"""The terrarium: its places, its things, and the rules for what the crab can do.

Pure logic. No files, no network, no model. The model only ever picks one entry
from the list that valid_moves() returns; everything that happens to the world
happens in apply_move(), in this file.
"""
import math
import random
import time

import pet
import threads as TH  # [threads]
import feel  # [mood]

PLACES = {
    "hollow": ("the hollow under the driftwood", "dim and quiet, your favourite place to sleep, with a "
                                                 "hook on the branch above it where one thing can hang"),
    "pool": ("the tide pool", "shallow cool water"),
    "tideline": ("the tideline", "where the tide leaves new things"),
    "driftwood": ("the top of the driftwood", "the highest point, good for looking around"),
    "ledge": ("the stone ledge", "where your favourite things are on show, with your tool chest "
                                 "at the back of it for the rest of your collection"),
    "dune": ("the dune", "soft sand, good for digging"),
    "glass": ("the front glass", "the spot nearest your person, where you can sit close to them"),
    "workshop": ("the workshop", "a flat board where you pile up spare things to build with"),
    "patch": ("the smooth patch of sand", "flat damp sand that is good for drawing in with a claw"),
    # the second tank, through the glass tube in the right-hand wall
    "moss": ("the moss bank", "in the second tank: a deep cushion of damp green moss where seeds hide"),
    "spring": ("the spring", "in the second tank: fresh water trickling over stones into a small pool"),
    "garden": ("the garden bed", "in the second tank: dark soil where seeds can be planted and grown"),
    "cave": ("the cave", "in the second tank: a gap under the boulders, lit by a small lantern, with something glinting further in"),
    "track": ("the sand track", "in the second tank: an oval lane with kerbs, just wide enough to run laps"),
    "library": ("the reading stone", "in the second tank: a flat stone with a fat encyclopedia propped open on it"),
}
SECOND_TANK = {"moss", "spring", "garden", "cave", "track", "library"}
GARDEN_MAX = 8      # places in the garden bed
GROW_EVERY = 30     # moves a plant spends at each stage; tending hurries it along
STAGES = ["a seed in the soil", "a sprout", "a young plant", "in bud", "fully grown"]
ART_REST = 20       # moves between drawings, and between tunes, unless the person asks
MADE_MAX = 12       # things of its own making in the tank before it stops making more unasked
WONDER_REST = 8     # moves between lookups when there is a find it wants to read about
AIM_LAPSE = 150     # moves before something it set out to do and never did is quietly dropped
DISPLAY_MAX = 8     # favourites on show on the ledge; everything else it keeps goes in the chest
SWAP_REST = 10      # moves between taking things off the ledge, so it does not shuffle all day

# What each kind of thing counts as when building.
MATERIAL = {"pebble": "stone", "shell": "shell", "feather": "soft", "scrap": "soft",
            "seaglass": "glass", "marble": "glass", "nut": "metal", "washer": "metal",
            "coin": "metal", "key": "metal", "cap": "metal", "button": "metal",
            "trinket": "odd"}
MATERIAL_WORDS = {"stone": "stones or pebbles", "shell": "shells", "soft": "feathers or paper scraps",
                  "glass": "pieces of glass or marbles", "metal": "metal bits", "odd": "odd trinkets"}

# id: (what it is, where it goes, the place the crab ends up, what it needs)
BLUEPRINTS = {
    "cairn": ("a cairn of stacked stones", "behind the dune", "dune", {"stone": 3}),
    "shellring": ("a ring of shells", "on the sand near the front glass", "glass", {"shell": 3}),
    "flag": ("a feather flag on a pole", "behind the dune", "dune", {"soft": 1, "metal": 1}),
    "suncatcher": ("a glass sun-catcher", "in the front corner by the pool", "pool", {"glass": 2}),
    "chime": ("a wind chime of metal bits", "by the side wall", "pool", {"metal": 3}),
    "board": ("a notice board", "beside the front glass", "glass", {"soft": 1, "stone": 1}),
    "stones": ("stepping stones", "across the tide pool", "pool", {"stone": 2, "metal": 1}),
    "nest": ("a soft nest", "in the hollow", "hollow", {"soft": 2}),
}


MATERIAL_ONE = {"stone": "stone or pebble", "shell": "shell", "soft": "feather or paper scrap",
                "glass": "piece of glass or marble", "metal": "metal bit", "odd": "odd trinket"}


def needs_text(needs):
    return " and ".join(f"{n} {(MATERIAL_ONE if n == 1 else MATERIAL_WORDS)[m]}"
                        for m, n in needs.items())


def pick_materials(w, needs):
    """The pile items a blueprint would use (oldest first), or None if the
    pile falls short. A gift only counts once it is on the workshop pile."""
    pile = items_at(w, "workshop")
    chosen = []
    for material, count in needs.items():
        have = [i for i in pile if MATERIAL.get(i["kind"]) == material and i not in chosen]
        if len(have) < count:
            return None
        chosen += have[:count]
    return chosen


def unbuilt(w):
    done = {s["id"] for s in w.get("structures", [])}
    return [b for b in BLUEPRINTS if b not in done]

# name, things needed on the ledge before it washes up
HELMETS = [
    ("a scuffed karting helmet off an old trophy", 0),
    ("an open-face helmet with a leather strap", 8),
    ("a full-face helmet in faded racing green", 20),
    ("a carbon endurance helmet with a tinted visor", 40),
]

KINDS = ["shell", "pebble", "seaglass", "cap", "nut", "washer", "feather",
         "coin", "button", "marble", "key", "trinket", "scrap", "seed"]
KINDS.append("treat")       # something to eat, given by the person; it does not keep  # [plans]

TIDE = [
    ("shell", "a spiral shell", "small, cream with brown bands, too small to live in"),
    ("shell", "a broken scallop shell", "half a fan, pink on the inside"),
    ("shell", "a periwinkle shell", "dark and glossy, the size of a pea"),
    ("shell", "a limpet shell", "a tiny grey cone with a worn top"),
    ("shell", "a cowrie shell", "smooth and speckled, with a toothed slit"),
    ("pebble", "a striped pebble", "grey with one white band right round it"),
    ("pebble", "a flat black pebble", "smooth enough to skim"),
    ("pebble", "a red pebble", "brick coloured, rough on one side"),
    ("pebble", "a speckled pebble", "white with black flecks, like a quail egg"),
    ("seaglass", "a piece of green sea glass", "frosted, worn smooth at the edges"),
    ("seaglass", "a piece of blue sea glass", "deep blue, thick, from the base of a bottle"),
    ("seaglass", "a piece of amber sea glass", "honey coloured with one sharp corner left"),
    ("seaglass", "a sliver of clear sea glass", "almost invisible when wet"),
    ("cap", "a red bottle cap", "crimped edge, faded lettering nobody could read"),
    ("cap", "a tyre valve cap", "black plastic, with a thread inside"),
    ("cap", "a green bottle cap", "bent in the middle, a little rusty"),
    ("nut", "a wheel nut", "heavy, hexagonal, with a scorched look"),
    ("nut", "a small brass nut", "bright yellow metal, thread still clean"),
    ("washer", "a steel washer", "a flat ring, cold to the touch"),
    ("washer", "a rubber o-ring", "black, stretchy, smells faintly of oil"),
    ("feather", "a grey feather", "soft at the base, stiff at the tip"),
    ("feather", "a white feather", "small and curled"),
    ("coin", "a small copper coin", "worn so flat the face is a ghost"),
    ("coin", "a foreign coin", "silver coloured with a hole through the middle"),
    ("button", "a blue button", "four holes, a thread still caught in one"),
    ("button", "a brass button", "domed, with an anchor stamped on it"),
    ("marble", "a glass marble", "clear with a green twist inside"),
    ("marble", "a ball bearing", "a perfect steel sphere that shows the whole room"),
    ("key", "a tiny key", "the sort that opens a padlock or a diary"),
    ("trinket", "a scrap of visor tear-off", "a clear curl of film with a tab at one end"),
    ("trinket", "a zip tie", "black, already pulled tight and cut"),
    ("trinket", "a chequered flag pin", "enamel, the pin on the back bent flat"),
    ("trinket", "a toy brick", "yellow, two studs by two"),
    ("trinket", "a guitar pick", "tortoiseshell, worn thin at the point"),
    ("trinket", "a die", "white with black pips, one corner chipped"),
    ("shell", "a mussel shell", "blue-black outside, pearly inside"),
    ("shell", "a whelk shell", "a pale twist with a chipped lip"),
    ("shell", "a cockle shell", "ribbed like a tiny fan, the colour of toast"),
    ("pebble", "a green pebble", "sea-worn serpentine, waxy to the touch"),
    ("pebble", "a pebble shaped like a heart", "pink granite, lopsided"),
    ("seaglass", "a piece of pink sea glass", "rare, the colour of a shrimp"),
    ("seaglass", "a bottle neck", "green glass, the ring of the lip still whole"),
    ("cap", "a yellow bottle cap", "scratched, with a star printed inside"),
    ("nut", "a lug nut", "chromed once, pitted now"),
    ("washer", "a split pin", "bent open like a hairpin"),
    ("feather", "a striped feather", "brown bars on cream, from something that hunts"),
    ("feather", "a blue feather", "small, and bright as enamel along one edge"),
    ("coin", "an arcade token", "brass, with NO CASH VALUE round the rim"),
    ("button", "a red toggle", "a wooden peg button off a coat"),
    ("marble", "a wooden bead", "painted green, the paint mostly gone"),
    ("key", "a hex key", "a small steel L, rounded at the short end"),
    ("trinket", "a cork", "swollen with sea water, branded with a letter"),
    ("trinket", "a pencil stub", "chewed, with a brass ferrule and no rubber"),
    ("trinket", "a jigsaw piece", "sky, and nothing but sky"),
    ("trinket", "a plastic dinosaur", "green, the size of a thumbnail, missing its tail"),
    ("trinket", "a cable clip", "white, with its little nail still in"),
    ("trinket", "a paddock pass lanyard clip", "a sprung steel hook on a swivel"),
]

