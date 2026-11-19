"""The crab's encyclopedia: an offline copy of Simple English Wikipedia.

This is the only file that opens it. It reads one local file and never touches
the network. What comes out is untrusted text: the caller hands it to the
no-memory reader, never straight to the crab.
"""
import os
import re
import threading
from html.parser import HTMLParser

_lock = threading.Lock()
_zim = None
_path = None

SKIP = {"script", "style", "table", "sup", "figure", "figcaption", "math", "noscript"}
VOID = {"br", "img", "hr", "meta", "link", "input", "wbr", "source", "col", "area", "base"}


class _Text(HTMLParser):
    """The words of the first paragraphs of an article, nothing else."""

    def __init__(self, limit):
        super().__init__(convert_charrefs=True)
        self.limit, self.size = limit, 0
        self.out, self.cur = [], None
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in VOID:
            return
        if self.skip or tag in SKIP:
            self.skip += 1
        elif tag == "p" and self.size < self.limit:
            self.cur = []

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if self.skip:
            self.skip -= 1
        elif tag == "p" and self.cur is not None:
            text = " ".join("".join(self.cur).split())
            if len(text) > 30:
                self.out.append(text)
                self.size += len(text)
            self.cur = None

    def handle_data(self, data):
        if self.cur is not None and not self.skip:
            self.cur.append(data)


def _open(path):
    global _zim, _path
    if _zim is None or _path != path:
        from libzim.reader import Archive
        _zim, _path = Archive(path), path
    return _zim


def available(path):
    if not path or not os.path.isfile(path):
        return False
    try:
        with _lock:
            _open(path)
        return True
    except Exception:
        return False


def _candidates(zim, topic):
    """Paths of articles that might be the one meant, best first."""
    from libzim.suggestion import SuggestionSearcher
    seen, out = set(), []

    def take(paths):
        for p in paths:
            if p not in seen:
                seen.add(p)
                out.append(p)
    single = topic[:-1] if topic.endswith("s") and len(topic) > 3 else topic
    for title in (topic, topic.capitalize(), topic.title(), single.capitalize()):
        try:
            take([zim.get_entry_by_title(title).path])
        except Exception:
            pass
    # Then headings like it. No searching inside articles: that brings back
    # pages that only mention the word, which would teach the crab the wrong thing.
    try:
        take(sorted((str(getattr(p, "path", p)) for p in
                     SuggestionSearcher(zim).suggest(topic).get_results(0, 12)), key=len))
    except Exception:
        pass
    return out[:12]


def _about(title, topic):
    """Does this heading really name the subject asked for? Whole words only,
    allowing the asker a plural the heading does not have."""
    have = set(re.findall(r"[a-z0-9']+", title.lower()))
    words = [w for w in topic.lower().split() if len(w) > 2] or topic.lower().split()
    return all(w in have or (w.endswith("s") and w[:-1] in have) for w in words)


def lookup(path, topic, limit=2400):
    """(article title, opening text) for a topic, or None if the book has
    nothing on it. The topic is trimmed to a few plain words first."""
    topic = " ".join(re.sub(r"[^\w\s'-]", " ", str(topic)).split())[:60]
    topic = re.sub(r"^(the|a|an)\s+", "", topic, flags=re.I)
    if len(topic) < 2:
        return None
    with _lock:
        zim = _open(path)
        for cand in _candidates(zim, topic):
            try:
                entry = zim.get_entry_by_path(cand)
                for _ in range(3):
                    if not entry.is_redirect:
                        break
                    entry = entry.get_redirect_entry()
                item = entry.get_item()
                if "html" not in item.mimetype:
                    continue
                parser = _Text(limit)
                parser.feed(bytes(item.content).decode("utf-8", "replace"))
                text = "\n".join(parser.out)[:limit]
            except Exception:
                continue
            title = " ".join(str(entry.title).split())[:80]
            if len(text) < 200 or "disambiguation" in title.lower() or not _about(title, topic):
                continue
            if re.match(r"(Category|Portal|Template|Wikipedia|Help|File|Module|Draft|User|Talk)\s*:", title):
                continue                    # housekeeping pages, not articles
            if re.search(r"\b(may|can|could|might) (also )?(refer to|mean)\b", text[:260]):
                continue                    # a list of meanings, not an article
            return title, text
    return None
