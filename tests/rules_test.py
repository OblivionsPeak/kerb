"""Walk the world's rules through 12,000 random moves with aims, reading and the sky switched on.

    python tests\\rules_test.py
"""
import os
import random, sys, collections
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import world as W
rng = random.Random(7)
now = 1_800_000_000.0
w = W.new_world(now)
w["book"] = True
w["pet"] = W.pet.new_pet(0)
states = collections.Counter()
done = collections.Counter(); lapsed = collections.Counter(); taken = collections.Counter()
quiet = collections.Counter()                                    # [quiet]
th_seen = {}; th_closed = {}; th_keys = {}; th_reasons = collections.Counter()   # [threads]
plans = collections.Counter()                                    # [plans] treats and the calendar
wire = collections.Counter()                                     # [research] questions down the wire
vis = collections.Counter()                                      # [friends] notes from visitors, as ordinary finds
for n in range(12000):
    now += 75
    # [research] the wire is there for long spells, gone for others; now and then the person asks
    w["wire"] = 0 if (n // 1500) % 3 == 2 else 3
    if w["wire"] == 0 and w.get("asked_art") == "research": w["asked_art"] = None      # as crab.py does
    if n % 900 == 450 and w["wire"] and not w.get("asked_art"):
        w["asked_art"] = "research"; w["asked_words"] = "search the web for sea glass"; wire["asked"] += 1
    w["crab"]["napping_until"] = None
    notes = {k for k, i in w["items"].items() if i.get("visitor")}   # [friends]
    if n % 150 == 60 and sum(i["place"] not in ("ledge", "chest", "hook") for i in w["items"].values() if i.get("visitor")) < 3:  # [friends]
        W.add_item(w, "scrap", f"a note from Ana {n}", "It says: the visitor says hello.", "tideline", "visitor", now)["visitor"] = n + 1
        vis["given"] += 1
    W.pet_tick(w, W.sky(now), now, rng)
    W.tide(w, now, rng); W.wash_away(w); W.grow(w, 2 if W.sky(now)["rain"] else 1)
    vis["tide took"] += len(notes - set(w["items"]))             # [friends] the tide may take one like anything else
    if not w.get("aim"):
        ch = W.aim_choices(w)
        assert ch and len({a for a, _ in ch}) == len(ch), ch
        a = rng.choice(ch)[0]
        assert W.set_aim(w, a, now), a
        assert W.set_aim(w, a, now) is None          # cannot take a second
        taken[a.split(":")[0]] += 1
    # [plans] a treat from the person now and then, and a plan on the calendar for a spell
    plans["off"] += len(W.go_off(w))
    if n % 300 == 20:
        W.add_item(w, "treat", f"a berry {n}", "ripe", "glass", "from you", now)
        plans["given"] += 1
    if n % 500 == 0:
        w["plan_now"] = {"id": n, "title": "Race at Road America", "until": now + 40 * 75}
    on = W.plan_on(w, now)
    moves = [m for m in W.valid_moves(w, now)]
    assert moves
    ids = [x[0] for x in moves]
    treat_ids = {str(i["id"]) for i in w["items"].values() if i["kind"] == "treat"}
    assert not any(x.startswith("toss:") and x[5:] in treat_ids for x in ids), ids
    if on and w["crab"]["place"] != "glass" and any(x.startswith("go:") for x in ids) \
            and w["crab"]["energy"] >= 15 and not w.get("asked_art"):
        assert "go:glass" in ids, ids                            # never paced away
        assert "Race at Road America" in dict(moves)["go:glass"]
    if on and w["crab"]["place"] == "glass" and len(ids) > 1 and (w["history"] or [""])[-1] != "attend":
        assert "attend" in ids, ids
    if not on:
        assert "attend" not in ids
    # a walker that leans towards its aim, like the model is asked to
    kind = w["aim"]["id"].split(":")[0]
    pref = [m for m in moves if any(m[0] == "go:" + p for p in W.AIM_PLACES.get(kind, ()))
            or m[0].split(":")[0] in {"lap","explore","dig","read","craft","build","plant","tend","forage","put_down","pick_up"}]
    m = rng.choice(pref if pref and rng.random() < 0.7 else moves)[0]
    # [quiet] some of the time the program moves without the model, as tick() does
    auto = W.auto_move(w, now, rng) if rng.random() < 0.6 else None
    if auto:
        assert auto in {x[0] for x in moves}, auto
        assert auto == "idle" or len(moves) == 1, (auto, moves)
        m = auto
        quiet["program:" + m.split(":")[0]] += 1
    else:
        w["last_model"] = w["ticks"]
        quiet["model"] += 1
    quiet["idle offered"] += any(x[0] == "idle" for x in moves)
    m = next((x for x in ids if x.startswith("eat:") or x == "attend") if rng.random() < 0.5 else iter(()), m)  # [plans]
    # [research] never offered with the wire off; of its own accord only at the reading stone, rested, with a find
    if "research" in ids:
        assert w["wire"] > 0 and w["crab"]["place"] == "library", ids
        if w.get("asked_art") == "research": assert ids == ["research"], ids
        else: assert W.wire_find(w) and w["ticks"] - w.get("last_wire", -99) >= W.WIRE_REST, ids
        if rng.random() < 0.7: m = "research"
    if not w["wire"]: assert "research" not in ids and not W.wire_lines(w)
    wire_was = (w.get("asked_art") == "research", w.get("tally", {}).get("read", 0), W.wire_find(w))
    if m == "research":                                          # as crab.py's wire_ask does, with a stub
        it = None if wire_was[0] else wire_was[2]
        w["wire_now"] = w["ticks"]; w["wire_about"] = "sea glass" if wire_was[0] else it["name"]
        w["wire_item"] = it["id"] if it else None
        wire_title = "Sea glass" if rng.random() < 0.7 else ""
        if it and wire_title: it.update(learned="x", learned_title=wire_title, wired=True)
        elif it: it["searched"] = True
    if m == "craft":
        w["making"] ={"work": n, "name": f"a thing {n}", "about": "x", "px": ["." * 12] * 12}
    words = "Pip!! the 2nd" if m == "name_pet" else "Amber" if m == "read" and rng.random() < 0.8 else ("fine" if m.startswith("examine") else "")
    if m == "research": words = wire_title                       # [research]
    gap, notable = w["since_diary"], w.get("notable", 0)          # [voice] the diary bar
    if w["crab"]["energy"] >= 15 and not all(k.startswith("go:") for k in dict(moves)) and not w.get("asked_art"):   # not when worn out, staring or asked
        assert ("write_diary" in dict(moves)) == W.diary_due(w)
        assert gap < W.DIARY_ALWAYS or "write_diary" in dict(moves)
    if m == "write_diary":
        assert gap >= W.DIARY_MIN and (notable or gap >= W.DIARY_QUIET), (gap, notable)
        diary_gaps = globals().setdefault("diary_gaps", collections.Counter())
        diary_gaps["with something notable" if notable else "quiet"] += 1
    # [threads] as read_up does, the find is marked before the move. Only when the read stays
    # allowed without a find to wonder about: marking it first can otherwise make the move invalid.
    if m == "read" and W.wondering(w) and w["ticks"] - w.get("last_read", -99) >= W.ART_REST:
        p = W.wondering(w)
        if words: p["learned"] = "x"; p["learned_title"] = words
        else: p["no_entry"] = True
    before = (w["crab"]["energy"], len(w["items"]))              # [plans]
    vis["look offered"] += any(x.startswith("examine:") and x[8:] in notes for x in ids)   # [friends]
    vis["toss offered"] += any(x.startswith("toss:") and x[5:] in notes for x in ids)       # [friends]
    vis[m.split(":")[0]] += m.partition(":")[2] in notes         # [friends] what was done to a note, by verb
    text = W.apply_move(w, m, words, now, "Kerb", rng, sky=W.sky(now))
    if m == "research":                                          # [research]
        about = "sea glass" if wire_was[0] else wire_was[2]["name"]
        assert text.startswith(f"Kerb sent a question down the wire about {about}, and " + ("an answer came back: Sea glass" if words else "no answer came back")), text
        assert w["last_wire"] == w["ticks"] - 1 and w.get("asked_art") != "research"
        assert not any(k in w for k in ("wire_about", "wire_item", "wire_now"))
        assert w["tally"].get("read", 0) == wire_was[1] + bool(words)    # an answer counts as a subject read
        assert "research" not in dict(W.valid_moves(w, now))             # never twice running
        if wire_was[2] and not wire_was[0]: assert W.wire_find(w) is not wire_was[2]      # never the same find again
        wire[("asked " if wire_was[0] else "own ") + ("answered" if words else "nothing back")] += 1
        wire["threads finished"] += any(t["kind"] == "wondering" and t["stage"] == "resolved" and t["steps"][-1]["text"].startswith("an answer came back down the wire") for t in w["threads"])
    if m == "write_diary":
        assert w["since_diary"] == 0 and w["notable"] == 0
    # [threads] what is on its mind is measured, bounded and never reopened
    ths = w["threads"]; op = [t for t in ths if t["stage"] == "open"]
    assert len(op) <= W.TH.MAX_OPEN and len(ths) - len(op) <= W.TH.KEEP_CLOSED, ths
    assert len(W.TH.on_mind(w)) <= 4
    for t in ths:
        key = W.TH._key(t["kind"], t["about"])
        assert t["stage"] in ("open", "resolved", "put aside") and 1 <= len(t["steps"]) <= W.TH.MAX_STEPS
        assert th_seen.setdefault(t["id"], key) == key
        if t["stage"] == "open":
            assert t["id"] not in th_closed, t                       # closed is closed for good
            a = t["about"]                                           # its subject is really there
            if t["kind"] == "wondering": assert str(a["item"]) in w["items"] and not w["items"][str(a["item"])].get("learned"), t
            if t["kind"] == "looking": assert any(p["id"] == a["plant"] and W.plant_stage(p) < len(W.STAGES) - 1 for p in w["plants"]), t
            if t["kind"] == "making": assert a["topic"], t
            if t["kind"] == "meaning": assert w["aim"] and (w["aim"]["id"], w["aim"]["tick"]) == (a["aim"], a["tick"]), t
        elif t["id"] not in th_closed:
            th_closed[t["id"]] = (t["kind"], t["stage"])
        assert th_keys.setdefault(key, t["id"]) == t["id"], t           # one thread per subject, ever
    if "," in text and any(x in text for x in ("wonder", "meant to", "see it through", "seeing through", "see fully grown", "set out to do")):
        th_reasons[m.split(":")[0]] += 1
    if m.startswith("eat:"):                                     # [plans]
        assert text.startswith("Kerb ate a berry") and m[4:] not in w["items"], text
        assert len(w["items"]) == before[1] - 1 and w["crab"]["energy"] >= before[0]
        assert w["crab"]["carrying"] is None or str(w["crab"]["carrying"]) in w["items"]
        plans["eaten"] += 1
    if m == "attend":                                            # [plans]
        assert text == "Kerb was at the glass for Race at Road America.", text
        w.pop("plan_now")                                        # as crab.py does after the move
        plans["attended"] += 1
    assert not any(i["kind"] == "treat" and i["place"] in W.NO_TREATS for i in w["items"].values())
    w.pop("making", None)
    assert text, m
    h = w["history"]                                             # [quiet]
    assert h[-2:] != ["idle", "idle"] and h[-W.IDLE_EVERY:].count("idle") <= 1, h
    if m == "idle":
        assert text.startswith("Kerb spent a while at ") and "glass" not in text, text
        quiet["idle"] += 1
    stared = len(h) > W.STARE_MAX and not any(x.startswith("go:") for x in h[-W.STARE_MAX - 1:])
    assert not stared or m == "nap", h                           # the stare guard forces a walk
    assert 0 <= w["crab"]["mood"] <= 100, w["crab"]["mood"]     # mood never leaves its scale
    states[W.feel.state(w)] += 1
    if W.feel.state(w) == "sulk":                                # no making or racing off its own bat in a sulk
        assert not {a for a, _ in W.valid_moves(w, now)} & W.feel.UNPROMPTED
    assert len(W.feel.beliefs(w, W.PLACES)) <= W.feel.MAX_BELIEFS
    assert len(W.items_at(w, "hook")) <= 1                       # the hook holds one thing
    assert len(W.items_at(w, "ledge")) <= W.DISPLAY_MAX      # the crab never overfills the ledge
    if m == "read":
        p = W.wondering(w)
        if p: p["learned"] = "x"; p["learned_title"] = "X"
    W.describe(w, "Kerb", [], W.sky(now))
    e = W.aim_check(w)
    if e: (done if e[0] == "done" else lapsed)[e[1].split(" ")[0] + " " + e[1].split(" ")[1]] += 1
    W.helmet_check(w)
print("taken", dict(taken)); print("done", dict(done)); print("lapsed", dict(lapsed))
print("diary entries", dict(diary_gaps))
print("threads opened", len(th_seen), "closed by kind and outcome", dict(sorted(collections.Counter(th_closed.values()).items())))   # [threads]
print("threads still open", [(t["kind"], t["title"]) for t in w["threads"] if t["stage"] == "open"])
print("moves that gained a reason clause", dict(th_reasons))
# making threads are rare under a random walker (tests/threads_test.py walks one through by hand)
assert {k for k, _ in th_closed.values()} >= {"wondering", "looking", "meaning"}
assert {("wondering", "resolved"), ("looking", "resolved"), ("meaning", "resolved")} <= set(th_closed.values())
print("tally", w["tally"], "laps", w.get("laps"), "ledge", len(W.items_at(w,"ledge")), "chest", len(W.items_at(w,"chest")), "hook", [i["name"] for i in W.items_at(w,"hook")], "plants", len(w.get("plants",[])))
print(W.describe(w, "Kerb", [], W.sky(now, (22.5, True)))[:600])
print([W.sky(0,(h,False))["phase"] for h in (0,4.9,5,7.4,8,12,16,19,20.4,21,23.9)])
print("rain share", sum(W.sky(1_800_000_000 + i*1800)["rain"] for i in range(5000))/5000)
# [quiet] a request from its person: the walk needs no model, the request itself does
w["crab"].update(place="dune", energy=80); w["asked_art"] = "draw"
assert W.auto_move(w, now, rng) == "go:patch"
w["crab"]["place"] = "patch"
assert W.valid_moves(w, now)[0][0] == "draw" and W.auto_move(w, now, rng) is None
w["asked_art"] = None
w["crab"].update(place="dune", energy=5)
assert W.auto_move(w, now, rng) == "go:hollow"
w["crab"]["place"] = "hollow"
assert W.auto_move(w, now, rng) == "nap"
print("quiet", dict(quiet))
print("mood", w["crab"]["mood"], "states", dict(states), "felt keys", len(w["felt"]))
print("beliefs", W.feel.beliefs(w, W.PLACES))
# [night] the drift guard: 200 nights of a model that always names the same leaning, on random days
import night
for used_all in (True, False):
    s = night.normal({}); alone = 0
    for n in range(200):
        day = [rng.choice(["dig", "read", "lap", "tend", "explore", "craft", "rest", "go:dune"]) for _ in range(20)] if used_all else ["read"]
        s, raised, note = night.settle(s, "reader", night.exercised(day))
        assert max(s["w"].values()) <= night.TOP and sum(s["w"].values()) <= night.TOTAL, s
        alone = alone + 1 if sum(v > 0 for v in s["w"].values()) == 1 else 0
        assert not used_all or alone <= night.SOLO_NIGHTS, (n, s)
        assert used_all or n < 9 or s["w"] == dict(night.normal({})["w"], reader=1), (n, s)
    print("night", "mixed days" if used_all else "reading only", {k: v for k, v in s["w"].items() if v}, night.sentence(s["w"]))

# [plans] treats and the calendar, step by step
print("treats and plans", dict(plans))
assert plans["eaten"] and plans["off"] and plans["attended"], plans
assert plans["eaten"] + plans["off"] + sum(i["kind"] == "treat" for i in w["items"].values()) == plans["given"]
t = W.new_world(now); t["crab"].update(place="glass", energy=50, mood=50)
it = W.add_item(t, "treat", "a slice of mango", "", "glass", "from you", now)
assert (f"eat:{it['id']}", "eat a slice of mango, the treat from your person, before it goes off") in W.valid_moves(t, now)
assert W.apply_move(t, f"pick_up:{it['id']}", "", now, "Kerb")
assert "something to eat" in W.describe(t, "Kerb", []) and "put it on show" not in W.describe(t, "Kerb", [])
for place in W.NO_TREATS[:1] + ("workshop", "hollow"):          # carried there: never kept
    t["crab"]["place"] = place; t["history"] = []
    got = {m.split(":")[0] for m, _ in W.valid_moves(t, now)}
    assert not got & {"hang", "store", "toss"} and ("put_down" in got) == (place == "hollow"), (place, got)
    assert f"eat:{it['id']}" in dict(W.valid_moves(t, now))
assert W.apply_move(t, f"eat:{it['id']}", "sweet", now, "Kerb") == "Kerb ate a slice of mango."
assert t["crab"]["mood"] > 55 and t["crab"]["energy"] > 55 and not t["items"].get(str(it["id"]))
assert t["crab"]["carrying"] is None
t = W.new_world(now)                                             # a world with no mood: still fine
it = W.add_item(t, "treat", "a crumb", "", "hollow", "from you", now)
assert W.apply_move(t, f"eat:{it['id']}", "", now, "Kerb")
it = W.add_item(t, "treat", "a grape", "", "glass", "from you", now)
t["ticks"] += W.TREAT_KEEPS - 1; assert W.go_off(t) == []
t["ticks"] += 1; assert W.go_off(t) == ["a grape"] and str(it["id"]) not in t["items"]
t["crab"]["place"] = "dune"; t["history"] = ["go:glass", "dig", "go:dune"]   # the glass was walked to lately
assert "go:glass" not in dict(W.valid_moves(t, now))
t["plan_now"] = {"id": 1, "title": "Race at Road America", "until": now + 60}
assert "Race at Road America" in dict(W.valid_moves(t, now))["go:glass"]
assert W.apply_move(t, "attend", "", now, "Kerb") is None        # not at the glass: not allowed
t["crab"]["place"] = "glass"
assert "attend" not in dict(W.valid_moves(t, now + 61))          # the plan is over
assert W.apply_move(t, "attend", "Good luck.", now, "Kerb") == "Kerb was at the glass for Race at Road America."
print("treats and plans ok")

# [research] the wire, step by step
print("wire", dict(wire))
assert wire["own answered"] and wire["own nothing back"] and wire["asked answered"] and wire["threads finished"], wire
t = W.new_world(now); t["crab"].update(place="library", energy=80); t["items"].clear(); t["book"] = True
gift = W.add_item(t, "trinket", "a visor tear-off", "PRIVATE WORDS", "ledge", "from you", now)
gift["note"] = "odd"; gift["no_entry"] = True
assert "research" not in dict(W.valid_moves(t, now)) and not W.wire_lines(t)       # no wire in an old world
t["wire"] = 2
assert "a visor tear-off" in dict(W.valid_moves(t, now))["research"] and "PRIVATE" not in str(W.valid_moves(t, now))
assert len(W.wire_lines(t)) == 1 and "PRIVATE" not in W.describe(t, "Kerb", [])
gift["searched"] = True
assert "research" not in dict(W.valid_moves(t, now)) and not W.wire_lines(t)       # asked once already
gift["searched"] = False; t["last_wire"] = t["ticks"] - (W.WIRE_REST - 1)
assert "research" not in dict(W.valid_moves(t, now))                              # rested 39 moves: not yet
t["asked_art"] = "research"; t["crab"]["place"] = "dune"
assert W.valid_moves(t, now) == [("go:library", "walk to the reading stone to send your person's question down the wire to the wider world")]
assert W.auto_move(t, now, rng) == "go:library"
t["crab"]["place"] = "library"
assert [m for m, _ in W.valid_moves(t, now)] == ["research"] and W.auto_move(t, now, rng) is None
t["wire"] = 0
assert "research" not in dict(W.valid_moves(t, now)) and len(W.valid_moves(t, now)) > 1   # wire gone: not stuck
assert W.apply_move(t, "research", "X", now, "Kerb") is None
print("wire ok")
# [friends] a visitor's note is looked at, kept, tossed and washed away like any other scrap
vis["kept"] = sum(1 for i in w["items"].values() if i.get("visitor") and i["place"] in ("ledge", "chest", "hook"))
print("visitor notes", {k: v for k, v in vis.items() if v})
assert vis["given"] > 20 and vis["tide took"] and vis["examine"] and vis["pick_up"] and vis["toss"], vis
assert vis["look offered"] and vis["toss offered"] and vis["tide took"] + vis["toss"] <= vis["given"], vis
assert all(i["kind"] == "scrap" and i["from"] == "visitor" for i in w["items"].values() if i.get("visitor"))
