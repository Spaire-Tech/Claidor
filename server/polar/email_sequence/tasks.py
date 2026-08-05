from datetime import timedelta
from uuid import UUID

import structlog

from polar.email.compose import finalize_email_html
from polar.email.sender import email_sender, resolve_creator_from_address
from polar.kit.utils import utc_now
from polar.models.email_sequence import EmailSequence, EmailSequenceStatus
from polar.models.email_sequence_enrollment import (
    EmailSequenceEnrollment,
    EmailSequenceEnrollmentStatus,
)
from polar.models.email_sequence_step import EmailSequenceStep
from polar.models.email_sequence_step_send import (
    EmailSequenceStepSend,
    EmailSequenceStepSendStatus,
)
from polar.models.email_subscriber import EmailSubscriber, EmailSubscriberStatus
from polar.models.organization import Organization
from polar.postgres import AsyncSession
from polar.worker import (
    AsyncSessionMaker,
    CronTrigger,
    TaskPriority,
    actor,
    enqueue_job,
)

log = structlog.get_logger()


@actor(actor_name="email_sequence.send_test_step", priority=TaskPriority.MEDIUM)
async def send_test_step(step_id: UUID, to_email: str) -> None:
    """Render and deliver a single test send of a sequence step.

    Wired from `EmailSequenceService.send_test_step`. Runs in the worker
    rather than on the API request thread (audit issue #50) so we don't
    block callers on the Resend roundtrip and gain retry-on-failure.
    """
    from polar.email_subscriber.unsubscribe_token import (
        build_test_unsubscribe_url,
    )

    async with AsyncSessionMaker() as session:
        step = await session.get(EmailSequenceStep, step_id)
        if step is None:
            return
        sequence = await session.get(EmailSequence, step.sequence_id)
        organization = (
            await session.get(Organization, sequence.organization_id)
            if sequence is not None
            else None
        )

        unsubscribe_url = build_test_unsubscribe_url()
        # Resolve {{first_name}} etc. against a representative recipient so the
        # test looks like a real, personalised send rather than shipping the
        # literal placeholder tokens (mirrors the real step-send path).
        from polar.email.personalize import build_variables
        from polar.email.personalize import render as personalize
        from polar.email.personalize import sample_subscriber

        personalize_vars = build_variables(subscriber=sample_subscriber(to_email))
        personalize_vars["unsubscribe_url"] = unsubscribe_url
        body_html = personalize(
            step.content_html or "<p>No content</p>", personalize_vars, html=True
        )
        subject_text = personalize(step.subject or "", personalize_vars, html=False)
        wrapped_html = finalize_email_html(
            body_html,
            unsubscribe_url=unsubscribe_url,
            organization_name=organization.name if organization else step.sender_name,
            organization_logo_url=organization.avatar_url if organization else None,
            organization_website=organization.website if organization else None,
        )
        try:
            await email_sender.send(
                to_email_addr=to_email,
                subject=f"[TEST] {subject_text}",
                html_content=wrapped_html,
                from_name=step.sender_name,
                from_email_addr=step.sender_email
                or "noreply@notifications.spairehq.com",
                email_headers={
                    "List-Unsubscribe": f"<{unsubscribe_url}>",
                    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                },
                reply_to_name=step.sender_name if step.reply_to_email else None,
                reply_to_email_addr=step.reply_to_email,
                track_opens=True,
                track_clicks=True,
            )
        except Exception:
            log.exception(
                "email_sequence.send_test_step_failed",
                step_id=str(step_id),
                to_email=to_email,
            )
            raise


@actor(actor_name="email_sequence.enroll_subscriber", priority=TaskPriority.MEDIUM)
async def enroll_subscriber(sequence_id: UUID, subscriber_id: UUID) -> None:
    """Create an enrollment for a subscriber in a sequence."""
    from .service import AlreadyEnrolled
    from .service import email_sequence as sequence_service

    async with AsyncSessionMaker() as session:
        sequence = await session.get(EmailSequence, sequence_id)
        if sequence is None or sequence.status != EmailSequenceStatus.active:
            return

        subscriber = await session.get(EmailSubscriber, subscriber_id)
        if subscriber is None or subscriber.status != EmailSubscriberStatus.active:
            return

        try:
            await sequence_service.enroll(session, sequence, subscriber_id)
        except AlreadyEnrolled:
            log.debug(
                "email_sequence.already_enrolled",
                sequence_id=str(sequence_id),
                subscriber_id=str(subscriber_id),
            )


