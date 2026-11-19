"""The optional cloud brain. The only file that talks to Anthropic.

When the person switches the crab's thinking to the cloud, every prompt that
would have gone to the local model goes to Claude Haiku instead. That means
the crab's identity, notebook, journal, the conversation and any photo being
looked at leave this PC. Nothing else changes: the model still only returns
text, and the same code decides what happens with it.

The API key is stored encrypted with Windows DPAPI, so only this Windows user
account on this PC can read it back. It is never logged or sent to the window.
"""
import base64
import ctypes
import os
from ctypes import wintypes

MODEL = "claude-haiku-5-5"
PRICE_IN, PRICE_OUT = 0.10, 0.50      # US dollars per million tokens
# Haiku thinks before it answers and that thinking counts toward the reply
# limit, so every call gets this much headroom on top of what it asked for.
THINKING_HEADROOM = 3000


class CloudError(Exception):
    pass


# ---------------------------------------------------------------- key store

class _Blob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _dpapi(data, protect):
    crypt, kernel = ctypes.windll.crypt32, ctypes.windll.kernel32
    src = _Blob(len(data), ctypes.cast(ctypes.create_string_buffer(data, len(data)),
                                       ctypes.POINTER(ctypes.c_char)))
    out = _Blob()
    fn = crypt.CryptProtectData if protect else crypt.CryptUnprotectData
    if not fn(ctypes.byref(src), None, None, None, None, 0, ctypes.byref(out)):
        raise CloudError("Windows could not " + ("protect" if protect else "read") + " the key.")
    try:
        return ctypes.string_at(out.pbData, out.cbData)
    finally:
        kernel.LocalFree(out.pbData)


def save_key(path, key):
    key = "".join(str(key).split())
    if not key.startswith("sk-ant-") or len(key) < 40 or len(key) > 300:
        raise CloudError("That doesn't look like an Anthropic API key (they start with sk-ant-).")
    with open(path, "wb") as f:
        f.write(_dpapi(key.encode("ascii"), True))


def load_key(path):
    """The saved key, else the ANTHROPIC_API_KEY environment variable, else ''."""
    try:
        with open(path, "rb") as f:
            return _dpapi(f.read(), False).decode("ascii")
    except (OSError, CloudError, UnicodeDecodeError):
        return os.environ.get("ANTHROPIC_API_KEY", "")


def forget_key(path):
    try:
        os.remove(path)
    except OSError:
        pass


# ------------------------------------------------------------------ adapter

def _strict(schema):
    """Structured outputs want closed objects and do not take length limits."""
    if isinstance(schema, dict):
        out = {k: _strict(v) for k, v in schema.items()
               if k not in ("maxItems", "minItems", "maxLength", "minLength")}
        if out.get("type") == "object":
            out["additionalProperties"] = False
        return out
    if isinstance(schema, list):
        return [_strict(v) for v in schema]
    return schema


def _convert(messages):
    """This program's message list -> (system text, Anthropic messages)."""
    system, out = "", []
    for m in messages:
        if m["role"] == "system":
            system += ("\n\n" if system else "") + m["content"]
            continue
        content = m["content"]
        if isinstance(content, list):
            blocks = []
            for part in content:
                if part.get("type") == "image_url":
                    head, _, data = part["image_url"]["url"].partition(",")
                    media = head[5:].split(";")[0] or "image/jpeg"
                    blocks.append({"type": "image", "source": {
                        "type": "base64", "media_type": media, "data": data}})
                else:
                    blocks.append({"type": "text", "text": part.get("text", "")})
            # images first, then the words about them
            content = [b for b in blocks if b["type"] == "image"] + \
                      [b for b in blocks if b["type"] == "text"]
        out.append({"role": m["role"], "content": content})
    return system, out


