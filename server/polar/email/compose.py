"""Finalise an email body into the HTML that is actually sent.

The course email editor produces a COMPLETE, self-contained HTML document —
its own ``<!doctype html>``, ``<head>`` with the responsive ``<style>``, web
fonts, dark background, and a footer carrying the unsubscribe link. Such a
document must be sent verbatim.

Wrapping it in the ``MarketingEmail`` React-Email template (as every send path
used to) injects a whole document inside a ``<div>`` via
``dangerouslySetInnerHTML``. Email clients then discard the nested ``<head>``/
``<style>`` (killing the mobile media queries, ``color-scheme`` and fonts) and
render the body inside the wrapper's narrow, white ``Container`` — which is
exactly the reported "email is too tight / white on mobile / editor changes do
nothing" failure.

Legacy fragment bodies (e.g. ``<h2>..</h2><p>..</p>`` from the simple composer)
are NOT self-contained and still get the marketing chrome.
"""

import re

from polar.email.react import render_email_template
from polar.email.schemas import MarketingEmail, MarketingEmailProps


def is_full_html_document(html: str | None) -> bool:
    """True when ``html`` is a complete document (starts with a doctype/<html>)."""
    head = (html or "").lstrip()[:256].lower()
    return head.startswith("<!doctype") or head.startswith("<html")


# ── dark-mode lock ──────────────────────────────────────────────────────────
# The editor's emails are ONE fixed design with explicit colours on every
# element; they must render identically whatever the recipient's system
# dark/light setting. Clients adapt ("darken") emails unless the document
# opts out with `color-scheme: only light`. Older saved emails declared
# `light dark` — advertising a dark scheme they never styled, which invites
# the client's own recolouring — and `content_html` is stored at SAVE time,
# so already-saved automations/broadcasts keep sending the stale head
# forever. Enforcing the lock here, at the send-time choke point every path
# funnels through, fixes previously saved emails without re-saving them.

_META_COLOR_SCHEME_RE = re.compile(
    r"(<meta[^>]*name=[\"'](?:supported-color-schemes|color-scheme)[\"']"
    r"[^>]*content=[\"'])[^\"']*([\"'][^>]*>)",
    re.IGNORECASE,
)
_CSS_SUPPORTED_SCHEMES_RE = re.compile(
    r"supported-color-schemes\s*:\s*[^;}\"']*", re.IGNORECASE
)
# Negative lookbehind so this never rewrites the tail of
# `supported-color-schemes:` declarations.
_CSS_COLOR_SCHEME_RE = re.compile(
    r"(?<![-\w])color-scheme\s*:\s*[^;}\"']*", re.IGNORECASE
)
_HEAD_OPEN_RE = re.compile(r"<head[^>]*>", re.IGNORECASE)

_LIGHT_LOCK_MARKUP = (
    '<meta name="color-scheme" content="light"/>'
    '<meta name="supported-color-schemes" content="light"/>'
    "<style>:root,html,body{color-scheme:only light}</style>"
)


def force_light_color_scheme(html: str) -> str:
    """Rewrite ``html`` so mail clients render its authored colours as-is.

    Rewrites any color-scheme meta tags and CSS declarations to light-only /
    ``only light``, and injects the lock into ``<head>`` when the document
    carries none at all. Idempotent; light-only documents pass through
    unchanged in meaning.
    """
    html = _META_COLOR_SCHEME_RE.sub(lambda m: f"{m.group(1)}light{m.group(2)}", html)
    html = _CSS_SUPPORTED_SCHEMES_RE.sub("supported-color-schemes:light", html)
    html = _CSS_COLOR_SCHEME_RE.sub("color-scheme:only light", html)
    if re.search(r"name=[\"']color-scheme[\"']", html, re.IGNORECASE) is None:
        html = _HEAD_OPEN_RE.sub(
            lambda m: m.group(0) + _LIGHT_LOCK_MARKUP, html, count=1
        )
    return html


def finalize_email_html(
    content_html: str,
    *,
    unsubscribe_url: str,
    organization_name: str,
    organization_logo_url: str | None = None,
    organization_website: str | None = None,
    preview_text: str | None = None,
) -> str:
    """Return the final send-ready HTML for ``content_html``.

    A self-contained editor email is sent with its dark-mode lock enforced
    (see ``force_light_color_scheme``) and its ``{{unsubscribe_url}}`` footer
    placeholder filled in; anything else is wrapped in the shared marketing
    template.
    """
    if is_full_html_document(content_html):
        return force_light_color_scheme(content_html).replace(
            "{{unsubscribe_url}}", unsubscribe_url
        )
    return render_email_template(
        MarketingEmail(
            props=MarketingEmailProps(
                organization_name=organization_name,
                organization_logo_url=organization_logo_url,
                organization_website=organization_website,
                html_content=content_html,
                unsubscribe_url=unsubscribe_url,
                preview_text=preview_text,
            )
        )
    )


__all__ = [
    "finalize_email_html",
    "force_light_color_scheme",
    "is_full_html_document",
]
