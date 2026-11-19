"""One thing followed from start to finish: find -> look -> read -> make.

    python -I tests\\threads_test.py                           the rules only
    .venv\\Scripts\\python.exe -I tests\\threads_test.py --crab   also through crab.py's tick(), with a
                                                              pretend model and a throwaway memory

Prints the feed line of every move, with its reason, and the "On your mind"
block the crab would be shown at each step. No real model call is ever made.
"""
import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import world as W          # noqa: E402

T = W.TH


def mind(w):
    return "\n".join("      " + line for line in T.on_mind(w)) or "      (nothing on its mind)"


# ------------------------------------------------------------------ 1
print("1. The rules alone\n")
now = 1_800_000_000.0
w = W.new_world(now)
w["book"] = True
w["crab"].update(place="cave", tucked=False, energy=90)
w["items"].clear()
find = W.add_item(w, "shell", "an ammonite", "a ribbed stone spiral", "cave", "cave", now)
fid = str(find["id"])


def do(move, words=""):
    global now
    now += 75
    assert move in {m for m, _ in W.valid_moves(w, now)}, (move, W.valid_moves(w, now))
    text = W.apply_move(w, move, words, now, "Kerb")
    assert text, move
    print("   feed:", text)
    print(mind(w))
    return text


def stage_of(kind):
    return [(t["stage"], t["title"]) for t in w["threads"] if t["kind"] == kind]


print(mind(w))
t = do(f"examine:{fid}", "ribbed like a tyre, and heavier than it looks")
assert "wonders what it is" in t and stage_of("wondering") == [("open", "what the ammonite is")]
do(f"pick_up:{fid}")
do("go:library")
assert "library" in W.thread_places(w)
# as read_up() in crab.py does: the find is marked, then the move is applied
find["learned"], find["learned_title"] = "Ammonites were sea animals with coiled shells.", "Ammonite"
t = do("read", "Ammonite")
assert t == ("Kerb read about Ammonite in the encyclopedia, which it had been wondering about "
             "since it took a proper look at the ammonite."), t
assert stage_of("wondering") == [("resolved", "what the ammonite is")]
assert stage_of("making") == [("open", "make something to do with Ammonite")]
assert T.making_hint(w) == "Ammonite"
do("go:workshop")
w["making"] = {"work": 1, "name": "a coiled clay ammonite", "about": "clay, to look at", "px": ["." * 12] * 12}
t = do("craft")
assert t.endswith("having meant to make something since it read about Ammonite."), t
assert stage_of("making") == [("resolved", "make something to do with Ammonite")]
assert T.making_hint(w) == "" and not T.on_mind(w)

print("\n   The same, but the book has nothing on it, and a seed seen through:\n")
other = W.add_item(w, "pebble", "a grey pebble", "plain", "workshop", "tide", now)
do(f"examine:{other['id']}", "dull")
other["no_entry"] = True
w["crab"]["place"] = "library"; w["last_read"] = -99; w["history"] = []
t = do("read", "")
assert "put aside wondering what the grey pebble is" in t, t
seed = W.add_item(w, "seed", W.SEEDS[0][0], W.SEEDS[0][1], "garden", "found", now)
w["crab"]["place"] = "garden"; w["history"] = []
t = do(f"plant:{seed['id']}")
assert "see it through" in t and "garden" in W.thread_places(w)
while W.plant_stage(w["plants"][0]) < len(W.STAGES) - 1:
    W.grow(w, 20)
    w["last_tend"] = -99; w["history"] = []; w["crab"]["energy"] = 90
    t = do("tend")
assert "fully grown" in t and stage_of("looking")[0][0] == "resolved", t

print("\n   A request from its person is not counted as its own idea:")
find2 = W.add_item(w, "shell", "a whelk shell", "spiral", "garden", "tide", now)
w["threads"] = [x for x in w["threads"] if x["stage"] != "open"]
do(f"examine:{find2['id']}", "pointy")
find2["learned"], find2["learned_title"] = "Whelks are sea snails.", "Whelk"
do("go:workshop")
assert stage_of("making")[-1] == ("open", "make something to do with Whelk")
w["asked_art"], w["asked_words"] = "item", "make me a little racing car"
w["making"] = {"work": 2, "name": "a little racing car", "about": "x", "px": ["." * 12] * 12}
t = do("craft")
assert t == "Kerb made a little racing car at the workshop." and stage_of("making")[-1][0] == "open", t

print("\n   An older saved world (no threads key) picks up where it was:")
old = W.new_world(now); old["book"] = True; old["crab"].update(place="pool", tucked=False)
it = W.add_item(old, "cap", "a valve cap", "black plastic", "pool", "tide", now); it["note"] = "small"; it["looked"] = 0
assert "threads" not in old and W.valid_moves(old, now) and W.describe(old, "Kerb", [])
print("   feed:", W.apply_move(old, "dip", "", now, "Kerb"))
print("\n".join("      " + line for line in T.on_mind(old)))
assert [x["title"] for x in old["threads"]] == ["what the valve cap is"]
print("   payload:", json.dumps(T.payload(w))[:400], "...")
print("\n   rules scenario passed")

