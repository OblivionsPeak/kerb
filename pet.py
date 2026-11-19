"""The shrimp in the tide pool: the crab's pet.

Run entirely by the rules in this file. It has no model of its own, so it
costs nothing: the program decides what it is doing, when it is hungry and
when it brings something up from the bottom. Pure logic, like world.py.
"""
import re

HUNGRY_AFTER = 40   # moves without food before it goes looking for some
FEED_REST = 20      # moves between feeds
TALK_REST = 6       # moves between chats
GIFT_BOND = 6       # times together before it starts bringing things up
GIFT_REST = 120     # moves between the things it brings up
VERBS = ("name_pet", "feed_pet", "talk_pet", "show_pet")
NO_CLEAN = ("scrap", "feather", "seed", "treat")    # things that should not go in the water
SPARE_NAMES = ["Pip", "Dot", "Flick", "Grit", "Shim"]

DOINGS = [
    "darting about the pool",
    "picking over the stones on the bottom",
    "hanging still in the water with its feelers waving",
    "walking along the bottom on tiptoe",
    "cleaning its own feelers, one at a time",
    "tucked under a stone with only its feelers showing",
]

# what it pushes up onto the edge of the pool for the crab, once they are friends
FINDS = [
    ("pebble", "a pearl-white pebble", "no bigger than a lentil, and perfectly round"),
    ("shell", "a tiny cone shell", "pink at the tip, small enough to wear as a hat if you were a shrimp"),
    ("seaglass", "a bead of green glass", "worn into a drop shape by the pool"),
    ("shell", "a fish scale", "clear as a fingernail, with a rainbow in it when it turns"),
    ("pebble", "a grain of garnet", "dark red, picked out of the sand one grain at a time"),
    ("trinket", "a fish hook with no barb", "rusted thin, bent almost into a ring"),
    ("shell", "a barnacle plate", "a small white wedge, ridged like a fan"),
    ("marble", "a seed pearl", "lopsided and grey, but a pearl all the same"),
    ("coin", "a sequin", "a silver disc with a hole in the middle, from who knows what"),
    ("pebble", "a chip of mother-of-pearl", "it shows pink and green as it turns"),
]


def new_pet(tick):
    return {"name": None, "fed": tick, "talked": -99, "bond": 0, "doing": DOINGS[0],
            "gift": tick, "born": tick}


def label(p):
    return p.get("name") or "the shrimp"


def hungry(w):
    p = w.get("pet")
    return bool(p) and w["ticks"] - p.get("fed", 0) >= HUNGRY_AFTER


def clean_name(words):
    """A name from the model's words: one or two short words, letters only."""
    parts = re.findall(r"[A-Za-z][A-Za-z'\-]{0,11}", str(words or ""))
    if len(parts) > 2:              # a whole sentence: take the one word that looks like a name
        plain = {"i", "the", "it", "its", "my", "shrimp", "maybe", "perhaps", "name", "call", "called", "think"}
        parts = [p for p in parts[1:] if p[0].isupper() and p.lower() not in plain][:1]
    name = " ".join(parts).strip("'-")
    return name[:1].upper() + name[1:] if 2 <= len(name) <= 20 else None


def tick(w, sky, rng, names):
    """What the shrimp gets up to while the crab makes a move. Returns
    (what it is doing, a thing to add at the pool or None)."""
    p = w["pet"]
    near = w["crab"]["place"] == "pool"
    night = bool(sky) and sky.get("phase") == "night"
    if near and p["bond"] >= 2:
        p["doing"] = "at the edge of the pool nearest you, watching you"
    elif night and not near:
        p["doing"] = "asleep under a stone"
    elif hungry(w):
        p["doing"] = "picking hopefully at the stones, looking for something to eat"
    elif rng.random() < 0.5 or p["doing"] not in DOINGS:
        p["doing"] = rng.choice(DOINGS)
    find = None
    if (p["bond"] >= GIFT_BOND and not hungry(w) and not night
            and w["ticks"] - p.get("gift", 0) >= GIFT_REST and rng.random() < 0.06):
        pool = [f for f in FINDS if f[1] not in names]
        if pool:
            find = rng.choice(pool)
            p["gift"] = w["ticks"]
    return p["doing"], find


def moves(w, held):
    """What the crab can do with the shrimp, when it is at the tide pool."""
    p = w.get("pet")
    if not p:
        return []
    who = label(p)
    if not p.get("name"):
        return [("name_pet", "give the shrimp in your pool a name of its own")]
    out = []
    if w["ticks"] - p.get("fed", 0) >= FEED_REST:
        out.append(("feed_pet", f"scrape some green algae off the pool stones and feed it to {who}"
                    + (", who is hungry" if hungry(w) else "")))
    if w["ticks"] - p.get("talked", -99) >= TALK_REST:
        out.append(("talk_pet", f"tell {who} about your day"))
    if held and not held.get("polished") and held["kind"] not in NO_CLEAN and held["kind"] != "made":
        out.append((f"show_pet:{held['id']}", f"hold {held['name']} in the water for {who} to look over "
                                              "and pick clean"))
    return out


def apply(w, verb, words, crab, held, rng):
    """Carry out one of the moves above. Returns (log line, energy, curiosity)."""
    p = w["pet"]
    if verb == "name_pet":
        p["name"] = clean_name(words) or rng.choice(SPARE_NAMES)
        p["bond"] += 1
        return f"{crab} named the shrimp {p['name']}.", 2, -25
    who = label(p)
    if verb == "feed_pet":
        p["fed"] = w["ticks"]
        p["bond"] += 2
        return f"{crab} fed {who} some algae from the pool stones.", 2, -8
    if verb == "talk_pet":
        p["talked"] = w["ticks"]
        p["bond"] += 1
        return (f"{crab} told {who} about the day: “{words}”" if words else
                f"{crab} sat at the edge of the pool with {who} for a while."), 4, -12
    held["polished"] = True
    held["desc"] = held["desc"].rstrip(". ") + f". {who[:1].upper() + who[1:]} has picked it clean, so it is brighter than when it turned up."
    p["bond"] += 1
    return f"{crab} held {held['name']} in the water and {who} picked it clean.", 1, -10


def line(w):
    """The shrimp in plain words, for the crab's prompts."""
    p = w.get("pet")
    if not p:
        return None
    here = w["crab"]["place"] == "pool"
    if not p.get("name"):
        return ("A small shrimp lives in your tide pool now. It has no name yet; choosing one is "
                "yours to do, at the pool.")
    seen = f"Right now it is {p['doing']}." if here else "It lives in the pool, so you see it when you go there."
    fed = (" It has not been fed for a long while and is hungry." if hungry(w) else "")
    times = p["bond"]
    return (f"Your friend {p['name']}, the small shrimp in your tide pool. {seen}{fed} "
            f"You have spent time together {times} time{'s' if times != 1 else ''}.")


def public(w):
    """What the window is told about the shrimp."""
    p = w.get("pet")
    if not p:
        return None
    return {"name": p.get("name"), "doing": p["doing"].replace("nearest you, watching you", "nearest the crab, watching"),
            "asleep": p["doing"].startswith("asleep"), "hungry": hungry(w),
            "near": w["crab"]["place"] == "pool" and not w["crab"].get("tucked"), "bond": p["bond"]}
