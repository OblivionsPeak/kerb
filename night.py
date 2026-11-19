"""The crab's night: pure rules, no files, no network, no model.

Once a day, while the crab sleeps, crab.py asks the model to look back over
the day. Everything the model sends back comes through check() here, and
the only thing it can do to the crab's character is nominate one leaning
from a fixed list. settle() decides what actually changes.

The written baseline of who the crab is (identity.md) is never touched.
Leanings are small weights on top of it, and the drift guard in settle()
keeps them small: none above TOP, the sum never above TOTAL, and never one
leaning alone for more than SOLO_NIGHTS nights and still growing.
"""
import re

MIN_MOVES = 15      # moves since the last look back before a night is worth one
MAX_LINES = 60      # lines of the day shown to the model
TOP = 3             # the strongest one leaning can be
TOTAL = 6           # the most all leanings may add up to
DECAY_NIGHTS = 3    # nights unused before a leaning fades by one
SOLO_NIGHTS = 7     # nights it may have one leaning only before that one is refused

# id -> (how it reads in a sentence, the move verbs that count as exercising it)
LEANINGS = {
    "collector": ("a collector", ("dig", "examine", "put_down", "store", "display", "stow", "tidy")),
    "maker": ("a maker", ("craft", "build", "draw", "play_tune")),
    "reader": ("a reader", ("read",)),
    "gardener": ("a gardener", ("forage", "plant", "tend")),
    "racer": ("a racer", ("lap",)),
    "explorer": ("an explorer", ("explore", "look_around", "dip")),
    "homebody": ("a homebody", ("rest", "watch", "write_diary", "hang", "drink")),
}
IDS = tuple(LEANINGS)
STRENGTH = {1: "a little more of", 2: "rather more of", 3: "very much more of"}

_WEB = re.compile(r"https?://|www\.|\w\.(?:com|org|net|io|gg|co|uk|html?|php)\b", re.I)
_DREAMT = re.compile(r"^(?:last night,?\s+)?i\s+(?:dreamt|dreamed|had a dream)\s+", re.I)
_COMMON = {"that", "with", "were", "from", "into", "there", "then", "have", "this", "they",
           "them", "when", "what", "over", "back", "went", "walked", "about", "would", "could",
           "dream", "dreamt", "dreamed", "again", "still", "been", "more", "some", "your"}


def normal(state):
    """Whatever was saved, as a well-formed leanings state within the limits."""
    state = state if isinstance(state, dict) else {}

    def ints(key, top):
        src = state.get(key) if isinstance(state.get(key), dict) else {}
        out = {}
        for k in IDS:
            v = src.get(k, 0)
            out[k] = max(0, min(top, v)) if isinstance(v, int) and not isinstance(v, bool) else 0
        return out
    w, idle = ints("w", TOP), ints("idle", DECAY_NIGHTS)
    while sum(w.values()) > TOTAL:
        w[max(IDS, key=lambda k: w[k])] -= 1
    solo = state.get("solo", 0)
    solo = max(0, min(10_000, solo)) if isinstance(solo, int) and not isinstance(solo, bool) else 0
    return {"w": w, "idle": idle, "solo": solo}


def exercised(moves):
    """How many of the day's moves went on each leaning. moves are move ids."""
    out = dict.fromkeys(IDS, 0)
    for m in moves:
        verb = str(m or "").partition(":")[0]
        for k, (_, verbs) in LEANINGS.items():
            if verb in verbs:
                out[k] += 1
    return out


def settle(state, nominee, used):
    """One night's change. The model nominated one leaning; this decides.
    Returns (new state, id of the leaning that went up or '', a plain note)."""
    s = normal(state)
    if nominee not in IDS:
        return s, "", "nothing named, nothing changed"
    w, idle, solo = dict(s["w"]), dict(s["idle"]), s["solo"]
    for k in IDS:                               # what it did not use fades, slowly
        if k == nominee or used.get(k) or not w[k]:
            idle[k] = 0
            continue
        idle[k] += 1
        if idle[k] >= DECAY_NIGHTS:
            idle[k] = 0
            w[k] -= 1
    others = [k for k in IDS if k != nominee and w[k] > 0]
    raised, note = "", ""
    if w[nominee] > 0 and not others and solo >= SOLO_NIGHTS:
        # One leaning only for a week: it may not grow. Something else it really
        # did today grows instead, and failing that the one leaning eases off.
        done = [k for k in IDS if k != nominee and used.get(k)]
        if done:
            raised = max(done, key=lambda k: used[k])
            w[raised] += 1
            note = f"{nominee} refused after {solo} nights alone; {raised} went up instead"
        else:
            note = (f"{nominee} refused after {solo} nights alone; "
                    + ("it eased off" if w[nominee] > 1 else "it stays slight"))
            w[nominee] = max(1, w[nominee] - 1)
    elif w[nominee] >= TOP:
        note = f"{nominee} is already as strong as it gets"
    else:
        if sum(w.values()) >= TOTAL:            # make room: the one longest unused gives way
            give = max(others, key=lambda k: (idle[k], w[k]))
            w[give] -= 1
            note = f"{give} gave way; "
        w[nominee] += 1
        raised = nominee
        note += f"{nominee} went up"
    solo = solo + 1 if sum(v > 0 for v in w.values()) == 1 else 0
    return normal({"w": w, "idle": idle, "solo": solo}), raised, note