# ------------------------------------------------------------------ 2
if "--crab" not in sys.argv:
    sys.exit(0)
print("\n2. Through crab.py's tick(), with a pretend model\n")
TMP = os.path.join(ROOT, "_t")
shutil.rmtree(TMP, ignore_errors=True)
os.makedirs(TMP)
os.environ["CRAB_DATA"] = TMP
os.environ["CRAB_UI_PORT"] = "4835"
import crab as C           # noqa: E402
try:
    assert os.path.abspath(C.DATA) == os.path.abspath(TMP)
    C.init_db()
    C.MODEL.state = "awake"
    C.book_ready = lambda: True
    C.encyclopedia.lookup = lambda path, topic: ("Ammonite", "Ammonites were sea animals with coiled, ribbed shells. "
                                                 "They died out with the dinosaurs.")
    C.web_enabled = lambda: False
    prompts = []

    def setup(w):
        w["crab"].update(place="cave", tucked=False, napping_until=None, energy=95)
        w["items"].clear()
        w["book"] = True
        return str(W.add_item(w, "shell", "an ammonite", "a ribbed stone spiral", "cave", "cave", 0)["id"])
    fid = C.with_world(setup)

    def fake_chat(messages, max_tokens, temperature, schema=None, purpose=""):
        text = messages[-1]["content"]
        prompts.append((purpose, text))
        props = (schema or {}).get("properties", {})
        if purpose == "move":
            moves = props["move"]["enum"]
            w = C.load_world()
            kinds = {t["kind"] for t in T.open_threads(w)}
            want = ([f"examine:{fid}", "read", "craft"]
                    + (["go:library"] if "wondering" in kinds else [])
                    + (["go:workshop"] if "making" in kinds else [])
                    + ["drink", "dip", "look_around", "watch", "explore"])
            out = {"move": next((m for m in want if m in moves), moves[0]),
                   "thought": "ribbed like a tyre", "words": "ribbed like a tyre"}
            if "aim" in props:
                out["aim"] = props["aim"]["enum"][0]
            return json.dumps(out)
        if "topics" in props:
            return json.dumps({"topics": ["Ammonite"], "thing": fid})
        if "summary" in props:
            return json.dumps({"summary": "Ammonites were sea animals with coiled, ribbed shells that died out long ago."})
        if "rows" in props:
            return json.dumps({"name": "a coiled clay ammonite", "about": "Rolled clay, to sit on the ledge.",
                               "rows": ["....KKKK....", "..KKNNNNKK..", ".KNNKKKKNNK.", ".KNKNNNNKNK.", "KNNKNKKNKNNK",
                                        "KNKNKNNKNKNK", "KNKNKNKKNKNK", "KNNKNNNNKNNK", ".KNNKKKKNNK.", ".KNNNNNNNNK.",
                                        "..KKNNNNKK..", "....KKKK...."]})
        raise AssertionError(("unexpected model call", purpose))
    C.MODEL.chat = fake_chat

    seen = 0
    for n in range(30):
        C.tick()
        rows = C.q("SELECT id, kind, text FROM events WHERE id > ? ORDER BY id", (seen,))
        for r in rows:
            seen = r["id"]
            print(f"   feed ({r['kind']}): {r['text']}")
        w = C.load_world()
        print(mind(w))
        if any(t["kind"] == "making" and t["stage"] == "resolved" for t in w.get("threads", [])):
            break
    feed = [r["text"] for r in C.q("SELECT text FROM events ORDER BY id")]
    assert any("and now wonders what it is" in t for t in feed), feed
    assert any("read about Ammonite in the encyclopedia, which it had been wondering about" in t for t in feed), feed
    assert any("having meant to make something since it read about Ammonite" in t for t in feed), feed
    art = [p for purpose, p in prompts if purpose == "art"]
    hint = [line for line in art[-1].splitlines() if "Ammonite" in line]
    print("\n   what the making step was told:", hint)
    assert len(hint) == 1 and "Only a thought" in hint[0]
    block = [p for purpose, p in prompts if purpose == "move" and "On your mind" in p]
    assert block, "the move prompt never showed the block"
    print("   move prompts that carried the block:", len(block), "of", sum(p == "move" for p, _ in prompts))
    # a request from its person always wins: no hint beside it
    assert C.thread_hint("craft", ['Your person asked you for this. Their words: "a car"']) == []
    assert C.thread_hint("draw", []) == []
    pay = C.world_payload(None)["threads"]
    print("   page:", json.dumps(pay)[:500], "...")
    assert [t["stage"] for t in pay["closed"] if t["kind"] in ("wondering", "making")] == ["done", "done"]
    print("\n   crab scenario passed")
finally:
    import gc
    import logging
    logging.shutdown()                  # let go of the log file and the database before deleting them
    gc.collect()
    shutil.rmtree(TMP, ignore_errors=True)
    print("   throwaway memory deleted:", not os.path.exists(TMP))
