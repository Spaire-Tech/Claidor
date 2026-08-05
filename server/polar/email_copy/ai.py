"""AI recap copy for course-lifecycle emails (the "Welcome note" ceiling).

Generates the subject / preview / welcome-note copy for a lifecycle email from
the course itself — title, description, the lesson list, and the instructor.

Design mirrors ``polar/course_assistant/ai.py``: the prompt-building and parsing
are PURE functions (no network, no SDK import) so they can be unit-tested
without booting the app or the Anthropic SDK. The single function that calls
Claude imports ``AsyncAnthropic`` lazily.

Model + thinking follow the Anthropic guidance: ``claude-opus-4-8`` with
adaptive thinking. Output is requested as a strict JSON object and parsed
defensively (same plain-text-+-parser pattern the course assistant uses), so a
malformed model response degrades gracefully instead of raising into the
request.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any


# --------------------------------------------------------------------------- #
# The six course-lifecycle moments (mirror of the editor's triggers).
# --------------------------------------------------------------------------- #
MOMENTS: dict[str, str] = {
    "enrolment": "the learner just enrolled and is opening the course for the first time",
    "firstLesson": "the learner just finished their very first lesson",
    "specificLesson": "the learner just cleared a pivotal lesson in the course",
    "halfway": "the learner reached the halfway point — this is the retention nudge",
    "courseComplete": "the learner finished every lesson in the course",
    "inactive": "the learner has been inactive for a while — this is the win-back",
}
DEFAULT_MOMENT = "enrolment"


@dataclass
class CourseBrief:
    """A compact, model-ready summary of the course."""

    title: str
    description: str
    instructor: str
    lessons: list[str] = field(default_factory=list)


@dataclass
class EmailCopy:
    """The generated copy the editor fills in."""

    subject: str
    preview: str
    heading: str
    body: list[str] = field(default_factory=list)


# --------------------------------------------------------------------------- #
# Pure: build a brief from a course-shaped mapping.
# --------------------------------------------------------------------------- #
def build_course_brief(course: dict[str, Any]) -> CourseBrief:
    """Assemble a CourseBrief from a plain course mapping.

    Accepts either a flat ``lessons`` list or the nested ``modules[].lessons[]``
    shape, and pulls lesson titles in order.
    """
    lessons: list[str] = []
    flat = course.get("lessons")
    if isinstance(flat, list) and flat:
        for lesson in flat:
            title = (lesson or {}).get("title") if isinstance(lesson, dict) else None
            if title:
                lessons.append(str(title).strip())
    else:
        for module in course.get("modules") or []:
            for lesson in (module or {}).get("lessons") or []:
                title = (lesson or {}).get("title")
                if title:
                    lessons.append(str(title).strip())

    return CourseBrief(
        title=str(course.get("title") or "this course").strip(),
        description=str(course.get("description") or "").strip(),
        instructor=str(course.get("instructor_name") or "").strip(),
        lessons=lessons,
    )


# --------------------------------------------------------------------------- #
# Pure: prompt construction.
# --------------------------------------------------------------------------- #
SYSTEM_PROMPT = (
    "You write short, warm lifecycle emails for online courses. Your copy is "
    "concrete and specific to the course — never generic marketing filler. You "
    "ground every line in the course's own lessons and instructor. You return "
    "ONLY a single JSON object, no prose around it."
)

_JSON_SHAPE = (
    '{"subject": string (max ~60 chars), '
    '"preview": string (max ~110 chars, the inbox preview), '
    '"heading": string (the welcome-note headline), '
    '"body": array of 1-3 short paragraphs (strings)}'
)


def build_email_copy_messages(
    *, brief: CourseBrief, moment: str
) -> list[dict[str, Any]]:
    """Build the user message for one generation. Pure — no network."""
    situation = MOMENTS.get(moment, MOMENTS[DEFAULT_MOMENT])
    lesson_lines = (
        "\n".join(f"- {title}" for title in brief.lessons[:12])
        if brief.lessons
        else "(no lessons listed)"
    )
    instructor = brief.instructor or "the instructor"
    user = (
        f"Course: {brief.title}\n"
        f"Instructor: {instructor}\n"
        f"About: {brief.description or '(no description)'}\n"
        f"Lessons:\n{lesson_lines}\n\n"
        f"Moment: {situation}.\n\n"
        f"Write the email copy for this exact moment, in {instructor}'s voice, "
        f"referencing the real lessons where it helps. Reply with ONLY this JSON "
        f"object:\n{_JSON_SHAPE}"
    )
    return [{"role": "user", "content": user}]


# --------------------------------------------------------------------------- #
# Pure: parse the model's JSON reply, defensively.
# --------------------------------------------------------------------------- #
def parse_email_copy(text: str) -> EmailCopy:
    """Extract the JSON object from the model reply into an EmailCopy.

    Tolerates code fences and leading/trailing prose; never raises — a missing
    or malformed field falls back to a safe empty value so the caller can decide
    what to keep.
    """
    raw = _extract_json_object(text)
    data: dict[str, Any] = {}
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                data = parsed
        except (ValueError, TypeError):
            data = {}

    body_value = data.get("body")
    body: list[str] = []
    if isinstance(body_value, list):
        body = [str(p).strip() for p in body_value if str(p).strip()]
    elif isinstance(body_value, str) and body_value.strip():
        body = [body_value.strip()]

    return EmailCopy(
        subject=str(data.get("subject") or "").strip(),
        preview=str(data.get("preview") or "").strip(),
        heading=str(data.get("heading") or "").strip(),
        body=body,
    )


def _extract_json_object(text: str) -> str | None:
    """Return the first balanced {...} block in `text`, or None."""
    if not text:
        return None
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        return fenced.group(1)
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(text)):
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


# --------------------------------------------------------------------------- #
# The one networked function — lazy SDK import.
# --------------------------------------------------------------------------- #
async def generate_email_copy(
    *,
    api_key: str,
    model: str,
    brief: CourseBrief,
    moment: str,
    max_tokens: int = 1024,
) -> EmailCopy:
    """Generate lifecycle email copy with Claude (adaptive thinking)."""
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=api_key)
    message = await client.messages.create(
        model=model,
        max_tokens=max_tokens,
        thinking={"type": "adaptive"},
        system=SYSTEM_PROMPT,
        messages=build_email_copy_messages(brief=brief, moment=moment),
    )
    text = ""
    for block in getattr(message, "content", None) or []:
        if getattr(block, "type", None) == "text":
            text += getattr(block, "text", "")
    return parse_email_copy(text)
