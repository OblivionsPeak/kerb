"""Things on the crab's mind that carry across days.

A thread is a small record of unfinished business: a find it wonders about,
a thing it means to make, a plant it is seeing through, the aim it chose.
Threads are opened, moved on and closed only here, by code, from things that
really happened in the world. The model never writes one and never says one
is done. Pure rules: no files, no network, no model, and no import of world.py
(world.py passes in the few facts this file cannot work out for itself).

    w["threads"]   a list: up to MAX_OPEN open threads and the last KEEP_CLOSED closed ones
    thread         {id, kind, title, stage, born, touched, steps: [{tick, text}], about: {...}}
    kind           looking | making | meaning | wondering
    stage          open | resolved | put aside
    about          wondering {item}, making {item, topic}, looking {plant, stage},
                   meaning {aim, tick, aims0, prog}
"""

MAX_OPEN = 4        # threads on the go at once
PER_KIND = 2        # of any one kind, so one interest cannot crowd out the rest
KEEP_CLOSED = 8     # finished and put-aside threads remembered
MAX_STEPS = 6       # lines kept for each thread
STALE = 200         # moves a thread may go untouched before it is put aside

def the(name):
    """'an ammonite' -> 'the ammonite', for titles and feed lines."""
    for article in ("a ", "an "):
        if name.startswith(article):
            return "the " + name[len(article):]
    return name


def _key(kind, about):
    if kind == "meaning":
        return kind, about.get("aim"), about.get("tick")
    return kind, about.get("plant" if kind == "looking" else "item")


def _open(w):
    return [t for t in w.get("threads", []) if t["stage"] == "open"]


def open_threads(w):
    """Open threads as the prompts and the page should see them, newest business
    first. A 'meaning' thread whose aim has just ended is closed at the next
    move, so until then it is left out here."""
    aim = w.get("aim") or {}
    out = [t for t in _open(w) if t["kind"] != "meaning"
           or (t["about"]["aim"], t["about"]["tick"]) == (aim.get("id"), aim.get("tick"))]
    return sorted(out, key=lambda t: (-t["touched"], -t["id"]))


def closed_threads(w):
    out = [t for t in w.get("threads", []) if t["stage"] != "open"]
    return sorted(out, key=lambda t: (-t.get("closed", 0), -t["id"]))


def _step(w, th, text):
    th["touched"] = w["ticks"]
    if th["steps"] and th["steps"][-1]["text"] == text:
        th["steps"][-1]["tick"] = w["ticks"]        # the same thing again: one line, not two
    else:
        th["steps"] = (th["steps"] + [{"tick": w["ticks"], "text": text}])[-MAX_STEPS:]


def _close(w, th, stage, text):
    if th["stage"] != "open":
        return
    _step(w, th, text)
    th["stage"] = stage
    th["closed"] = w["ticks"]


def start(w, kind, title, about, first):
    """Open a thread, making room if need be. Returns it, or None when there is
    already (or has lately been) a thread about the same thing."""
    ths = w.setdefault("threads", [])
    key = _key(kind, about)
    if any(_key(t["kind"], t["about"]) == key for t in ths):
        return None
    opened = _open(w)
    same = [t for t in opened if t["kind"] == kind]
    oldest = lambda pool: min(pool, key=lambda t: (t["touched"], t["id"]))
    if len(same) >= PER_KIND:
        if kind == "looking":
            return None                         # the plants already on its mind come first
        _close(w, oldest(same), "put aside", "put aside for something newer")
    elif len(opened) >= MAX_OPEN:
        _close(w, oldest([t for t in opened if t["kind"] != "meaning"] or opened),
               "put aside", "put aside to make room")
    w["thread_seq"] = w.get("thread_seq", 0) + 1
    th = {"id": w["thread_seq"], "kind": kind, "title": title[:120], "stage": "open",
          "born": w["ticks"], "touched": w["ticks"], "steps": [], "about": about}
    _step(w, th, first)
    ths.append(th)
    return th


