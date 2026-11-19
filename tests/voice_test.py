"""Does the crab's voice module rest what it leans on, and keep the right lines?

    python -I tests\\voice_test.py              the rules in voice.py, no model, no files
    .venv\\Scripts\\python.exe tests\\voice_test.py --tick
                                               also 40 moves of tick() with a fake model that
                                               keeps repeating itself, in a throwaway folder
"""
import json
import logging
import os
import shutil
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import voice as V          # noqa: E402
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

NAMES = ["the stone ledge", "a spiral ammonite", "the tool chest", "the dune", "a tiny key",
         "the tide pool", "the workshop", "a brass washer"]

# 1. the case that was seen: four thoughts in a row with the same opener
crowded = ["The ledge is crowded, so I should put the key away.",
           "The ledge is crowded, so the washer can go in the chest.",
           "The ledge is crowded, so something has to move.",
           "The ledge is crowded, so I will pick my favourites."]
lean = V.leaning(crowded, NAMES)
print("leaning on:", lean)
assert lean == ["the ledge is crowded"], lean

# 2. names of things and places are never rested for being handled
handling = ["This ammonite is heavier than it looks.",
            "I carry the ammonite over the dune to the ledge.",
            "The ammonite fits on the ledge beside the key.",
            "The ledge looks better with the ammonite on it.",
            "Back to the dune, then the ledge again."]
assert V.leaning(handling, NAMES) == [], V.leaning(handling, NAMES)
assert "ammonite" in V.leaning(handling, [])            # without the names it would have been
print("handling the ammonite five times rests:", V.leaning(handling, NAMES))

# 3. a single word and an inner phrase; two uses are not enough; the window is 8 lines
pet = ["What a splendid pebble.", "A splendid morning for a dig.", "The pool is splendid today."]
assert V.leaning(pet, NAMES) == ["splendid"]
assert V.leaning(pet[:2], NAMES) == []
assert V.leaning(pet + ["Off to dig."] * 7, NAMES) == ["off to dig"]       # 'splendid' has aged out
inner = ["I see a glint of old brass here.", "There is a glint of old rope.", "Again a glint of old tin."]
assert V.leaning(inner, NAMES) == ["glint of old"], V.leaning(inner, NAMES)

# 4. resting: about 25 moves, longer if used anyway, never more than 8
rest = V.rest_update({}, crowded, NAMES, 100)
assert rest == {"the ledge is crowded": 125}
print("prompt line:", V.rest_line(rest))
quiet = crowded + ["Off to the pool."]
assert V.rest_update(rest, quiet + ["x y z"] * 8, NAMES, 126) == {}                     # back after its rest
again = V.rest_update(rest, ["a b c d e"] * 8 + ["The ledge is crowded, so there."], NAMES, 120)
assert again == {"the ledge is crowded": 145}, again                                    # used anyway: longer
many = V.rest_update({f"word{i}": 200 + i for i in range(20)}, [], NAMES, 100)
assert len(many) == V.REST_MAX and "word19" in many and "word0" not in many
assert V.uses("The LEDGE is crowded, so.", ["the ledge is crowded", "crowd"]) == ["the ledge is crowded"]

# 5. scoring: concrete, sensible length and fresh beats vague, short, repeated or rested
good = "The ammonite has a chip on its lip that fits my smallest claw exactly."
vague = "I wonder if maybe something really nice will turn up today."
s_good, s_vague = V.score(good, NAMES, crowded), V.score(vague, NAMES, crowded)
s_rested = V.score(crowded[0], NAMES, [], list(rest))
s_repeat = V.score(crowded[1], NAMES, crowded[:1])
print("scores: good", s_good, "vague", s_vague, "rested", s_rested, "short", V.score("Off I go.", NAMES))
assert s_good >= 6 > V.BEST_MIN > s_vague and s_rested < V.BEST_MIN and V.score("Off I go.", NAMES) == 0
assert s_repeat < V.score(crowded[1], NAMES, [])

# 6. the best set: capped, no near-duplicates, turns over, and never becomes a catchphrase
best = V.keep_best([], good, s_good, 10)
assert V.keep_best(best, good.replace("exactly", "just so"), 6.5, 11) == best           # too alike
assert V.keep_best(best, vague, s_vague, 11) == best                                    # not good enough
pool = iter("pebble feather button marble washer thimble cork bead nail ribbon acorn bottle spoon ticket "
            "buckle lantern anchor whistle compass saddle candle hammer basket mirror pillow ladder trumpet "
            "garlic pepper violin walrus tunnel meadow harbour copper velvet thunder orchard biscuit "
            "kettle parsnip magnet".split())
for n in range(14):
    best = V.keep_best(best, " ".join(next(pool) for _ in range(3)), 5.0, 20 + n)
assert len(best) == V.BEST_MAX
shown = {}
blocks = 0
for tick in range(60, 400):
    lines, best = V.pick_best(best, [], tick)
    assert len(lines) in (0, 2, 3) and (not lines or tick % V.SHOW_EVERY == 0)
    blocks += bool(lines)
    for l in lines:
        shown[l] = shown.get(l, 0) + 1