@actor(
    actor_name="email_sequence.process_due",
    cron_trigger=CronTrigger(minute="*/5"),
    priority=TaskPriority.MEDIUM,
)
async def process_due_enrollments() -> None:
    """Advance all enrollments whose next_step_at has passed."""
    from .repository import EmailSequenceRepository

    async with AsyncSessionMaker() as session:
        repository = EmailSequenceRepository.from_session(session)
        due = await repository.list_due_enrollments(utc_now())

    for enrollment in due:
        enqueue_job(
            "email_sequence.send_step",
            enrollment_id=enrollment.id,
        )


@actor(
    actor_name="email_sequence.enrol_inactive",
    cron_trigger=CronTrigger(hour="3", minute="0"),
    priority=TaskPriority.LOW,
)
async def enrol_inactive_students() -> None:
    """Daily scan: enter students with no recent course activity into any active
    `on_inactivity` sequence for their course.

    "Activity" is the student's latest lesson completion, falling back to their
    enrolment time when they've completed nothing. A student whose last activity
    is older than the sequence's configured `inactive_days` is enqueued for
    enrolment. Re-enqueuing a still-inactive (already-enrolled) student is a
    no-op — `enroll_subscriber` dedups — so they're never entered twice.
    """
    from sqlalchemy import func, select

    from polar.email_subscriber.repository import EmailSubscriberRepository
    from polar.models.course_enrollment import CourseEnrollment
    from polar.models.course_lesson_progress import CourseLessonProgress
    from polar.models.email_sequence import EmailSequenceTriggerType

    from .repository import EmailSequenceRepository

    async with AsyncSessionMaker() as session:
        repository = EmailSequenceRepository.from_session(session)
        sequences = await repository.list_active_by_trigger(
            EmailSequenceTriggerType.on_inactivity
        )
        subscriber_repo = EmailSubscriberRepository.from_session(session)
        now = utc_now()

        for sequence in sequences:
            if sequence.course_id is None:
                continue
            cfg = sequence.trigger_config or {}
            try:
                days = int(cfg.get("inactive_days", 7))
            except (TypeError, ValueError):
                days = 7
            if days < 1:
                days = 7
            cutoff = now - timedelta(days=days)

            # last activity = latest lesson completion, else when they enrolled
            last_activity = func.coalesce(
                select(func.max(CourseLessonProgress.completed_at))
                .where(CourseLessonProgress.enrollment_id == CourseEnrollment.id)
                .correlate(CourseEnrollment)
                .scalar_subquery(),
                CourseEnrollment.enrolled_at,
            )
            statement = select(CourseEnrollment.customer_id).where(
                CourseEnrollment.course_id == sequence.course_id,
                CourseEnrollment.deleted_at.is_(None),
                last_activity < cutoff,
            )
            result = await session.execute(statement)
            customer_ids = [row[0] for row in result.all()]

            for customer_id in customer_ids:
                subscriber = await subscriber_repo.get_by_customer_and_organization(
                    customer_id, sequence.organization_id
                )
                if subscriber is None:
                    continue
                enqueue_job(
                    "email_sequence.enroll_subscriber",
                    sequence_id=sequence.id,
                    subscriber_id=subscriber.id,
                )


@actor(actor_name="email_sequence.send_step", priority=TaskPriority.MEDIUM)
async def send_sequence_step(enrollment_id: UUID) -> None:
    """Advance an enrolment by one node.

    Sequences with an authored flow_doc are walked by the flow_engine
    (handles wait / branch / action / goal nodes too). Sequences without
    one fall through to the legacy email-step walker so existing data
    keeps working.
    """
    async with AsyncSessionMaker() as session:
        enrollment = await session.get(EmailSequenceEnrollment, enrollment_id)
        if enrollment is None or enrollment.status != EmailSequenceEnrollmentStatus.active:
            return

        # Re-check next_step_at to avoid double-send on rapid retries
        if enrollment.next_step_at is None or enrollment.next_step_at > utc_now():
            return

        sequence = await session.get(EmailSequence, enrollment.sequence_id)
        if sequence is None:
            return

        subscriber = await session.get(EmailSubscriber, enrollment.subscriber_id)
        if subscriber is None or subscriber.status != EmailSubscriberStatus.active:
            enrollment.status = EmailSequenceEnrollmentStatus.cancelled
            return

        from .flow_engine import get_flow_doc, process_one_step

        flow = get_flow_doc(sequence)
        if flow is not None:
            await _process_with_flow_engine(
                session,
                enrollment,
                sequence,
                subscriber,
                process_one_step=process_one_step,
            )
            return

        # — Legacy path: walk EmailSequenceStep rows in order —
        await _process_legacy(session, enrollment, sequence, subscriber)