def _lead(text):
    head = str(text).split(" ", 1)[0]
    return int(head) if head.isdigit() else None


def _wonder_ok(it, book):
    return bool(book and it and it.get("note") and not it.get("learned")
                and not it.get("no_entry") and it.get("kind") not in ("scrap", "made"))


def after_move(w, move, text, words="", aim=None, stage=None, stages=(), book=False,
               asked=False, puzzle=None, can_make=True):
    """Called once at the end of every move that happened. Opens, moves on and
    closes threads from what is now true in the world, and returns the move's
    log line, with a short reason added when the move had to do with a thread.

    aim     (done, progress words, lapsed) for the current aim, or None
    stage   function giving a plant's stage number; stages its names
    book    is the encyclopedia there to be read
    asked   was this move something its person asked for
    can_make  is there still room in the tank for things of its own making
    puzzle  only for a world saved before threads existed: the find it is wondering about
    """
    if "threads" not in w:                      # an older world: pick up where it already was
        w["threads"] = []
        if _wonder_ok(puzzle, book) and move != f"examine:{puzzle['id']}":
            start(w, "wondering", f"what {the(puzzle['name'])} is", {"item": puzzle["id"]},
                  "still not read about")
    verb, _, arg = move.partition(":")
    items = w["items"]
    plants = {p["id"]: p for p in w.get("plants", [])}
    last = len(stages) - 1
    clause = ""

    if verb == "examine":
        it = items.get(arg)
        if _wonder_ok(it, book) and start(w, "wondering", f"what {the(it['name'])} is",
                                          {"item": it["id"]}, "had a proper look at it"):
            clause = ", and now wonders what it is"
    elif verb == "plant" and plants:
        p = w["plants"][-1]
        if start(w, "looking", f"see {the(p['name'])} through to fully grown",
                 {"plant": p["id"], "stage": 0}, f"planted {p['seed']}"):
            clause = ", and means to see it through to fully grown"
    elif verb == "craft" and not asked:
        pool = [t for t in _open(w) if t["kind"] == "making"]
        made = [i for i in items.values() if i.get("kind") == "made"]
        if pool and made:
            th = max(pool, key=lambda t: t["id"])
            new = max(made, key=lambda i: i["id"])
            th["about"]["made"] = new["id"]
            _close(w, th, "resolved", f"made {new['name']}")
            clause = f", having meant to make something since it read about {th['about']['topic']}"

    for th in _open(w):
        about = th["about"]
        if th["kind"] == "wondering":
            it = items.get(str(about["item"]))
            if not it:
                _close(w, th, "put aside", "it is gone now")
            elif it.get("learned"):
                title = str(it.get("learned_title") or it["name"])[:80]
                _close(w, th, "resolved", f"read about it under {title}")
                if can_make:
                    start(w, "making", f"make something to do with {title}",
                          {"item": it["id"], "topic": title}, f"read about {title}")
                if verb == "read" and words and words == it.get("learned_title") and not clause:
                    clause = (", which it had been wondering about since it took a proper "
                              f"look at {the(it['name'])}")
            elif it.get("no_entry"):
                _close(w, th, "put aside", "the encyclopedia had nothing on it")
                if verb == "read" and not words and not clause:
                    clause = f", so it has put aside wondering what {the(it['name'])} is"
        elif th["kind"] == "looking":
            p = plants.get(about["plant"])
            if not p or not stage:
                if not p:
                    _close(w, th, "put aside", "it is gone now")
                continue
            now_at, bare = stage(p), the(p["name"])
            if now_at >= last:
                _close(w, th, "resolved", "fully grown")
                if verb == "tend" and not clause:
                    clause = f", and {bare} it has been seeing through is fully grown"
                continue
            if verb == "tend":
                _step(w, th, "watered and weeded it")
                if not clause:
                    clause = f", helping along {bare} it means to see fully grown"
            if now_at > about.get("stage", 0):
                about["stage"] = now_at
                _step(w, th, f"now {stages[now_at]}")
        elif th["kind"] == "meaning":
            cur = w.get("aim") or {}
            if aim and (cur.get("id"), cur.get("tick")) == (about["aim"], about["tick"]):
                done, prog, lapsed = aim
                if done:
                    _close(w, th, "resolved", "done")
                elif lapsed:
                    _close(w, th, "put aside", "let go of after a long while")
                elif prog != about.get("prog"):
                    was, is_now = _lead(about.get("prog")), _lead(prog)
                    about["prog"] = prog
                    if was is not None and is_now is not None and is_now > was:
                        _step(w, th, f"{prog} so far")
                        if not clause:
                            clause = f", one more towards what it set out to do ({prog})"
                    elif was is None or is_now is None:
                        th["touched"] = w["ticks"]
            else:                               # the aim ended without this file seeing how
                ok = w.get("tally", {}).get("aims", 0) > about.get("aims0", 0)
                _close(w, th, "resolved" if ok else "put aside",
                       "done" if ok else "let go of")

    cur = w.get("aim")
    if cur and aim and not (aim[0] or aim[2]):
        start(w, "meaning", str(cur["text"]),
              {"aim": cur["id"], "tick": cur["tick"], "prog": aim[1],
               "aims0": w.get("tally", {}).get("aims", 0)}, "set out to do it")

    for th in _open(w):
        if w["ticks"] - th["touched"] >= STALE:
            _close(w, th, "put aside", "left alone too long")
    gone = closed_threads(w)[KEEP_CLOSED:]
    if gone:
        w["threads"] = [t for t in w["threads"] if t not in gone]
    if clause and text.endswith("."):
        return text[:-1] + clause + "."
    return text