class Brain:
    def __init__(self, key):
        try:
            import anthropic
        except ImportError:
            raise CloudError("The Anthropic library is not installed for this program.")
        if not key:
            raise CloudError("No API key saved yet.")
        self.anthropic = anthropic
        self.client = anthropic.Anthropic(api_key=key, max_retries=2, timeout=90.0)

    def _args(self, messages, max_tokens, schema):
        system, msgs = _convert(messages)
        args = {"model": MODEL, "max_tokens": max_tokens + THINKING_HEADROOM, "messages": msgs,
                "output_config": {"effort": "low"}}
        if system:
            args["system"] = system
        if schema:
            args["output_config"]["format"] = {"type": "json_schema", "schema": _strict(schema)}
        return args

    def _explain(self, e):
        a = self.anthropic
        if isinstance(e, a.AuthenticationError):
            return "Anthropic rejected the API key."
        if isinstance(e, a.PermissionDeniedError):
            return "That API key is not allowed to use this model."
        if isinstance(e, a.RateLimitError):
            return "Anthropic is rate-limiting this key. Try again in a minute."
        if isinstance(e, a.APIConnectionError):
            return "Could not reach Anthropic. Check the internet connection."
        if isinstance(e, a.APIStatusError):
            return f"Anthropic answered with an error ({e.status_code}): {e.message}"
        return f"Cloud error: {type(e).__name__}"

    @staticmethod
    def _usage(message):
        u = message.usage
        return {"input": (u.input_tokens or 0) + (getattr(u, "cache_read_input_tokens", 0) or 0)
                + (getattr(u, "cache_creation_input_tokens", 0) or 0),
                "output": u.output_tokens or 0}

    def ask(self, messages, max_tokens, schema=None):
        """One reply as text. Returns (text, usage)."""
        try:
            message = self.client.messages.create(**self._args(messages, max_tokens, schema))
        except self.anthropic.APIError as e:
            raise CloudError(self._explain(e))
        if message.stop_reason == "refusal":
            raise CloudError("The cloud model declined to answer that.")
        text = "".join(b.text for b in message.content if b.type == "text")
        if not text.strip():
            raise CloudError("The cloud model returned nothing.")
        return text, self._usage(message)

    def stream(self, messages, max_tokens, on_usage):
        """Yield a reply piece by piece; report usage through on_usage at the end."""
        try:
            with self.client.messages.stream(**self._args(messages, max_tokens, None)) as s:
                for piece in s.text_stream:
                    yield piece
                on_usage(self._usage(s.get_final_message()))
        except self.anthropic.APIError as e:
            raise CloudError(self._explain(e))


def cost(input_tokens, output_tokens, searches=0):
    return (input_tokens * PRICE_IN + output_tokens * PRICE_OUT) / 1_000_000 + (searches or 0) * PRICE_SEARCH


# ---- [research] one question with Anthropic's own web search tool

WEB_SEARCH = "web_search_20250305"
PRICE_SEARCH = 0.01                   # US dollars per web search ($10 per 1,000)
NOT_ENABLED = ("Web search is switched off for this Anthropic organisation. An administrator can "
               "switch it on in the Claude Console.")


def _f(obj, name, default=None):
    """A field of a reply block, whether the library hands it over as an object or a dict."""
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _research(brain, args, continues=2):
    """Send one research request and read the reply into plain values. This PC
    fetches nothing: the search runs at Anthropic. Never raises for an answer
    it does not like; 'problem' says in plain words what went wrong.

    Returns queries (what the tool really searched for), results ({url, title}
    of the pages it reported), cited (addresses the answer cites), errors (tool
    error codes), text (the answer after the last search), input and output
    tokens, searches (the number Anthropic counted), calls, and blocked (web
    search is switched off for the organisation)."""
    out = {"queries": [], "results": [], "cited": [], "errors": [], "text": "", "input": 0,
           "output": 0, "searches": 0, "calls": 0, "problem": "", "blocked": False}
    tools = args.get("tools") or []
    if len(tools) != 1 or tools[0].get("type") != WEB_SEARCH or not tools[0].get("allowed_domains"):
        out["problem"] = "The question was not put together properly, so it was not sent."
        return out
    messages, text = list(args["messages"]), []
    for _ in range(continues + 1):
        try:
            # no automatic second try: a repeat could run, and bill, the searches again
            message = brain.client.with_options(max_retries=0, timeout=120.0).messages.create(
                **dict(args, messages=messages))
        except brain.anthropic.APIError as e:
            said = str(_f(e, "message", "") or e).lower()
            if _f(e, "status_code") == 400 and "web search" in said.replace("_", " "):
                out["problem"], out["blocked"] = NOT_ENABLED, True
            else:
                out["problem"] = brain._explain(e)
            return out
        out["calls"] += 1
        usage = _f(message, "usage")
        for key in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"):
            out["input"] += _f(usage, key, 0) or 0
        out["output"] += _f(usage, "output_tokens", 0) or 0
        out["searches"] += _f(_f(usage, "server_tool_use"), "web_search_requests", 0) or 0
        content = _f(message, "content") or []
        for b in content:
            kind = _f(b, "type")
            if kind == "server_tool_use":
                out["queries"].append(str(_f(_f(b, "input") or {}, "query", ""))[:400])
            elif kind == "web_search_tool_result":
                text = []                   # only what is said after the last search is the answer
                got = _f(b, "content")
                if isinstance(got, (list, tuple)):
                    out["results"] += [{"url": str(_f(r, "url", ""))[:400], "title": str(_f(r, "title", ""))[:200]}
                                       for r in got if _f(r, "type") == "web_search_result"]
                else:
                    out["errors"].append(str(_f(got, "error_code", "unavailable"))[:40])
            elif kind == "text":
                text.append(str(_f(b, "text", "")))
                out["cited"] += [str(_f(c, "url"))[:400] for c in _f(b, "citations") or [] if _f(c, "url")]
        stop = _f(message, "stop_reason")
        if stop == "refusal":
            out["problem"] = "The cloud model declined to answer that."
            return out
        if stop != "pause_turn":
            out["text"] = "".join(text)
            return out
        messages = messages + [{"role": "assistant", "content": content}]     # sent back unchanged
    out["problem"] = "The search took too long and was stopped."
    return out


Brain.research = _research