async def _process_with_flow_engine(
    session: AsyncSession,
    enrollment: EmailSequenceEnrollment,
    sequence: EmailSequence,
    subscriber: EmailSubscriber,
    *,
    process_one_step,
) -> None:
    organization = await session.get(Organization, sequence.organization_id)

    async def _send(
        _seq: EmailSequence,
        enr: EmailSequenceEnrollment,
        value: dict,
    ) -> dict | None:
        return await _send_email_node(
            session,
            sequence=sequence,
            enrollment=enr,
            subscriber=subscriber,
            organization=organization,
            email_value=value,
        )

    await process_one_step(
        session,
        enrollment,
        sequence,
        send_email_node=_send,
    )


async def _process_legacy(
    session: AsyncSession,
    enrollment: EmailSequenceEnrollment,
    sequence: EmailSequence,
    subscriber: EmailSubscriber,
) -> None:
    from .repository import EmailSequenceRepository
    from .service import apply_send_window, check_frequency_cap

    repository = EmailSequenceRepository.from_session(session)

    step = await repository.get_step_by_position(
        enrollment.sequence_id, enrollment.current_step_position
    )
    if step is None:
        enrollment.status = EmailSequenceEnrollmentStatus.completed
        enrollment.completed_at = utc_now()
        enrollment.next_step_at = None
        return

    # Frequency-cap for the legacy walker: defer if the subscriber has hit
    # their workspace quota in the last 7 days. Because the legacy doc
    # doesn't carry a frequencyCap toggle we always honour the default cap.
    if not await check_frequency_cap(session, enrollment.subscriber_id):
        base = utc_now() + timedelta(hours=24)
        enrollment.next_step_at = apply_send_window(
            base,
            sequence.trigger_config,
            subscriber_timezone=subscriber.timezone,
        )
        log.info(
            "email_sequence.legacy.cap_deferred",
            enrollment_id=str(enrollment.id),
            deferred_until=enrollment.next_step_at.isoformat()
            if enrollment.next_step_at
            else None,
        )
        return

    organization = await session.get(Organization, sequence.organization_id)
    await _send_email_step(
        session,
        sequence=sequence,
        enrollment=enrollment,
        subscriber=subscriber,
        organization=organization,
        step=step,
    )

    next_position = enrollment.current_step_position + 1
    next_step = await repository.get_step_by_position(
        enrollment.sequence_id, next_position
    )

    if next_step is None:
        enrollment.status = EmailSequenceEnrollmentStatus.completed
        enrollment.completed_at = utc_now()
        enrollment.next_step_at = None
    else:
        enrollment.current_step_position = next_position
        candidate = utc_now() + timedelta(hours=next_step.delay_hours)
        enrollment.next_step_at = apply_send_window(
            candidate,
            sequence.trigger_config,
            subscriber_timezone=subscriber.timezone,
        )


# ── Email send helpers ────────────────────────────────────────────────────────


def _email_ordinal_for_flow_index(flow: dict, index: int) -> int:
    """Number of email nodes appearing at indices < `index`."""
    steps = flow.get("steps") or []
    count = 0
    for i in range(min(index, len(steps))):
        node = steps[i]
        if isinstance(node, dict) and node.get("type") == "email":
            count += 1
    return count