def answered(w, item, title, can_make=True):  # [research]
    """A find it had stopped wondering about, because the encyclopedia had
    nothing on it, has been answered another way after all. The thread that was
    put aside becomes a finished one. Returns True if there was such a thread."""
    title = str(title)[:80]
    for th in w.get("threads", []):
        if th["kind"] == "wondering" and str(th["about"].get("item")) == str(item) \
                and th["stage"] != "resolved":
            _step(w, th, f"an answer came back down the wire: {title}")
            th["stage"], th["closed"] = "resolved", w["ticks"]
            if can_make:
                start(w, "making", f"make something to do with {title}",
                      {"item": th["about"]["item"], "topic": title}, f"heard about {title}")
            return True
    return False


def making_hint(w):
    """The subject of the newest thing it means to make, or '' if there is none.
    The caller offers it to the making step as a suggestion, no more."""
    pool = [t for t in _open(w) if t["kind"] == "making"]
    return max(pool, key=lambda t: t["id"])["about"]["topic"] if pool else ""


def _ago(w, tick):
    n = w["ticks"] - tick
    return "just now" if n <= 0 else f"{n} move{'s' if n != 1 else ''} ago"


def on_mind(w):
    """At most four lines for the crab's prompt. What it is working towards has
    its own line there already, so that thread is left out."""
    ths = [t for t in open_threads(w) if t["kind"] != "meaning"][:3]
    if not ths:
        return []
    return ["On your mind, in your own time:"] + [
        f"- {'a question: ' if t['kind'] == 'wondering' else 'to '}{t['title']}. "
        f"Last: {t['steps'][-1]['text']}, {_ago(w, t['steps'][-1]['tick'])}." for t in ths]


def payload(w):
    """Threads for the page: open ones, then the ones lately closed."""
    def one(t):
        return {"id": t["id"], "kind": t["kind"], "title": t["title"],
                "stage": "done" if t["stage"] == "resolved" else t["stage"],
                "since": _ago(w, t["born"]),
                "steps": [{"text": s["text"], "when": _ago(w, s["tick"])} for s in t["steps"]]}
    return {"open": [one(t) for t in open_threads(w)],
            "closed": [one(t) for t in closed_threads(w)]}
