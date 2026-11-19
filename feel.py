"""How the crab feels: its mood, the state that mood and energy put it in, and
what it has come to believe about its own life.

Pure logic, like world.py: no files, no network, no model. Mood is a number
moved by what actually happens. Beliefs are sentences built here, from
templates, out of running averages of what followed each thing it did. The
model never writes one, so none can be invented.
"""

MID = 50            # mood drifts back towards this a little every move
SETTLED = 55        # where wading, resting, drinking and napping bring it
CALMING = 0.2       # share of the distance to SETTLED that a calm thing covers
DRIFT = 0.02        # share of the distance to MID lost each move
WINDOW = 30         # averages follow roughly the last this-many times, so old truths fade
SLOW = 200          # the same for weather and tiredness, whose effect is small and needs more
MIN_N = 6           # times something must have happened before it can be a belief
CLEAR = 2.5         # average mood change that counts as a clear effect
CALM_CLEAR = 1.0    # average pull towards SETTLED that counts as settling
COND_CLEAR = 0.4    # the same for weather and tiredness, measured against an ordinary move
TIRING, RESTFUL = 9, 8      # average energy change that counts as a clear effect
MAX_BELIEFS = 5

# What each thing does to mood, by verb or by verb+outcome. Anything not here does nothing.
LIFT = {
    "dig+find": 10, "dig+none": -6, "forage+find": 8, "forage+none": -4,
    "explore+find": 10, "explore+none": -4, "lap": 6, "lap+best": 12,
    "read": 6, "read+none": -4, "build": 12, "craft": 8, "draw": 6, "play_tune": 6,
    "plant": 6, "tend": 4, "hang": 4, "put_down@ledge": 4, "store": 1, "display": 1,
    "pick_up": 1, "examine": 1, "look_around": 1, "tidy": 1, "write_diary": 1,
    "leave_note": 1, "new_helmet": 16,
    # things that happen to it rather than moves it makes
    "aim_done": 20, "aim_lapsed": -8, "gift": 16, "tap": 6,
}
CALM = {"dip", "rest", "drink", "nap"}          # these settle it towards SETTLED
COVER = {"hollow", "cave"}                      # out of the rain, and not "in the open"
COND = {"rain": 0.8, "night_in": 0.8, "night_out": -0.4, "tired": -1.5}
UNPROMPTED = {"draw", "play_tune", "craft", "lap"}      # not offered in a sulk unless asked for
COMFORTS = {"hollow", "pool", "moss", "spring"}         # always walkable in a sulk

# How each thing is said in a belief. {p} is the place's own name from world.PLACES.
PHRASE = {
    "go": "Walking to {p}", "dip": "Wading in {p}", "rest": "Resting on {p}",
    "drink": "Drinking from {p}", "lap": "A lap of {p}", "nap": "A nap in {p}",
    "watch": "Sitting by {p}", "look_around": "Looking out from {p}",
    "read": "Reading at {p}", "tend": "Tending {p}",
    "put_down": "Putting a find down at {p}", "pick_up": "Picking something up",
    "examine": "Taking a proper look at something", "toss": "Tossing something back",
    "hang": "Hanging something on my hook", "store": "Putting a find away in my tool chest",
    "display": "Putting a favourite on show", "tidy": "Tidying my favourites",
    "build": "Building something", "craft": "Making something at the workshop",
    "draw": "Drawing in the sand", "play_tune": "Tapping out a tune on the log",
    "plant": "Planting a seed", "write_diary": "Writing in my diary",
    "leave_note": "Leaving a note for my person", "new_helmet": "Moving into a new shell",
    "dig+find": "Digging and finding something", "dig+none": "Digging and finding nothing",
    "forage+find": "Finding a seed in the moss",
    "forage+none": "Searching the moss and finding nothing",
    "explore+find": "Bringing something out of the cave",
    "explore+none": "Searching the cave and finding nothing",
    "lap+best": "A new best lap", "read+none": "Looking something up and not finding it",
    "aim_done": "Finishing what I set out to do",
    "aim_lapsed": "Letting go of something I set out to do",
    "gift": "A gift from my person", "tap": "A tap on the glass from my person",
    "rain": "The rain from the misters", "night_in": "Being in my hollow at night",
    "night_out": "Being out in the open at night", "tired": "Being worn out",
}
DOWN = {"night_out": "makes me uneasy"}         # otherwise "gets me down"

STATE_WORDS = {"bright": "bright and up for anything", "content": "in a steady mood",
               "flat": "a bit flat", "sulk": "in a sulk, so things have to earn your attention"}
STATE_SHORT = {"bright": "bright and up for anything", "content": "content",
               "flat": "flat", "sulk": "in a sulk"}


def _clamp(v):
    return max(0.0, min(100.0, v))


def mood(w):
    return w["crab"].get("mood", 55)


def state(w):
    """Mood and energy together: 'bright', 'content', 'flat' or 'sulk'."""
    m, e = mood(w), w["crab"].get("energy", 50)
    if m < 35:
        return "sulk"
    if m >= 70 and e >= 40:
        return "bright"
    if m < 45 or e < 15:
        return "flat"
    return "content"


def words(w):
    """The state as the end of 'You feel tired, curious ...'."""
    return ", and " + STATE_WORDS[state(w)]