async def _send_email_node(
    session: AsyncSession,
    *,
    sequence: EmailSequence,
    enrollment: EmailSequenceEnrollment,
    subscriber: EmailSubscriber,
    organization: Organization | None,
    email_value: dict,
) -> dict | None:
    """Send an email node from the flow_doc.

    Looks up the corresponding EmailSequenceStep row by email-ordinal so
    analytics, send-test and step-send rows continue to tie back to the
    same step ids the editor already manages.

    Returns `{"deferred_until": datetime}` when the frequency cap throttles
    the send so the flow engine can park the enrolment without advancing
    flow_index. Returns None on a successful send.
    """
    from .flow_engine import get_flow_doc
    from .repository import EmailSequenceRepository
    from .service import apply_send_window, check_frequency_cap

    flow = get_flow_doc(sequence)
    send_cfg = (
        (flow or {}).get("send") if isinstance(flow, dict) else None
    ) or {}
    if send_cfg.get("frequencyCap"):
        if not await check_frequency_cap(session, enrollment.subscriber_id):
            # Defer to the next eligible window slot (or just 24h out if
            # no window is configured).
            base = utc_now() + timedelta(hours=24)
            deferred = apply_send_window(
                base,
                sequence.trigger_config,
                subscriber_timezone=subscriber.timezone,
            )
            log.info(
                "email_sequence.flow.cap_deferred",
                enrollment_id=str(enrollment.id),
                deferred_until=deferred.isoformat(),
            )
            return {"deferred_until": deferred}

    repository = EmailSequenceRepository.from_session(session)
    # Prefer resolving the step by the current flow node's stable id: the tree
    # walker leaves `flow_next_step_id` pointing at the email node being sent
    # (it only advances to the next node *after* this returns). This is exact
    # even for flows with waits/branches, where the email-ordinal fallback —
    # which counts only root-level email nodes against a flow_index the tree
    # walker never advances — would otherwise always resolve to position 0.
    # Compute the email ordinal up front so it is ALWAYS bound — the legacy
    # analytics cursor (current_step_position) is advanced by `ordinal + 1` on a
    # successful send below. When the step resolves via flow_next_step_id (the
    # normal flow path) the `if step is None` block never ran, leaving `ordinal`
    # unbound and raising UnboundLocalError *after* the email was already sent —
    # the transaction rolled back, the cursor never advanced, and the same email
    # re-sent on the next tick (duplicate sends / stuck enrolment).
    cursor = enrollment.flow_index if enrollment.flow_index is not None else 0
    ordinal = _email_ordinal_for_flow_index(flow, cursor) if flow is not None else 0
    step = None
    if enrollment.flow_next_step_id:
        step = await repository.get_step_by_flow_id(
            sequence.id, enrollment.flow_next_step_id
        )
    if step is None:
        step = await repository.get_step_by_position(sequence.id, ordinal)
    if step is None:
        # Materialized step row missing — synthesise a best-effort send from
        # the flow node so authors can still ship even if syncEmailSteps
        # hasn't run. step_id is required for step_send rows so we skip the
        # send analytics row in this case and just deliver the email.
        await _send_inline(
            sequence=sequence,
            enrollment=enrollment,
            subscriber=subscriber,
            organization=organization,
            subject=email_value.get("subject") or "(no subject)",
            sender_name=email_value.get("fromName") or (organization.name if organization else "Spaire"),
            sender_email=email_value.get("fromEmail"),
            content_html=email_value.get("content_html") or _fallback_html(email_value),
        )
        # Bump current_step_position so legacy analytics keep marching forward.
        enrollment.current_step_position = ordinal + 1
        return None

    sent_ok = await _send_email_step(
        session,
        sequence=sequence,
        enrollment=enrollment,
        subscriber=subscriber,
        organization=organization,
        step=step,
    )
    if sent_ok:
        enrollment.current_step_position = ordinal + 1
    else:
        # Transient failure or quota exhausted: push next_step_at out
        # ~30 minutes so we retry on the same step instead of silently
        # skipping it. Without this, a Resend 429 would still
        # mark the enrollment as having "completed" that step, the
        # subscriber would never receive it, and the next step would
        # fire on schedule as if nothing happened.
        from datetime import timedelta as _td

        enrollment.next_step_at = utc_now() + _td(minutes=30)
    return None


