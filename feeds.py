"""Read-only news feeds. The only file in this project that touches the internet.

What it can do: send a plain GET to an https address that the person added as a
source, and read back an RSS or Atom feed. Nothing here is ever given text
written by the model: the addresses come from the sources list only, no query
strings are built, no cookies or logins are used, and nothing is posted.
"""
import html
import ipaddress
import re
import socket
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

MAX_BYTES = 2_000_000
USER_AGENT = "Mozilla/5.0 (compatible; feed-reader)"


class FeedError(Exception):
    pass


def check_address(url):
    """Allow only https on the normal port to a public internet address.
    Refuses this PC, the home network and anything with a login in it."""
    u = urllib.parse.urlsplit(url)
    if u.scheme != "https" or not u.hostname or u.username or u.password:
        raise FeedError("Only plain https addresses are allowed.")
    if u.port not in (None, 443):
        raise FeedError("Only the standard https port is allowed.")
    try:
        infos = socket.getaddrinfo(u.hostname, 443, type=socket.SOCK_STREAM)
    except OSError:
        raise FeedError("That address could not be found.")
    for info in infos:
        if not ipaddress.ip_address(info[4][0]).is_global:
            raise FeedError("That address is not on the public internet.")
    return url


class _CheckedRedirects(urllib.request.HTTPRedirectHandler):
    max_redirections = 4

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        check_address(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_opener = urllib.request.OpenerDirector()
for _h in (urllib.request.HTTPSHandler(), _CheckedRedirects(),
           urllib.request.HTTPDefaultErrorHandler(), urllib.request.HTTPErrorProcessor()):
    _opener.add_handler(_h)


def fetch(url):
    """GET one feed. Returns its bytes."""
    check_address(url)
    req = urllib.request.Request(url, method="GET", headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml",
        "Accept-Encoding": "identity",
    })
    try:
        with _opener.open(req, timeout=20) as resp:
            data = resp.read(MAX_BYTES + 1)
    except FeedError:
        raise
    except urllib.error.HTTPError as e:
        raise FeedError(f"The site answered with error {e.code}.")
    except Exception as e:
        raise FeedError(f"Could not reach the site ({type(e).__name__}).")
    if len(data) > MAX_BYTES:
        raise FeedError("The feed is too large.")
    return data


_TAG = re.compile(r"<[^>]+>")
_SPACE = re.compile(r"\s+")


def clean(text, limit):
    """Feed text as plain words: no markup, no line breaks, capped."""
    text = html.unescape(_TAG.sub(" ", html.unescape(text or "")))
    return _SPACE.sub(" ", text).strip()[:limit]


def _local(tag):
    return tag.rsplit("}", 1)[-1].lower() if isinstance(tag, str) else ""


def parse(data):
    """Returns (feed title, [entries]); each entry has guid, title, blurb, link."""
    if b"<!ENTITY" in data:
        raise FeedError("That feed uses a feature this reader refuses.")
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        raise FeedError("That address is not an RSS or Atom feed.")
    feed_title = ""
    entries = []
    for el in root.iter():
        name = _local(el.tag)
        if name == "title" and not feed_title:
            feed_title = clean(el.text, 60)
        if name not in ("item", "entry"):
            continue
        title = blurb = link = guid = ""
        for child in el:
            c = _local(child.tag)
            if c == "title":
                title = clean(child.text, 200)
            elif c in ("description", "summary") or (c in ("encoded", "content") and not blurb):
                blurb = clean(child.text, 1200) or blurb
            elif c == "link":
                href = (child.get("href") or child.text or "").strip()
                if href.startswith("https://") and (not link or child.get("rel") in (None, "alternate")):
                    link = href[:500]
            elif c in ("guid", "id"):
                guid = (child.text or "").strip()[:300]
        if title:
            entries.append({"guid": guid or link or title, "title": title,
                            "blurb": blurb, "link": link})
    if not entries:
        raise FeedError("That address is not an RSS or Atom feed, or it is empty.")
    return feed_title or "Untitled feed", entries[:40]
