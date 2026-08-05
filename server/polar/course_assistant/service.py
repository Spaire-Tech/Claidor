"""Course Assistant service — ingestion (Phase 1) + answering (Phase 2).

Phase 1: turn a course's lessons + transcripts into a draft assistant
(knowledge base + voice card + sample questions) and leave it
``ready_for_review``. Nothing is served to students until approved.

Phase 2: serve grounded, voice-matched, guardrailed answers to enrolled
students — but only when the assistant is ``live``.

The whole feature is gated on ``ANTHROPIC_API_KEY``: when it's unset,
ingestion is a no-op and the answer surface reports "not configured".
"""

from __future__ import annotations

import logging
import re
import unicodedata
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any
from uuid import UUID

from polar.config import settings
from polar.course.repository import (
    CourseEnrollmentRepository,
    CourseLessonRepository,
    CourseRepository,
)
from polar.kit.utils import utc_now
from polar.models.course import Course
from polar.models.course_assistant import CourseAssistant
from polar.models.course_lesson import CourseLesson
from polar.postgres import AsyncSession

from . import ai

if TYPE_CHECKING:
    from .repository import QuestionGroup, QuestionTotals

log = logging.getLogger(__name__)

# Lesson states that mean "this video will never produce a transcript", so the
# assistant build should stop waiting on it.
_TERMINAL_MUX_STATES = frozenset({"errored", "deleted", "quota_exceeded"})
_RESOLVED_TRANSCRIPT_STATES = frozenset({"ready", "failed", "unavailable"})

# Cap the transcript text fed to the voice-card extractor (the voice is in the
# style, not the volume — and it keeps that one call cheap).
_VOICE_SAMPLE_CHAR_CAP = 12_000


class CourseAssistantError(Exception):
    """Base error for the course assistant surface."""


class NotConfigured(CourseAssistantError):
    """ANTHROPIC_API_KEY is not set; the feature is disabled."""


class AssistantNotAvailable(CourseAssistantError):
    """No live assistant exists for this course."""


class TranscriptNotReady(CourseAssistantError):
    """The lesson has no ready transcript to write AI lesson copy from."""


class DraftGenerationFailed(CourseAssistantError):
    """The model produced nothing usable for the lesson draft."""


class NotEnrolled(CourseAssistantError):
    """The customer is not enrolled in the course."""


@dataclass(frozen=True)
class AnswerSnapshot:
    """Everything needed to answer, captured from the DB up front so the
    streamed response doesn't touch the session after it's closed."""

    course_id: UUID
    organization_id: UUID
    course_title: str
    instructor_name: str | None
    display_name: str
    voice_card: str | None
    disclaimer: str | None
    knowledge_base: str
    model: str
    scope: str
    # v2: "course_only" | "course_plus_general". Defaults to the latter so v1
    # constructors (which don't set it) remain valid.
    strictness: str = "course_plus_general"
    # v2: per-lesson char ranges in the knowledge base, for mapping document
    # citations back to clickable lessons. Empty for v1 snapshots.
    citation_refs: tuple[ai.LessonCitationRef, ...] = ()
    # v2: lesson_id -> timestamped caption cues, for mapping a citation to the
    # second in the video it came from. Empty for v1 / lessons without captions.
    lesson_cues: dict[str, list[dict[str, Any]]] = field(default_factory=dict)


def is_configured() -> bool:
    return bool(settings.ANTHROPIC_API_KEY)


# Outcomes recorded for a logged student question.
QUESTION_OUTCOMES = frozenset({"answered", "refused", "error"})

# Grouping key length must match course_assistant_questions.question_normalized.
_NORMALIZED_MAX = 500
_PUNCT_EDGE = re.compile(r"^[^\w]+|[^\w]+$")
_WHITESPACE = re.compile(r"\s+")


def normalize_question(question: str) -> str:
    """Collapse a question to a grouping key so trivially-different phrasings
    cluster together: NFKC-folded, lowercased, whitespace-collapsed, with
    surrounding punctuation stripped. NOT semantic — see Phase 5 notes."""
    folded = unicodedata.normalize("NFKC", question).casefold()
    collapsed = _WHITESPACE.sub(" ", folded).strip()
    stripped = _PUNCT_EDGE.sub("", collapsed)
    # Fall back to the collapsed form if the question was all punctuation.
    key = stripped or collapsed
    return key[:_NORMALIZED_MAX]


