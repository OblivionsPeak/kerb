"""The calendar by the glass: things the person has said are coming up.

Pure rules, like world.py: no files, no network, no model, no database. crab.py
keeps the rows and calls in here to decide what they mean. A plan is anything
with the keys id, ts_start, minutes, title, state (and awake, words). Times are
this PC's own local time, as seconds.

The title is the person's own words. It is cleaned and cut short here and is
only ever used as text.
"""
import datetime as dt
import unicodedata

TITLE_MAX = 60
EARLY = 15 * 60         # the crab may turn up this long before the start
MINUTES_DEFAULT = 60
MINUTES_MAX = 24 * 60
AHEAD_MAX = 366 * 86400
UPCOMING_MAX = 20       # plans waiting on the calendar at once
PAST_KEPT = 30          # finished plans kept before the oldest are dropped
UPCOMING, THERE, MISSED, SLEPT = "upcoming", "was there", "missed", "slept through"


def clean_title(text):
    """One line of plain text: no control or invisible characters, at most 60 long."""
    s = "".join(" " if unicodedata.category(ch)[0] in "CZ" else ch for ch in str(text or "")[:2000])
    return " ".join(s.split())[:TITLE_MAX].strip()


def parse_when(text):
    """'2026-11-21T19:30' in local time, as seconds. None if it is not exactly that."""
    try:
        return dt.datetime.strptime(str(text or "")[:16], "%Y-%m-%dT%H:%M").timestamp()
    except (ValueError, OverflowError, OSError):
        return None


def parse_minutes(value):
    try:
        n = int(value)
    except (TypeError, ValueError):
        return MINUTES_DEFAULT
    return max(5, min(MINUTES_MAX, n))


def check_new(title, ts, minutes, now, waiting):
    """Why this plan cannot go on the calendar, in plain words, or None if it can."""
    if len(title) < 2:
        return "Give it a name of at least two letters."
    if ts is None:
        return "Pick a date and a time."
    if ts + minutes * 60 <= now:
        return "That time has already gone."
    if ts - now > AHEAD_MAX:
        return "That is more than a year away."
    if waiting >= UPCOMING_MAX:
        return "The calendar is full. Remove something first."
    return None


def window(p):
    """(first moment the crab may turn up, the end)."""
    return p["ts_start"] - EARLY, p["ts_start"] + p["minutes"] * 60


def current(plans, now):
    """The upcoming plan it could be at the glass for right now, or None."""
    for p in sorted(plans, key=lambda p: (p["ts_start"], p["id"])):
        a, b = window(p)
        if p["state"] == UPCOMING and a <= now < b:
            return p
    return None


def over(plans, now):
    """Upcoming plans whose time has passed without the crab turning up."""
    return [p for p in plans if p["state"] == UPCOMING and window(p)[1] <= now]


def outcome(p):
    """(new state, what the crab is told, the line for the log) for a plan that is over.
    'awake' is set by crab.py the first time the crab had a move to make inside the window."""
    if p["awake"]:
        return (MISSED, f"You meant to be at the glass for {p['title']} and missed it.",
                "{name} missed " + p["title"] + ".")
    return (SLEPT, f"{p['title']} came and went while you were asleep.",
            "{name} slept through " + p["title"] + ".")


def day_words(ts, now):
    d, today = dt.date.fromtimestamp(ts), dt.date.fromtimestamp(now)
    gap = (d - today).days
    if gap in (-1, 0, 1):
        return ("yesterday", "today", "tomorrow")[gap + 1]
    return f"on {d:%A} {d.day} {d:%B}" + (f" {d.year}" if d.year != today.year else "")


def when_words(ts, now):
    """'today at 19:30', 'tomorrow at 08:00', 'on Saturday 21 November at 19:30'."""
    return f"{day_words(ts, now)} at {dt.datetime.fromtimestamp(ts):%H:%M}"


def how_long(seconds):
    m = max(1, round(seconds / 60))
    if m < 90:
        return f"in {m} minute{'s' if m != 1 else ''}"
    if m < 36 * 60:
        return f"in about {round(m / 60)} hours"
    return f"in {round(m / 1440)} days"


def added_notice(title, ts, now):
    return ("Your person has put something on the calendar by the glass: "
            f"{title}, {when_words(ts, now)}.")


def removed_notice(title):
    return f"Your person has taken {title} off the calendar by the glass."


def _upcoming(plans):
    return sorted((p for p in plans if p["state"] == UPCOMING), key=lambda p: (p["ts_start"], p["id"]))


def prompt_line(plans, now):
    """One line for the crab's prompts: the next two plans and how long until each.
    Empty when there is nothing on the calendar."""
    bits = []
    for p in _upcoming(plans)[:2]:
        end = window(p)[1]
        if now >= end:
            continue
        if now >= p["ts_start"]:
            bits.append(f"“{p['title']}” is on now, until {dt.datetime.fromtimestamp(end):%H:%M}")
        else:
            bits.append(f"“{p['title']}” {how_long(p['ts_start'] - now)} "
                        f"({when_words(p['ts_start'], now)}, for {p['minutes']} minutes)")
    if not bits:
        return ""
    return ("On the calendar by the front glass, put there by your person: " + "; ".join(bits)
            + ". You can be at the glass for one from 15 minutes before it starts until it ends.")


def past_line(p, now):
    """What became of a finished plan, said to the crab."""
    said = {THERE: "you were at the glass for it", MISSED: "you meant to be there and missed it",
            SLEPT: "it came and went while you were asleep"}.get(p["state"], p["state"])
    words = f' You said: "{p["words"]}"' if p["state"] == THERE and p["words"] else ""
    return f"“{p['title']}”, {when_words(p['ts_start'], now)}: {said}.{words}"


def chat_part(plans, past, now):
    """The calendar as a section of the chat prompt, or '' if there is nothing to say."""
    line = prompt_line(plans, now)
    if not line and not past:
        return ""
    out = [line or "Nothing is on the calendar by the front glass just now."]
    if past:
        out.append("What became of the last few, newest first. This is all you know about them:")
        out += ["- " + past_line(p, now) for p in past]
    return "## The calendar by the glass\n\n" + "\n".join(out)


def next_text(plans, now):
    """The short line under the crab's name in the window."""
    for p in _upcoming(plans):
        end = window(p)[1]
        if now >= end:
            continue
        if now >= p["ts_start"]:
            return f"On now: {p['title']}, until {dt.datetime.fromtimestamp(end):%H:%M}"
        return f"Next on the calendar: {p['title']}, {when_words(p['ts_start'], now)}"
    return ""