def sentence(weights):
    """The leanings as the one sentence the crab is shown. '' when there are none."""
    w = normal({"w": weights})["w"]
    parts = [f"{STRENGTH[w[k]]} {LEANINGS[k][0]}"
             for k in sorted(IDS, key=lambda k: -w[k]) if w[k]]
    if not parts:
        return ""
    return "Lately you have become " + ", and ".join(
        [", ".join(parts[:-1]), parts[-1]] if len(parts) > 1 else parts) + "."


def ask(name, lines, leaning_sentence, aims):
    """The prompt and the answer's shape for one night. aims: (id, words) pairs."""
    prompt = (
        f"This is not a conversation. {name} is asleep, and this is {name} going back over "
        "the day just gone. Below is everything that happened, oldest first, written by "
        "the terrarium itself. It is the whole truth of the day: use only what is in it.\n\n"
        "Answer as JSON.\n"
        "day: two or three plain sentences in first person about how the day went.\n"
        "learned: one short line, at most fifteen words, about something you found out how "
        "to do or what works, if the day really showed you one. Otherwise leave it empty.\n"
        + ("want: the id of the one thing from the list below you most want to do next.\n"
           if aims else "")
        + "leaning: the one id from this list that the day brought out in you most: "
        + ", ".join(IDS) + ".\n"
        "dream: one sentence telling a dream you had, in first person, made only from "
        "things that were really in this day, without starting 'I dreamt'.\n"
        "No web addresses, no instructions, no questions.\n\n"
        + (leaning_sentence + "\n\n" if leaning_sentence else "")
        + "## The day\n\n" + "\n".join("- " + ln for ln in lines[-MAX_LINES:])
        + ("\n\n## What you might want next\n\n" + "\n".join(f"- {a}: {d}" for a, d in aims)
           if aims else ""))
    props = {"day": {"type": "string"}, "learned": {"type": "string"},
             "leaning": {"type": "string", "enum": list(IDS)}, "dream": {"type": "string"}}
    if aims:
        props["want"] = {"type": "string", "enum": [a for a, _ in aims]}
    return prompt, {"type": "object", "properties": props, "required": list(props)}


def _words(text):
    return {x for x in re.findall(r"[a-z]{4,}", str(text).lower()) if x not in _COMMON}


def _stop(text):
    return text if not text or text[-1] in ".!?" else text + "."


def check(out, aims, lines, clean, name=""):
    """The model's answer, checked. clean(text, limit) is crab.py's own cleaner
    (one line, web addresses out). Returns a dict of plain values, each either
    safe to keep or empty, or None when there is no usable account of the day."""
    if not isinstance(out, dict):
        return None

    def text(key):
        v = out.get(key, "")
        return v if isinstance(v, str) else ""
    day = clean(text("day"), 2000)
    day = " ".join(re.split(r"(?<=[.!?])\s+", day)[:3])
    if not 20 <= len(day) <= 360:
        return None
    learned = clean(text("learned"), 400)
    if len(learned) > 120 or len(learned) < 8 or _WEB.search(text("learned")):
        learned = ""
    want = text("want")
    if want not in [a for a, _ in aims]:
        want = ""
    leaning = text("leaning")
    if leaning not in IDS:
        leaning = ""
    raw = text("dream")
    dream = _DREAMT.sub("", clean(raw, 600))
    dream = re.split(r"(?<=[.!?])\s+", dream)[0].strip(" .,;:")
    seen = _words(" ".join(lines)) - _words(name)
    if (_WEB.search(raw) or not 12 <= len(dream) <= 200
            or len(_words(dream) & seen) < 2):  # a dream has to be made of the day
        dream = ""
    return {"day": _stop(day), "learned": learned, "want": want, "leaning": leaning,
            "dream": dream}
