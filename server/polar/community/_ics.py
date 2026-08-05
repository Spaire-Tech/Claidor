"""iCalendar (RFC 5545) generation for community events.

We hand-roll a minimal VCALENDAR rather than pulling in an `icalendar`
dependency — the surface is tiny (one VEVENT per RSVP confirmation) and
the format is rigid enough that the escaping/folding rules are easier
to read inline than to wrap.

Encoding rules implemented:
  * CRLF line terminator (per spec — calendars rendered with LF only get
    silently corrupted by some parsers).
  * Escape `\\`, `;`, `,`, and newlines in TEXT properties.
  * Fold long lines at 75 octets, continuing with a leading space.
"""

from __future__ import annotations

import base64
from datetime import UTC, datetime, timedelta

from polar.email.sender import Attachment
from polar.kit.utils import utc_now


def _escape_text(value: str) -> str:
    # Order matters — escape backslashes first or we'd double-escape the
    # backslashes we add for `;` and `,`.
    out = value.replace("\\", "\\\\")
    out = out.replace(";", "\\;")
    out = out.replace(",", "\\,")
    out = out.replace("\r\n", "\\n").replace("\n", "\\n").replace("\r", "\\n")
    return out


def _fold(line: str) -> str:
    """Fold a single content line to <=75 octets per RFC 5545 §3.1.

    We measure octets (UTF-8 bytes), not characters, because the spec is
    byte-oriented. Each continuation line starts with a single space.
    """
    encoded = line.encode("utf-8")
    if len(encoded) <= 75:
        return line
    parts: list[bytes] = []
    chunk = encoded[:75]
    parts.append(chunk)
    rest = encoded[75:]
    while rest:
        parts.append(b" " + rest[:74])
        rest = rest[74:]
    return "\r\n".join(p.decode("utf-8") for p in parts)


def _fmt_utc(dt: datetime) -> str:
    # All-UTC times — DTSTART/DTEND in `YYYYMMDDTHHMMSSZ` form. The `Z`
    # suffix tells calendar clients the value is already UTC; we never
    # ship VTIMEZONE blocks since we have one canonical instant per event.
    # Naive datetimes are treated as UTC (matches how the event service
    # normalises start_at on create — see events_service.py:107-109).
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def build_event_ics(
    *,
    event_id: str,
    title: str,
    description: str | None,
    start_at: datetime,
    duration_minutes: int,
    location: str | None,
    meeting_url: str | None,
    host_name: str,
    host_email: str | None,
    attendee_email: str | None,
    cal_method: str = "PUBLISH",
) -> str:
    """Build a minimal one-event VCALENDAR string.

    `cal_method=PUBLISH` is right for "here is an event happening" — the
    receiving client treats it as informational. Use `REQUEST` only when
    the host is actively inviting the attendee (which would require us
    to keep parity between RSVPs and ATTENDEE PARTSTAT, which we don't).
    """
    end_at = start_at + timedelta(minutes=duration_minutes)
    now = utc_now()

    # The body lines, escaped + folded. Order roughly matches what most
    # calendar clients put at the top of an event card.
    lines: list[str] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Spaire//Community Event//EN",
        "CALSCALE:GREGORIAN",
        f"METHOD:{cal_method}",
        "BEGIN:VEVENT",
        f"UID:{event_id}@community.spaire.app",
        f"DTSTAMP:{_fmt_utc(now)}",
        f"DTSTART:{_fmt_utc(start_at)}",
        f"DTEND:{_fmt_utc(end_at)}",
        f"SUMMARY:{_escape_text(title)}",
    ]
    if description:
        lines.append(f"DESCRIPTION:{_escape_text(description)}")
    if location:
        lines.append(f"LOCATION:{_escape_text(location)}")
    if meeting_url:
        # URL is a URI property — RFC 5545 says it isn't TEXT-escaped, but
        # commas and semicolons in a URL would still trip naive parsers,
        # so we escape conservatively.
        lines.append(f"URL:{_escape_text(meeting_url)}")
    if host_email:
        lines.append(
            f"ORGANIZER;CN={_escape_text(host_name)}:mailto:{host_email}"
        )
    if attendee_email:
        # PARTSTAT=ACCEPTED matches the fact that the customer just RSVP'd
        # going. RSVP=FALSE tells the client not to prompt for a response.
        lines.append(
            f"ATTENDEE;CN={_escape_text(attendee_email)};"
            f"PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:{attendee_email}"
        )
    lines.extend(["END:VEVENT", "END:VCALENDAR"])

    return "\r\n".join(_fold(line) for line in lines) + "\r\n"


def to_ics_attachment(ics_text: str, *, filename: str = "event.ics") -> Attachment:
    return Attachment(
        filename=filename,
        content=base64.b64encode(ics_text.encode("utf-8")).decode("ascii"),
    )
