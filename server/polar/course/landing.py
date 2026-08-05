"""Helpers for the course ``landing_overrides`` blob.

The landing editor PATCHes ``landing_overrides`` on the course. Two concerns
live here, both pure functions so they can be unit-tested without a database:

* :func:`merge_landing_overrides` — a deep merge used by the update service so
  a stale or partial client blob can't wipe sibling keys it never knew about
  (the lost-update / field-wipe hazard). ``None`` values delete a key, which is
  how the editor removes a media slot or resets a field.
* :func:`validate_landing_overrides` and :func:`validate_object_position` —
  input validation wired into the Pydantic schemas. ``landing_overrides`` is an
  open JSON blob served verbatim to anonymous landing visitors, so we bound its
  size and reject string values carrying a script-y URL scheme. The
  object-position string is interpolated into a CSS ``object-position`` rule, so
  we constrain it to real CSS tokens.
"""

import json
from typing import Any

# Serialized ceiling for the whole landing_overrides blob. Generous for real
# editorial copy + media slots, small enough that the column can't be turned
# into arbitrary storage or a payload that bloats every public landing fetch.
MAX_LANDING_OVERRIDES_BYTES = 512 * 1024

# URL schemes that have no business in landing copy/media and are the classic
# stored-XSS vector if a future render path ever drops one into an href/src.
# Matched case-insensitively against the stripped string.
_BLOCKED_URL_SCHEMES = ("javascript:", "vbscript:", "data:text/html")

# Tokens a CSS object-position value may contain. Two at most (x then y).
_OBJECT_POSITION_KEYWORDS = {"top", "bottom", "left", "right", "center"}


def merge_landing_overrides(
    existing: dict[str, Any] | None, patch: dict[str, Any]
) -> dict[str, Any]:
    """Deep-merge ``patch`` onto ``existing`` and return a new dict.

    Rules:
    * dict + dict → recurse (so patching ``ai_hero.description`` keeps the
      other ``ai_hero`` fields, and an unrelated key like ``ai_faq`` survives a
      blob that predates it);
    * a ``None`` value deletes the key (how the editor clears a media slot or
      resets a field);
    * anything else — scalars and lists — replaces wholesale (lists are ordered
      collections like ``ai_faq``/``badges`` and must replace, not merge).
    """
    result: dict[str, Any] = dict(existing) if isinstance(existing, dict) else {}
    for key, value in patch.items():
        if value is None:
            result.pop(key, None)
        elif isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = merge_landing_overrides(result[key], value)
        else:
            result[key] = value
    return result


def _iter_strings(value: Any) -> list[str]:
    """Collect every string value nested anywhere inside ``value``."""
    out: list[str] = []
    if isinstance(value, str):
        out.append(value)
    elif isinstance(value, dict):
        for v in value.values():
            out.extend(_iter_strings(v))
    elif isinstance(value, (list, tuple)):
        for v in value:
            out.extend(_iter_strings(v))
    return out


def validate_landing_overrides(value: dict[str, Any] | None) -> dict[str, Any] | None:
    """Validate a ``landing_overrides`` blob; raise ``ValueError`` if unsafe.

    Bounds the serialized size and rejects any string carrying a script-y URL
    scheme. Returns the value unchanged when it passes so it can be used as a
    Pydantic validator.
    """
    if value is None:
        return None
    try:
        serialized = json.dumps(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("landing_overrides must be JSON-serializable") from exc
    if len(serialized.encode("utf-8")) > MAX_LANDING_OVERRIDES_BYTES:
        raise ValueError(
            "landing_overrides is too large "
            f"(max {MAX_LANDING_OVERRIDES_BYTES} bytes)"
        )
    for s in _iter_strings(value):
        lowered = s.strip().lower()
        if any(lowered.startswith(scheme) for scheme in _BLOCKED_URL_SCHEMES):
            raise ValueError("landing_overrides contains a disallowed URL scheme")
    return value


def validate_object_position(value: str | None) -> str | None:
    """Validate a CSS ``object-position`` value; raise ``ValueError`` if unsafe.

    Accepts one or two tokens, each a keyword (top/bottom/left/right/center) or
    a length/percentage (e.g. ``50%`` or ``12px``). Anything else — semicolons,
    other CSS properties, ``url(...)`` — is rejected so the value can't break
    out of the inline ``object-position`` rule it is interpolated into.
    """
    if value is None:
        return None
    stripped = value.strip()
    if stripped == "":
        return None
    tokens = stripped.split()
    if not 1 <= len(tokens) <= 2:
        raise ValueError("object-position must be one or two tokens")
    for token in tokens:
        if not _is_object_position_token(token):
            raise ValueError(f"invalid object-position token: {token!r}")
    return stripped


def _is_object_position_token(token: str) -> bool:
    lowered = token.lower()
    if lowered in _OBJECT_POSITION_KEYWORDS:
        return True
    for suffix in ("%", "px"):
        if lowered.endswith(suffix):
            number = lowered[: -len(suffix)]
            try:
                float(number)
            except ValueError:
                return False
            return True
    return False