def payload(w):
    return {"value": round(mood(w)), "state": state(w), "words": STATE_SHORT[state(w)]}


def rest(w, moves):
    """The wait between drawings, tunes and made things: shorter on a bright day."""
    return moves * 3 // 5 if state(w) == "bright" else moves


def offered(w, acts):
    """In a sulk it does not make, draw, play or race off its own bat. What its
    person asked for is never taken off the list."""
    if state(w) != "sulk":
        return acts
    asked = {"draw": "draw", "tune": "play_tune", "item": "craft", "lap": "lap"}.get(w.get("asked_art"))
    return [a for a in acts if a[0] not in UNPROMPTED or a[0] == asked]


def comforts(w):
    """Places that are never off the list of walks while it is in a sulk."""
    return COMFORTS if state(w) == "sulk" else set()


def move_key(verb, arg, here, text):
    """What a move is filed under: the verb with its outcome, or with its place."""
    if verb in ("dig", "forage", "explore"):
        return verb + ("+none" if "found only" in text or "found nothing" in text else "+find")
    if verb == "lap" and "a new best" in text:
        return "lap+best"
    if verb == "read" and "did not find" in text:
        return "read+none"
    if "{p}" in PHRASE.get(verb, ""):
        return f"{verb}@{arg if verb == 'go' else here}"
    return verb


def _rec(w, key, dm, de, calm):
    f = w.setdefault("felt", {})
    n, a, b, s = f.get(key, [0, 0.0, 0.0, 0.0])
    n += 1
    k = min(n, SLOW if key in COND or key == "*" else WINDOW)
    f[key] = [n, round(a + (dm - a) / k, 3), round(b + (de - b) / k, 3), round(s + (calm - s) / k, 3)]
    if len(f) > 120:                             # cannot happen with today's moves; a guard
        del f[min((x for x in f if x != "*"), key=lambda x: f[x][0])]


def after_move(w, move, here, text, sky=None):
    """Called once at the end of world.apply_move: move the mood, and note what
    this move was followed by. here is where the crab stood before the move."""
    c = w["crab"]
    verb, _, arg = move.partition(":")
    key = move_key(verb, arg, here, text or "")
    m0 = mood(w)
    m = m0 + LIFT.get(key, LIFT.get(verb, 0))
    if verb in CALM:
        m += max(-6.0, min(6.0, (SETTLED - m) * CALMING))
    conds = []
    if c["energy"] < 20:
        conds.append("tired")
    if sky:
        if sky.get("rain") and c["place"] not in COVER:
            conds.append("rain")                # it likes the misters
        if sky.get("phase") == "night" and (c["place"] == "hollow" or c["place"] not in COVER):
            conds.append("night_in" if c["place"] == "hollow" else "night_out")
    m = _clamp(m + sum(COND[k] for k in conds))
    de = c["energy"] - c.get("e_was", c["energy"])
    for k in [key, "*"] + conds:
        _rec(w, k, m - m0, de, abs(m0 - SETTLED) - abs(m - SETTLED))
    c["mood"] = round(_clamp(m + (MID - m) * DRIFT), 1)
    c["e_was"] = c["energy"]


def event(w, kind):
    """Something that happened to the crab outside a move: 'gift', 'tap',
    'aim_done' or 'aim_lapsed'."""
    c = w["crab"]
    if kind == "tap":                           # one tap counts per move, however many there are
        if c.get("tapped") == w.get("ticks"):
            return
        c["tapped"] = w.get("ticks")
    m0 = mood(w)
    c["mood"] = round(_clamp(m0 + LIFT[kind]), 1)
    _rec(w, kind, c["mood"] - m0, 0, 0)


def beliefs(w, places):
    """Up to five sentences, strongest first, each one true of the averages
    as they stand now. Nothing is stored: a belief that stops being true is
    simply not built next time."""
    f = w.get("felt", {})
    base = f.get("*", [0, 0.0, 0.0, 0.0])[1]
    out = []
    for key, (n, dm, de, calm) in f.items():
        verb, _, place = key.partition("@")
        what = PHRASE.get(key) or PHRASE.get(verb)
        if n < (MIN_N * 10 if key in COND else MIN_N) or not what or ("{p}" in what and place not in places):
            continue
        if "{p}" in what:
            what = what.format(p=places[place][0])
        clear = CLEAR
        if key in COND:                         # weather and tiredness: against an ordinary move
            dm, de, clear = dm - base, 0, COND_CLEAR
        if verb in CALM and calm >= CALM_CLEAR:
            end, strength = "settles me", calm / CALM_CLEAR
        elif dm >= clear:
            end, strength = "lifts me", dm / clear
        elif dm <= -clear:
            end, strength = DOWN.get(key, "gets me down"), -dm / clear
        elif de <= -TIRING:
            end, strength = "wears me out", min(1.0, -de / TIRING * 0.8)
        elif de >= RESTFUL:
            end, strength = "gives me my strength back", min(1.0, de / RESTFUL * 0.8)
        else:
            continue
        out.append((strength, f"{what} {end}."))
    return [s for _, s in sorted(out, key=lambda b: (-b[0], b[1]))[:MAX_BELIEFS]]


def describe_lines(w, places):
    b = beliefs(w, places)
    return ["Things you have come to believe about yourself: " + " ".join(b)] if b else []
