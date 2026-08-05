"""Background tasks for the Course Assistant (Phase 1 — auto-build silently).

Flow:
  Mux caption track ready  ──▶  course_assistant.fetch_transcript(lesson_id)
                                    │  (downloads + stores the transcript)
                                    ▼
                                course_assistant.maybe_build(course_id)
                                    │  (builds the draft assistant once every
                                    ▼   lesson has finished processing)
                                status = ready_for_review

A reconcile cron catches anything the webhooks missed: text-only courses
(which produce no Mux events), stuck "pending" captions, and builds that were
never triggered.
"""

from datetime import timedelta
from uuid import UUID

from polar.course import mux as mux_client
from polar.course.repository import CourseLessonRepository
from polar.exceptions import PolarTaskError
from polar.kit.utils import utc_now
from polar.worker import (
    AsyncSessionMaker,
    CronTrigger,
    TaskPriority,
    actor,
    enqueue_job,
)

from .repository import CourseAssistantRepository
from .service import course_assistant_service as service

# A caption stuck "pending" longer than this is given up on (marked
# "unavailable") so it can't block the course's assistant build forever.
PENDING_TRANSCRIPT_TIMEOUT = timedelta(hours=2)


class CourseAssistantTaskError(PolarTaskError): ...


@actor(actor_name="course_assistant.fetch_transcript", priority=TaskPriority.LOW)
async def fetch_transcript(lesson_id: UUID) -> None:
    """Download the Mux auto-caption VTT for a lesson and store it, then
    re-check whether the course is now ready to build. Idempotent: if the
    caption isn't ready yet, leaves the lesson 'pending' for the reconcile
    cron to retry."""
    async with AsyncSessionMaker() as session:
        lesson_repo = CourseLessonRepository.from_session(session)
        lesson = await lesson_repo.get_by_id(lesson_id)
        if lesson is None:
            return

        asset_id = lesson.mux_asset_id
        playback_id = lesson.mux_playback_id
        if not asset_id or not playback_id:
            # No (working) asset → nothing to transcribe; unblock the build.
            course_id = await service.mark_transcript_status(
                session, lesson_id=lesson_id, status="unavailable"
            )
            if course_id is not None:
                enqueue_job("course_assistant.maybe_build", course_id=course_id)
            return

        vtt = await mux_client.get_caption_vtt(asset_id, playback_id)
        if vtt is None:
            # Caption track not ready yet — leave pending; cron will retry.
            return

        course_id = await service.store_transcript(
            session, lesson_id=lesson_id, vtt=vtt
        )
        if course_id is not None:
            enqueue_job("course_assistant.maybe_build", course_id=course_id)


@actor(actor_name="course_assistant.autofill_lesson", priority=TaskPriority.LOW)
async def autofill_lesson(lesson_id: UUID) -> None:
    """Write the AI lesson draft (description / overview / takeaways) into a
    lesson's empty fields, from its just-landed transcript. Gated inside the
    service on ai_autofill_status='pending', so retries and duplicate enqueues
    are harmless no-ops."""
    async with AsyncSessionMaker() as session:
        await service.autofill_lesson(session, lesson_id=lesson_id)


@actor(actor_name="course_assistant.maybe_build", priority=TaskPriority.LOW)
async def maybe_build(course_id: UUID) -> None:
    """Build the course's assistant if it's configured, has content, and every
    lesson has finished processing. No-op otherwise (safe to call often)."""
    async with AsyncSessionMaker() as session:
        await service.maybe_build(session, course_id)


@actor(actor_name="course_assistant.log_question", priority=TaskPriority.LOW)
async def log_question(
    course_id: UUID,
    organization_id: UUID,
    customer_id: UUID | None,
    question: str,
    outcome: str,
) -> None:
    """Persist one student question (Phase 5 — "What students are asking").

    Enqueued best-effort after the answer has streamed, so it's fully decoupled
    from — and can never break — the student answer path."""
    async with AsyncSessionMaker() as session:
        await service.log_question(
            session,
            course_id=course_id,
            organization_id=organization_id,
            customer_id=customer_id,
            question=question,
            outcome=outcome,
        )


@actor(
    actor_name="course_assistant.reconcile",
    cron_trigger=CronTrigger(minute="*/15"),
    priority=TaskPriority.LOW,
)
async def reconcile() -> None:
    """Catch missed triggers: retry / time out pending captions, and kick
    builds for courses (notably text-only ones) that never got one."""
    async with AsyncSessionMaker() as session:
        lesson_repo = CourseLessonRepository.from_session(session)
        now = utc_now()
        for lesson in await lesson_repo.list_pending_transcripts():
            aged = (
                lesson.modified_at is not None
                and (now - lesson.modified_at) > PENDING_TRANSCRIPT_TIMEOUT
            )
            if aged:
                course_id = await service.mark_transcript_status(
                    session, lesson_id=lesson.id, status="unavailable"
                )
                if course_id is not None:
                    enqueue_job("course_assistant.maybe_build", course_id=course_id)
            else:
                enqueue_job("course_assistant.fetch_transcript", lesson_id=lesson.id)

        # AI lesson drafts whose transcript landed but whose autofill enqueue
        # was dropped — re-kick them so the editor banner always resolves.
        for lesson in await lesson_repo.list_pending_autofills():
            enqueue_job("course_assistant.autofill_lesson", lesson_id=lesson.id)

        assistant_repo = CourseAssistantRepository.from_session(session)
        for course_id in await assistant_repo.list_course_ids_needing_build():
            enqueue_job("course_assistant.maybe_build", course_id=course_id)