assert shown and max(shown.values()) <= V.SHOW_MAX, shown
print(f"best lines: {len(best)} kept, shown in {blocks} of 340 prompts, no line more than {max(shown.values())} times")
old = {b["t"] for b in best}
best = V.keep_best(best, "A cold green marble of sea glass rolled out from under the driftwood root.", 4.5, 400)
assert len(best) == V.BEST_MAX and len(old - {b["t"] for b in best}) == 1               # a spent line made way
fresh = [{"t": crowded[0], "s": 6, "at": 0, "n": 0}, {"t": good, "s": 6, "at": 0, "n": 0},
         {"t": "The washer rings like a bell on the stone.", "s": 6, "at": 0, "n": 0}]
lines, _ = V.pick_best(fresh, list(rest), 30)
assert crowded[0] not in lines and len(lines) == 2                                      # holds a rested phrase
assert [b["t"] for b in V.drop_rested(fresh, rest)] == [good, fresh[2]["t"]]             # and is dropped for good
assert V.pick_best(fresh[:2], list(rest), 30)[0] == []                                  # never one line alone
assert V.pick_best([dict(b, at=28) for b in fresh], [], 30)[0] == []                    # too new to echo
print("block:\n" + V.best_block(lines))
p = V.payload({"rest": rest, "best": fresh}, 110)
assert p["resting"] == [{"text": "the ledge is crowded", "left": 15}] and len(p["best"]) == 3
print("voice.py rules: all passed")

if "--tick" not in sys.argv:
    sys.exit(0)

# ---- 40 moves of the real tick() with a fake model, in a throwaway folder
TMP = tempfile.mkdtemp(prefix="_t_voice_", dir=ROOT)
os.environ["CRAB_DATA"] = TMP
os.environ.setdefault("CRAB_UI_PORT", "4831")
try:
    import crab as C           # noqa: E402
    C.init_db()
    C.MODEL.state = "awake"
    C.drive_note = lambda: None
    C.wash_up_find = lambda now: None
    C.book_ready = lambda: False
    prompts = []
    varied = iter(["The spring tastes of cold stone and I like it more than the pool.",
                   "From up here the dune looks like the back of a sleeping animal.",
                   "My claws leave a neat row of commas across the damp sand.",
                   "The moss gives under me like a held breath.",
                   "Somewhere a drip is keeping slow time against the boulders.",
                   "The lamp has turned the water in the pool the colour of weak tea.",
                   "A kerb on the track has a nick in it that I always clip.",
                   "The driftwood creaks when I climb it, as if it disapproves.",
                   "The garden soil smells darker after rain, almost like coffee.",
                   "I could count every grain on this patch and still lose my place."] * 4)

    def fake(messages, max_tokens, temperature, schema=None, purpose=""):
        prompt = messages[-1]["content"]
        ids = schema["properties"]["move"]["enum"]      # anything but a move prompt fails here, which is fine
        prompts.append(prompt)
        pick = next((m for m in ids if m == "write_diary"), None) or \
            next((m for m in ids if not m.startswith(("go:", "nap", "draw", "play_tune", "craft", "read"))), ids[0])
        if len(prompts) % 4 == 0:
            pick = next((m for m in ids if m.startswith("go:")), pick)
        resting = "give them a rest" in prompt
        thought = next(varied) if resting else "The ledge is crowded, so I had better see about that."
        out = {"move": pick, "thought": thought,
               "words": "The ledge is crowded, so today was a tidying day." if pick == "write_diary" else ""}
        if "aim" in schema["properties"]:
            out["aim"] = schema["properties"]["aim"]["enum"][0]
        return json.dumps(out)
    C.MODEL.chat = fake

    def wake(w):
        w["crab"]["tucked"] = False
        w["crab"]["energy"] = 100
    last = ""
    for n in range(40):
        C.with_world(wake)
        C.tick()
        added = [l for l in prompts[-1].split("\n") if "give them a rest" in l] if prompts else []
        if added and added[0] != last:
            last = added[0]
            print(f"move {n + 1}: the prompt now has: {last}")
    st = C.voice_state()
    tick = C.load_world()["ticks"]
    print("moves made:", tick, " model calls:", len(prompts))
    print("rested (phrase -> the move it comes back):", st["rest"])
    assert any("the ledge is crowded" in p for p in st["rest"]), st["rest"]
    assert last and "the ledge is crowded" in last
    blocks = [p[p.index("Lines of yours"):].split("\n\n")[0] for p in prompts if "Lines of yours" in p]
    print(f"prompts with a best-lines block: {len(blocks)} of {len(prompts)}; the last one:")
    print(blocks[-1] if blocks else "(none)")
    assert blocks and not any("ledge is crowded" in b.lower() for b in blocks)
    print("best lines kept:", len(st["best"]))
    for b in st["best"]:
        assert "ledge is crowded" not in b["t"].lower() and b["n"] <= V.SHOW_MAX
        print(f"  {b['s']:.2f}  shown {b['n']}x  {b['t']}")
    print("memory payload:", json.dumps(C.voice_payload())[:300])
    print("chat prompt gains:", C.voice_chat())
    assert C.build_system(0).endswith(C.voice_chat()[0])
    print("most the move prompt ever gained:", max(len(b) for b in blocks) + len(last) + 4, "characters")
    print("tick(): all passed")
finally:
    logging.shutdown()
    import gc
    gc.collect()               # let go of the throwaway database so Windows will delete it
    shutil.rmtree(TMP, ignore_errors=True)
    if os.path.exists(TMP):
        print("Could not delete the throwaway folder:", TMP)
