"""What an app's tool call hands back to the agent, made small enough to read.

A connector returns the provider's whole answer. For Gmail that is the raw
message: forty routing headers (DKIM, ARC, Received), the body twice (plain
and HTML), base64url encoded, and every earlier reply quoted under it. One
thread fetch filled the 60,000 character cut, and the agent paid for it again
on every later step (the founder's inbox log, 7 October 2026). This keeps what
an agent acts on (who, to whom, when, the subject, the text, ids, attachment
names) and drops the rest, for every app, then caps what is left.

The rules are shape based, not app based, and each one only removes noise:
- a ``headers`` list of ``{name, value}`` keeps the few headers people read;
- an encoded body (``body.data``) becomes its text, HTML turned to text, and
  is dropped when the message already carries the same text or a plain part;
- a long run of base64 under any key but an id, token or url is replaced by
  a note of its size (an attachment id stays whole: the agent needs it);
- quoted earlier messages (lines starting with ``>``) are folded to one line.
Anything the rules do not recognise passes through unchanged.
"""

import base64
import binascii
import html
import json
import re
from typing import Any

OUTPUT_LIMIT = 30_000
_TEXT_LIMIT = 6_000
_KEPT_HEADERS = frozenset(
    {"from", "to", "cc", "bcc", "reply-to", "subject", "date", "message-id"}
)
_BASE64 = re.compile(r"^[A-Za-z0-9+/_\-=\s]+$")
_KEEP_KEY = re.compile(r"(?i)(id|ids|token|url|uri|href|link|cursor)$")
_TAGS = re.compile(r"(?is)<(script|style|head)\b.*?</\1>|<[^>]+>")
_BLOCK_TAGS = re.compile(r"(?i)<\s*(br|/p|/div|/tr|/li|/h[1-6])\b[^>]*>")
_BLANKS = re.compile(r"\n[ \t|]*(?:\n[ \t|]*)+")
_SPACES = re.compile(r"[ \t ]+")


def _decode(data: str) -> str | None:
    cleaned = re.sub(r"\s", "", data)
    try:
        raw = base64.urlsafe_b64decode(cleaned + "=" * (-len(cleaned) % 4))
    except (binascii.Error, ValueError):
        return None
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return None


def _html_text(markup: str) -> str:
    text = _BLOCK_TAGS.sub("\n", markup)
    text = _TAGS.sub("", text)
    return html.unescape(text)


def readable_text(text: str) -> str:
    """Plain text an agent reads: no quoted chains, no runs of blank lines."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines: list[str] = []
    quoted = False
    for line in text.split("\n"):
        if line.lstrip().startswith(">"):
            if not quoted:
                lines.append("[earlier quoted messages omitted]")
                quoted = True
            continue
        quoted = False
        lines.append(_SPACES.sub(" ", line).rstrip())
    text = _BLANKS.sub("\n\n", "\n".join(lines)).strip()
    if len(text) > _TEXT_LIMIT:
        text = text[:_TEXT_LIMIT] + " … (rest of the text cut)"
    return text


def _looks_encoded(key: str, value: str) -> bool:
    if len(value) < 400 or _KEEP_KEY.search(key):
        return False
    return " " not in value[:400] and _BASE64.match(value[:2000]) is not None


def _tidy_headers(headers: list[Any]) -> list[Any]:
    kept = []
    for header in headers:
        if not isinstance(header, dict):
            return headers
        name = header.get("name")
        if not isinstance(name, str) or "value" not in header:
            return headers
        if name.lower() in _KEPT_HEADERS:
            kept.append(header)
    return kept


def _is_header_list(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) > 0
        and all(
            isinstance(item, dict) and "name" in item and "value" in item
            for item in value
        )
    )


def _part_text(part: dict[str, Any]) -> str | None:
    body = part.get("body")
    if not isinstance(body, dict) or not isinstance(body.get("data"), str):
        return None
    decoded = _decode(body["data"])
    if decoded is None:
        return None
    mime = part.get("mimeType")
    if isinstance(mime, str) and mime.lower() == "text/html":
        decoded = _html_text(decoded)
    return readable_text(decoded)


def _tidy_parts(parts: list[Any]) -> list[Any]:
    mimes = {
        part.get("mimeType", "").lower()
        for part in parts
        if isinstance(part, dict) and isinstance(part.get("mimeType"), str)
    }
    if "text/plain" in mimes and "text/html" in mimes:
        parts = [
            part
            for part in parts
            if not (
                isinstance(part, dict)
                and str(part.get("mimeType", "")).lower() == "text/html"
            )
        ]
    return parts


def _tidy(value: Any, key: str = "", *, has_text: bool = False) -> Any:
    if isinstance(value, dict):
        own_text = (
            isinstance(value.get("messageText"), str)
            and value["messageText"].strip() != ""
        )
        within = has_text or own_text
        out: dict[str, Any] = {}
        for k, v in value.items():
            if k == "headers" and _is_header_list(v):
                out[k] = _tidy_headers(v)
            elif k == "parts" and isinstance(v, list):
                out[k] = [_tidy(p, k, has_text=within) for p in _tidy_parts(v)]
            elif k == "body" and isinstance(v, dict) and isinstance(v.get("data"), str):
                if within:
                    continue
                text = _part_text(value)
                rest = {bk: bv for bk, bv in v.items() if bk not in ("data", "size")}
                out[k] = (
                    {**rest, "text": text}
                    if text is not None
                    else {
                        **rest,
                        "data": f"[{len(v['data'])} characters of encoded data omitted]",
                    }
                )
            else:
                out[k] = _tidy(v, k, has_text=within)
        return out
    if isinstance(value, list):
        return [_tidy(item, key, has_text=has_text) for item in value]
    if isinstance(value, str):
        if key == "messageText":
            return readable_text(value)
        if _looks_encoded(key, value):
            return f"[{len(value)} characters of encoded data omitted]"
    return value


def _cap(text: str) -> str:
    if len(text) <= OUTPUT_LIMIT:
        return text
    return (
        text[:OUTPUT_LIMIT]
        + f"… (cut: the full result was {len(text)} characters. Ask for fewer"
        " results, a narrower search, or one item at a time.)"
    )


def tidy_result(data: Any) -> str:
    """The text an agent gets for a tool call's data."""
    if isinstance(data, str):
        return _cap(data)
    try:
        text = json.dumps(_tidy(data), ensure_ascii=False, separators=(",", ":"))
    except Exception:
        text = json.dumps(data, ensure_ascii=False, default=str)
    return _cap(text)
