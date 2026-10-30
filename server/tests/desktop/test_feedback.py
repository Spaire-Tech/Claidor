"""The founder's e-mail about a piece of feedback or an issue
(`simeon.desktop.feedback`). No database."""

import base64
from datetime import UTC, datetime

import pytest

from simeon.desktop.feedback import (
    SCREENSHOT_MAX_BYTES,
    FeedbackBody,
    FeedbackScreenshot,
    ScreenshotRefused,
    feedback_email,
    screenshot_attachments,
)

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 16


def test_every_word_the_app_sends_is_escaped() -> None:
    body = FeedbackBody(
        kind="feedback",
        message="<script>alert(1)</script>\nmore",
        agent={"id": "<a>", "name": "<b>Maya</b>", "title": "Inbox"},
        topics=["<i>Chats</i>"],
        device="<iPhone>",
    )
    subject, html = feedback_email(
        body,
        email="ada@example.com",
        name="Ada <Lovelace>",
        user_id="u1",
        screenshots=0,
    )
    assert subject == "Feedback from Ada <Lovelace>: <script>alert(1)</script>"
    assert "<script>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;<br>more" in html
    assert "&lt;b&gt;Maya&lt;/b&gt; · Inbox (&lt;a&gt;)" in html
    assert "&lt;i&gt;Chats&lt;/i&gt;" in html
    assert "Ada &lt;Lovelace&gt; &lt;ada@example.com&gt;" in html
    # Feedback has no logs to speak of.
    assert "Logs" not in html


def test_an_issue_says_whether_logs_came_and_a_long_first_line_is_cut() -> None:
    line = "The computer never opens and the screen stays grey even after a restart of the app"
    body = FeedbackBody(kind="issue", message=line)
    subject, html = feedback_email(
        body,
        email="ada@example.com",
        name=None,
        user_id="u1",
        screenshots=2,
        sent_at=datetime(2026, 10, 30, 12, 5, tzinfo=UTC),
    )
    assert subject.startswith("Issue from ada@example.com: The computer never opens")
    assert subject.endswith("…")
    assert len(subject.split(": ", 1)[1]) == 70
    assert "Not included" in html
    assert "2 attached" in html
    assert "30 October 2026, 12:05 UTC" in html


def test_screenshots_are_named_by_their_kind_and_checked() -> None:
    shots = [
        FeedbackScreenshot(filename="IMG.HEIC", data=base64.b64encode(JPEG).decode())
    ]
    assert [one["filename"] for one in screenshot_attachments(shots)] == [
        "screenshot-1.jpg"
    ]

    for data in (
        b"GIF89a",
        b"%PDF-1.7",
        b"\xff\xd8\xff" + b"\x00" * SCREENSHOT_MAX_BYTES,
    ):
        with pytest.raises(ScreenshotRefused):
            screenshot_attachments(
                [
                    FeedbackScreenshot.model_construct(
                        filename="x", data=base64.b64encode(data).decode()
                    )
                ]
            )
    with pytest.raises(ScreenshotRefused):
        screenshot_attachments([FeedbackScreenshot(filename="x", data="not base64!")])