async def _send_email_step(
    session: AsyncSession,
    *,
    sequence: EmailSequence,
    enrollment: EmailSequenceEnrollment,
    subscriber: EmailSubscriber,
    organization: Organization | None,
    step: EmailSequenceStep,
) -> bool:
    """Send one step. Returns True on success, False if the step should
    be retried (transient failure / quota exhausted) — the caller must
    not advance ``current_step_position`` when this returns False, or
    the enrollment will skip the step entirely.
    """
    from polar.email_subscriber.unsubscribe_token import build_unsubscribe_url

    unsubscribe_url = build_unsubscribe_url(enrollment.subscriber_id)

    # Email sends are uncapped on every tier — the only email lever is
    # list size (email_subscribers), enforced at subscriber-add time. No
    # per-send quota check here.
    try:
        # Per-recipient placeholder substitution (``{{first_name}}`` etc.)
        # before we hand the body to the outer marketing template wrapper.
        from polar.email.personalize import build_variables
        from polar.email.personalize import render as personalize

        from .custom_fields import list_fields

        custom_fields = await list_fields(session, subscriber.id)
        personalize_vars = build_variables(
            subscriber=subscriber, custom_fields=custom_fields
        )
        # Make {{unsubscribe_url}} resolve in the body (the editor's footer block
        # emits it) — otherwise personalize() would wipe it as an unknown token.
        personalize_vars["unsubscribe_url"] = unsubscribe_url
        body_html = step.content_html or "<p>No content</p>"
        body_html = personalize(body_html, personalize_vars, html=True)
        subject_text = personalize(
            step.subject or "", personalize_vars, html=False
        )

        wrapped_html = finalize_email_html(
            body_html,
            unsubscribe_url=unsubscribe_url,
            organization_name=organization.name if organization else step.sender_name,
            organization_logo_url=organization.avatar_url if organization else None,
            organization_website=organization.website if organization else None,
        )
        from_name, from_email = resolve_creator_from_address(
            organization=organization,
            requested_email=step.sender_email,
            requested_name=step.sender_name,
        )
        sequence_tags: list[dict[str, str]] = [
            {"name": "kind", "value": "sequence"},
            {"name": "sequence_id", "value": str(sequence.id)},
            {"name": "step_id", "value": str(step.id)},
            {"name": "enrollment_id", "value": str(enrollment.id)},
        ]
        if organization is not None:
            sequence_tags.append(
                {"name": "organization_id", "value": str(organization.id)}
            )
        resend_email_id = await email_sender.send(
            to_email_addr=subscriber.email,
            subject=subject_text,
            html_content=wrapped_html,
            from_name=from_name,
            from_email_addr=from_email,
            email_headers={
                "List-Unsubscribe": f"<{unsubscribe_url}>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
            reply_to_name=step.sender_name if step.reply_to_email else None,
            reply_to_email_addr=step.reply_to_email,
            track_opens=True,
            track_clicks=True,
            tags=sequence_tags,
            # Same enrollment+step send is at most once; this dedupes any
            # worker retry on Resend's side without us having to track it.
            idempotency_key=(
                f"sequence:{sequence.id}:{enrollment.id}:{step.id}"
            ),
        )
        session.add(
            EmailSequenceStepSend(
                enrollment_id=enrollment.id,
                step_id=step.id,
                subscriber_id=enrollment.subscriber_id,
                resend_email_id=resend_email_id,
                status=EmailSequenceStepSendStatus.sent,
                sent_at=utc_now(),
            )
        )
        # Flush narrows the visibility gap so subsequent reads in this
        # session see resend_email_id. The deferred-resolve queue in the
        # webhook handler covers the remaining cross-process race when a
        # sub-second Resend event lands before this actor commits.
        await session.flush()
        return True
    except Exception:
        log.exception(
            "email_sequence.send_step_failed",
            enrollment_id=str(enrollment.id),
            step_id=str(step.id),
        )
        session.add(
            EmailSequenceStepSend(
                enrollment_id=enrollment.id,
                step_id=step.id,
                subscriber_id=enrollment.subscriber_id,
                status=EmailSequenceStepSendStatus.failed,
            )
        )
        return False


async def _send_inline(
    *,
    sequence: EmailSequence,
    enrollment: EmailSequenceEnrollment,
    subscriber: EmailSubscriber,
    organization: Organization | None,
    subject: str,
    sender_name: str,
    sender_email: str | None,
    content_html: str,
) -> None:
    from polar.email_subscriber.unsubscribe_token import build_unsubscribe_url

    unsubscribe_url = build_unsubscribe_url(enrollment.subscriber_id)
    try:
        wrapped_html = finalize_email_html(
            content_html.replace("{{unsubscribe_url}}", unsubscribe_url),
            unsubscribe_url=unsubscribe_url,
            organization_name=organization.name if organization else sender_name,
            organization_logo_url=organization.avatar_url if organization else None,
            organization_website=organization.website if organization else None,
        )
        await email_sender.send(
            to_email_addr=subscriber.email,
            subject=subject,
            html_content=wrapped_html,
            from_name=sender_name,
            from_email_addr=sender_email or "noreply@notifications.spairehq.com",
            email_headers={
                "List-Unsubscribe": f"<{unsubscribe_url}>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
            track_opens=True,
            track_clicks=True,
            tags=[
                {"name": "kind", "value": "sequence_inline"},
                {"name": "sequence_id", "value": str(sequence.id)},
                {"name": "enrollment_id", "value": str(enrollment.id)},
            ],
        )
    except Exception:
        log.exception(
            "email_sequence.send_flow_node_failed",
            enrollment_id=str(enrollment.id),
            sequence_id=str(sequence.id),
        )


def _fallback_html(email_value: dict) -> str:
    subject = (email_value.get("subject") or "").replace("<", "&lt;")
    preview = (email_value.get("preview") or "").replace("<", "&lt;")
    return f"<h2>{subject}</h2><p>{preview}</p>"
