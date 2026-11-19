"""Reads how the person's driving went, from the telemetry files iRacing
already writes to this PC. Read-only, local, and never while the sim runs.

From each file it reads the header, the session description and the very last
telemetry sample (a few kilobytes in all), never the rest. Only the person's
own result is used: no other driver's name is kept or passed on.
"""
import os
import re
import struct

TELEMETRY = os.path.join(os.path.expanduser("~"), "Documents", "iRacing", "telemetry")
WANTED = ("SessionNum", "SessionState", "PlayerCarPosition", "PlayerCarClassPosition",
          "PlayerCarMyIncidentCount", "LapCompleted", "LapBestLapTime", "Lap")
FORMATS = {0: "c", 1: "?", 2: "i", 3: "I", 4: "f", 5: "d"}


def _field(text, key, default=""):
    m = re.search(r"^[ \t]*" + re.escape(key) + r":[ \t]*(.*)$", text, re.M)
    return m.group(1).strip().strip('"') if m else default


def read_file(path):
    """(session description, start time, last telemetry sample) from one .ibt."""
    try:
        with open(path, "rb") as f:
            head = f.read(144)
            if len(head) < 144:
                return "", 0, {}
            (_, _, _, _, ylen, yoff, nvars, voff, _, buflen) = struct.unpack("<10i", head[:40])
            bufoff, = struct.unpack("<i", head[52:56])
            started, = struct.unpack("<q", head[112:120])
            records, = struct.unpack("<i", head[140:144])
            if not (0 < ylen < 2_000_000 and 0 < yoff < 50_000_000 and 0 < nvars < 5000):
                return "", 0, {}
            f.seek(yoff)
            text = f.read(ylen).decode("cp1252", "replace")
            last = {}
            if records > 0 and 0 < buflen < 1_000_000:
                f.seek(voff)
                table = f.read(nvars * 144)
                f.seek(bufoff + (records - 1) * buflen)
                sample = f.read(buflen)
                for i in range(nvars):
                    vtype, offset = struct.unpack("<2i", table[i * 144:i * 144 + 8])
                    name = table[i * 144 + 16:i * 144 + 48].split(b"\0", 1)[0].decode("ascii", "replace")
                    if name in WANTED and vtype in FORMATS and len(sample) == buflen:
                        fmt = "<" + FORMATS[vtype]
                        last[name] = struct.unpack_from(fmt, sample, offset)[0]
            return text, started, last
    except (OSError, struct.error):
        return "", 0, {}


def ordinal(n):
    n = int(n)
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def lap_time(seconds):
    if not seconds or seconds <= 0:
        return ""
    m, s = divmod(seconds, 60)
    return f"{int(m)}:{s:06.3f}" if m else f"{s:.3f} s"


def parse(text, started=0, last=None):
    """One drive as a dict, or None. 'line' is the plain sentence for the crab."""
    last = last or {}
    if not text or "SessionNum" not in last:
        return None
    weekend = text.split("SessionInfo:", 1)[0]
    track = _field(weekend, "TrackDisplayName")
    config = _field(weekend, "TrackConfigName")
    me = _field(text, "DriverCarIdx")
    if not track or not me:
        return None

    # the person's own car and how many real cars share its class
    car, my_class, classes = "", "", []
    for block in re.split(r"\n[ \t]*- CarIdx:[ \t]*", text.split("DriverInfo:", 1)[-1])[1:]:
        idx = block.split("\n", 1)[0].strip()
        if _field(block, "CarIsPaceCar") == "1" or _field(block, "IsSpectator") == "1":
            continue
        classes.append(_field(block, "CarClassID"))
        if idx == me:
            car, my_class = _field(block, "CarScreenName"), classes[-1]
    field = classes.count(my_class)

    sessions = re.split(r"\n[ \t]*- SessionNum:", text.split("SessionInfo:", 1)[-1].split("DriverInfo:", 1)[0])[1:]
    num = int(last["SessionNum"])
    stype = _field(sessions[num], "SessionType") if 0 <= num < len(sessions) else ""
    laps = max(int(last.get("LapCompleted", 0)), 0)
    best = last.get("LapBestLapTime", 0)
    inc = int(last.get("PlayerCarMyIncidentCount", 0))
    pos = int(last.get("PlayerCarClassPosition", 0)) or int(last.get("PlayerCarPosition", 0))
    done = int(last.get("SessionState", 0)) >= 5          # chequered flag or cool-down

    extras = (f"{laps} lap{'s' if laps != 1 else ''}"
              + (f", best lap {lap_time(best)}" if best and best > 0 else "")
              + f", {inc} incident point{'s' if inc != 1 else ''}")
    if "Race" in stype:
        kind = "race"
        if pos and done:
            what = f"finished the race {ordinal(pos)} of {field} in class"
        elif pos:
            what = f"left the race while running {ordinal(pos)} of {field} in class, before the finish"
        else:
            what = "took part in the race"
    elif "Qual" in stype:
        kind = "qualifying"
        what = f"qualified {ordinal(pos)} of {field}" if pos else "ran qualifying"
    else:
        kind = "practice"
        what = "ran " + (stype.lower() or "practice")
    official = _field(weekend, "Official") == "1"
    where = track + (f" ({config})" if config and config.lower() not in track.lower() else "")
    line = (f"{where}, {car or 'unknown car'}, "
            f"{'official' if official else 'unofficial'} {_field(weekend, 'EventType', 'session').lower()}: "
            f"{what}; {extras}.")
    return {"key": _field(weekend, "SubSessionID") or f"{track}|{started}",
            "track": where, "car": car, "kind": kind, "started": started, "line": line,
            "laps": laps}


def recent(folder, since, limit=40):
    """Drives from .ibt files changed after `since`, the last file of each
    session. Returns (drives oldest first, newest file time seen)."""
    try:
        files = [(os.path.getmtime(os.path.join(folder, n)), n)
                 for n in os.listdir(folder) if n.lower().endswith(".ibt")]
    except OSError:
        return [], since
    files = sorted(f for f in files if f[0] > since)[-limit:]
    found, newest = {}, since
    for mtime, name in files:
        drive = parse(*read_file(os.path.join(folder, name)))
        newest = max(newest, mtime)
        if drive:
            drive["when"] = mtime
            found[drive["key"]] = drive        # later files of a session replace earlier ones
    return sorted(found.values(), key=lambda d: d["when"]), newest
