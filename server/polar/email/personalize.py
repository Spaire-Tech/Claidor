"""Per-recipient template variable substitution for marketing email.

Both broadcasts and sequence steps may contain ``{{first_name}}`` style
placeholders in either the subject or the HTML body. We substitute them
at send time against the subscriber row plus any custom fields. Without
this, the editor's preview shows ``{{first_name}}`` rendered literally
in the sent email — which was the pre-fix behaviour for every recipient
of every broadcast (audit issue #45).

Supported tokens (case-insensitive on the variable name, surrounding
whitespace tolerated):

  {{email}}                 → subscriber.email
  {{name}} / {{full_name}}  → subscriber.name
  {{first_name}}            → first whitespace-delimited token of name
  {{last_name}}             → remainder after the first token
  {{custom.<key>}}          → custom field value, empty if unset

Unknown variables resolve to the empty string (loud rendering — the
sender doesn't ship ``{{unknown_field}}`` to recipients).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from html import escape
from typing import Any

# Anchored on ``{{`` to avoid matching inside HTML attribute braces.
# Non-greedy body so two placeholders on one line don't merge.
_TOKEN_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}")

# Neutral fallback name for preview/test sends whose recipient address yields no
# usable name (e.g. ``billing@acme.com``).
_SAMPLE_NAME = "Alex Rivera"


@dataclass(frozen=True)
class SampleSubscriber:
    """A duck-typed stand-in recipient for TEST / preview sends.

    Exposes only ``.email`` and ``.name`` — exactly what ``build_variables``
    reads — so a test send can flow through the same substitution path a real
    send uses.
    """

    email: str
    name: str


def _display_name_from_email(email: str) -> str:
    """Best-effort friendly display name from an email's local part.

    ``ada.lovelace@x.com`` → ``Ada Lovelace``; ``jsmith@x.com`` → ``Jsmith``;
    an address with no usable letters falls back to a neutral sample name.
    """
    local = (email or "").split("@", 1)[0]
    words: list[str] = []
    for part in re.split(r"[._+\-]+", local):
        letters = re.sub(r"[^A-Za-z]", "", part)
        if letters:
            words.append(letters[:1].upper() + letters[1:].lower())
    if not words:
        return _SAMPLE_NAME
    return " ".join(words[:2])


def sample_subscriber(email: str) -> SampleSubscriber:
    """Build a representative recipient for a TEST / preview send.

    Test sends have no real subscriber, but shipping the literal
    ``{{first_name}}`` token to whoever hit "Send test" reads as broken
    personalisation. Substituting against a representative recipient derived
    from the test address instead lets the author see a realistic, personalised
    email (``Hi Alex,``) exactly as a subscriber would — proving the merge tags
    work rather than exposing raw placeholders.
    """
    return SampleSubscriber(email=email, name=_display_name_from_email(email))


def _split_first_last(full_name: str | None) -> tuple[str, str]:
    if not full_name:
        return "", ""
    parts = full_name.strip().split(None, 1)
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]


def build_variables(
    *,
    subscriber: Any,
    custom_fields: dict[str, str | None] | None = None,
) -> dict[str, str]:
    """Build the substitution map for a single recipient.

    The subscriber argument is duck-typed (only ``.email`` and ``.name``
    are read) so this works with both ORM rows and lightweight test
    doubles.
    """
    name = getattr(subscriber, "name", None) or ""
    email = getattr(subscriber, "email", None) or ""
    first, last = _split_first_last(name)
    out: dict[str, str] = {
        "email": email,
        "name": name,
        "full_name": name,
        "first_name": first,
        "last_name": last,
    }
    for key, value in (custom_fields or {}).items():
        # Custom-field keys are normalised at write time but defensive
        # normalisation here keeps the substitution case-insensitive
        # for the ``{{custom.X}}`` form.
        out[f"custom.{key.strip()}"] = (value or "") if value is not None else ""
    return out


def render(text: str, variables: dict[str, str], *, html: bool) -> str:
    """Replace every ``{{var}}`` in ``text`` with ``variables[var]``.

    When ``html`` is true, replacement values are HTML-escaped — both
    broadcast HTML and step content_html flow through here, and an
    unescaped subscriber name like ``<script>`` would otherwise be an
    XSS vector inside the rendered body. Subject lines pass ``html=False``.
    """
    if not text or "{{" not in text:
        return text

    def _sub(match: re.Match[str]) -> str:
        raw_key = match.group(1)
        # Direct hit first, then case-insensitive fallback so authors
        # can write ``{{First_Name}}`` and still match.
        if raw_key in variables:
            value = variables[raw_key]
        else:
            lower = raw_key.lower()
            value = next(
                (v for k, v in variables.items() if k.lower() == lower),
                "",
            )
        return escape(value, quote=True) if html else value

    return _TOKEN_RE.sub(_sub, text)
