"""Event-fire pipeline for sequences.

`fire_event` is called when an organization needs to wake `until-event`
waits for a subscriber. It scans the subscriber's parked enrolments
(status=active, next_step_at IS NULL), peeks at the previous flow step,
and resumes any matching `wait{ mode:'until-event', event:<name> }` by
setting `next_step_at` to the next eligible window slot.

The current cursor (`flow_index`) already points at the step *after* the
wait — see `flow_engine.process_one_step`'s wait branch, which advances
linearly even when `schedule_wait` returns None. So waking just means
flipping `next_step_at` from None → now (window-respecting).
"""

from __future__ import annotations

from uuid import UUID

import structlog

from polar.kit.utils import utc_now
from polar.models.email_sequence_enrollment import EmailSequenceEnrollment
from polar.postgres import AsyncSession

from .flow_engine import get_flow_doc, get_node
from .repository import EmailSequenceRepository
from .service import apply_send_window

log = structlog.get_logger()


async def fire_event(
    session: AsyncSession,
    *,
    organization_id: UUID,
    subscriber_id: UUID,
    event_name: str,
    course_id: UUID | None = None,
    lesson_id: UUID | None = None,
) -> list[EmailSequenceEnrollment]:
    """Wake every parked enrolment whose preceding wait was waiting on
    this `event_name` for this subscriber. Returns the enrolments that
    were resumed so callers / tests can assert on the result.

    When `course_id` / `lesson_id` are passed, sequences scoped to a
    different course or lesson are skipped — so an event from course A
    never wakes a sequence scoped to course B. Sequences with no scope
    (course_id / lesson_id NULL) still match every event.
    """
    event_name = (event_name or "").strip()
    if not event_name or len(event_name) > 120:
        return []

    from polar.models.email_subscriber import EmailSubscriber

    # Defense in depth: refuse to wake any enrolment unless the (subscriber,
    # organization) pair we were handed actually exists. The endpoint already
    # scopes this via get_readable_statement, but cross-module callers could
    # bypass it; the repository SQL also filters on organization_id below.
    subscriber = await session.get(EmailSubscriber, subscriber_id)
    if subscriber is None or subscriber.organization_id != organization_id:
        log.warning(
            "email_sequence.event.subscriber_org_mismatch",
            organization_id=str(organization_id),
            subscriber_id=str(subscriber_id),
        )
        return []
    subscriber_tz = getattr(subscriber, "timezone", None)

    repository = EmailSequenceRepository.from_session(session)
    parked = await repository.list_parked_enrolments_for_subscriber(
        organization_id, subscriber_id
    )
    if not parked:
        return []

    woken: list[EmailSequenceEnrollment] = []
    for enrolment, sequence in parked:
        # Scope guard: don't wake a sequence bound to a different course/lesson
        # than the one this event came from.
        if (
            course_id is not None
            and sequence.course_id is not None
            and sequence.course_id != course_id
        ):
            continue
        if (
            lesson_id is not None
            and sequence.lesson_id is not None
            and sequence.lesson_id != lesson_id
        ):
            continue

        flow = get_flow_doc(sequence)
        if flow is None:
            continue
        cursor = enrolment.flow_index if enrolment.flow_index is not None else 0
        # The cursor points at the node AFTER the wait, so the wait we
        # were parked on is at cursor - 1.
        prev = get_node(flow, cursor - 1)
        if prev is None or prev.get("type") != "wait":
            continue
        value = prev.get("value") or {}
        if value.get("mode") != "until-event":
            continue
        if (value.get("event") or "").strip() != event_name:
            continue
        enrolment.next_step_at = apply_send_window(
            utc_now(),
            sequence.trigger_config,
            subscriber_timezone=subscriber_tz,
        )
        woken.append(enrolment)
        log.info(
            "email_sequence.event.woke_enrolment",
            event=event_name,
            enrolment_id=str(enrolment.id),
            sequence_id=str(sequence.id),
        )

    if woken:
        await session.flush()
        # Skip the 5-minute scheduler tick: enqueue each woken enrolment
        # so the worker advances them immediately. Idempotent — the
        # send_step task re-checks `next_step_at` before doing work.
        from polar.worker import enqueue_job

        for enrolment in woken:
            enqueue_job(
                "email_sequence.send_step",
                enrollment_id=enrolment.id,
            )
    return woken
