"""Mood, state and beliefs (feel.py), shown on a rigged world. No model, no files.

    python -I tests\\mood_test.py
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import world as W
import feel as F


class Rig:
    """A dice that always finds (roll=0.0) or never does (roll=0.99)."""
    def __init__(self, roll): self.roll = roll
    def random(self): return self.roll
    def choice(self, seq): return seq[0]
    def uniform(self, a, b): return (a + b) / 2


now = 1_800_000_000.0
DAY = W.sky(0, (12.0, False))


def fresh(place="dune", mood=None):
    w = W.new_world(now)
    w["crab"].update(place=place, tucked=False, energy=90)
    if mood is not None:
        w["crab"]["mood"] = mood
    return w


def dig(w, roll, times):
    seen = [F.mood(w)]
    for _ in range(times):
        w["history"] = []                       # so the same move may be made again
        w["crab"]["energy"] = 90
        assert W.apply_move(w, "dig", "", now, "Kerb", Rig(roll), sky=DAY)
        seen.append(F.mood(w))
    return seen

# 1. An old saved world has no mood: it reads as 55 and nothing breaks.
w = fresh()
assert "mood" not in w["crab"] and F.mood(w) == 55 and F.state(w) == "content"
assert F.beliefs(w, W.PLACES) == [] and "believe" not in W.describe(w, "Kerb", [], DAY)

# 2. Repeated finds lift mood; repeated empty digs lower it. Beliefs follow, built by code.
up = dig(fresh(mood=30), 0.0, 6)
print("six digs that find something:", up)
assert all(b > a for a, b in zip(up, up[1:])) and up[-1] > up[0] + 30
w = fresh()
down = dig(w, 0.99, 8)
print("eight digs that find nothing:  ", down)
assert all(b < a for a, b in zip(down, down[1:]))
print("state after the empty digs:", F.state(w), "| feeling:", W.feeling(w))
print("beliefs:", F.beliefs(w, W.PLACES))
assert F.beliefs(w, W.PLACES) == ["Digging and finding nothing gets me down."]
assert "Things you have come to believe about yourself: Digging and finding nothing gets me down." \
    in W.describe(w, "Kerb", [], DAY)

# 3. Fewer than six times is not enough for a belief.
w5 = fresh(); dig(w5, 0.99, 5)
assert F.beliefs(w5, W.PLACES) == []

# 4. A belief that stops being true drops out: the same key now gets measurements near zero.
for _ in range(60):
    F._rec(w, "dig+none", 0.0, -10, 0.0)
print("after sixty empty digs that did not hurt:", F.beliefs(w, W.PLACES))
assert not any("gets me down" in b for b in F.beliefs(w, W.PLACES))

# 5. In a sulk: no unprompted drawing, tunes, making or laps...
for place, move in (("patch", "draw"), ("driftwood", "play_tune"), ("workshop", "craft"), ("track", "lap")):
    ok, sulk = fresh(place, 60), fresh(place, 20)
    assert F.state(sulk) == "sulk"
    assert move in dict(W.valid_moves(ok, now)) and move not in dict(W.valid_moves(sulk, now)), move
# ...but what its person asked for is always still offered, there and on the way there.
for asked, place, move in (("draw", "patch", "draw"), ("tune", "driftwood", "play_tune"),
                           ("item", "workshop", "craft"), ("lap", "track", "lap")):
    sulk = fresh(place, 20); sulk["asked_art"] = asked
    away = fresh("dune", 20); away["asked_art"] = asked
    print(f"sulk, asked for {asked}: at {place} ->", [m for m, _ in W.valid_moves(sulk, now)],
          "| at dune ->", [m for m, _ in W.valid_moves(away, now)])
    assert [m for m, _ in W.valid_moves(sulk, now)] == [move]
    assert [m for m, _ in W.valid_moves(away, now)] == ["go:" + place]
    assert F.offered(sulk, [(move, "x")]) == [(move, "x")]

# 6. In a sulk the comforting places are never dropped by the "don't pace" rule.
paced = ["go:dune", "go:pool", "go:moss", "watch", "go:hollow"]
ok, sulk = fresh("glass", 60), fresh("glass", 20)
ok["history"], sulk["history"] = list(paced), list(paced)
gone = {"go:pool", "go:moss", "go:hollow"}
assert not gone & set(dict(W.valid_moves(ok, now)))
assert gone <= set(dict(W.valid_moves(sulk, now))) and "go:dune" not in dict(W.valid_moves(sulk, now))

# 7. Bright: the rest between drawings is shorter (12 moves instead of 20).
ok, bright = fresh("patch", 60), fresh("patch", 85)
for x in (ok, bright):
    x["ticks"], x["last_draw"] = 113, 100
assert F.state(bright) == "bright" and F.rest(bright, W.ART_REST) == 12
assert "draw" in dict(W.valid_moves(bright, now)) and "draw" not in dict(W.valid_moves(ok, now))

# 8. Texture: rain lifts, night in the open lowers, night in the hollow lifts, a gift and a tap lift.
def after(place, sky, move="go:glass", start="dune"):
    x = fresh(start, 50)
    assert W.apply_move(x, move, "", now, "Kerb", sky=sky), move
    return F.mood(x)
plain = after("glass", DAY)
assert after("glass", W.sky(0, (12.0, True))) > plain > after("glass", W.sky(0, (23.0, False)))
assert after("hollow", W.sky(0, (23.0, False)), "go:hollow") > after("hollow", DAY, "go:hollow")
x = fresh("glass", 50); F.event(x, "gift"); g = F.mood(x)
F.event(x, "tap"); t = F.mood(x); F.event(x, "tap")
assert g > 50 and t > g and F.mood(x) == t      # a second tap in the same move adds nothing
y = fresh("pool", 90); W.apply_move(y, "dip", "", now, "Kerb", sky=DAY)
z = fresh("pool", 20); W.apply_move(z, "dip", "", now, "Kerb", sky=DAY)
assert F.mood(y) < 90 and F.mood(z) > 20        # wading settles it from both sides
print("wading from 90 ->", F.mood(y), "| wading from 20 ->", F.mood(z))

# 9. Whatever is thrown at it, mood stays on its scale.
x = fresh("glass", 99)
for _ in range(30):
    x["ticks"] += 1; F.event(x, "gift"); F.event(x, "tap"); F.event(x, "aim_done")
assert F.mood(x) == 100
for _ in range(60):
    F.event(x, "aim_lapsed")
assert F.mood(x) == 0 and F.payload(x) == {"value": 0, "state": "sulk", "words": "in a sulk"}
print("all mood checks passed")
