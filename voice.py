"""The crab's voice: resting the words it leans on, and keeping its best lines.

Pure logic. No files, no network, no model. crab.py hands in the crab's recent
lines and the names of things in its world, and stores what comes back.

Two ideas:
- Words and phrases it has used in 3 of its last 8 lines are 'rested' for about
  25 moves, so it cannot settle into a catchphrase.
- Every line it writes is scored here in code. Its best dozen are kept and a
  couple are handed back now and then as examples of how it sounds at its best.
"""
import re

WINDOW = 8          # lines looked back over
LEAN = 3            # a phrase in this many of them is being leaned on
REST_MOVES = 25     # moves a leaned-on phrase is rested for
REST_MAX = 8        # most phrases rested at once
BEST_MAX = 12       # best lines kept
BEST_MIN = 4.0      # score a line needs to be kept at all
SHOW_MAX = 3        # times any one best line is ever shown back to it
SHOW_EVERY = 3      # best lines go into the prompt on one move in this many
FRESH = 6           # moves before a new best line may be shown back

STOP = frozenset("""
a an the and but or so if then than that this these those there here it its it's i i'm i'll
i've i'd me my mine myself you your we our they them their he she his her is am are was were
be been being do does did done don't have has had having will would can could should shall
may might must not no nor of to in on at by for from with into onto over under up down out
off about as again once more most some any all each both few such only own same too very
just now still also yet where when what which who why how while before after through
between against during until one get got go let let's
""".split())

FILLER = ("i wonder", "i should", "i think", "i need to", "i want to", "time to", "let's see",
          "maybe", "perhaps", "something", "interesting", "nice", "lovely", "really", "very",
          "quite", "today")


def words(text):
    return re.findall(r"[a-z]+(?:'[a-z]+)?", (text or "").lower().replace("’", "'"))


def name_words(names):
    """The words that make up the names of things and places in the world."""
    return {x for n in names for x in words(n) if len(x) >= 3 and x not in STOP}


def uses(text, phrases):
    """Which of these phrases appear in the text, as whole words."""
    t = " " + " ".join(words(text)) + " "
    return [p for p in phrases if p and " " + " ".join(words(p)) + " " in t]


def _content(tokens, nw=()):
    return {x for x in tokens if x not in STOP and x not in nw and len(x) >= 3}


def _grams(text, nw):
    """Everything in one line that could be a habit: sentence openers of up to
    four words, phrases of two or three words, and single words of five letters
    or more. A phrase has to hold at least one word that is not small talk and
    not the name of a thing, and cannot begin or end on a name."""
    out = set()
    for sent in re.split(r"[.!?;:]+", text or ""):
        t = words(sent)
        for i in range(len(t)):
            for n in range(1, (4 if i == 0 else 3) + 1):
                g = t[i:i + n]
                if len(g) < n:
                    break
                if g[-1] in STOP or g[-1] in nw:
                    continue
                if i and (g[0] in STOP or g[0] in nw):
                    continue
                if not _content(g, nw) or (n == 1 and len(g[0]) < 5):
                    continue
                out.add(" ".join(g))
    return out


def leaning(lines, names=()):
    """What the crab is leaning on: phrases found in LEAN or more of its last
    WINDOW lines, longest first, with anything a longer phrase already covers
    left out. Names of things in its world never count against it."""
    nw = name_words(names)
    counts = {}
    for line in [l for l in lines if l][-WINDOW:]:
        for g in _grams(line, nw):
            counts[g] = counts.get(g, 0) + 1
    found = sorted((g for g, c in counts.items() if c >= LEAN),
                   key=lambda g: (-len(g.split()), -counts[g], g))
    out, covered = [], set()
    for g in found:
        content = _content(g.split(), nw)
        if content <= covered:
            continue
        out.append(g)
        covered |= content
    return out


def rest_update(resting, lines, names, tick):
    """The rested list after one more move, as {phrase: the move it comes back}.
    Using a rested phrase anyway simply keeps it rested for longer."""
    out = {p: t for p, t in (resting or {}).items() if t > tick}
    for p in leaning(lines, names):
        out[p] = tick + REST_MOVES
    last = next((l for l in reversed(lines) if l), "")
    for p in uses(last, list(out)):
        out[p] = tick + REST_MOVES
    keep = sorted(out, key=lambda p: (-out[p], p))[:REST_MAX]
    return {p: out[p] for p in keep}


