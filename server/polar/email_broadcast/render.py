"""Render block-based broadcast content to email-safe HTML.

The frontend block editor produces a JSON document of the form:

    {
      "version": 1,
      "blocks": [
        {"id": "...", "type": "heading", "level": 1, "text": "..."},
        {"id": "...", "type": "paragraph", "text": "..."},
        {"id": "...", "type": "image", "src": "...", "alt": "...", "href": "..."},
        {"id": "...", "type": "button", "text": "...", "url": "..."},
        {"id": "...", "type": "divider"},
        {"id": "...", "type": "video", "thumbnail": "...", "url": "..."}
      ]
    }

This module produces the HTML the worker sends. We render the same shape
client-side for the live preview, but the server is the source of truth —
whenever a broadcast is saved with `content_json`, we regenerate
`content_html` so the eventual send always matches the stored JSON.
"""

from __future__ import annotations

import html
from typing import Any

_HEADING_STYLES = {
    1: "font-size:28px;font-weight:600;letter-spacing:-0.02em;line-height:1.2;color:#1d1d1f;margin:0 0 16px",
    2: "font-size:22px;font-weight:600;letter-spacing:-0.015em;line-height:1.25;color:#1d1d1f;margin:0 0 14px",
    3: "font-size:17px;font-weight:600;letter-spacing:-0.01em;line-height:1.3;color:#1d1d1f;margin:0 0 12px",
}

_PARAGRAPH_STYLE = (
    "font-size:14px;line-height:1.65;color:#424245;margin:0 0 16px"
)
_BUTTON_WRAPPER_STYLE = "margin:24px 0"
_BUTTON_STYLE = (
    "display:inline-block;background:#1d1d1f;color:#ffffff;"
    "padding:10px 20px;border-radius:8px;font-size:13px;"
    "font-weight:500;text-decoration:none"
)
_IMAGE_STYLE = "max-width:100%;height:auto;display:block;border-radius:8px"
_DIVIDER_STYLE = "border:none;border-top:1px solid #e8e8ed;margin:28px 0"
_VIDEO_THUMB_STYLE = (
    "max-width:100%;height:auto;display:block;border-radius:10px;"
    "border:1px solid #e8e8ed"
)