BURIED = [
    ("coin", "an old silver coin", "black with tarnish, a date too worn to read"),
    ("key", "a rusty key", "long, with a looped handle"),
    ("shell", "a fossil shell", "turned to stone, heavy for its size"),
    ("marble", "a clay marble", "dull brown, older than glass ones"),
    ("nut", "a spark plug cap", "ceramic, with a metal collar"),
    ("button", "a bone button", "yellowed, carved by hand"),
    ("pebble", "a piece of quartz", "milky, with a clear seam through it"),
    ("trinket", "a thimble", "dented, with a ring of tiny dimples"),
    ("seaglass", "a red glass bead", "round, with a hole for a thread"),
    ("washer", "a bent paper clip", "someone straightened it and gave up"),
    ("shell", "a shark's tooth", "grey and glossy, serrated down both edges"),
    ("shell", "a sand dollar", "a chalk-white disc with a five-petalled flower pressed into it"),
    ("shell", "a razor clam shell", "long and narrow, both halves still hinged"),
    ("pebble", "a piece of flint", "grey outside, glassy black where it has chipped"),
    ("pebble", "a hag stone", "a pebble with a hole worn clean through it"),
    ("pebble", "a lump of amber", "warm to the touch, with a gnat caught inside"),
    ("pebble", "a pumice stone", "full of holes and light enough to float"),
    ("pebble", "a fossil fern", "a slate chip with a leaf printed on it"),
    ("seaglass", "a marble stopper", "the glass ball from the neck of an old bottle"),
    ("seaglass", "a shard of willow-pattern china", "blue and white, with half a bridge on it"),
    ("seaglass", "a lens", "a small round lens that turns everything upside down"),
    ("coin", "a brass token", "stamped ONE LAP on one side and worn smooth on the other"),
    ("coin", "a bent sixpence", "silver, folded nearly double for luck"),
    ("coin", "a medal with no ribbon", "bronze, for coming third in something"),
    ("key", "a clock key", "brass, with a square socket and a butterfly handle"),
    ("key", "an ignition key", "cut on both edges, the plastic head long gone"),
    ("nut", "a wheel stud", "a thick threaded bolt, sheared off at one end"),
    ("nut", "a brass rivet", "mushroom headed, green round the edge"),
    ("washer", "a piston ring", "a springy steel ring with a gap in it"),
    ("washer", "a curtain ring", "brass, worn thin on one side"),
    ("button", "a military button", "tarnished, with a crown still showing"),
    ("button", "a mother-of-pearl button", "it shows pink and green as it turns"),
    ("marble", "a cat's-eye marble", "clear, with a yellow blade inside"),
    ("marble", "a lead shot", "a dull grey ball, far heavier than it looks"),
    ("cap", "an oil filler cap", "black, with a little oil can moulded on top"),
    ("feather", "a quill", "a long feather with its tip cut to a point and stained with ink"),
    ("trinket", "a tin soldier", "one leg missing, paint down to the metal"),
    ("trinket", "a pocket watch cog", "a brass wheel thinner than paper"),
    ("trinket", "a spark plug", "the porcelain cracked, the gap packed with sand"),
    ("trinket", "a domino", "the double four, yellowed like an old tooth"),
    ("trinket", "a fishing lure", "a silver spoon shape with a rusted hook eye"),
    ("trinket", "a chess pawn", "black, turned from wood, chewed at the top"),
    ("trinket", "a toy car wheel", "a rubber tyre the size of a pea on a chrome hub"),
    ("trinket", "a dog tag", "blank on both sides, with a ball chain through it"),
]

# seed name, what it looks like, the plant it grows into
SEEDS = [
    ("a poppy seed", "a black speck no bigger than a grain of sand", "poppy"),
    ("a sunflower seed", "striped grey and white, pointed at one end", "sunflower"),
    ("a fern spore", "a brown dot from the underside of a frond", "fern"),
    ("a bean", "smooth and speckled, heavy for a seed", "bean"),
    ("a clover seed", "tiny, round and yellow-green", "clover"),
    ("a thistle seed", "a dark seed with a tuft of down", "thistle"),
    ("a bluebell bulb", "a papery white bulb the size of a pea", "bluebell"),
    ("a daisy seed", "a pale sliver, light enough to blow away", "daisy"),
]
PLANT_NAMES = {"poppy": "a poppy", "sunflower": "a sunflower", "fern": "a fern",
               "bean": "a bean vine", "clover": "a patch of clover", "thistle": "a thistle",
               "bluebell": "a bluebell", "daisy": "a daisy"}

CAVE = [
    ("pebble", "a shard of amethyst", "purple, with flat faces that catch the light"),
    ("seaglass", "a clear crystal point", "six sided, cold, sharp at the tip"),
    ("pebble", "a lump of fool's gold", "brassy cubes grown into each other"),
    ("coin", "a very old token", "green with age, a hole punched off centre"),
    ("trinket", "a tiny brass gear", "eleven teeth, one of them bent"),
    ("marble", "a moonstone bead", "milky, with a blue glow when it turns"),
    ("pebble", "a piece of obsidian", "black glass with an edge like a blade"),
    ("shell", "an ammonite", "a coiled shell turned to stone, ridged all the way round"),
    ("nut", "a rusted wing nut", "seized solid, flaking orange"),
    ("trinket", "a bat's tooth", "a white needle, curved, very small"),
    ("pebble", "a geode half", "dull as a potato outside, lined with sparkle inside"),
    ("pebble", "a stalactite tip", "a stone icicle, still damp"),
    ("pebble", "a lump of rose quartz", "cloudy pink, cool as water"),
    ("seaglass", "a sliver of mica", "a clear flake that peels into thinner flakes"),
    ("marble", "a cave pearl", "a white stone ball polished by dripping water"),
    ("coin", "a hammered coin", "not quite round, with a cross cut into it"),
    ("key", "a skeleton key", "black iron, its teeth eaten by rust"),
    ("trinket", "an arrowhead", "chipped from flint, the point still sharp"),
    ("trinket", "a miner's tag", "a brass disc stamped with the number 22"),
    ("shell", "a snail shell", "empty, bleached white, thin as paper"),
]


