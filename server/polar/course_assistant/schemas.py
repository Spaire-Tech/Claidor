from datetime import datetime

from pydantic import Field

from polar.kit.schemas import Schema


class CourseAssistantAskRequest(Schema):
    question: str = Field(
        min_length=1,
        max_length=4000,
        description="The student's question for the course assistant.",
    )


class CourseAssistantStatusRead(Schema):
    """Drives the student-facing "Course TA" chat in the course player."""

    available: bool = Field(
        description="Whether the assistant is enabled for this course and the "
        "student is enrolled."
    )
    display_name: str | None = Field(
        default=None,
        description='Name shown to students. Always the neutral "Course TA".',
    )
    course_title: str | None = Field(default=None)
    disclaimer: str | None = Field(
        default=None,
        description="AI disclaimer to show under the composer.",
    )
    strictness: str | None = Field(
        default=None,
        description="'course_only' | 'course_plus_general' — informs copy only.",
    )
    starters: list[str] = Field(
        default_factory=list,
        description="Empty-state starter prompts to lower the blank-page "
        "barrier.",
    )
    suggestions: list[str] = Field(
        default_factory=list,
        description="In-composer suggestion chips shown once a chat is going.",
    )
    # Legacy v1 fields, kept so existing clients don't break.
    instructor_name: str | None = Field(default=None)
    example_question: str | None = Field(default=None)


# ── Creator-facing (Phase 3 review & approve) ─────────────────────────────── #


class CourseAssistantSample(Schema):
    """One review card: a question and the answer the assistant would give."""

    id: str
    question: str
    answer: str
    citation: str | None = None
    scope: str | None = Field(
        default=None,
        description='Off-syllabus label, e.g. "Out of scope" / "Off topic".',
    )
    approved: bool = False
    edited_answer: str | None = Field(
        default=None, description="Creator override of the answer, if any."
    )


class CourseAssistantSampleUpdate(Schema):
    """Edit / approve one review card. None ⇒ leave unchanged."""

    answer: str | None = Field(default=None, max_length=8000)
    approved: bool | None = None


class CourseAssistantManageRead(Schema):
    """Creator-facing management view (the Assistant tab)."""

    course_id: str
    # building | ready_for_review | live | failed | disabled
    status: str
    configured: bool = Field(
        description="Whether ANTHROPIC_API_KEY is set; false ⇒ feature off."
    )
    live: bool = Field(description="Currently serving students.")
    is_answerable: bool = Field(
        description="Live AND has an approved serving snapshot."
    )
    has_pending_review: bool = Field(
        description="A newer draft exists than what was last approved."
    )
    display_name: str | None = None
    disclaimer: str | None = None
    model: str | None = None
    error: str | None = None
    # The draft snapshot is what the creator reviews.
    sample_questions: list[CourseAssistantSample] | None = None
    draft_lesson_count: int | None = None
    draft_tokens: int | None = None
    draft_built_at: datetime | None = None
    approved_at: datetime | None = None
    approved_lesson_count: int | None = None


class CourseAssistantApproveRequest(Schema):
    """Approve the draft and go live. Optional identity tweaks applied first."""

    display_name: str | None = Field(default=None, max_length=200)
    disclaimer: str | None = Field(default=None, max_length=2000)


class CourseAssistantSettingsUpdate(Schema):
    """Edit identity without (re)approving. None ⇒ leave unchanged."""

    display_name: str | None = Field(default=None, max_length=200)
    disclaimer: str | None = Field(default=None, max_length=2000)


class CourseAssistantLiveUpdate(Schema):
    live: bool = Field(description="Turn the live assistant on or off.")


# ── Creator-facing (Phase 5 — "What students are asking") ─────────────────── #


class CourseAssistantQuestionItem(Schema):
    """One aggregated question cluster shown to the creator."""

    question: str = Field(description="Representative phrasing (most recent).")
    count: int = Field(description="Total times this was asked.")
    asker_count: int = Field(description="Distinct students who asked it.")
    refused_count: int = Field(
        description="Times the assistant couldn't answer (out of scope) — a "
        "content-gap signal."
    )
    last_asked_at: datetime = Field(description="When it was most recently asked.")


class CourseAssistantQuestionsRead(Schema):
    """The creator's "What students are asking" panel."""

    total_questions: int = Field(description="All questions asked, all-time.")
    asker_count: int = Field(description="Distinct students who have asked.")
    refused_count: int = Field(
        description="Questions the assistant declined (out of scope)."
    )
    items: list[CourseAssistantQuestionItem] = Field(
        description="Top question clusters, most-asked first."
    )