class CourseAssistantService:
    # ----------------------------------------------------------------- #
    # Ingestion / build (Phase 1)
    # ----------------------------------------------------------------- #

    async def ensure_assistant(
        self, session: AsyncSession, course: Course
    ) -> CourseAssistant:
        from .repository import CourseAssistantRepository

        repo = CourseAssistantRepository.from_session(session)
        existing = await repo.get_by_course(course.id)
        if existing is not None:
            return existing
        return await repo.create(
            CourseAssistant(
                course_id=course.id,
                organization_id=course.organization_id,
                status="building",
            ),
            flush=True,
        )

    async def store_transcript(
        self, session: AsyncSession, *, lesson_id: UUID, vtt: str
    ) -> UUID | None:
        """Parse a caption VTT and store it on the lesson. Returns the lesson's
        course id so the caller can re-check whether the course is now
        ingestable. ``status='failed'`` if the VTT parses to nothing."""
        lesson_repo = CourseLessonRepository.from_session(session)
        lesson = await lesson_repo.get_by_id(lesson_id)
        if lesson is None:
            return None
        cues = ai.parse_vtt_cues(vtt)
        text = ai.parse_vtt(vtt)
        await lesson_repo.update(
            lesson,
            update_dict={
                "transcript": text or None,
                "transcript_cues": cues or None,
                "transcript_status": "ready" if text else "failed",
            },
        )
        await self._resolve_autofill_after_transcript(
            session, lesson, stored=bool(text)
        )
        return await lesson_repo.get_course_id_for_lesson(lesson_id)

    async def fetch_and_store_transcript(
        self, session: AsyncSession, *, lesson_id: UUID
    ) -> bool:
        """Fetch the lesson's Mux caption text and store it — inline, wherever
        called. The fetch is a plain HTTP GET, so this works on the API request
        path and does NOT require a healthy background worker (which is the link
        that was silently failing). Returns True if a transcript was stored."""
        from polar.course import mux as mux_client

        lesson_repo = CourseLessonRepository.from_session(session)
        lesson = await lesson_repo.get_by_id(lesson_id)
        if lesson is None:
            return False
        if not lesson.mux_asset_id or not lesson.mux_playback_id:
            await lesson_repo.update(
                lesson, update_dict={"transcript_status": "unavailable"}
            )
            await self._resolve_autofill_after_transcript(
                session, lesson, stored=False
            )
            return False
        vtt = await mux_client.get_caption_vtt(
            lesson.mux_asset_id, lesson.mux_playback_id
        )
        if vtt is None:
            # Caption track not ready/fetchable yet — leave status as-is.
            return False
        cues = ai.parse_vtt_cues(vtt)
        text = ai.parse_vtt(vtt)
        await lesson_repo.update(
            lesson,
            update_dict={
                "transcript": text or None,
                "transcript_cues": cues or None,
                "transcript_status": "ready" if text else "failed",
            },
        )
        await self._resolve_autofill_after_transcript(
            session, lesson, stored=bool(text)
        )
        return bool(text)

    async def mark_transcript_status(
        self, session: AsyncSession, *, lesson_id: UUID, status: str
    ) -> UUID | None:
        lesson_repo = CourseLessonRepository.from_session(session)
        lesson = await lesson_repo.get_by_id(lesson_id)
        if lesson is None:
            return None
        await lesson_repo.update(lesson, update_dict={"transcript_status": status})
        if status in ("failed", "unavailable"):
            # No transcript will ever come — the AI lesson draft can't run.
            await self._resolve_autofill_after_transcript(
                session, lesson, stored=False
            )
        return await lesson_repo.get_course_id_for_lesson(lesson_id)

    # ----------------------------------------------------------------- #
    # AI lesson draft (autofill + per-section rewrite)
    # ----------------------------------------------------------------- #

    async def _resolve_autofill_after_transcript(
        self, session: AsyncSession, lesson: CourseLesson, *, stored: bool
    ) -> None:
        """The transcript pipeline just resolved for this lesson: kick the AI
        lesson draft if a transcript landed, or fail the autofill if one never
        will. No-op unless the lesson is actually waiting on it."""
        if lesson.ai_autofill_status != "pending":
            return
        if stored:
            from polar.worker import enqueue_job

            enqueue_job("course_assistant.autofill_lesson", lesson_id=lesson.id)
        else:
            lesson_repo = CourseLessonRepository.from_session(session)
            await lesson_repo.update(
                lesson, update_dict={"ai_autofill_status": "failed"}
            )

    async def _course_for_lesson(
        self, session: AsyncSession, lesson_id: UUID
    ) -> Course | None:
        lesson_repo = CourseLessonRepository.from_session(session)
        course_id = await lesson_repo.get_course_id_for_lesson(lesson_id)
        if course_id is None:
            return None
        return await CourseRepository.from_session(session).get_by_id(course_id)

    async def _generate_lesson_draft(
        self, session: AsyncSession, lesson: CourseLesson
    ) -> ai.LessonDraft | None:
        course = await self._course_for_lesson(session, lesson.id)
        return await ai.generate_lesson_draft(
            api_key=settings.ANTHROPIC_API_KEY,
            model=settings.COURSE_ASSISTANT_BUILD_MODEL,
            transcript=lesson.transcript or "",
            course_title=(course.title if course else None) or "this course",
            lesson_title=lesson.title,
            instructor_name=course.instructor_name if course else None,
        )

    async def autofill_lesson(
        self, session: AsyncSession, *, lesson_id: UUID
    ) -> None:
        """Write the AI lesson draft into the lesson's EMPTY fields only —
        description, overview note, and takeaways. Never touches anything the
        creator already wrote (including the title — they named the lesson).
        Terminal either way: 'done' or 'failed', so the editor's banner always
        resolves."""
        lesson_repo = CourseLessonRepository.from_session(session)
        lesson = await lesson_repo.get_by_id(lesson_id)
        if lesson is None or lesson.ai_autofill_status != "pending":
            return
        if not is_configured() or not (lesson.transcript or "").strip():
            await lesson_repo.update(
                lesson, update_dict={"ai_autofill_status": "failed"}
            )
            return

        try:
            draft = await self._generate_lesson_draft(session, lesson)
        except Exception:
            log.exception(
                "course_assistant.autofill_failed",
                extra={"lesson_id": str(lesson_id)},
            )
            draft = None
        if draft is None:
            await lesson_repo.update(
                lesson, update_dict={"ai_autofill_status": "failed"}
            )
            return

        update: dict[str, Any] = {"ai_autofill_status": "done"}
        if draft.description and not (lesson.description or "").strip():
            update["description"] = draft.description
        content = dict(lesson.content or {})
        content_changed = False
        if draft.overview and not str(content.get("overview") or "").strip():
            content["overview"] = draft.overview
            content_changed = True
        existing_takeaways = content.get("takeaways")
        has_takeaways = isinstance(existing_takeaways, list) and any(
            str(item or "").strip() for item in existing_takeaways
        )
        if draft.takeaways and not has_takeaways:
            content["takeaways"] = draft.takeaways
            content_changed = True
        if content_changed:
            update["content"] = content
        await lesson_repo.update(lesson, update_dict=update)
        log.info(
            "course_assistant.autofill_done",
            extra={
                "lesson_id": str(lesson_id),
                "filled": [k for k in update if k != "ai_autofill_status"],
            },
        )

    async def rewrite_lesson_section(
        self,
        session: AsyncSession,
        lesson: CourseLesson,
        *,
        section: str,
    ) -> CourseLesson:
        """Deliberately rewrite one editor section from the transcript.

        'details' → title + description; 'overview' → overview note +
        takeaways. Unlike autofill this OVERWRITES — the creator explicitly
        clicked "Rewrite with AI" on that section."""
        if not is_configured():
            raise NotConfigured()
        if lesson.transcript_status != "ready" or not (
            lesson.transcript or ""
        ).strip():
            raise TranscriptNotReady()

        draft = await self._generate_lesson_draft(session, lesson)
        if draft is None:
            raise DraftGenerationFailed()

        lesson_repo = CourseLessonRepository.from_session(session)
        update: dict[str, Any] = {}
        if section == "details":
            if draft.title:
                update["title"] = draft.title
            if draft.description:
                update["description"] = draft.description
        else:  # overview
            content = dict(lesson.content or {})
            if draft.overview:
                content["overview"] = draft.overview
            if draft.takeaways:
                content["takeaways"] = draft.takeaways
            update["content"] = content
        if not update:
            raise DraftGenerationFailed()
        return await lesson_repo.update(lesson, update_dict=update)

    async def _buildable_lessons(
        self, session: AsyncSession, course_id: UUID
    ) -> list[CourseLesson]:
        """Every lesson the assistant should learn from.

        Includes drafts — the creator expects the assistant to train on what
        they've uploaded while still building the course. Exposure is still
        gated downstream: a build only produces a *draft* snapshot, and nothing
        reaches students until the creator approves and the assistant is live.
        """
        lesson_repo = CourseLessonRepository.from_session(session)
        statement = lesson_repo.get_by_course_statement(course_id)
        return list(await lesson_repo.get_all(statement))

    def _lesson_blocks_build(self, lesson: CourseLesson) -> bool:
        """True if this lesson is still processing and the build must wait."""
        if lesson.content_type != "video":
            return False
        if lesson.transcript_status in _RESOLVED_TRANSCRIPT_STATES:
            return False
        if lesson.mux_status in _TERMINAL_MUX_STATES or lesson.mux_status is None:
            # No (working) video to transcribe — nothing to wait for.
            return False
        # waiting / processing / ready-but-captions-not-fetched-yet → wait.
        return True

    def is_ingestable(self, lessons: list[CourseLesson]) -> bool:
        return not any(self._lesson_blocks_build(lesson) for lesson in lessons)

    def _collect_sources(self, lessons: list[CourseLesson]) -> list[ai.LessonSource]:
        sources: list[ai.LessonSource] = []
        for lesson in lessons:
            transcript = lesson.transcript if lesson.content_type == "video" else None
            sources.append(
                ai.build_lesson_source(
                    lesson_id=str(lesson.id),
                    title=lesson.title,
                    content_type=lesson.content_type,
                    content=lesson.content,
                    transcript=transcript,
                )
            )
        return sources

    async def maybe_build(
        self, session: AsyncSession, course_id: UUID
    ) -> CourseAssistant | None:
        """Build the assistant for a course iff it's configured, has content,
        and every lesson has finished processing. Safe to call repeatedly."""
        if not is_configured():
            log.info(
                "course_assistant.skip_not_configured",
                extra={"course_id": str(course_id)},
            )
            return None

        course_repo = CourseRepository.from_session(session)
        course = await course_repo.get_by_id(course_id)
        if course is None:
            return None

        lessons = await self._buildable_lessons(session, course_id)
        if not lessons:
            return None
        if not self.is_ingestable(lessons):
            log.info(
                "course_assistant.waiting_on_processing",
                extra={"course_id": str(course_id)},
            )
            return None

        assistant = await self.ensure_assistant(session, course)
        return await self._build(session, assistant, course, lessons)

    async def _build(
        self,
        session: AsyncSession,
        assistant: CourseAssistant,
        course: Course,
        lessons: list[CourseLesson],
    ) -> CourseAssistant:
        from .repository import CourseAssistantRepository

        repo = CourseAssistantRepository.from_session(session)
        sources = self._collect_sources(lessons)
        knowledge_base = ai.assemble_knowledge_base(sources)

        if not any(source.text for source in sources):
            return await repo.update(
                assistant,
                update_dict={
                    "status": "failed",
                    "error": "No lesson text or transcripts available yet.",
                },
            )

        estimated_tokens = ai.estimate_tokens(knowledge_base)
        if estimated_tokens > settings.COURSE_ASSISTANT_MAX_CONTEXT_TOKENS:
            return await repo.update(
                assistant,
                update_dict={
                    "status": "failed",
                    "error": (
                        f"Course is too large for v1 "
                        f"(~{estimated_tokens} tokens; limit "
                        f"{settings.COURSE_ASSISTANT_MAX_CONTEXT_TOKENS}). "
                        "Retrieval/RAG would be required."
                    ),
                },
            )

        api_key = settings.ANTHROPIC_API_KEY
        build_model = settings.COURSE_ASSISTANT_BUILD_MODEL
        course_title = course.title or "this course"

        transcript_sample = "\n\n".join(
            source.text for source in sources if source.content_type == "video"
        ).strip()
        if not transcript_sample:
            transcript_sample = knowledge_base
        transcript_sample = transcript_sample[:_VOICE_SAMPLE_CHAR_CAP]

        try:
            voice_card = await ai.generate_voice_card(
                api_key=api_key,
                model=build_model,
                transcript_sample=transcript_sample,
                instructor_name=course.instructor_name,
            )
            samples = await ai.generate_sample_qa(
                api_key=api_key,
                model=build_model,
                knowledge_base=knowledge_base,
                course_title=course_title,
                instructor_name=course.instructor_name,
                voice_card=voice_card,
            )
        except Exception as exc:
            log.exception(
                "course_assistant.build_failed",
                extra={"course_id": str(course.id)},
            )
            return await repo.update(
                assistant,
                update_dict={
                    "status": "failed",
                    "error": f"Build failed: {exc}",
                },
            )

        # The review batch the creator approves/edits, one card per item.
        sample_payload: list[dict[str, Any]] = [
            {
                "id": s.id,
                "question": s.question,
                "answer": s.answer,
                "citation": s.citation,
                "scope": s.scope,
                "approved": False,
                "edited_answer": None,
            }
            for s in samples
        ]

        # A rebuild of an already-approved assistant updates only the draft and
        # flags it for re-review; the previously approved snapshot keeps
        # serving students (live stays true) until the creator re-approves.
        update_dict: dict[str, Any] = {
            "draft_knowledge_base": knowledge_base,
            "draft_voice_card": voice_card or None,
            "draft_sample_questions": sample_payload or None,
            "draft_knowledge_base_tokens": estimated_tokens,
            "draft_source_lesson_count": len(sources),
            "draft_built_at": utc_now(),
            "status": "ready_for_review",
            "error": None,
        }
        result = await repo.update(assistant, update_dict=update_dict)

        # The "your assistant is ready to review" signal is the status flip the
        # creator's Assistant tab reads. Emit a structured log too so this is
        # observable; a real push/notification belongs to the review UI (Phase 3).
        log.info(
            "course_assistant.ready_for_review",
            extra={
                "course_id": str(course.id),
                "lesson_count": len(sources),
                "tokens": estimated_tokens,
                "previously_live": assistant.live,
            },
        )
        return result

    # ----------------------------------------------------------------- #
    # Approval (backend logic for the Phase 3 review UI; gate for Phase 2)
    # ----------------------------------------------------------------- #

    async def approve(
        self,
        session: AsyncSession,
        assistant: CourseAssistant,
        *,
        approved_by_user_id: UUID | None,
        display_name: str | None = None,
        disclaimer: str | None = None,
    ) -> CourseAssistant:
        """Promote the draft snapshot to the serving snapshot and go live."""
        from .repository import CourseAssistantRepository

        repo = CourseAssistantRepository.from_session(session)
        update_dict: dict[str, Any] = {
            "knowledge_base": assistant.draft_knowledge_base,
            "voice_card": assistant.draft_voice_card,
            "sample_questions": assistant.draft_sample_questions,
            "knowledge_base_tokens": assistant.draft_knowledge_base_tokens,
            "source_lesson_count": assistant.draft_source_lesson_count,
            "model": settings.COURSE_ASSISTANT_ANSWER_MODEL,
            "live": True,
            "status": "live",
            "approved_at": utc_now(),
            "approved_by_user_id": approved_by_user_id,
        }
        if display_name is not None:
            update_dict["display_name"] = display_name
        if disclaimer is not None:
            update_dict["disclaimer"] = disclaimer
        return await repo.update(assistant, update_dict=update_dict)

    async def set_live(
        self, session: AsyncSession, assistant: CourseAssistant, *, live: bool
    ) -> CourseAssistant:
        from .repository import CourseAssistantRepository

        repo = CourseAssistantRepository.from_session(session)
        return await repo.update(
            assistant,
            update_dict={"live": live, "status": "live" if live else "disabled"},
        )

    # ----------------------------------------------------------------- #
    # Answering (Phase 2)
    # ----------------------------------------------------------------- #

    async def get_answerable_snapshot(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        customer_id: UUID,
    ) -> AnswerSnapshot:
        if not is_configured():
            raise NotConfigured()

        course_repo = CourseRepository.from_session(session)
        course = await course_repo.get_by_id(course_id)
        if course is None:
            raise AssistantNotAvailable()

        enrollment_repo = CourseEnrollmentRepository.from_session(session)
        enrollment = await enrollment_repo.get_active_for_customer_course(
            customer_id, course_id
        )
        if enrollment is None:
            raise NotEnrolled()

        from .repository import CourseAssistantRepository

        assistant = await CourseAssistantRepository.from_session(session).get_by_course(
            course_id
        )
        if assistant is None or not assistant.is_answerable:
            raise AssistantNotAvailable()

        course_title = course.title or "this course"
        display_name = assistant.display_name or course.instructor_name or course_title
        scope = course_title
        if course.description:
            scope = f"{course_title}. {course.description[:300]}"

        # ``is_answerable`` guarantees knowledge_base is populated.
        knowledge_base = assistant.knowledge_base or ""
        return AnswerSnapshot(
            course_id=course_id,
            organization_id=assistant.organization_id,
            course_title=course_title,
            instructor_name=course.instructor_name,
            display_name=display_name,
            voice_card=assistant.voice_card,
            disclaimer=assistant.disclaimer or ai.DEFAULT_DISCLAIMER,
            knowledge_base=knowledge_base,
            model=assistant.model or settings.COURSE_ASSISTANT_ANSWER_MODEL,
            scope=scope,
        )

    async def answer_event_stream(
        self, snapshot: AnswerSnapshot, question: str
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield answer events (no DB access — safe to run after the request
        session has closed). Runs the cheap guardrail first, then streams the
        grounded answer."""
        api_key = settings.ANTHROPIC_API_KEY

        decision = await ai.run_guardrail(
            api_key=api_key,
            model=settings.COURSE_ASSISTANT_GUARDRAIL_MODEL,
            course_title=snapshot.course_title,
            scope=snapshot.scope,
            question=question,
        )
        if not decision.allowed:
            yield {
                "type": "refusal",
                "message": (
                    "That's a bit outside what this course covers, so I'll "
                    "leave it there — happy to help with anything from the "
                    "course itself."
                ),
            }
            yield {"type": "done", "stop_reason": "guardrail"}
            return

        system_blocks = ai.build_system_blocks(
            course_title=snapshot.course_title,
            instructor_name=snapshot.instructor_name,
            display_name=snapshot.display_name,
            voice_card=snapshot.voice_card,
            disclaimer=snapshot.disclaimer or ai.DEFAULT_DISCLAIMER,
        )
        user_blocks = ai.build_user_blocks(
            knowledge_base=snapshot.knowledge_base,
            question=question,
            course_title=snapshot.course_title,
        )

        async for event in ai.stream_answer(
            api_key=api_key,
            model=snapshot.model,
            system_blocks=system_blocks,
            user_blocks=user_blocks,
            max_tokens=settings.COURSE_ASSISTANT_MAX_ANSWER_TOKENS,
        ):
            yield event

    # ----------------------------------------------------------------- #
    # v2 — stateless live answering (no snapshot / approval gate)
    # ----------------------------------------------------------------- #

    async def get_live_snapshot(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        customer_id: UUID,
    ) -> AnswerSnapshot:
        """Build an answer snapshot directly from the LIVE course — no approval,
        no stored snapshot. Gated only on: feature configured, the creator's
        per-course ``assistant_enabled`` toggle, and active enrollment.

        The knowledge base is assembled on every ask from current lesson text +
        transcripts. Cost is controlled by prompt caching on the course block
        (see ai.build_user_blocks), not by snapshotting.
        """
        if not is_configured():
            raise NotConfigured()

        course = await CourseRepository.from_session(session).get_by_id(course_id)
        if course is None or not course.assistant_enabled:
            raise AssistantNotAvailable()

        enrollment = await CourseEnrollmentRepository.from_session(
            session
        ).get_active_for_customer_course(customer_id, course_id)
        if enrollment is None:
            raise NotEnrolled()

        lessons = await self._buildable_lessons(session, course_id)
        sources = self._collect_sources(lessons)
        thumbnails = {str(lesson.id): lesson.thumbnail_url for lesson in lessons}
        knowledge_base, citation_refs = ai.assemble_knowledge_base_with_refs(
            sources, thumbnails
        )
        lesson_cues = {
            str(lesson.id): lesson.transcript_cues
            for lesson in lessons
            if lesson.transcript_cues
        }

        course_title = course.title or "this course"
        scope = course_title
        if course.description:
            scope = f"{course_title}. {course.description[:300]}"

        return AnswerSnapshot(
            course_id=course_id,
            organization_id=course.organization_id,
            course_title=course_title,
            instructor_name=course.instructor_name,
            display_name="Course TA",
            voice_card=None,
            disclaimer=ai.COURSE_TA_DISCLAIMER,
            knowledge_base=knowledge_base,
            model=settings.COURSE_ASSISTANT_ANSWER_MODEL,
            scope=scope,
            strictness=course.assistant_strictness,
            citation_refs=tuple(citation_refs),
            lesson_cues=lesson_cues,
        )

    async def live_answer_event_stream(
        self,
        snapshot: AnswerSnapshot,
        question: str,
        *,
        course_description: str | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield v2 answer events (no DB access — safe after the session closes).

        Runs the permissive guardrail, then streams a course-first answer using
        the neutral "Course TA" system prompt. When strictness allows general
        knowledge and the model produced no course citations, a ``general``
        event is emitted so the UI can show the labeled note.
        """
        api_key = settings.ANTHROPIC_API_KEY

        decision = await ai.run_guardrail(
            api_key=api_key,
            model=settings.COURSE_ASSISTANT_GUARDRAIL_MODEL,
            course_title=snapshot.course_title,
            scope=snapshot.scope,
            question=question,
        )
        if not decision.allowed:
            yield {
                "type": "refusal",
                "message": (
                    "That's outside what I can help with here — ask me anything "
                    "about the course and I'll dig in."
                ),
            }
            yield {"type": "done", "stop_reason": "guardrail"}
            return

        system_blocks = ai.build_system_blocks_v2(
            course_title=snapshot.course_title,
            course_description=course_description,
            strictness=snapshot.strictness,
            disclaimer=snapshot.disclaimer or ai.DEFAULT_DISCLAIMER,
        )
        user_blocks = ai.build_user_blocks(
            knowledge_base=snapshot.knowledge_base,
            question=question,
            course_title=snapshot.course_title,
        )

        had_citations = False
        answer_parts: list[str] = []
        async for event in ai.stream_answer(
            api_key=api_key,
            model=snapshot.model,
            system_blocks=system_blocks,
            user_blocks=user_blocks,
            max_tokens=settings.COURSE_ASSISTANT_MAX_ANSWER_TOKENS,
        ):
            event_type = event.get("type")
            if event_type == "text":
                answer_parts.append(str(event.get("text", "")))
                yield event
                continue
            if event_type == "citations":
                # Map raw document citations to clickable lessons.
                citations = ai.map_citations_to_lessons(
                    list(event.get("citations") or []),
                    list(snapshot.citation_refs),
                    snapshot.lesson_cues,
                )
                had_citations = bool(citations)
                yield {"type": "citations", "citations": citations}
                continue
            if event_type == "done":
                # No citations + general allowed ⇒ a general-knowledge answer:
                # flag it so the UI shows the labeled note.
                if not had_citations and snapshot.strictness == "course_plus_general":
                    yield {"type": "general"}
                followups = await self._safe_followups(
                    course_title=snapshot.course_title,
                    question=question,
                    answer="".join(answer_parts),
                )
                if followups:
                    yield {"type": "follow", "suggestions": followups}
                yield event
                continue
            yield event

    async def _safe_followups(
        self, *, course_title: str, question: str, answer: str
    ) -> list[str]:
        """Best-effort follow-up suggestions; never raises into the stream."""
        try:
            return await ai.generate_followups(
                api_key=settings.ANTHROPIC_API_KEY,
                model=settings.COURSE_ASSISTANT_GUARDRAIL_MODEL,
                course_title=course_title,
                question=question,
                answer=answer,
            )
        except Exception:
            log.warning("course_assistant.followups_failed", exc_info=True)
            return []

    # ----------------------------------------------------------------- #
    # Creator preview & settings (Phase 3 review)
    # ----------------------------------------------------------------- #

    async def get_draft_snapshot(
        self, session: AsyncSession, *, course_id: UUID
    ) -> AnswerSnapshot:
        """Snapshot built from the DRAFT (un-approved) content, for the
        creator's preview chat in the review screen. The caller is responsible
        for the org-membership check; no enrollment / live gate applies."""
        if not is_configured():
            raise NotConfigured()
        course = await CourseRepository.from_session(session).get_by_id(course_id)
        if course is None:
            raise AssistantNotAvailable()

        from .repository import CourseAssistantRepository

        assistant = await CourseAssistantRepository.from_session(session).get_by_course(
            course_id
        )
        if assistant is None or not assistant.draft_knowledge_base:
            raise AssistantNotAvailable()

        course_title = course.title or "this course"
        display_name = assistant.display_name or course.instructor_name or course_title
        scope = course_title
        if course.description:
            scope = f"{course_title}. {course.description[:300]}"
        return AnswerSnapshot(
            course_id=course_id,
            organization_id=assistant.organization_id,
            course_title=course_title,
            instructor_name=course.instructor_name,
            display_name=display_name,
            voice_card=assistant.draft_voice_card,
            disclaimer=assistant.disclaimer or ai.DEFAULT_DISCLAIMER,
            knowledge_base=assistant.draft_knowledge_base,
            model=settings.COURSE_ASSISTANT_ANSWER_MODEL,
            scope=scope,
        )

    async def update_settings(
        self,
        session: AsyncSession,
        assistant: CourseAssistant,
        *,
        display_name: str | None = None,
        disclaimer: str | None = None,
    ) -> CourseAssistant:
        """Edit the creator-facing identity without (re)approving. ``None``
        means 'leave unchanged'."""
        from .repository import CourseAssistantRepository

        update_dict: dict[str, Any] = {}
        if display_name is not None:
            update_dict["display_name"] = display_name
        if disclaimer is not None:
            update_dict["disclaimer"] = disclaimer
        if not update_dict:
            return assistant
        return await CourseAssistantRepository.from_session(session).update(
            assistant, update_dict=update_dict
        )

    async def request_rebuild(
        self, session: AsyncSession, assistant: CourseAssistant
    ) -> CourseAssistant:
        """Mark the assistant as rebuilding (the caller enqueues the build
        job). Clears any prior error so the UI reflects a fresh attempt."""
        from .repository import CourseAssistantRepository

        return await CourseAssistantRepository.from_session(session).update(
            assistant, update_dict={"status": "building", "error": None}
        )

    async def update_sample(
        self,
        session: AsyncSession,
        assistant: CourseAssistant,
        *,
        sample_id: str,
        answer: str | None = None,
        approved: bool | None = None,
    ) -> CourseAssistant:
        """Edit / approve a single review card on the DRAFT batch. ``answer``
        is stored as an override (``edited_answer``); ``None`` leaves a field
        unchanged. No-op if the sample id isn't found."""
        from .repository import CourseAssistantRepository

        samples = assistant.draft_sample_questions or []
        new_samples: list[dict[str, Any]] = []
        changed = False
        for item in samples:
            if isinstance(item, dict) and item.get("id") == sample_id:
                updated = dict(item)
                if answer is not None:
                    updated["edited_answer"] = answer
                if approved is not None:
                    updated["approved"] = approved
                new_samples.append(updated)
                changed = True
            else:
                new_samples.append(item)
        if not changed:
            return assistant
        return await CourseAssistantRepository.from_session(session).update(
            assistant, update_dict={"draft_sample_questions": new_samples}
        )

    # ----------------------------------------------------------------- #
    # Question logging & insights (Phase 5 — "What students are asking")
    # ----------------------------------------------------------------- #

    async def log_question(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        organization_id: UUID,
        customer_id: UUID | None,
        question: str,
        outcome: str,
    ) -> None:
        """Append one student question to the log. Called from a background
        task after the answer has streamed, so a failure here never affects the
        student answer path. Silently no-ops on empty input."""
        from polar.models.course_assistant_question import CourseAssistantQuestion

        from .repository import CourseAssistantQuestionRepository

        text = (question or "").strip()
        if not text:
            return
        normalized = normalize_question(text)
        if not normalized:
            return
        if outcome not in QUESTION_OUTCOMES:
            outcome = "answered"

        repo = CourseAssistantQuestionRepository.from_session(session)
        await repo.create(
            CourseAssistantQuestion(
                course_id=course_id,
                organization_id=organization_id,
                customer_id=customer_id,
                question=text[:4000],
                question_normalized=normalized,
                outcome=outcome,
            )
        )

    async def get_question_insights(
        self, session: AsyncSession, *, course_id: UUID, limit: int = 50
    ) -> tuple[QuestionTotals, list[QuestionGroup]]:
        """Return (totals, top question clusters) for the creator's panel."""
        from .repository import CourseAssistantQuestionRepository

        repo = CourseAssistantQuestionRepository.from_session(session)
        totals = await repo.totals(course_id)
        items = await repo.top_questions(course_id, limit=limit)
        return totals, items


    async def diagnose_transcripts(
        self, session: AsyncSession, *, course_id: UUID
    ) -> list[dict[str, Any]]:
        """Per video lesson, report the real transcript pipeline state plus a
        live Mux probe (tracks Mux reports + the .vtt HTTP status). Lets a
        creator see exactly why transcription is or isn't working in their own
        deployment, instead of us guessing."""
        from polar.course import mux as mux_client

        lessons = await self._buildable_lessons(session, course_id)
        results: list[dict[str, Any]] = []
        for lesson in lessons:
            if lesson.content_type != "video":
                continue
            entry: dict[str, Any] = {
                "lesson_id": str(lesson.id),
                "title": lesson.title,
                "mux_status": lesson.mux_status,
                "transcript_status": lesson.transcript_status,
                "has_transcript": bool(lesson.transcript),
            }
            if lesson.mux_asset_id and lesson.mux_playback_id:
                entry["mux"] = await mux_client.diagnose_caption_fetch(
                    lesson.mux_asset_id, lesson.mux_playback_id
                )
            else:
                entry["mux"] = {"error": "no_mux_asset_on_lesson"}
            results.append(entry)
        return results

    async def retry_transcripts(
        self, session: AsyncSession, *, course_id: UUID
    ) -> dict[str, int]:
        """Fetch + store the transcript for every video lesson that isn't
        already transcribed — INLINE on the API (not via the worker), since the
        fetch is just an HTTP GET and the worker path was the broken link. Then
        kick a build. Returns how many were attempted vs stored."""
        from polar.worker import enqueue_job

        lessons = await self._buildable_lessons(session, course_id)
        attempted = 0
        stored = 0
        for lesson in lessons:
            if lesson.content_type != "video" or not lesson.mux_asset_id:
                continue
            if lesson.transcript_status == "ready":
                continue
            attempted += 1
            if await self.fetch_and_store_transcript(session, lesson_id=lesson.id):
                stored += 1
        # Now that transcripts may have landed, kick the assistant build.
        enqueue_job("course_assistant.maybe_build", course_id=course_id)
        return {"attempted": attempted, "stored": stored}


course_assistant_service = CourseAssistantService()
