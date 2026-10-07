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

Added after the September inbox log (7 October 2026), for a message whose
text is already in ``messageText``:
- text that arrives as HTML (an Apple Mail reply) is turned into text;
- an earlier reply chain under the message (an HTML quote, or Outlook's
  ``From: ... Sent: ...`` block) is folded to one line, unless the message is
  a forward, where the quoted part is the content;
- the MIME skeleton (``payload.parts``) and the ``preview`` copy go: the text
  is in ``messageText`` and every attachment is in ``attachmentList``.

And for every message, with text or without: a header that repeats the
message's own ``sender``, ``to`` or ``subject`` exactly goes, and so does the
preview's copy of the subject.
"""

import base64
import binascii
import html
import json
import re
from typing import Any, TypeGuard

OUTPUT_LIMIT = 30_000
_TEXT_LIMIT = 6_000
# A reply chain shorter than this stays: folding it saves less than it risks.
_CHAIN_FOLD_MIN = 800
_KEPT_HEADERS = frozenset(
    {"from", "to", "cc", "bcc", "reply-to", "subject", "date", "message-id"}
)
_BASE64 = re.compile(r"^[A-Za-z0-9+/_\-=\s]+$")
_KEEP_KEY = re.compile(r"(?i)(id|ids|token|url|uri|href|link|cursor)$")
_TAGS = re.compile(r"(?is)<(script|style|head)\b.*?</\1>|<[^>]+>")
_BLOCK_TAGS = re.compile(r"(?i)<\s*(br|/p|/div|/tr|/li|/h[1-6])\b[^>]*>")
_BLANKS = re.compile(r"\n[ \t|]*(?:\n[ \t|]*)+")
_SPACES = re.compile(r"[ \t\xa0]+")
_HTML_HINT = re.compile(
    r"(?i)</(?:div|p|span|td|table|blockquote|body|html)\s*>|<br\s*/?>"
)
# Where a client starts the quoted earlier messages in HTML: Apple Mail and
# most clients use <blockquote>, Gmail a gmail_quote div, Outlook a reply div.
_HTML_QUOTE = re.compile(
    r"(?i)<blockquote\b"
    r"|<div\b[^>]*class=\"[^\"]*gmail_quote"
    r"|<div\b[^>]*id=\"(?:divRplyFwdMsg|appendonsend)\""
)
_FORWARD_SUBJECT = re.compile(r"(?i)\bfwd?\s*:")
_FORWARD_BODY = re.compile(r"(?i)forwarded message|begin forwarded")
_CHAIN_FROM = re.compile(r"^\s*\**From:\**\s*\S")
_CHAIN_SENT = re.compile(r"^\s*\**(?:Sent|Date):\**\s*\S")
_CHAIN_RULE = re.compile(r"(?i)^\s*(?:_{10,}|-{3,}\s*original message\s*-{3,})\s*$")


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


def _cut_html_quote(markup: str) -> str:
    """The markup above the first quoted earlier message, with a note."""
    match = _HTML_QUOTE.search(markup)
    if match is None or not _html_text(markup[: match.start()]).strip():
        return markup
    return markup[: match.start()] + "<br>[earlier quoted messages omitted]"


def _fold_reply_chain(text: str) -> str:
    """Folds an Outlook-style chain (``From: ... Sent: ...``) under a reply."""
    lines = text.split("\n")
    for index, line in enumerate(lines):
        if index == 0:
            continue
        starts_chain = False
        if _CHAIN_RULE.match(line):
            starts_chain = any(
                _CHAIN_FROM.match(nxt) for nxt in lines[index + 1 : index + 4]
            )
        elif _CHAIN_FROM.match(line):
            starts_chain = any(
                _CHAIN_SENT.match(nxt) for nxt in lines[index + 1 : index + 5]
            )
        if not starts_chain:
            continue
        before = "\n".join(lines[:index])
        chain = "\n".join(lines[index:])
        if not before.strip() or len(chain) < _CHAIN_FOLD_MIN:
            return text
        return (
            before.rstrip()
            + f"\n\n[earlier messages in this thread omitted: {len(chain)} characters;"
            " read the thread for them]"
        )
    return text


def readable_text(
    text: str, *, html_text: bool | None = None, fold_replies: bool = False
) -> str:
    """Plain text an agent reads: no quoted chains, no runs of blank lines.

    ``html_text`` says the text is HTML (None: guess from its tags).
    ``fold_replies`` also folds an earlier reply chain; it is ignored for a
    forward, whose quoted part is what was sent.
    """
    if fold_replies and _FORWARD_BODY.search(text):
        fold_replies = False
    if html_text is None:
        html_text = _HTML_HINT.search(text) is not None
    if html_text:
        if fold_replies:
            text = _cut_html_quote(text)
        text = _html_text(text)
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
    text = "\n".join(lines)
    if fold_replies:
        text = _fold_reply_chain(text)
    text = _BLANKS.sub("\n\n", text).strip()
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


def _is_header_list(value: Any) -> TypeGuard[list[Any]]:
    return (
        isinstance(value, list)
        and len(value) > 0
        and all(
            isinstance(item, dict) and "name" in item and "value" in item
            for item in value
        )
    )


def _subject_of(value: dict[str, Any]) -> str | None:
    subject = value.get("subject")
    if isinstance(subject, str):
        return subject
    headers = value.get("headers")
    if _is_header_list(headers):
        for header in headers:
            if str(header.get("name", "")).lower() == "subject" and isinstance(
                header.get("value"), str
            ):
                return header["value"]
    return None


def _part_text(part: dict[str, Any], *, fold_replies: bool) -> str | None:
    body = part.get("body")
    if not isinstance(body, dict) or not isinstance(body.get("data"), str):
        return None
    decoded = _decode(body["data"])
    if decoded is None:
        return None
    mime = part.get("mimeType")
    is_html = isinstance(mime, str) and mime.lower() == "text/html"
    return readable_text(decoded, html_text=is_html, fold_replies=fold_replies)


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


def _slim_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    """A message payload whose text and attachments are listed elsewhere."""
    headers = payload.get("headers")
    if _is_header_list(headers):
        return {"headers": _tidy_headers(headers)}
    return None


# A header and the top-level field that repeats it (Gmail's `sender`, `to`,
# `subject`). A listing of 30 messages to nine people carried each recipient
# list twice and each subject three times (the staffing log, 7 October 2026).
_REPEATED_HEADERS = {"from": "sender", "to": "to", "subject": "subject"}


def _top_level_headers(value: dict[str, Any]) -> dict[str, str]:
    top: dict[str, str] = {}
    for header, field in _REPEATED_HEADERS.items():
        given = value.get(field)
        if isinstance(given, str) and given.strip():
            top[header] = given.strip()
    return top


def _without_repeated_headers(payload: Any, top: dict[str, str]) -> Any:
    """The payload without headers the message already gives at its top."""
    if not isinstance(payload, dict) or not top:
        return payload
    headers = payload.get("headers")
    if not _is_header_list(headers):
        return payload
    kept = [
        header
        for header in headers
        if not (
            isinstance(header.get("value"), str)
            and top.get(str(header.get("name", "")).lower()) == header["value"].strip()
        )
    ]
    rest = {k: v for k, v in payload.items() if k != "headers"}
    return {"headers": kept, **rest} if kept else rest


def _tidy(
    value: Any, key: str = "", *, has_text: bool = False, forward: bool = False
) -> Any:
    if isinstance(value, dict):
        own_text = (
            isinstance(value.get("messageText"), str)
            and value["messageText"].strip() != ""
        )
        within = has_text or own_text
        subject = _subject_of(value)
        if subject is not None:
            forward = _FORWARD_SUBJECT.search(subject) is not None
        # The text is in messageText and the attachments in attachmentList:
        # the MIME skeleton and the preview copy say nothing new.
        listed = own_text and isinstance(value.get("attachmentList"), list)
        # Who, to whom and the subject, as the message gives them at its top.
        top = _top_level_headers(value)
        out: dict[str, Any] = {}
        for k, v in value.items():
            if k == "headers" and _is_header_list(v):
                out[k] = _tidy_headers(v)
            elif k == "messageText" and isinstance(v, str):
                out[k] = readable_text(v, fold_replies=not forward)
            elif k == "payload" and isinstance(v, dict) and (listed or top):
                payload = (
                    _slim_payload(v)
                    if listed
                    else _tidy(v, k, has_text=within, forward=forward)
                )
                payload = _without_repeated_headers(payload, top)
                if payload:
                    out[k] = payload
            elif k == "preview" and isinstance(v, dict) and (own_text or top):
                rest = {
                    pk: pv
                    for pk, pv in v.items()
                    if not (pk == "body" and own_text)
                    and not (pk == "subject" and pv == value.get("subject"))
                }
                if rest:
                    out[k] = _tidy(rest, k, has_text=within, forward=forward)
            elif k == "parts" and isinstance(v, list):
                out[k] = [
                    _tidy(p, k, has_text=within, forward=forward)
                    for p in _tidy_parts(v)
                ]
            elif k == "body" and isinstance(v, dict) and isinstance(v.get("data"), str):
                if within:
                    continue
                text = _part_text(value, fold_replies=not forward)
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
                out[k] = _tidy(v, k, has_text=within, forward=forward)
        return out
    if isinstance(value, list):
        return [_tidy(item, key, has_text=has_text, forward=forward) for item in value]
    if isinstance(value, str) and _looks_encoded(key, value):
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