def _esc(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def _attr(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def _safe_url(url: Any) -> str | None:
    """Allow http(s) and mailto only — drop anything that smells like javascript:."""
    if not url:
        return None
    s = str(url).strip()
    lower = s.lower()
    if lower.startswith(("http://", "https://", "mailto:")):
        return s
    return None


def _paragraph_text(text: str) -> str:
    """Escape paragraph text and convert single newlines to <br>."""
    parts = [_esc(line) for line in (text or "").split("\n")]
    return "<br>".join(parts)


def _render_heading(block: dict[str, Any]) -> str:
    level = block.get("level") or 1
    if level not in (1, 2, 3):
        level = 1
    if block.get("huge"):
        # The TS renderer swaps to a 32px hero variant when `huge` is set;
        # the email needs to match the on-screen preview the author saw.
        style = (
            "font-size:32px;font-weight:600;letter-spacing:-0.02em;"
            "line-height:1.15;color:#1d1d1f;margin:8px 0 16px"
        )
    else:
        style = _HEADING_STYLES[level]
    text = _esc(block.get("text") or "")
    return f'<h{level} style="{style}">{text}</h{level}>'


def _render_paragraph(block: dict[str, Any]) -> str:
    text = _paragraph_text(block.get("text") or "")
    return f'<p style="{_PARAGRAPH_STYLE}">{text}</p>'


def _render_image(block: dict[str, Any]) -> str:
    src = _safe_url(block.get("src"))
    if not src:
        return ""
    alt = _attr(block.get("alt") or "")
    img = f'<img src="{_attr(src)}" alt="{alt}" style="{_IMAGE_STYLE}">'
    href = _safe_url(block.get("href"))
    inner = f'<a href="{_attr(href)}" target="_blank" rel="noreferrer">{img}</a>' if href else img
    return f'<div style="margin:20px 0">{inner}</div>'


def _render_button(block: dict[str, Any]) -> str:
    url = _safe_url(block.get("url"))
    text = _esc(block.get("text") or "Learn more")
    if not url:
        # Render the text but skip the link if the URL is missing/invalid.
        return f'<div style="{_BUTTON_WRAPPER_STYLE}"><span style="{_BUTTON_STYLE}">{text}</span></div>'
    return (
        f'<div style="{_BUTTON_WRAPPER_STYLE}">'
        f'<a href="{_attr(url)}" target="_blank" rel="noreferrer" '
        f'style="{_BUTTON_STYLE}">{text}</a>'
        f"</div>"
    )


def _render_divider(_block: dict[str, Any]) -> str:
    return f'<hr style="{_DIVIDER_STYLE}">'


def _render_video(block: dict[str, Any]) -> str:
    # Prefer the embed link; fall back to a direct file URL. Thumbnail
    # defaults to the same URL when none is given.
    target = _safe_url(block.get("embed_url")) or _safe_url(block.get("src"))
    if not target:
        return ""
    thumb = _safe_url(block.get("thumbnail")) or target
    return (
        f'<div style="margin:24px 0">'
        f'<a href="{_attr(target)}" target="_blank" rel="noreferrer">'
        f'<img src="{_attr(thumb)}" alt="Watch video" style="{_VIDEO_THUMB_STYLE}">'
        f"</a>"
        f"</div>"
    )


def _render_eyebrow(block: dict[str, Any], accent: str) -> str:
    text = _esc(block.get("text") or "")
    return (
        f'<div style="font-size:11px;letter-spacing:0.18em;'
        f'text-transform:uppercase;color:{accent};font-weight:600;'
        f'margin:0 0 8px">{text}</div>'
    )


def _render_subheading(block: dict[str, Any]) -> str:
    text = _esc(block.get("text") or "")
    return (
        f'<h3 style="font-size:17px;font-weight:600;letter-spacing:-0.01em;'
        f'line-height:1.3;color:#1d1d1f;margin:20px 0 8px">{text}</h3>'
    )


def _render_badge(block: dict[str, Any]) -> str:
    text = _esc(block.get("text") or "")
    return (
        f'<span style="display:inline-block;font-size:12px;'
        f'padding:5px 11px;background:#1d1d1f;color:#ffffff;'
        f'border-radius:999px;font-weight:500;margin:0 0 14px">{text}</span>'
    )


def _render_list(block: dict[str, Any]) -> str:
    tag = "ol" if block.get("ordered") else "ul"
    items = block.get("items") or []
    if not isinstance(items, list):
        return ""

    def _item_text(it: Any) -> str:
        # Tolerate the legacy `string[]` shape and the canonical
        # `{id, text}` object shape — both still round-trip through saved
        # drafts on disk pre-migration.
        if isinstance(it, str):
            return it
        if isinstance(it, dict):
            text = it.get("text")
            return text if isinstance(text, str) else ""
        return ""

    cells = "".join(
        f'<li style="margin-bottom:4px">{_esc(_item_text(it))}</li>'
        for it in items
    )
    return (
        f'<{tag} style="margin:0 0 14px;padding-left:20px;color:#3a3a3c;'
        f'font-size:14px;line-height:1.7">{cells}</{tag}>'
    )


def _render_quote(block: dict[str, Any], accent: str) -> str:
    text = _esc(block.get("text") or "")
    cite_raw = block.get("cite")
    cite = (
        f'<div style="font-size:11.5px;color:#86868b;margin-top:8px">'
        f"— {_esc(cite_raw)}</div>"
        if cite_raw
        else ""
    )
    return (
        f'<div style="margin:20px 0;padding:18px 22px;background:#fafafa;'
        f'border-left:3px solid {accent};border-radius:0 8px 8px 0">'
        f'<div style="font-size:15px;color:#1d1d1f;line-height:1.55;'
        f'font-style:italic;letter-spacing:-0.01em">"{text}"</div>'
        f"{cite}</div>"
    )


def _render_columns(block: dict[str, Any]) -> str:
    cols = block.get("cols") or []
    if not isinstance(cols, list) or not cols:
        return ""
    cells: list[str] = []
    for c in cols:
        if not isinstance(c, dict):
            continue
        parts: list[str] = []
        if c.get("label"):
            parts.append(
                f'<div style="font-size:10.5px;color:#86868b;'
                f'text-transform:uppercase;letter-spacing:0.06em;'
                f'font-weight:500;margin-bottom:4px">'
                f'{_esc(c["label"])}</div>'
            )
        if c.get("title"):
            parts.append(
                f'<div style="font-size:13px;font-weight:600;color:#1d1d1f;'
                f'margin-bottom:4px;letter-spacing:-0.005em">'
                f'{_esc(c["title"])}</div>'
            )
        if c.get("value"):
            parts.append(
                f'<div style="font-size:13px;font-weight:500;color:#1d1d1f">'
                f'{_esc(c["value"])}</div>'
            )
        if c.get("body"):
            parts.append(
                f'<div style="font-size:11.5px;line-height:1.5;'
                f'color:#6e6e73">{_esc(c["body"])}</div>'
            )
        cells.append(
            f'<td style="background:#fafafa;padding:14px;border-radius:8px;'
            f'border:1px solid #efefef;vertical-align:top;width:33%">'
            f'{"".join(parts)}</td>'
        )
    return (
        '<table role="presentation" cellspacing="0" cellpadding="0" '
        'border="0" style="width:100%;margin:18px 0"><tr>'
        + '<td width="12"></td>'.join(cells)
        + "</tr></table>"
    )


def _render_checklist(block: dict[str, Any], accent: str) -> str:
    items = block.get("items") or []
    if not isinstance(items, list):
        return ""
    rows: list[str] = []
    for i, it in enumerate(items):
        if not isinstance(it, dict):
            continue
        title = _esc(it.get("title") or "")
        body_raw = it.get("body")
        body = (
            f'<div style="font-size:12px;color:#6e6e73;line-height:1.5">'
            f"{_esc(body_raw)}</div>"
            if body_raw
            else ""
        )
        rows.append(
            f"<tr>"
            f'<td valign="top" style="width:34px">'
            f'<div style="width:22px;height:22px;border-radius:50%;'
            f"background:{accent};color:#fff;display:inline-block;"
            f'text-align:center;line-height:22px;font-size:11px;'
            f'font-weight:600">{i + 1}</div></td>'
            f'<td style="padding-left:12px">'
            f'<div style="font-size:13.5px;font-weight:600;color:#1d1d1f;'
            f'margin-bottom:2px">{title}</div>{body}</td></tr>'
        )
    return (
        '<table role="presentation" cellspacing="0" cellpadding="0" '
        'border="0" style="margin:16px 0;background:#fafafa;'
        'border:1px solid #efefef;border-radius:8px;padding:14px;'
        'width:100%">'
        + '<tr><td colspan="2" height="10"></td></tr>'.join(rows)
        + "</table>"
    )


def _render_event_card(block: dict[str, Any], accent: str) -> str:
    return (
        f'<table role="presentation" cellspacing="0" cellpadding="0" '
        f'border="0" style="margin:8px 0 18px;width:100%;background:{accent};'
        f'color:#fff;border-radius:10px"><tr><td style="padding:20px">'
        f'<table role="presentation" cellspacing="0" cellpadding="0" '
        f'border="0"><tr><td valign="top" style="width:80px;'
        f'padding-right:18px"><div style="background:rgba(255,255,255,0.15);'
        f'border-radius:8px;padding:10px;text-align:center">'
        f'<div style="font-size:10px;letter-spacing:0.1em;opacity:0.8">'
        f'{_esc(block.get("day"))}</div>'
        f'<div style="font-size:18px;font-weight:700;'
        f'letter-spacing:-0.02em;margin-top:2px">'
        f'{_esc(block.get("date"))}</div></div></td><td>'
        f'<div style="font-size:11px;opacity:0.7;text-transform:uppercase;'
        f'letter-spacing:0.1em;margin-bottom:6px">You\'re invited</div>'
        f'<div style="font-size:17px;font-weight:600;letter-spacing:-0.01em;'
        f'margin-bottom:6px;line-height:1.25">{_esc(block.get("title"))}</div>'
        f'<div style="font-size:12px;opacity:0.85">'
        f'{_esc(block.get("meta"))}</div></td></tr></table>'
        f"</td></tr></table>"
    )


def _render_receipt(block: dict[str, Any]) -> str:
    items = block.get("items") or []
    if not isinstance(items, list):
        return ""
    rows: list[str] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        sub = (
            f'<div style="font-size:11.5px;color:#86868b;margin-top:2px">'
            f'{_esc(it.get("sub"))}</div>'
            if it.get("sub")
            else ""
        )
        rows.append(
            f'<tr><td style="padding:10px 0;border-bottom:1px solid #efefef">'
            f'<div style="font-size:13.5px;font-weight:500;color:#1d1d1f">'
            f'{_esc(it.get("name"))}</div>{sub}</td>'
            f'<td align="right" style="padding:10px 0;'
            f'border-bottom:1px solid #efefef;font-size:13.5px;'
            f'font-weight:600;font-family:monospace">'
            f'{_esc(it.get("price"))}</td></tr>'
        )
    total = _esc(block.get("total") or "")
    return (
        '<table role="presentation" cellspacing="0" cellpadding="0" '
        'border="0" style="margin:16px 0;background:#fafafa;'
        'border:1px solid #efefef;border-radius:10px;padding:20px;'
        'width:100%">'
        + "".join(rows)
        + f'<tr><td style="padding-top:12px;border-top:2px solid #1d1d1f;'
        f'font-size:13px;font-weight:600">Total</td>'
        f'<td align="right" style="padding-top:12px;'
        f'border-top:2px solid #1d1d1f;font-size:15px;font-weight:700;'
        f'font-family:monospace">{total}</td></tr></table>'
    )


def _render_digest_item(block: dict[str, Any], accent: str) -> str:
    return (
        f'<table role="presentation" cellspacing="0" cellpadding="0" '
        f'border="0" style="margin:14px 0;width:100%"><tr>'
        f'<td valign="top" style="width:48px;font-size:20px;font-weight:700;'
        f'color:{accent};font-family:monospace;line-height:1">'
        f'{_esc(block.get("num"))}</td>'
        f'<td style="padding-left:14px">'
        f'<div style="font-size:15px;font-weight:600;color:#1d1d1f;'
        f'letter-spacing:-0.01em;margin-bottom:3px;line-height:1.3">'
        f'{_esc(block.get("title"))}</div>'
        f'<div style="font-size:11px;color:#86868b;text-transform:uppercase;'
        f'letter-spacing:0.05em;margin-bottom:5px">'
        f'{_esc(block.get("meta"))}</div>'
        f'<div style="font-size:13px;color:#3a3a3c;line-height:1.55">'
        f'{_esc(block.get("body"))}</div></td></tr></table>'
    )


def _safe_color(color: Any) -> str:
    if not isinstance(color, str):
        return "#1d1d1f"
    s = color.strip()
    import re as _re

    if _re.fullmatch(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})", s):
        return s
    return "#1d1d1f"


def _render_button_with_accent(block: dict[str, Any], accent: str) -> str:
    url = _safe_url(block.get("url"))
    text = _esc(block.get("text") or "Learn more")
    size = block.get("size")
    padding = (
        "13px 28px"
        if size == "lg"
        else "8px 16px"
        if size == "sm"
        else "10px 20px"
    )
    font_size = "14px" if size == "lg" else "13px"
    style = (
        f"display:inline-block;background:{accent};color:#ffffff;"
        f"padding:{padding};border-radius:8px;font-size:{font_size};"
        f"font-weight:500;text-decoration:none"
    )
    if not url:
        return (
            f'<div style="{_BUTTON_WRAPPER_STYLE}">'
            f'<span style="{style}">{text}</span></div>'
        )
    return (
        f'<div style="{_BUTTON_WRAPPER_STYLE}">'
        f'<a href="{_attr(url)}" target="_blank" rel="noreferrer" '
        f'style="{style}">{text}</a></div>'
    )


def render_blocks_to_html(content_json: dict[str, Any] | None) -> str:
    """Render the block document to a string of email-safe HTML.

    Returns an empty string if there's nothing to render — callers can choose
    to fall back to a stored `content_html` (or a placeholder) in that case.
    """
    if not content_json:
        return ""
    blocks = content_json.get("blocks") or []
    if not isinstance(blocks, list):
        return ""

    accent = _safe_color(content_json.get("accent"))

    rendered: list[str] = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        block_type = block.get("type")
        chunk: str = ""
        if block_type == "heading":
            chunk = _render_heading(block)
        elif block_type == "paragraph":
            chunk = _render_paragraph(block)
        elif block_type == "image":
            chunk = _render_image(block)
        elif block_type == "button":
            chunk = _render_button_with_accent(block, accent)
        elif block_type == "divider":
            chunk = _render_divider(block)
        elif block_type == "video":
            chunk = _render_video(block)
        elif block_type == "eyebrow":
            chunk = _render_eyebrow(block, accent)
        elif block_type == "subheading":
            chunk = _render_subheading(block)
        elif block_type == "badge":
            chunk = _render_badge(block)
        elif block_type == "list":
            chunk = _render_list(block)
        elif block_type == "quote":
            chunk = _render_quote(block, accent)
        elif block_type == "columns":
            chunk = _render_columns(block)
        elif block_type == "checklist":
            chunk = _render_checklist(block, accent)
        elif block_type == "event-card":
            chunk = _render_event_card(block, accent)
        elif block_type == "receipt":
            chunk = _render_receipt(block)
        elif block_type == "digest-item":
            chunk = _render_digest_item(block, accent)
        if chunk:
            rendered.append(chunk)
    return "\n".join(rendered)