def plant_stage(p):
    return min(len(STAGES) - 1, p["growth"] // GROW_EVERY)


def grow(w, by=1):
    """Every plant in the bed gets a little older. Returns log lines for the
    moments worth mentioning: the first sprout and the day it is fully grown."""
    out = []
    for p in w.get("plants", []):
        if plant_stage(p) < len(STAGES) - 1:
            p["growth"] += by
        stage = plant_stage(p)
        if stage > p.get("told", 0):
            p["told"] = stage
            bare = p["name"].split(" ", 1)[1]
            if stage == 1:
                out.append(f"A sprout has come up in the garden bed where {p['seed']} was planted.")
            elif stage == len(STAGES) - 1:
                out.append(f"The {bare} in the garden bed is fully grown.")
    return out


def new_world(now):
    w = {
        "crab": {"place": "hollow", "carrying": None, "energy": 90, "curiosity": 60,
                 "tucked": True, "napping_until": None, "helmet": 0},
        "items": {}, "next_id": 1, "history": [], "notices": [],
        "last_tide": 0, "last_note": 0, "since_diary": 0, "ticks": 0,
        "new_helmet_waiting": False, "born": now,
    }
    rng = random.Random()
    for kind, name, desc in rng.sample(TIDE, 2):
        add_item(w, kind, name, desc, "tideline", "tide", now)
    w["last_tide"] = now
    return w


def add_item(w, kind, name, desc, place, origin, now):
    item = {"id": w["next_id"], "kind": kind, "name": name, "desc": desc,
            "place": place, "from": origin, "ts": now, "note": "",
            "tick": w.get("ticks", 0)}
    w["items"][str(item["id"])] = item
    w["next_id"] += 1
    return item


def items_at(w, place):
    return sorted((i for i in w["items"].values() if i["place"] == place),
                  key=lambda i: i["id"])


def kept(w):
    """The whole collection: what is on show on the ledge and what is put away
    in the tool chest. 'chest' is not a place the crab can walk to; it stands
    on the ledge and is reached from there."""
    return items_at(w, "ledge") + items_at(w, "chest") + items_at(w, "hook")


def carried(w):
    cid = w["crab"]["carrying"]
    return w["items"].get(str(cid)) if cid else None


def feeling(w):
    c = w["crab"]
    e = "worn out" if c["energy"] < 15 else "a bit tired" if c["energy"] < 40 else \
        "fine" if c["energy"] < 75 else "full of energy"
    q = "restless and wanting something new" if c["curiosity"] > 70 else \
        "mildly curious" if c["curiosity"] > 35 else "content"
    return f"{e}, {q}" + feel.words(w)  # [mood]


def next_helmet(w):
    """(name, needed) of the next shell, or None at the top."""
    h = w["crab"]["helmet"]
    return HELMETS[h + 1] if h + 1 < len(HELMETS) else None


def count(w, key, by=1):
    """Running totals of what the crab has done, for measuring what it set out to do."""
    t = w.setdefault("tally", {})
    t[key] = t.get(key, 0) + by


def aim_choices(w):
    """Things worth working towards right now, as (id, plain words). Every one
    is something this file can measure, so 'done' is never a matter of opinion."""
    t = w.get("tally", {})
    names = {i["name"] for i in w["items"].values()}
    out = []
    ledge = len(kept(w))
    nh = next_helmet(w)
    if nh and not w.get("new_helmet_waiting") and 0 < nh[1] - ledge <= 5:
        out.append((f"ledge:{nh[1]}", f"get your collection, ledge and tool chest together, up to {nh[1]} "
                                      "things, which is enough for a bigger helmet to wash up"))
    else:
        out.append((f"ledge:{ledge + 3}", "get your collection, ledge and tool chest together, "
                                          f"up to {ledge + 3} things"))
    plants = w.get("plants", [])
    if len(plants) < GARDEN_MAX:
        n = min(GARDEN_MAX, len(plants) + 2)
        out.append((f"planted:{n}", f"have {n} plants in the garden bed"))
    grown = sum(plant_stage(p) == len(STAGES) - 1 for p in plants)
    if grown < len(plants):
        out.append((f"grown:{grown + 1}", "see a plant in the garden bed through to fully grown"
                    if not grown else f"have {grown + 1} plants in the garden bed fully grown"))
    laps = w.get("laps") or {"count": 0, "best": None}
    if laps["count"] < 3:
        out.append(("laps:3", "run three laps of the sand track"))
    elif laps["best"] > 11.5:
        target = math.floor((laps["best"] - 0.1) * 10) / 10
        out.append((f"lap:{target:.1f}", f"run a lap of the sand track in under {target:.1f} seconds"))
    if any(f[1] not in names for f in CAVE):
        out.append((f"cave:{t.get('cave', 0) + 2}", "bring two more finds out of the cave"))
    if any(b[1] not in names for b in BURIED):
        out.append((f"dug:{t.get('dug', 0) + 2}", "dig two more things out of the dune"))
    if w.get("book"):
        out.append((f"read:{t.get('read', 0) + 2}", "read about two more subjects in the encyclopedia"))
    if sum(i["kind"] == "made" for i in w["items"].values()) < MADE_MAX:
        out.append((f"made:{t.get('made', 0) + 1}", "make a new thing at the workshop"))
    for b in unbuilt(w)[:2]:
        out.append((f"build:{b}", f"build {BLUEPRINTS[b][0]} {BLUEPRINTS[b][1]}"))
    if (w.get("pet") or {}).get("name"):                                          # [pet]
        out.append((f"pet:{t.get('pet', 0) + 3}", f"spend time with {pet.label(w['pet'])}, "
                                                  "your shrimp, three more times"))
    return out


AIM_PLACES = {"planted": ("moss", "garden"), "grown": ("garden",), "laps": ("track",),
              "lap": ("track",), "cave": ("cave",), "dug": ("dune",), "read": ("library",),
              "made": ("workshop",), "build": ("workshop",), "ledge": ("ledge",),
              "pet": ("pool",)}


def aim_progress(w):
    """(done, how far along in plain words) for the current aim."""
    aim = w.get("aim")
    kind, _, arg = aim["id"].partition(":")
    t = w.get("tally", {})
    plants = w.get("plants", [])
    if kind == "build":
        done = any(s["id"] == arg for s in w.get("structures", []))
        return done, "built" if done else "not built yet"
    if kind == "lap":
        best = (w.get("laps") or {}).get("best")
        return (best is not None and best < float(arg),
                f"your best is {best:.3f} seconds" if best is not None else "no lap run yet")
    have = {"ledge": len(kept(w)),
            "planted": len(plants),
            "grown": sum(plant_stage(p) == len(STAGES) - 1 for p in plants),
            "laps": (w.get("laps") or {}).get("count", 0)}.get(kind, t.get(kind, 0))
    need = int(arg)
    if kind in ("cave", "dug", "read", "made", "pet"):  # 'two more' counts from where it started
        start = aim.get("start", 0)
        return have >= need, f"{max(0, have - start)} of {need - start}"
    return have >= need, f"{have} of {need}"


def set_aim(w, aim_id, now):
    """Take up one of the offered aims. Returns its words, or None if it is not on offer."""
    words = dict(aim_choices(w)).get(aim_id)
    if not words or w.get("aim"):
        return None
    kind = aim_id.partition(":")[0]
    w["aim"] = {"id": aim_id, "text": words, "tick": w["ticks"], "ts": now,
                "start": w.get("tally", {}).get(kind, 0)}
    return words


def aim_check(w):
    """After a move: has the crab done what it set out to do, or let it lapse?
    Returns ("done" or "lapsed", the aim's words) or None."""
    aim = w.get("aim")
    if not aim:
        return None
    if aim_progress(w)[0]:
        w["aim"] = None
        count(w, "aims")
        feel.event(w, "aim_done")  # [mood]
        return "done", aim["text"]
    if w["ticks"] - aim["tick"] >= AIM_LAPSE:
        w["aim"] = None
        feel.event(w, "aim_lapsed")  # [mood]
        return "lapsed", aim["text"]
    return None


def wondering(w):
    """The find the crab most recently had a proper look at and has not yet
    read about, if the encyclopedia might have something on it."""
    pool = [i for i in w["items"].values()
            if i["note"] and not i.get("learned") and not i.get("no_entry")
            and i["kind"] not in ("scrap", "made")]
    return max(pool, key=lambda i: (i.get("looked", 0), i["id"])) if pool else None


def may_read(w):
    """Is the crab rested enough to read again? Sooner when a find is waiting to be looked up."""
    if not w.get("book"):
        return False
    rest = WONDER_REST if wondering(w) else ART_REST
    if w.get("reading_now") == w["ticks"]:      # it has already opened the book this move
        return True
    return w.get("asked_art") == "read" or w["ticks"] - w.get("last_read", -99) >= rest


def thread_note(w, move, text, words=""):
    """After a move: let the threads on its mind catch up with what really
    happened. Returns the log line, with a reason added when there is one."""
    aim = w.get("aim")
    return TH.after_move(
        w, move, text, words,
        aim=(*aim_progress(w), w["ticks"] - aim["tick"] >= AIM_LAPSE) if aim else None,
        stage=plant_stage, stages=STAGES, book=bool(w.get("book")),
        asked=bool(w.get("asked_words")),
        can_make=sum(i["kind"] == "made" for i in w["items"].values()) < MADE_MAX,
        puzzle=wondering(w) if "threads" not in w else None)


def thread_places(w):
    """Places an open thread needs right now, which the 'don't pace' rule leaves alone."""
    out = set()
    for th in TH.open_threads(w):
        if th["kind"] == "wondering" and may_read(w):
            out.add("library")
        elif th["kind"] == "making" and w["ticks"] - w.get("last_craft", -99) >= ART_REST                 and sum(i["kind"] == "made" for i in w["items"].values()) < MADE_MAX:
            out.add("workshop")
        elif th["kind"] == "looking" and w["ticks"] - w.get("last_tend", -99) >= 5:
            out.add("garden")
    return out


def sky(now, fixed=None):
    """The lamp over the tanks follows the real clock, and now and then the
    misters in the lid give a shower. fixed = (hour, rain) is for testing."""
    if fixed:
        hour, rain = fixed
    else:
        lt = time.localtime(now)
        hour = lt.tm_hour + lt.tm_min / 60
        rain = random.Random(int(now // 1800) * 7919).random() < 0.07   # half-hour showers
    phase, words = next((p, t) for upto, p, t in (
        (5.0, "night", "It is night. The lamp over the tanks is off and the light is dim and blue."),
        (7.5, "dawn", "It is early morning. The lamp over the tanks is coming up, low and pink."),
        (11.0, "morning", "It is morning and the lamp over the tanks is bright."),
        (15.0, "midday", "It is the middle of the day and the lamp over the tanks is at its brightest."),
        (18.0, "afternoon", "It is afternoon and the lamp over the tanks is warm."),
        (20.5, "dusk", "It is evening. The lamp over the tanks is low and amber."),
        (24.1, "night", "It is night. The lamp over the tanks is off and the light is dim and blue."),
    ) if hour < upto)
    if rain:
        words += " The misters in the lid are on: a fine rain is falling in both tanks, which the garden likes."
    return {"hour": round(hour, 2), "phase": phase, "rain": bool(rain), "words": words}


def valid_moves(w, now):
    """Every move the crab may make right now, as (id, plain description)."""
    c = w["crab"]
    here = c["place"]
    if c["energy"] < 15:
        if here == "hollow":
            return [("nap", "tuck into your helmet and sleep")]
        return [("go:hollow", "walk to the hollow to sleep, because you are worn out")]
    # When the person has asked for a picture or a tune, that comes first.
    want = {"draw": ("patch", "draw", "draw the picture your person asked for in the sand"),
            "tune": ("driftwood", "play_tune", "tap out the tune your person asked for on the log"),
            "item": ("workshop", "craft", "make the thing your person asked for on the workshop board"),
            "lap": ("track", "lap", "run the timed lap your person asked for on the sand track"),
            "read": ("library", "read", "look up what your person asked about in the encyclopedia"),
            }.get(w.get("asked_art"))
    want = wire_want(w, want)                                   # [research]
    if want:
        place, move, about = want
        if here == place:
            return [(move, about)]
        return [(f"go:{place}", f"walk to {PLACES[place][0]} to {about.split(' in the ')[0].split(' on the ')[0]}")]

    acts = []
    held = carried(w)
    here_items = items_at(w, here)[:6]
    if held:
        if here == "hollow" and not items_at(w, "hook"):
            acts.append(("hang", f"hang {held['name']} on the hook over your hollow, where you "
                                 "will see it when you wake"))
        if c.get("picked_at") != here and here == "ledge":
            if len(items_at(w, "ledge")) < DISPLAY_MAX:
                acts.append(("put_down", f"put {held['name']} on show on the ledge with your favourites"))
            acts.append(("store", f"put {held['name']} away in a drawer of the tool chest, "
                                  "where the rest of your collection is kept"))
        elif c.get("picked_at") != here:    # carry it somewhere before setting it down
            acts.append(("put_down", f"put down {held['name']} here at {PLACES[here][0]}"))
        if not held["note"]:
            acts.append((f"examine:{held['id']}", f"take a proper look at {held['name']}, which you are carrying"))
    else:
        if here == "hollow" and w["ticks"] - w.get("last_hang", -99) >= SWAP_REST:
            for it in items_at(w, "hook"):
                acts.append((f"unhook:{it['id']}", f"take {it['name']} down from the hook over your hollow"))
        put_id, put_tick = w.get("last_put") or (None, 0)
        for it in here_items:
            if it["id"] == put_id and w["ticks"] - put_tick < 4:
                continue                    # it has only just been set down
            if here == "ledge":
                continue                    # the ledge is for keeping, not for taking
            acts.append((f"pick_up:{it['id']}", f"pick up {it['name']}"))
    for it in here_items:
        if not it["note"]:
            acts.append((f"examine:{it['id']}", f"take a proper look at {it['name']}"))
    # Things it has looked at and does not want can go back in the water.
    # Never gifts from its person, and never anything already on the ledge.
    for it in ([held] if held else []) + (here_items if here != "ledge" else []):
        if it["note"] and it["from"] != "from you" and it["kind"] != "made":
            acts.append((f"toss:{it['id']}",
                         f"toss {it['name']} back into the water for good, because it is no use "
                         "even as building material"))
    if here == "dune":
        acts.append(("dig", "dig in the sand to see what is buried"))
    if here == "pool":
        acts.append(("dip", "wade about in the cool water"))
        acts += pet.moves(w, held)                                                # [pet]
    if here == "moss":
        acts.append(("forage", "search through the moss for seeds"))
        if c["energy"] < 80:
            acts.append(("rest", "sink into the moss for a breather"))
    if here == "spring":
        acts.append(("drink", "drink from the spring"))
    if here == "cave":
        acts.append(("explore", "go into the cave by the light of the lantern and search it"))
    if here == "track":
        acts.append(("lap", "run a timed lap of the sand track, flat out"))
    if here == "library" and may_read(w):
        puzzle = wondering(w)
        acts.append(("read", f"look up {puzzle['name']} in the encyclopedia, or something else "
                             "you are curious about" if puzzle else
                     "look up something you are curious about in the encyclopedia"))
    if here == "library":                                       # [research]
        acts += wire_moves(w)                                   # [research]
    if here == "garden":
        plants = w.get("plants", [])
        if len(plants) < GARDEN_MAX:
            for it in ([held] if held else []) + here_items:
                if it["kind"] == "seed":
                    acts.append((f"plant:{it['id']}", f"plant {it['name']} in the garden bed"))
        if any(plant_stage(p) < len(STAGES) - 1 for p in plants) \
                and w["ticks"] - w.get("last_tend", -99) >= 5:
            acts.append(("tend", "water and weed the garden bed so your plants grow faster"))
    asked = w.get("asked_art")
    if here == "patch" and (asked == "draw" or w["ticks"] - w.get("last_draw", -99) >= feel.rest(w, ART_REST)):  # [mood]
        acts.append(("draw", "draw a picture in the sand with your claw"))
    if here == "driftwood" and (asked == "tune" or w["ticks"] - w.get("last_tune", -99) >= feel.rest(w, ART_REST)):  # [mood]
        acts.append(("play_tune", "tap out a tune of your own on the hollow log"))
    if here == "workshop" and (asked == "item" or (
            w["ticks"] - w.get("last_craft", -99) >= feel.rest(w, ART_REST)  # [mood]
            and sum(i["kind"] == "made" for i in w["items"].values()) < MADE_MAX)):
        acts.append(("craft", "make a small thing entirely of your own invention from odds and ends"))
    if here == "driftwood":
        acts.append(("look_around", "look out over the whole terrarium"))
    if here == "glass":
        acts.append(("watch", "sit by the glass for a while in case your person comes by"))
    if here == "ledge" and not held:
        shown, chest = items_at(w, "ledge"), items_at(w, "chest")
        # Too many on show: some must go in the chest. Otherwise only now and then.
        if len(shown) > DISPLAY_MAX or (shown and w["ticks"] - w.get("last_swap", -99) >= SWAP_REST):
            for it in shown[:16]:
                acts.append((f"stow:{it['id']}", f"take {it['name']} off the ledge and put it away in the tool chest"))
        if chest and len(shown) < DISPLAY_MAX:
            start = (w["ticks"] // 4 * 6) % len(chest) if len(chest) > 6 else 0
            for it in (chest + chest)[start:start + min(6, len(chest))]:
                acts.append((f"display:{it['id']}", f"take {it['name']} out of the tool chest and put it on show on the ledge"))
    if here == "ledge" and len(items_at(w, "ledge")) >= 2:
        acts.append(("tidy", "rearrange your favourites on the ledge until they look right"))
    if here == "hollow" and c["energy"] < 70:
        acts.append(("nap", "tuck into your helmet and sleep"))
    if here == "workshop":
        for b in unbuilt(w):
            what, where, _, needs = BLUEPRINTS[b]
            if pick_materials(w, needs):
                acts.append((f"build:{b}", f"build {what} {where}, using {needs_text(needs)} from your pile"))
    if here == "tideline" and w.get("new_helmet_waiting"):
        nh = next_helmet(w)
        if nh:
            acts.append(("new_helmet", f"move out of your old shell and into {nh[0]}"))
    if diary_due(w):                                            # [voice]
        acts.append(("write_diary", "write a line in your diary about your day so far"))
    if now - w["last_note"] > 3 * 3600 and w["ticks"] >= 6:
        acts.append(("leave_note", "leave a short note at the glass for your person to find"))
    acts = side_moves(w, now, acts)                             # [plans]

    acts = feel.offered(w, acts)  # [mood]
    last = w["history"][-1] if w["history"] else ""
    acts = [a for a in acts if a[0] != last]
    # Don't pace: places walked to in the last few moves are off the list,
    # except the ledge when there is something to put on it.
    been = {h[3:] for h in w["history"][-5:] if h.startswith("go:")}
    crowded = len(items_at(w, "ledge")) > DISPLAY_MAX
    if held or crowded:
        been.discard("ledge")
    ready = [BLUEPRINTS[b][0] for b in unbuilt(w) if pick_materials(w, BLUEPRINTS[b][3])]
    if ready or held:
        been.discard("workshop")
    if w.get("asked_art"):
        been.discard({"draw": "patch", "tune": "driftwood", "item": "workshop",
                      "lap": "track", "read": "library"}.get(w["asked_art"]))
    if held and held["kind"] == "seed":
        been.discard("garden")
    if pet.hungry(w) or (w.get("pet") and not w["pet"].get("name")):              # [pet]
        been.discard("pool")
    if w.get("aim"):                        # what it is working towards is never off the list
        been.difference_update(AIM_PLACES.get(w["aim"]["id"].partition(":")[0], ()))
    been.difference_update(thread_places(w))  # [threads]
    been -= feel.comforts(w)  # [mood]
    puzzle = wondering(w) if may_read(w) else None
    if puzzle:
        been.discard("library")
    been.discard("glass" if plan_on(w, now) else None)          # [plans]
    been.discard("library" if may_wire(w) else None)            # [research]
    goes = [(f"go:{p}", f"walk to {name} ({about})")
            for p, (name, about) in PLACES.items() if p != here and p not in been]
    if puzzle:
        goes = [(m, f"walk to the reading stone to see what the encyclopedia says about {puzzle['name']}")
                if m == "go:library" else (m, d) for m, d in goes]
    if pet.hungry(w):                                                             # [pet]
        goes = [(m, f"walk to the tide pool, where {pet.label(w['pet'])} is hungry and waiting to be fed")
                if m == "go:pool" else (m, d) for m, d in goes]
    if crowded:
        goes = [(m, "walk to the stone ledge, which is overcrowded, to choose which favourites stay "
                    "on show and put the rest away in the tool chest")
                if m == "go:ledge" else (m, d) for m, d in goes]
    if ready:
        goes = [(m, f"walk to the workshop, where your pile now has enough to build {ready[0]}")
                if m == "go:workshop" else (m, d) for m, d in goes]
    acts, goes = _quiet(w, acts, goes)      # [quiet] idle moments and the stare guard
    goes = plan_walk(w, now, goes)                              # [plans]
    wandering = len(w["history"]) >= 2 and all(h.startswith("go:") for h in w["history"][-2:])
    if wandering and acts:
        return acts          # two walks in a row: do something here first
    return acts + goes


DIARY_MIN = 3       # moves after an entry before another, even with something to write about
DIARY_QUIET = 12    # moves after an entry before the diary comes up again on a quiet day
DIARY_ALWAYS = 30   # moves after which the diary is on offer at every move


def _diary_sign(w):
    """Everything worth a diary line, as numbers that only change when one happens:
    finds dug up, foraged or brought out of the cave, things made, subjects read
    and aims finished (the tally), things built, the best lap, the shell it lives
    in, and gifts from its person."""
    return [sum(w.get("tally", {}).values()), len(w.get("structures", [])),
            (w.get("laps") or {}).get("best"), w["crab"]["helmet"],
            sum(i["from"] == "from you" for i in w["items"].values())]


def diary_mark(w, verb):
    """Called once per move: count the notable things since the last diary entry."""
    sign = _diary_sign(w)
    if verb == "write_diary":
        w["notable"] = 0
    elif "diary_sign" in w and sign != w["diary_sign"]:
        w["notable"] = w.get("notable", 0) + 1
    w["diary_sign"] = sign


def diary_due(w):
    """The bar for a diary entry is high just after one and comes down with quiet.
    With something notable to write about, DIARY_MIN moves is enough. Without, it
    waits DIARY_QUIET moves and is then offered on one move in three, and after
    DIARY_ALWAYS moves it is offered every time."""
    n = w["since_diary"]
    if w.get("notable", 0) > 0:
        return n >= DIARY_MIN
    return n >= DIARY_ALWAYS or (n >= DIARY_QUIET and n % 3 == 0)


def _clamp(v):
    return max(0, min(100, v))


# ---- [quiet] idle moments, the stare guard, and moves that need no model

IDLE_EVERY = 5      # at most one idle moment in this many moves
STARE_MAX = 8       # moves in a row without walking anywhere before only walks are offered
IDLE = {
    "hollow": ("listening to the sand tick", "watching the dust settle in the dim",
               "listening to the driftwood creak"),
    "pool": ("watching the ripples settle", "watching the light wobble on the bottom"),
    "tideline": ("watching the water come and go", "counting the lines the tide has left in the sand"),
    "driftwood": ("staring into the middle distance", "watching the lamp light move across the sand"),
    "ledge": ("looking the favourites over one by one", "doing nothing much beside the tool chest"),
    "dune": ("watching sand grains slide down the slope", "sitting very still in the warm sand"),
    "patch": ("looking at the smooth sand and leaving it be", "watching the damp sand dry at the edges"),
    "moss": ("watching a drop of water hang on the moss", "breathing in the smell of damp moss"),
    "spring": ("listening to the water trickle over the stones", "watching the little pool fill and spill"),
    "garden": ("watching a leaf do nothing", "looking at the soil in case something moves"),
    "cave": ("watching the lantern flame", "listening to a drip somewhere in the dark"),
    "track": ("walking the racing line in its head", "looking down the straight and going nowhere"),
}


def idle_line(w):
    """The idle moment on offer where the crab stands. Chosen by the move count,
    so the words offered and the words logged for one move are the same."""
    lines = IDLE[w["crab"]["place"]]
    return lines[random.Random(w["ticks"]).randrange(len(lines))]


def _quiet(w, acts, goes):
    """Last step of valid_moves. Too long without a walk: only walks are left.
    Otherwise an idle moment may join the list, but never twice close together.
    There is always a walk on offer, so this cannot leave the list empty."""
    h = w["history"]
    if len(h) >= STARE_MAX and not any(m.startswith("go:") for m in h[-STARE_MAX:]):
        return [], goes
    wandering = len(h) >= 2 and all(m.startswith("go:") for m in h[-2:])
    if w["crab"]["place"] in IDLE and "idle" not in h[-(IDLE_EVERY - 1):] and (acts or not wandering):
        acts = acts + [("idle", f"stay where you are for a while, {idle_line(w)}")]
    return acts, goes


def auto_move(w, now, rng=random):
    """A move the program can make without asking the model, or None when the
    model should decide. Only the clear-cut cases: the one and only move on offer
    when it is a walk or a nap (worn out, or on the way to something its person
    asked for), and now and then an idle moment in a real lull."""
    moves = [m for m, _ in valid_moves(w, now)]
    if len(moves) == 1:
        return moves[0] if moves[0].startswith("go:") or moves[0] == "nap" else None
    c, aim = w["crab"], w.get("aim")
    lull = ("idle" in moves and aim and w["ticks"] - aim["tick"] >= 3
            and c["curiosity"] <= 35 and c["energy"] >= 40 and not c["carrying"]
            and not w.get("new_helmet_waiting")
            and all(i["note"] for i in items_at(w, c["place"]))
            and w["ticks"] - w.get("last_model", -99) <= 2)
    return "idle" if lull and rng.random() < 0.5 else None


def apply_move(w, move, words, now, name, rng=random, sky=None):  # [mood]
    """Carry out one move. Returns the line for the day's log, or None if the
    move is not allowed (the world is then left untouched)."""
    if move not in {m for m, _ in valid_moves(w, now)}:
        return None
    c = w["crab"]
    here = c["place"]
    verb, _, arg = move.partition(":")
    energy, curiosity = -2, 4
    words = (words or "").strip()[:300]

    if verb == "go":
        c["place"] = arg
        energy = -6
        text = f"{name} walked to {PLACES[arg][0]}."
        if (arg in SECOND_TANK) != (here in SECOND_TANK):       # a long walk, through the tube
            energy = -10
            text = f"{name} walked through the glass tube to {PLACES[arg][0]}."
    elif verb == "pick_up":
        it = w["items"][arg]
        it["place"] = "carried"
        c["carrying"] = it["id"]
        c["picked_at"] = here
        curiosity = -5
        text = f"{name} picked up {it['name']}."
    elif verb == "put_down":
        it = carried(w)
        it["place"] = here
        c["carrying"] = None
        w["last_put"] = [it["id"], w["ticks"]]
        text = (f"{name} added {it['name']} to the collection on the ledge."
                if here == "ledge" else
                f"{name} put {it['name']} down at {PLACES[here][0]}.")
    elif verb == "hang":
        it = carried(w)
        it["place"] = "hook"
        c["carrying"] = None
        w["last_hang"] = w["ticks"]
        energy, curiosity = -2, -15
        text = f"{name} hung {it['name']} on the hook over the hollow."
    elif verb == "unhook":
        it = w["items"][arg]
        it["place"] = "carried"
        c["carrying"] = it["id"]
        c["picked_at"] = here
        text = f"{name} took {it['name']} down from the hook over the hollow."
    elif verb == "store":
        it = carried(w)
        it["place"] = "chest"
        c["carrying"] = None
        w["last_put"] = [it["id"], w["ticks"]]
        text = f"{name} put {it['name']} away in the tool chest."
    elif verb == "stow":
        it = w["items"][arg]
        it["place"] = "chest"
        w["last_swap"] = w["ticks"]
        energy, curiosity = -1, -4
        text = f"{name} took {it['name']} off the ledge and put it away in the tool chest."
    elif verb == "display":
        it = w["items"][arg]
        it["place"] = "ledge"
        energy, curiosity = -1, -6
        text = f"{name} took {it['name']} out of the tool chest and put it on show on the ledge."
    elif verb == "examine":
        it = w["items"][arg]
        it["note"] = words
        it["looked"] = w["ticks"]
        energy, curiosity = -1, -20
        text = f"{name} took a proper look at {it['name']}."
    elif verb == "toss":
        it = w["items"].pop(arg)
        if c["carrying"] == it["id"]:
            c["carrying"] = None
        energy, curiosity = -2, -3
        text = f"{name} tossed {it['name']} back into the water."
    elif verb == "build":
        what, where, ends_at, needs = BLUEPRINTS[arg]
        used = pick_materials(w, needs)
        for it in used:
            del w["items"][str(it["id"])]
        w.setdefault("structures", []).append({
            "id": arg, "name": what, "where": where, "words": words, "ts": now,
            "made_from": [it["name"] for it in used]})
        c["place"] = ends_at
        energy, curiosity = -12, -35
        text = f"{name} built {what} {where}."
    elif verb == "dig":
        energy = -10
        names = {i["name"] for i in w["items"].values()}
        pool = [b for b in BURIED if b[1] not in names]
        if pool and rng.random() < 0.4:
            kind, iname, desc = rng.choice(pool)
            add_item(w, kind, iname, desc, "dune", "dug up", now)
            count(w, "dug")
            curiosity = -15
            text = f"{name} dug in the dune and uncovered {iname}."
        else:
            text = f"{name} dug in the dune and found only damp sand."
    elif verb == "dip":
        energy, curiosity = 8, -4
        text = f"{name} waded about in the tide pool."
    elif verb == "draw":
        w["last_draw"] = w["ticks"]
        if w.get("asked_art") == "draw":
            w["asked_art"] = None
        energy, curiosity = -4, -25
        text = f"{name} drew a picture in the sand: “{words}”."
    elif verb == "play_tune":
        w["last_tune"] = w["ticks"]
        if w.get("asked_art") == "tune":
            w["asked_art"] = None
        energy, curiosity = -3, -25
        text = f"{name} tapped out a tune on the log: “{words}”."
    elif verb == "craft":
        made = w.pop("making", None)        # the thing itself is thought up by the caller
        if not made:
            return None
        it = add_item(w, "made", made["name"], made["about"], "workshop", "made", now)
        it["px"], it["work"] = made["px"], made["work"]
        count(w, "made")
        w["last_craft"] = w["ticks"]
        if w.get("asked_art") == "item":
            w["asked_art"] = None
        energy, curiosity = -8, -30
        text = f"{name} made {made['name']} at the workshop."
    elif verb == "forage":
        energy = -5
        names = {i["name"] for i in w["items"].values()}
        pool = [s for s in SEEDS if s[0] not in names]
        if pool and rng.random() < 0.45:
            sname, desc, _ = rng.choice(pool)
            add_item(w, "seed", sname, desc, "moss", "found", now)
            count(w, "seeds")
            curiosity = -15
            text = f"{name} searched the moss and found {sname}."
        else:
            text = f"{name} searched the moss and found nothing but moss."
    elif verb == "rest":
        energy, curiosity = 18, 6
        text = f"{name} sank into the moss for a breather."
    elif verb == "drink":
        energy, curiosity = 9, -3
        text = f"{name} drank from the spring."
    elif verb == "explore":
        energy = -8
        names = {i["name"] for i in w["items"].values()}
        pool = [f for f in CAVE if f[1] not in names]
        if pool and rng.random() < 0.45:      # easier to find things by lantern light
            kind, iname, desc = rng.choice(pool)
            add_item(w, kind, iname, desc, "cave", "cave", now)
            count(w, "cave")
            curiosity = -20
            text = f"{name} went into the cave and came out with {iname}."
        else:
            curiosity = -6
            text = f"{name} searched the cave by lantern light and found nothing new this time."
    elif verb == "plant":
        it = w["items"].pop(arg)
        if c["carrying"] == it["id"]:
            c["carrying"] = None
        plants = w.setdefault("plants", [])
        kind = next((s[2] for s in SEEDS if s[0] == it["name"]), None)
        pname = PLANT_NAMES[kind] if kind else f"a plant grown from {it['name']}"
        if not kind:                            # a seed from the person: it grows into something
            kinds = sorted(PLANT_NAMES)
            kind = kinds[sum(map(ord, it["name"])) % len(kinds)]
        used = {p["slot"] for p in plants}
        plants.append({"id": w["next_id"], "kind": kind, "name": pname, "seed": it["name"],
                       "growth": 0, "told": 0, "ts": now,
                       "slot": next(i for i in range(GARDEN_MAX) if i not in used)})
        w["next_id"] += 1
        energy, curiosity = -5, -25
        text = f"{name} planted {it['name']} in the garden bed."
    elif verb == "tend":
        w["last_tend"] = w["ticks"]
        for p in w.get("plants", []):           # anything worth telling is told at the next move
            if plant_stage(p) < len(STAGES) - 1:
                p["growth"] += 12
        energy, curiosity = -4, -8
        text = f"{name} watered and weeded the garden bed."
    elif verb == "lap":
        laps = w.setdefault("laps", {"count": 0, "best": None, "last": None})
        t = 14.2 - min(3.0, 0.08 * laps["count"]) + rng.uniform(-0.45, 0.7) \
            + 0.3 * c["helmet"] + (1.0 if c["energy"] < 40 else 0.0) + (0.6 if c["carrying"] else 0.0)
        t = round(t, 3)
        best = laps["best"] is None or t < laps["best"]
        laps.update(count=laps["count"] + 1, last=t, best=t if best else laps["best"])
        if w.get("asked_art") == "lap":
            w["asked_art"] = None
        energy, curiosity = -9, -18
        text = (f"{name} ran a lap of the sand track in {t:.3f} seconds"
                + (", a new best." if best and laps["count"] > 1 else "."))
    elif verb == "read":
        w["last_read"] = w["ticks"]
        if w.get("asked_art") == "read":
            w["asked_art"] = None
        energy, curiosity = -3, -35
        if words:
            count(w, "read")
        text = (f"{name} read about {words} in the encyclopedia." if words else
                f"{name} leafed through the encyclopedia and did not find what it was after.")
    elif verb == "research":                                    # [research]
        energy, curiosity, text = wire_done(w, words, name)     # [research]
    elif verb == "look_around":
        energy, curiosity = -3, -10
        text = f"{name} looked out over the terrarium from the top of the driftwood."
    elif verb == "eat":                                         # [plans]
        energy, curiosity, text = eat(w, arg, name)             # [plans]
    elif verb == "attend":                                      # [plans]
        energy, curiosity, text = attend(w, name)               # [plans]
    elif verb == "watch":
        energy, curiosity = -1, -8
        text = f"{name} sat by the glass for a while."
    elif verb == "tidy":
        energy, curiosity = -2, -6
        text = f"{name} rearranged the favourites on the ledge."
    elif verb == "nap":
        c["tucked"] = True
        c["napping_until"] = now + 600
        c["energy"] = 100
        energy, curiosity = 0, 10
        text = f"{name} tucked into the helmet for a nap."
    elif verb == "write_diary":
        w["since_diary"] = -1
        energy = -1
        text = f"{name} wrote in the diary."
    elif verb == "leave_note":
        w["last_note"] = now
        energy = -1
        text = f"{name} left a note at the glass."
    elif verb in pet.VERBS:                                                       # [pet]
        text, energy, curiosity = pet.apply(w, verb, words, name, carried(w), rng)
        count(w, "pet")
    elif verb == "new_helmet":
        c["helmet"] += 1
        w["new_helmet_waiting"] = False
        curiosity = -30
        text = f"{name} moved into a new shell: {HELMETS[c['helmet']][0]}."
    elif verb == "idle":                        # [quiet]
        energy, curiosity = 3, 6                # [quiet]
        text = f"{name} spent a while at {PLACES[here][0]}, {idle_line(w)}."    # [quiet]
    else:
        return None

    c["energy"] = _clamp(c["energy"] + energy)
    c["curiosity"] = _clamp(c["curiosity"] + curiosity)
    feel.after_move(w, move, here, text, sky)  # [mood]
    w["history"] = (w["history"] + [move])[-12:]
    diary_mark(w, verb)                                         # [voice]
    w["since_diary"] += 1
    w["ticks"] += 1
    text = thread_note(w, move, text, words)  # [threads]
    return text


def wake_from_nap(w):
    c = w["crab"]
    if c.get("napping_until"):
        c["napping_until"] = None
        c["tucked"] = False
        return True
    return False


WASH_AFTER = 90     # moves; about two hours of awake time


def wash_away(w):
    """The tide takes back whatever has sat unclaimed at the tideline too long.
    Returns the names of the things it took."""
    gone = []
    for key, it in list(w["items"].items()):
        if it["place"] != "tideline" or it["from"] in ("from you", "made"):
            continue                        # the tide never takes a gift, or its own handiwork
        if "tick" not in it:
            it["tick"] = w["ticks"]         # older things start their wait now
        elif w["ticks"] - it["tick"] >= WASH_AFTER:
            gone.append(it["name"])
            del w["items"][key]
    return gone


# ---- the wire beside the reading stone: a question for the wider world  [research]

WIRE_REST = 40      # moves between questions it sends of its own accord


def wire_find(w):
    """The find to ask the wider world about: one it has had a proper look at,
    that the encyclopedia had nothing on, and that it has not asked about before."""
    pool = [i for i in w["items"].values()
            if i["note"] and i.get("no_entry") and not i.get("searched") and not i.get("learned")
            and i["kind"] not in ("scrap", "made", "treat")]
    return max(pool, key=lambda i: (i.get("looked", 0), i["id"])) if pool else None


def may_wire(w):
    """May a question go down the wire right now? crab.py puts the number of
    questions left today in w["wire"] before each move: 0 when the wire is
    switched off, not there, or used up for the day. Its person's question goes
    whenever there is one left; its own waits WIRE_REST moves and needs a find."""
    if int(w.get("wire") or 0) <= 0:
        return False
    if w.get("asked_art") == "research" or w.get("wire_now") == w["ticks"]:
        return True                             # asked for, or already on its way this move
    return bool(wire_find(w)) and w["ticks"] - w.get("last_wire", -99) >= WIRE_REST


def wire_want(w, want):
    """The 'your person asked' move for valid_moves, when what they asked for is a question."""
    if w.get("asked_art") != "research":
        return want
    if not may_wire(w):
        return None
    return ("library", "research", "send your person's question down the wire to the wider world")


def wire_moves(w):
    if not may_wire(w):
        return []
    it = wire_find(w)
    return [("research", "send a question down the wire beside the reading stone to the wider world"
             + (f", asking what {it['name']} is, since the encyclopedia had nothing on it" if it else ""))]


def wire_lines(w):
    """One line for the crab's prompt, only when a question of its own could go."""
    it = wire_find(w) if may_wire(w) and w.get("asked_art") != "research" else None
    if not it:
        return []
    return [f"The encyclopedia had nothing on {it['name']}. The wire beside the reading stone can "
            "carry one question about it to the wider world."]


def wire_done(w, words, name):
    """The 'research' move. crab.py has already sent the question (the crab never
    writes it) and left what it was about in the world; words is the title of
    what came back, or empty. Returns (energy, curiosity, log line)."""
    about = str(w.pop("wire_about", "") or "something")[:80]
    item = w.pop("wire_item", None)
    w.pop("wire_now", None)
    w["last_wire"] = w["ticks"]
    if w.get("asked_art") == "research":
        w["asked_art"] = None
    if not words:
        return -3, -10, f"{name} sent a question down the wire about {about}, and no answer came back."
    count(w, "read")                            # an answer counts as a subject read about
    if item is not None:
        TH.answered(w, item, words, sum(i["kind"] == "made" for i in w["items"].values()) < MADE_MAX)
    return -3, -35, f"{name} sent a question down the wire about {about}, and an answer came back: {words}."


# ---- treats that get used up, and turning up for the calendar  [plans]

TREAT_KEEPS = 200   # moves before something to eat goes off
NO_TREATS = ("ledge", "chest", "hook", "workshop")     # food is never kept or built with


def go_off(w):
    """A treat nobody has eaten goes off in the end. Returns the names of the ones cleared away."""
    gone = []
    for key, it in list(w["items"].items()):
        if it["kind"] != "treat":
            continue
        if "tick" not in it:
            it["tick"] = w["ticks"]
        elif w["ticks"] - it["tick"] >= TREAT_KEEPS:
            if w["crab"]["carrying"] == it["id"]:
                w["crab"]["carrying"] = None
            gone.append(it["name"])
            del w["items"][key]
    return gone


def plan_on(w, now):
    """What is on the calendar right now, if anything. crab.py puts it in the
    world for the length of one move; this file only reads it."""
    p = w.get("plan_now")
    if isinstance(p, dict) and p.get("title") and now < p.get("until", 0):
        return p
    return None


def side_moves(w, now, acts):
    """Adds eating a treat and being at the glass for a plan to the moves on
    offer, and takes out any move that would keep or throw away a treat."""
    here = w["crab"]["place"]
    held = carried(w)
    treats = [i for i in ([held] if held else []) + items_at(w, here) if i["kind"] == "treat"]
    if held and held["kind"] == "treat":
        acts = [a for a in acts if a[0] not in ("hang", "store")
                and not (a[0] == "put_down" and here in NO_TREATS)]
    never = {f"toss:{i['id']}" for i in treats}
    acts = [a for a in acts if a[0] not in never]
    acts += [(f"eat:{i['id']}", f"eat {i['name']}, the treat from your person, before it goes off")
             for i in treats[:4]]
    plan = plan_on(w, now)
    if plan and here == "glass":
        acts.insert(0, ("attend", f"be at the glass for {plan['title'][:60]}, which your person put "
                                  "on the calendar for now"))
    return acts


def plan_walk(w, now, goes):
    plan = plan_on(w, now)
    if not plan:
        return goes
    return [(m, f"walk to the front glass, because it is time for {plan['title'][:60]}, which your "
                "person put on the calendar") if m == "go:glass" else (m, d) for m, d in goes]


def eat(w, arg, name):
    """(energy, curiosity, log line). The treat is gone once eaten."""
    c = w["crab"]
    it = w["items"].pop(arg)
    if c["carrying"] == it["id"]:
        c["carrying"] = None
    if isinstance(c.get("mood"), (int, float)) and not isinstance(c.get("mood"), bool):
        c["mood"] = _clamp(c["mood"] + 10)      # only if the crab has a mood to lift
    return 15, -10, f"{name} ate {it['name']}."


def attend(w, name):
    plan = w["plan_now"]
    plan["attended"] = True
    return -1, -12, f"{name} was at the glass for {plan['title'][:60]}."


def treat_words(w, lines):
    """describe() tells the crab a thing it carries can go on the ledge. Not food."""
    held = carried(w)
    if held and held["kind"] == "treat":
        lines = [f"You are carrying {held['name']}, something to eat from your person. Eat it "
                 "when you like; it will not keep for ever and it is not for your collection."
                 if ln.startswith("You are carrying ") else ln for ln in lines]
    return lines


def tide_due(w, now):
    return now - w["last_tide"] >= 40 * 60 and len(items_at(w, "tideline")) < 3


def tide(w, now, rng=random):
    """Now and then the tide leaves something new. Returns a log line or None."""
    if now - w["last_tide"] < 40 * 60 or len(items_at(w, "tideline")) >= 3:
        return None
    names = {i["name"] for i in w["items"].values()}
    pool = [t for t in TIDE if t[1] not in names]
    if not pool:
        return None
    kind, name, desc = rng.choice(pool)
    add_item(w, kind, name, desc, "tideline", "tide", now)
    w["last_tide"] = now
    return f"The tide left {name} at the tideline."


def pet_tick(w, sky, now, rng=random):
    """The shrimp's own moment, once per move of the crab's. Returns log lines."""
    if not w.get("pet"):
        return []
    _, find = pet.tick(w, sky, rng, {i["name"] for i in w["items"].values()})
    if not find or len(items_at(w, "pool")) >= 3:
        return []
    add_item(w, find[0], find[1], find[2], "pool", "shrimp", now)
    who = pet.label(w["pet"])
    return [f"{who[:1].upper() + who[1:]} pushed {find[1]} up onto the edge of the tide pool."]


def helmet_check(w):
    """When the collection (ledge and chest together) is big enough, a bigger helmet washes up."""
    nh = next_helmet(w)
    if nh and not w.get("new_helmet_waiting") and len(kept(w)) >= nh[1]:
        w["new_helmet_waiting"] = True
        return f"Something big has washed up at the tideline: {nh[0]}."
    return None


def describe(w, name, events, sky=None):
    """The world in plain words, for the crab's prompts."""
    c = w["crab"]
    held = carried(w)
    ledge = items_at(w, "ledge")
    lines = ([sky["words"]] if sky else []) + [
             f"You are at {PLACES[c['place']][0]}.",
             f"Your shell is {HELMETS[c['helmet']][0]}.",
             (f"You are carrying {held['name']}. At the stone ledge you can put it on show with your "
              "favourites or away in the tool chest; either way it joins your collection. Or put it "
              "on the workshop board to save it for building.")
             if held else "You are carrying nothing.",
             f"You feel {feeling(w)}."]
    chest = items_at(w, "chest")
    if ledge:
        shown = ", ".join(i["name"] for i in ledge[-16:])
        lines.append(f"Your favourites on show on the ledge ({len(ledge)}, and it has room for "
                     f"{DISPLAY_MAX}): {shown}.")
        if len(ledge) > DISPLAY_MAX:
            lines.append(f"The ledge is overcrowded. {len(ledge) - DISPLAY_MAX} of those should go into "
                         "the tool chest, so that only your favourites are left on show. Which ones "
                         "stay is up to you.")
    else:
        lines.append("Your ledge is empty." + ("" if chest else " Nothing collected yet."))
    if chest:
        names = ", ".join(i["name"] for i in chest[-30:])
        lines.append(f"Put away in the tool chest at the back of the ledge ({len(chest)} things"
                     + (", the latest 30 being" if len(chest) > 30 else "") + f"): {names}.")
    elif ledge:
        lines.append("The tool chest at the back of the ledge is empty.")
    hung = items_at(w, "hook")
    lines.append(f"Hanging on the hook over your hollow, where you see it when you wake: {hung[0]['name']}."
                 if hung else
                 "The hook on the branch over your hollow is empty. One thing can hang there, "
                 "where you would see it on waking.")
    if ledge or chest or hung:
        lines.append(f"Your whole collection is {len(kept(w))} thing{'s' if len(kept(w)) != 1 else ''}.")
    nh = next_helmet(w)
    if w.get("new_helmet_waiting") and nh:
        lines.append(f"A bigger shell is waiting at the tideline: {nh[0]}.")
    built = w.get("structures", [])
    if built:
        lines.append("Things you have built: " + ", ".join(
            f"{s['name']} {s['where']}" for s in built) + ".")
    pile = items_at(w, "workshop")
    lines.append("Your workshop pile: " + (", ".join(i["name"] for i in pile) if pile else "empty") + ".")
    ready = [BLUEPRINTS[b][0] for b in unbuilt(w) if pick_materials(w, BLUEPRINTS[b][3])]
    if ready:
        lines.append("The pile already has everything needed to build " + " or ".join(ready[:3])
                     + ". You only have to go to the workshop and do it.")
    todo = unbuilt(w)
    if todo:
        lines.append("Things you know how to build once the pile at the workshop has the pieces: "
                     + "; ".join(f"{BLUEPRINTS[b][0]} ({needs_text(BLUEPRINTS[b][3])})"
                                 for b in todo) + ".")
    if held and held["kind"] == "seed":
        lines.append("What you are carrying is a seed: the garden bed in the second tank is the "
                     "place to plant it.")
    plants = w.get("plants", [])
    if plants:
        lines.append("Your garden bed: " + ", ".join(
            f"{p['name']} ({STAGES[plant_stage(p)]})" for p in plants) + ".")
    else:
        lines.append("Your garden bed is empty. Seeds turn up in the moss bank.")
    laps = w.get("laps")
    if laps and laps["count"]:
        lines.append(f"Your laps of the sand track: {laps['count']} so far, best "
                     f"{laps['best']:.3f} seconds, last {laps['last']:.3f} seconds.")
    else:
        lines.append("You have not yet run a lap of the sand track.")
    if pet.line(w):                                                               # [pet]
        lines.append(pet.line(w))
    aim = w.get("aim")
    if aim:
        lines.append(f"What you are working towards, which you chose yourself {w['ticks'] - aim['tick']} "
                     f"moves ago: to {aim['text']}. So far: {aim_progress(w)[1]}.")
    else:
        lines.append("You are not working towards anything in particular just now.")
    puzzle = wondering(w) if may_read(w) else None
    if puzzle:
        lines.append(f"You have had a proper look at {puzzle['name']} but never read about it. "
                     "The encyclopedia on the reading stone might say what it is.")
    lines.extend(TH.on_mind(w))  # [threads]
    lines.extend(wire_lines(w))                                 # [research]
    lines.extend(feel.describe_lines(w, PLACES))  # [mood]
    lines = treat_words(w, lines)                               # [plans]
    if events:
        lines.append("")
        lines.append("What you have done lately, oldest first:")
        lines.extend("- " + e for e in events)
    return "\n".join(lines)
