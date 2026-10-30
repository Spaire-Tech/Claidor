"""The apps' Send Feedback and Report an Issue (30 October 2026): what a
person writes in either sheet is e-mailed to the founder (`CONTACT_EMAIL`,
bass@simeonlabs.com, the founder: "anything submitted under the hood let it
go to bass@simeonlabs.com"), with the person as the reply-to, so answering
the e-mail answers them. The route is `POST /desktop/api/feedback`
(`endpoints.py`), which until then only wrote a log line.

The e-mail says who sent it and from what (the app, its version, the device
and its system, the language, the time zone), the agent it was about and the
topics picked, then the words. Screenshots come as attachments, and an issue
whose sender chose to include logs and diagnostics carries them as
`diagnostics.txt`. Nothing is stored."""

from __future__ import annotations

import base64
import binascii
from datetime import UTC, datetime
from html import escape
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from simeon.email.sender import Attachment

FEEDBACK_MESSAGE_MAX_CHARS = 10_000

#: Screenshots the apps send: four at most, each JPEG or PNG and under 4 MB,
#: 10 MB together (the apps shrink theirs to well under a megabyte).
SCREENSHOT_LIMIT = 4
SCREENSHOT_MAX_BYTES = 4 * 1024 * 1024
SCREENSHOTS_MAX_BYTES = 10 * 1024 * 1024

#: The app's recent activity, attached as text when the person agreed.
DIAGNOSTICS_MAX_CHARS = 400_000

Short = Field(default=None, max_length=120)


class FeedbackAgent(BaseModel):
    """The agent a message is about, as the app names it."""

    model_config = ConfigDict(extra="ignore")
    id: str = Field(max_length=100)
    name: str = Field(max_length=100)
    title: str | None = Field(default=None, max_length=100)


class FeedbackScreenshot(BaseModel):
    model_config = ConfigDict(extra="ignore")
    filename: str = Field(max_length=120)
    #: The picture, base64.
    data: str = Field(max_length=SCREENSHOT_MAX_BYTES * 4 // 3 + 8)


class FeedbackBody(BaseModel):
    """What the Send Feedback and Report an Issue sheets post. The retired
    Electron app's sheet sent `category`, `appVersion` and `platform` (and
    `submissionId`, `conversationId`, `sentryEventIds`, still ignored); the
    iPhone and Mac apps send the rest."""

    model_config = ConfigDict(extra="ignore")
    message: str = Field(min_length=1, max_length=FEEDBACK_MESSAGE_MAX_CHARS)
    kind: Literal["feedback", "issue"] = "feedback"
    category: str | None = Field(default=None, max_length=64)
    appVersion: str | None = Field(default=None, max_length=64)
    platform: str | None = Field(default=None, max_length=64)
    device: str | None = Short
    osVersion: str | None = Field(default=None, max_length=64)
    language: str | None = Field(default=None, max_length=32)
    timeZone: str | None = Field(default=None, max_length=64)
    agent: FeedbackAgent | None = None
    topics: list[str] = Field(default_factory=list, max_length=16)
    diagnostics: str | None = Field(default=None, max_length=DIAGNOSTICS_MAX_CHARS)
    screenshots: list[FeedbackScreenshot] = Field(
        default_factory=list, max_length=SCREENSHOT_LIMIT
    )


class ScreenshotRefused(ValueError):
    """A screenshot that is not a JPEG or PNG, or is too large."""


def _picture_type(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    return None


def screenshot_attachments(shots: list[FeedbackScreenshot]) -> list[Attachment]:
    """Each screenshot as an attachment named `screenshot-1.jpg` and on, once
    it is known to be a JPEG or PNG within the limits; `ScreenshotRefused`
    otherwise."""
    attachments: list[Attachment] = []
    total = 0
    for index, shot in enumerate(shots, start=1):
        try:
            data = base64.b64decode(shot.data, validate=True)
        except (binascii.Error, ValueError) as error:
            raise ScreenshotRefused("not base64") from error
        kind = _picture_type(data)
        if kind is None:
            raise ScreenshotRefused("not a JPEG or PNG")
        if len(data) > SCREENSHOT_MAX_BYTES:
            raise ScreenshotRefused("too large")
        total += len(data)
        if total > SCREENSHOTS_MAX_BYTES:
            raise ScreenshotRefused("too large together")
        attachments.append(
            Attachment(
                filename=f"screenshot-{index}.{kind}",
                content=base64.b64encode(data).decode("ascii"),
            )
        )
    return attachments


def diagnostics_attachment(text: str) -> Attachment:
    return Attachment(
        filename="diagnostics.txt",
        content=base64.b64encode(text.encode("utf-8")).decode("ascii"),
    )


def _clean(value: str | None) -> str:
    return " ".join((value or "").split())


def feedback_email(
    body: FeedbackBody,
    *,
    email: str,
    name: str | None,
    user_id: str,
    screenshots: int,
    sent_at: datetime | None = None,
) -> tuple[str, str]:
    """The founder's e-mail about one message: its subject and its HTML, every
    word the person or the app sent escaped."""
    label = "Issue" if body.kind == "issue" else "Feedback"
    who = _clean(name) or email
    first_line = _clean(
        body.message.strip().splitlines()[0] if body.message.strip() else ""
    )
    preview = first_line if len(first_line) <= 70 else first_line[:69].rstrip() + "…"
    subject = f"{label} from {who}: {preview}"

    app = " ".join(
        part for part in (_clean(body.platform), _clean(body.appVersion)) if part
    )
    device = " · ".join(
        part for part in (_clean(body.device), _clean(body.osVersion)) if part
    )
    topics = ", ".join(_clean(topic) for topic in body.topics if _clean(topic))
    when = (sent_at or datetime.now(UTC)).strftime("%d %B %Y, %H:%M UTC")
    rows: list[tuple[str, str]] = [
        ("From", escape(who) + (f" &lt;{escape(email)}&gt;" if who != email else "")),
        ("Account", escape(user_id)),
        ("Sent", when),
        ("App", escape(app) or "Not given"),
        ("Device", escape(device) or "Not given"),
        ("Language", escape(_clean(body.language)) or "Not given"),
        ("Time zone", escape(_clean(body.timeZone)) or "Not given"),
    ]
    if body.agent is not None:
        named = " · ".join(
            part for part in (_clean(body.agent.name), _clean(body.agent.title)) if part
        )
        rows.append(("Agent", f"{escape(named)} ({escape(body.agent.id)})"))
    if topics:
        rows.append(("About", escape(topics)))
    if body.kind == "issue":
        rows.append(
            (
                "Logs",
                "Attached (diagnostics.txt)"
                if body.diagnostics and body.diagnostics.strip()
                else "Not included",
            )
        )
    if screenshots:
        rows.append(("Screenshots", f"{screenshots} attached"))
    table = "".join(
        f'<tr><td style="padding:4px 16px 4px 0;color:#6e6e73;vertical-align:top">{key}</td>'
        f'<td style="padding:4px 0">{value}</td></tr>'
        for key, value in rows
    )
    message = escape(body.message.strip()).replace("\n", "<br>")
    lead = (
        "An issue reported in the app."
        if body.kind == "issue"
        else "Feedback sent from the app."
    )
    html = (
        '<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1f">'
        f"<p>{lead} Reply to this e-mail to answer {escape(who)}.</p>"
        f'<table style="border-collapse:collapse;margin:16px 0">{table}</table>'
        f"<p>{message}</p></div>"
    )
    return subject, html