def _overlap(a, b):
    return len(a & b) / len(a | b) if a and b else 0.0


def score(line, names=(), recent=(), resting=()):
    """How much a line sounds like the crab at its best, from 0 to about 6.5.
    Rewards naming a real thing or place, a sensible length and saying something
    its recent lines did not; marks down rested phrases and filler."""
    t = words(line)
    if len(t) < 5 or len(line) > 180:
        return 0.0
    s = 2.0 if 8 <= len(t) <= 24 else 1.0 if len(t) <= 32 else 0.0
    hits = set(t) & name_words(names)
    s += (2.0 if hits else 0.0) + (0.5 if len(hits) > 1 else 0.0)
    mine = _content(t)
    s += 2.0 * (1 - max((_overlap(mine, _content(words(r))) for r in recent), default=0.0))
    s -= 3.0 * len(uses(line, resting))
    s -= min(2.0, 0.5 * len(uses(line, FILLER)))
    return round(max(0.0, s), 2)


def _worth(b, tick):
    """A kept line's standing: its score, fading slowly with age so the set
    turns over, and falling right away once it has been shown its fill."""
    return b["s"] - (tick - b["at"]) / 100.0 - (5 if b["n"] >= SHOW_MAX else 0)


def keep_best(best, line, sc, tick):
    """The best lines after considering one more. Each is {t, s, at, n}: the
    text, its score, the move it was written on and how often it has been shown."""
    best = [dict(b) for b in best or []]
    line = " ".join((line or "").split())
    if sc < BEST_MIN or not line:
        return best
    mine = _content(words(line))
    if any(_overlap(mine, _content(words(b["t"]))) > 0.5 for b in best):
        return best                             # too like one already kept
    best.append({"t": line, "s": sc, "at": tick, "n": 0})
    if len(best) > BEST_MAX:
        best.remove(min(best, key=lambda b: _worth(b, tick)))
    return best


def drop_rested(best, resting):
    """A kept line that holds a phrase now being rested was the start of a
    habit, not a best line: it goes for good."""
    return [b for b in best or [] if not uses(b["t"], resting)]


def pick_best(best, resting, tick):
    """(lines to show this move, the best list with their counts moved on).
    Shows two or three, least-shown first, on one move in SHOW_EVERY; never a
    line shown SHOW_MAX times already, a brand new one, or one holding a rested
    phrase. Never a single line on its own, which would read as a template."""
    best = [dict(b) for b in best or []]
    if tick % SHOW_EVERY:
        return [], best
    ok = [b for b in best if b["n"] < SHOW_MAX and tick - b["at"] >= FRESH
          and not uses(b["t"], resting)]
    ok.sort(key=lambda b: (b["n"], b.get("last", -1), -b["s"]))
    chosen = ok[:3 if len(ok) >= 6 else 2]
    if len(chosen) < 2:
        return [], best
    for b in chosen:
        b["n"] += 1
        b["last"] = tick
    return [b["t"] for b in chosen], best


def rest_line(resting):
    """One short line for a prompt, or '' when nothing is rested."""
    if not resting:
        return ""
    return ("You have leaned on these lately, so give them a rest: "
            + ", ".join(f"“{p}”" for p in sorted(resting, key=lambda p: (-resting[p], p))) + ".")


def best_block(shown):
    if not shown:
        return ""
    return ("Lines of yours that sounded most like you. They show the manner only: "
            "never reuse their words or their shape.\n" + "\n".join("- " + s for s in shown))


def payload(state, tick):
    """What the owner is shown in the Memory panel."""
    resting = (state or {}).get("rest") or {}
    best = (state or {}).get("best") or []
    return {"resting": [{"text": p, "left": resting[p] - tick}
                        for p in sorted(resting, key=lambda p: (-resting[p], p)) if resting[p] > tick],
            "best": [{"text": b["t"], "shown": b["n"], "spent": b["n"] >= SHOW_MAX}
                     for b in sorted(best, key=lambda b: -_worth(b, tick))]}
