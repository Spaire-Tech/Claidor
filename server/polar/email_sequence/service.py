from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from uuid import UUID

import structlog

from polar.auth.models import AuthSubject, Organization, User
from polar.entitlements.service import entitlements as entitlements_service
from polar.exceptions import PolarError
from polar.kit.pagination import PaginationParams
from polar.kit.utils import utc_now
from polar.models.email_sequence import (
    EmailSequence,
    EmailSequenceStatus,
    EmailSequenceTriggerType,
)
from polar.models.email_sequence_enrollment import (
    EmailSequenceEnrollment,
    EmailSequenceEnrollmentStatus,
)
from polar.models.email_sequence_step import EmailSequenceStep
from polar.postgres import AsyncReadSession, AsyncSession
from polar.worker import enqueue_job

from .repository import EmailSequenceRepository

log = structlog.get_logger()


# Keys in trigger_config that participate in event matching. Settings keys
# (skip_if_in_another, pause_on_unsubscribe, send_window) are intentionally
# excluded — they're behavioural, not selectors.
_TRIGGER_FILTER_KEYS = {"product_id", "form_id"}


def trigger_config_matches(config: dict | None, event_filter: dict | None) -> bool:
    """Decide whether an event should fan out to a sequence.

    For each filter key on the sequence, the event must match. Keys outside
    `_TRIGGER_FILTER_KEYS` are ignored (settings, not selectors). A sequence
    with no filter keys configured matches every event.
    """
    if not config:
        return True
    event = event_filter or {}
    for key, expected in config.items():
        if key not in _TRIGGER_FILTER_KEYS:
            continue
        if event.get(key) != expected:
            return False
    return True


def apply_send_window(
    candidate: datetime,
    config: dict | None,
    *,
    subscriber_timezone: str | None = None,
) -> datetime:
    """Defer `candidate` to the next allowed send-window slot, if any.

    The window lives at `config.send_window` and supports:
      enabled: bool — short-circuit if false / missing
      days: list[int] — 0=Mon..6=Sun (defaults to weekdays)
      start_hour, end_hour: int — window in the configured timezone
      respect_timezone: bool — when true and `subscriber_timezone` is a
        valid IANA name, the window's start_hour / end_hour are evaluated
        in that tz. Otherwise everything is UTC.
    """
    if not config:
        return candidate
    window = config.get("send_window")
    if not isinstance(window, dict) or not window.get("enabled"):
        return candidate

    days = window.get("days")
    if not isinstance(days, list) or not days:
        days = [0, 1, 2, 3, 4]
    days_set = {int(d) for d in days if isinstance(d, int) and 0 <= d <= 6}
    if not days_set:
        return candidate

    start_hour = int(window.get("start_hour", 9))
    end_hour = int(window.get("end_hour", 17))
    start_hour = max(0, min(23, start_hour))
    end_hour = max(start_hour + 1, min(24, end_hour))

    target_tz = UTC
    if window.get("respect_timezone") and subscriber_timezone:
        try:
            from zoneinfo import ZoneInfo

            target_tz = ZoneInfo(subscriber_timezone)
        except Exception:
            target_tz = UTC

    moment = (
        candidate.astimezone(target_tz)
        if candidate.tzinfo
        else candidate.replace(tzinfo=UTC).astimezone(target_tz)
    )
    for _ in range(14):  # 2-week safety bound; windows always recur weekly
        if moment.weekday() in days_set:
            window_start = moment.replace(
                hour=start_hour, minute=0, second=0, microsecond=0
            )
            window_end = moment.replace(
                hour=0, minute=0, second=0, microsecond=0
            ) + timedelta(hours=end_hour)
            if moment < window_start:
                return window_start.astimezone(UTC)
            if moment < window_end:
                return moment.astimezone(UTC)
        moment = moment.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(
            days=1
        )
    return candidate


# Workspace-wide cap on how many sequence emails a subscriber can receive
# in a 7-day window. Override per-sequence with `send_window.frequency_cap`.
DEFAULT_FREQUENCY_CAP = 3


async def check_frequency_cap(
    session: "AsyncSession",
    subscriber_id: UUID,
    *,
    cap: int = DEFAULT_FREQUENCY_CAP,
    window_days: int = 7,
) -> bool:
    """Return True when the subscriber has capacity for another sequence
    send in the rolling window. Repository owns the actual query."""
    from .repository import EmailSequenceRepository

    if cap <= 0:
        return True
    repository = EmailSequenceRepository.from_session(session)
    cutoff = utc_now() - timedelta(days=window_days)
    count = await repository.count_recent_sends_for_subscriber(
        subscriber_id, cutoff=cutoff
    )
    return count < cap


class EmailSequenceError(PolarError): ...


class AlreadyEnrolled(EmailSequenceError):
    def __init__(self) -> None:
        super().__init__("Subscriber is already enrolled in this sequence.")


class EmailSequenceService:
    async def list(
        self,
        session: AsyncReadSession,
        auth_subject: AuthSubject[User | Organization],
        *,
        organization_id: UUID | None = None,
        course_id: UUID | None = None,
        lesson_id: UUID | None = None,
        pagination: PaginationParams,
    ) -> tuple[Sequence[EmailSequence], int]:
        repository = EmailSequenceRepository.from_session(session)
        statement = repository.get_readable_statement(auth_subject)
        if organization_id is not None:
            statement = statement.where(
                EmailSequence.organization_id == organization_id
            )
        if course_id is not None:
            statement = statement.where(EmailSequence.course_id == course_id)
        if lesson_id is not None:
            statement = statement.where(EmailSequence.lesson_id == lesson_id)
        statement = statement.order_by(EmailSequence.created_at.desc())
        return await repository.paginate(
            statement, limit=pagination.limit, page=pagination.page
        )

    async def get_by_id(
        self,
        session: AsyncReadSession,
        auth_subject: AuthSubject[User | Organization],
        sequence_id: UUID,
    ) -> EmailSequence | None:
        repository = EmailSequenceRepository.from_session(session)
        statement = repository.get_readable_statement(auth_subject).where(
            EmailSequence.id == sequence_id
        )
        return await repository.get_one_or_none(statement)

    async def create(
        self,
        session: AsyncSession,
        *,
        organization_id: UUID,
        name: str,
        description: str | None = None,
        trigger_type: EmailSequenceTriggerType = EmailSequenceTriggerType.manual,
        trigger_config: dict | None = None,
        course_id: UUID | None = None,
        lesson_id: UUID | None = None,
    ) -> EmailSequence:
        # Email sequences require Pro+. The legacy tier exempts grandfathered
        # orgs so existing sequences don't break.
        await entitlements_service.require_feature(
            session, organization_id, "email_sequences_and_segments"
        )

        repository = EmailSequenceRepository.from_session(session)
        sequence = EmailSequence(
            organization_id=organization_id,
            name=name,
            description=description,
            trigger_type=trigger_type,
            trigger_config=trigger_config or {},
            status=EmailSequenceStatus.draft,
            course_id=course_id,
            lesson_id=lesson_id,
        )
        sequence = await repository.create(sequence, flush=True)
        # The automation builder ships the authored email design inside
        # trigger_config.flow_doc; materialise it into step rows the worker
        # can actually send (see sync_flow_steps).
        await self.sync_flow_steps(session, sequence)
        return sequence

    async def update(
        self,
        session: AsyncSession,
        sequence: EmailSequence,
        *,
        name: str | None = None,
        description: str | None = None,
        trigger_type: EmailSequenceTriggerType | None = None,
        trigger_config: dict | None = None,
        status: EmailSequenceStatus | None = None,
        course_id: UUID | None = None,
        lesson_id: UUID | None = None,
    ) -> EmailSequence:
        repository = EmailSequenceRepository.from_session(session)
        if name is not None:
            sequence.name = name
        if description is not None:
            sequence.description = description
        if trigger_type is not None:
            sequence.trigger_type = trigger_type
        if trigger_config is not None:
            sequence.trigger_config = trigger_config
        if status is not None:
            # Gate activations against the tier's active_email_sequences
            # cap (Pro 1, Studio 10, Scale unlimited). Activation only —
            # creators can keep as many drafts / paused sequences as they
            # want; the cap is on simultaneously-running funnels.
            transitioning_to_active = (
                status == EmailSequenceStatus.active
                and sequence.status != EmailSequenceStatus.active
            )
            if transitioning_to_active:
                already_active = await repository.count_active_for_org(
                    sequence.organization_id,
                    exclude_sequence_id=sequence.id,
                )
                await entitlements_service.require_under_limit(
                    session,
                    sequence.organization_id,
                    "active_email_sequences",
                    current=already_active,
                )
            sequence.status = status
        if course_id is not None:
            sequence.course_id = course_id
        if lesson_id is not None:
            sequence.lesson_id = lesson_id
        sequence = await repository.update(sequence)
        # Re-materialise the flow_doc's email nodes whenever the authored doc
        # changes, so edits to the email body/subject reach the send path.
        if trigger_config is not None:
            await self.sync_flow_steps(session, sequence)
        return sequence

    async def delete(self, session: AsyncSession, sequence: EmailSequence) -> None:
        repository = EmailSequenceRepository.from_session(session)
        await repository.soft_delete(sequence)

    async def create_from_template(
        self,
        session: AsyncSession,
        *,
        organization_id: UUID,
        template: dict,
        course_id: UUID | None = None,
        lesson_id: UUID | None = None,
    ) -> EmailSequence:
        repository = EmailSequenceRepository.from_session(session)
        # The template can ship a rich `flow_doc` with wait/branch/action/goal
        # nodes. We mirror it onto trigger_config so the editor opens with the
        # full authored flow; the materialized email steps below are what the
        # worker actually iterates over.
        trigger_config = dict(template.get("trigger_config") or {})
        if "flow_doc" in template:
            trigger_config["flow_doc"] = template["flow_doc"]

        sequence = EmailSequence(
            organization_id=organization_id,
            name=template["name"],
            description=template.get("description"),
            trigger_type=template["trigger_type"],
            trigger_config=trigger_config,
            status=EmailSequenceStatus.draft,
            course_id=course_id,
            lesson_id=lesson_id,
        )
        sequence = await repository.create(sequence, flush=True)

        for index, step in enumerate(template.get("steps", [])):
            session.add(
                EmailSequenceStep(
                    sequence_id=sequence.id,
                    position=index,
                    delay_hours=step.get("delay_hours", 0),
                    subject=step["subject"],
                    sender_name=step.get("sender_name", "Team"),
                    sender_email=step.get("sender_email"),
                    reply_to_email=step.get("reply_to_email"),
                    content_html=step.get("content_html"),
                    content_json=step.get("content_json"),
                )
            )
        await session.flush()
        return sequence

    async def duplicate(
        self,
        session: AsyncSession,
        sequence: EmailSequence,
    ) -> EmailSequence:
        repository = EmailSequenceRepository.from_session(session)
        clone = EmailSequence(
            organization_id=sequence.organization_id,
            name=f"{sequence.name} (copy)",
            description=sequence.description,
            trigger_type=sequence.trigger_type,
            trigger_config=dict(sequence.trigger_config or {}),
            status=EmailSequenceStatus.draft,
        )
        clone = await repository.create(clone, flush=True)

        steps = await repository.list_steps(sequence.id)
        for step in steps:
            session.add(
                EmailSequenceStep(
                    sequence_id=clone.id,
                    position=step.position,
                    delay_hours=step.delay_hours,
                    subject=step.subject,
                    sender_name=step.sender_name,
                    sender_email=step.sender_email,
                    reply_to_email=step.reply_to_email,
                    content_html=step.content_html,
                    content_json=dict(step.content_json) if step.content_json else None,
                )
            )
        await session.flush()
        return clone

    async def sync_flow_steps(
        self,
        session: AsyncSession,
        sequence: EmailSequence,
    ) -> None:
        """Materialise the flow_doc's email nodes into EmailSequenceStep rows.

        The automation builder saves the authored email design *inside*
        ``trigger_config.flow_doc`` — each email node carries its own
        ``subject`` / ``content_html`` / ``content_json``. The worker's send
        path, however, reads the body from a materialised EmailSequenceStep row
        (so personalisation, quota, idempotency and analytics all hang off a
        stable row). Without this bridge the send path finds no row and falls
        back to an empty ``(no subject)`` email — the body the creator designed
        never ships.

        Idempotent: rows are aligned to nodes by ``flow_step_id``, updated in
        place, created when new, and soft-deleted when their node disappears.
        Rows with no ``flow_step_id`` (legacy/template steps) are left
        untouched.
        """
        from .flow_engine import get_flow_doc

        flow = get_flow_doc(sequence)
        if flow is None:
            return

        # Collect email nodes in pre-order (root then branch arms), preserving
        # the order the flow walker visits them so `position` lines up with the
        # send path's email-ordinal fallback.
        email_nodes: list[dict] = []

        def _walk(nodes: object) -> None:
            if not isinstance(nodes, list):
                return
            for node in nodes:
                if not isinstance(node, dict):
                    continue
                if node.get("type") == "email":
                    email_nodes.append(node)
                elif node.get("type") == "branch":
                    _walk(node.get("yes"))
                    _walk(node.get("no"))

        _walk(flow.get("steps"))

        repository = EmailSequenceRepository.from_session(session)
        existing = await repository.list_steps(sequence.id)
        by_flow_id = {s.flow_step_id: s for s in existing if s.flow_step_id}

        # The step's sender_name is only a fallback — the send path re-resolves
        # the real From identity from the organization — but the column is
        # NOT NULL, so seed it with the org name (or a safe default).
        organization = await session.get(Organization, sequence.organization_id)
        default_sender = organization.name if organization is not None else "Team"

        seen: set[str] = set()
        for position, node in enumerate(email_nodes):
            node_id = node.get("id")
            if not isinstance(node_id, str) or not node_id:
                continue
            seen.add(node_id)
            # Email nodes may be flat (authored in the builder) or value-wrapped
            # (backend templates) — read content from whichever is present.
            value = node.get("value") if isinstance(node.get("value"), dict) else {}
            subject = str(
                node.get("subject") or value.get("subject") or node.get("name") or ""
            ).strip()
            content_html = node.get("content_html") or value.get("content_html")
            content_json = node.get("content_json") or value.get("content_json")
            # Honour the creator's authored From name instead of always falling
            # back to the org name. The editor stores it in
            # content_json.broadcast.from; templates put it in value.fromName.
            authored_from = value.get("fromName")
            if not authored_from and isinstance(content_json, dict):
                broadcast = content_json.get("broadcast")
                if isinstance(broadcast, dict):
                    authored_from = broadcast.get("from")
            sender_name = (
                str(authored_from).strip() if authored_from else ""
            ) or default_sender
            row = by_flow_id.get(node_id)
            if row is None:
                session.add(
                    EmailSequenceStep(
                        sequence_id=sequence.id,
                        position=position,
                        delay_hours=0,
                        subject=subject or "(no subject)",
                        sender_name=sender_name,
                        content_html=content_html,
                        content_json=content_json,
                        flow_step_id=node_id,
                    )
                )
            else:
                row.position = position
                row.subject = subject or row.subject or "(no subject)"
                row.content_html = content_html
                row.content_json = content_json
                # Keep the From name in sync when authored; otherwise seed it.
                if authored_from:
                    row.sender_name = sender_name
                elif not row.sender_name:
                    row.sender_name = default_sender

        # Soft-delete rows whose node vanished from the flow. Only touch rows we
        # own (flow-linked); legacy/template rows keep flow_step_id=None.
        for row in existing:
            if row.flow_step_id and row.flow_step_id not in seen:
                row.deleted_at = utc_now()

        await session.flush()

    # ── Steps ──────────────────────────────────────────────────────────────

    async def add_step(
        self,
        session: AsyncSession,
        sequence: EmailSequence,
        *,
        position: int | None = None,
        delay_hours: int = 0,
        subject: str,
        sender_name: str,
        sender_email: str | None = None,
        reply_to_email: str | None = None,
        content_html: str | None = None,
        content_json: dict | None = None,
        flow_step_id: str | None = None,
    ) -> EmailSequenceStep:
        repository = EmailSequenceRepository.from_session(session)

        if position is None:
            max_pos = await repository.max_position(sequence.id)
            position = max_pos + 1

        step = EmailSequenceStep(
            sequence_id=sequence.id,
            position=position,
            delay_hours=delay_hours,
            subject=subject,
            sender_name=sender_name,
            sender_email=sender_email,
            reply_to_email=reply_to_email,
            content_html=content_html,
            content_json=content_json,
            flow_step_id=flow_step_id,
        )
        session.add(step)
        await session.flush()
        return step

    async def update_step(
        self,
        session: AsyncSession,
        step: EmailSequenceStep,
        *,
        position: int | None = None,
        delay_hours: int | None = None,
        subject: str | None = None,
        sender_name: str | None = None,
        sender_email: str | None = None,
        reply_to_email: str | None = None,
        content_html: str | None = None,
        content_json: dict | None = None,
        flow_step_id: str | None = None,
    ) -> EmailSequenceStep:
        if position is not None:
            step.position = position
        if delay_hours is not None:
            step.delay_hours = delay_hours
        if subject is not None:
            step.subject = subject
        if sender_name is not None:
            step.sender_name = sender_name
        if sender_email is not None:
            step.sender_email = sender_email
        if reply_to_email is not None:
            step.reply_to_email = reply_to_email
        if content_html is not None:
            step.content_html = content_html
        if content_json is not None:
            step.content_json = content_json
        if flow_step_id is not None:
            step.flow_step_id = flow_step_id
        await session.flush()
        return step

    async def delete_step(self, session: AsyncSession, step: EmailSequenceStep) -> None:
        step.deleted_at = utc_now()
        await session.flush()

    async def reorder_steps(
        self,
        session: AsyncSession,
        items: list[dict],
    ) -> None:
        repository = EmailSequenceRepository.from_session(session)
        await repository.reorder_steps(items)

    # ── Enrollments ────────────────────────────────────────────────────────

    async def enroll(
        self,
        session: AsyncSession,
        sequence: EmailSequence,
        subscriber_id: UUID,
    ) -> EmailSequenceEnrollment:
        repository = EmailSequenceRepository.from_session(session)

        existing = await repository.get_enrollment(sequence.id, subscriber_id)
        if (
            existing is not None
            and existing.status == EmailSequenceEnrollmentStatus.active
        ):
            raise AlreadyEnrolled()

        now = utc_now()
        # Recycle a non-active existing enrollment instead of trying to
        # INSERT a second one. The unique constraint on
        # (sequence_id, subscriber_id, deleted_at) covers (active,
        # cancelled, paused, completed) all with deleted_at IS NULL, so
        # a fresh insert would have collided. Resetting the existing
        # row preserves its primary key (and any downstream FK rows)
        # while flipping it back into the active state below.
        recycle = (
            existing
            if existing is not None
            and existing.status != EmailSequenceEnrollmentStatus.active
            else None
        )
        # If the sequence ships an authored flow_doc, the worker walks that
        # tree via flow_index. The initial next_step_at honours an opening
        # wait node so first emails don't fire mid-night for time-of-day
        # gated flows.
        # Resolve subscriber tz (best-effort) so the first send respects it.
        from polar.models.email_subscriber import EmailSubscriber

        from .flow_engine import (
            get_flow_doc,
            initial_flow_index,
            initial_send_at,
        )

        sub = await session.get(EmailSubscriber, subscriber_id)
        sub_tz = getattr(sub, "timezone", None) if sub is not None else None

        flow = get_flow_doc(sequence)
        flow_index: int | None = None
        flow_next_step_id: str | None = None
        if flow is not None:
            flow_index = initial_flow_index(flow)
            # Tree cursor: the first step's id. Tree-shaped flows always set
            # this so the walker uses tree traversal from the start; legacy
            # flat docs also have ids on each step, so it works there too.
            steps = flow.get("steps") or []
            if steps and isinstance(steps[0], dict):
                first_id = steps[0].get("id")
                if isinstance(first_id, str) and first_id:
                    flow_next_step_id = first_id
            first_send = initial_send_at(
                flow,
                sequence.trigger_config,
                now=now,
                subscriber_timezone=sub_tz,
            )
        else:
            first_send = apply_send_window(
                now, sequence.trigger_config, subscriber_timezone=sub_tz
            )

        if recycle is not None:
            # Reset every cursor so the recycled enrollment behaves like
            # a fresh one (start over from the first step / first node).
            recycle.status = EmailSequenceEnrollmentStatus.active
            recycle.current_step_position = 0
            recycle.flow_index = flow_index
            recycle.flow_next_step_id = flow_next_step_id
            recycle.enrolled_at = now
            recycle.next_step_at = first_send
            recycle.completed_at = None
            await session.flush()
            return recycle

        enrollment = EmailSequenceEnrollment(
            sequence_id=sequence.id,
            subscriber_id=subscriber_id,
            status=EmailSequenceEnrollmentStatus.active,
            current_step_position=0,
            flow_index=flow_index,
            flow_next_step_id=flow_next_step_id,
            enrolled_at=now,
            next_step_at=first_send,
        )
        session.add(enrollment)
        await session.flush()
        return enrollment

    async def unenroll(
        self,
        session: AsyncSession,
        sequence_id: UUID,
        subscriber_id: UUID,
    ) -> None:
        repository = EmailSequenceRepository.from_session(session)
        enrollment = await repository.get_enrollment(sequence_id, subscriber_id)
        if enrollment is not None:
            enrollment.status = EmailSequenceEnrollmentStatus.cancelled
            await session.flush()

    async def complete_for_goal(
        self,
        session: AsyncSession,
        organization_id: UUID,
        subscriber_id: UUID,
        *,
        goal_type: str,
        goal_filter: dict | None = None,
    ) -> int:
        """Mark active enrolments complete when a subscriber's customer hits
        the sequence's configured goal.

        Goal lives at `trigger_config.goal_event = {type, ...selectors}`.
        We compare `type` and any selector keys against the event payload.
        Returns the number of enrolments closed.
        """
        repository = EmailSequenceRepository.from_session(session)

        # Pull every active enrolment this subscriber has in this org and
        # check each parent sequence's goal config in-memory. Subscribers are
        # rarely enrolled in many sequences so the N+1 is fine here.
        enrolments = await repository.list_active_enrolments_for_subscriber(
            organization_id, subscriber_id
        )
        completed_count = 0
        for enrolment, sequence in enrolments:
            goal = (sequence.trigger_config or {}).get("goal_event")
            if not isinstance(goal, dict):
                continue
            if goal.get("type") != goal_type:
                continue
            event = goal_filter or {}
            ok = True
            for key, expected in goal.items():
                if key == "type":
                    continue
                if event.get(key) != expected:
                    ok = False
                    break
            if not ok:
                continue
            enrolment.status = EmailSequenceEnrollmentStatus.completed
            enrolment.completed_at = utc_now()
            enrolment.next_step_at = None
            completed_count += 1
        if completed_count:
            await session.flush()
        return completed_count

    async def enroll_for_trigger(
        self,
        session: AsyncSession,
        organization_id: UUID,
        trigger_type: EmailSequenceTriggerType,
        subscriber_id: UUID,
        *,
        trigger_filter: dict | None = None,
        lesson_id: UUID | None = None,
        course_id: UUID | None = None,
    ) -> None:
        """Find all active sequences matching this trigger and enqueue enrollment.

        `lesson_id` narrows the match to sequences scoped to that lesson — used
        by the per-lesson "completes this lesson" trigger so only that lesson's
        automations enrol the subscriber. `course_id` narrows course-lifecycle
        triggers (first lesson / halfway / completed) to that course's sequences.
        """
        repository = EmailSequenceRepository.from_session(session)
        sequences = await repository.get_active_for_org_by_trigger(
            organization_id, trigger_type, lesson_id=lesson_id, course_id=course_id
        )
        from .audience import evaluate_audience
        from .tags import has_any_tag

        # Eagerly hydrate the subscriber once for audience evaluation; every
        # candidate sequence reads from the same row.
        subscriber = None
        for sequence in sequences:
            if not trigger_config_matches(sequence.trigger_config, trigger_filter):
                continue
            flow_doc = (sequence.trigger_config or {}).get("flow_doc")
            audience = flow_doc.get("audience") if isinstance(flow_doc, dict) else None
            # Honour audience.excludeTags from the flow_doc — a subscriber
            # carrying any of those tags is dropped before we enqueue.
            exclude_tags: list[str] = []
            if isinstance(audience, dict):
                tags = audience.get("excludeTags")
                if isinstance(tags, list):
                    exclude_tags = [t for t in tags if isinstance(t, str) and t]
            if exclude_tags and await has_any_tag(session, subscriber_id, exclude_tags):
                continue
            # Only resolve the rule list if the editor switched to "filtered"
            # mode; defaults stay in the no-filter path so we skip the
            # subscriber lookup entirely for "all" audiences.
            if (
                isinstance(audience, dict)
                and audience.get("mode") == "filtered"
                and (audience.get("filters") or [])
            ):
                if subscriber is None:
                    from polar.models.email_subscriber import EmailSubscriber

                    subscriber = await session.get(EmailSubscriber, subscriber_id)
                if subscriber is None:
                    continue
                if not await evaluate_audience(session, subscriber, audience):
                    continue
            enqueue_job(
                "email_sequence.enroll_subscriber",
                sequence_id=sequence.id,
                subscriber_id=subscriber_id,
            )

    # ── Analytics ──────────────────────────────────────────────────────────

    async def get_analytics(
        self,
        session: AsyncReadSession,
        sequence_id: UUID,
    ) -> dict:
        repository = EmailSequenceRepository.from_session(session)
        send_counts = await repository.get_analytics_counts(sequence_id)
        enrollment_counts = await repository.get_enrollment_counts(sequence_id)
        # Read opens/clicks from `opened_at` / `clicked_at` (source of
        # truth) rather than from the status enum, which can lag or be
        # overwritten by late webhooks.
        engagement = await repository.get_engagement_counts(sequence_id)

        delivered = (
            send_counts.get("delivered", 0)
            + send_counts.get("opened", 0)
            + send_counts.get("clicked", 0)
        )
        opened = engagement["opened"]
        clicked = engagement["clicked"]
        total_sent = sum(
            v for k, v in send_counts.items() if k not in ("pending", "failed")
        )
        total_enrolled = sum(enrollment_counts.values())

        return {
            "total_sent": total_sent,
            "delivered": delivered,
            "opened": opened,
            "clicked": clicked,
            "bounced": send_counts.get("bounced", 0),
            "open_rate": (opened / delivered * 100) if delivered > 0 else 0.0,
            "click_rate": (clicked / delivered * 100) if delivered > 0 else 0.0,
            "total_enrolled": total_enrolled,
            "active_enrollments": enrollment_counts.get("active", 0),
            "completed_enrollments": enrollment_counts.get("completed", 0),
        }

    async def get_step_analytics(
        self,
        session: AsyncReadSession,
        sequence_id: UUID,
    ) -> list[dict]:
        """Per-step open / click rates derived from EmailSequenceStepSend rows.

        Delivered counts come from the status enum, but opens/clicks are
        read from `opened_at` / `clicked_at` so out-of-order webhooks
        (e.g. a late bounce after an open, or `email.opened` arriving
        before `email.delivered`) don't silently drop engagement.
        """
        repository = EmailSequenceRepository.from_session(session)
        steps = await repository.list_steps(sequence_id)
        per_step = await repository.get_step_analytics_counts(sequence_id)
        per_step_engagement = await repository.get_step_engagement_counts(sequence_id)

        rows: list[dict] = []
        for step in steps:
            counts = per_step.get(step.id, {})
            engagement = per_step_engagement.get(step.id, {"opened": 0, "clicked": 0})
            delivered = (
                counts.get("delivered", 0)
                + counts.get("opened", 0)
                + counts.get("clicked", 0)
            )
            opened = engagement["opened"]
            clicked = engagement["clicked"]
            sent = sum(v for k, v in counts.items() if k not in ("pending", "failed"))
            rows.append(
                {
                    "step_id": step.id,
                    "sent": sent,
                    "delivered": delivered,
                    "opened": opened,
                    "clicked": clicked,
                    "bounced": counts.get("bounced", 0),
                    "open_rate": (opened / delivered * 100) if delivered else 0.0,
                    "click_rate": (clicked / delivered * 100) if delivered else 0.0,
                }
            )
        return rows

    async def send_test_step(
        self,
        session: AsyncSession,
        step: EmailSequenceStep,
        *,
        to_email: str,
    ) -> None:
        """Enqueue a test-send of this step to a single inbox.

        Routed through Dramatiq (audit issue #50) so the API request returns
        without waiting on Resend; transient delivery failures get the
        worker's retry policy.
        """
        enqueue_job(
            "email_sequence.send_test_step",
            step_id=step.id,
            to_email=to_email,
        )

    async def get_steps(
        self, session: AsyncReadSession, sequence_id: UUID
    ) -> list[EmailSequenceStep]:
        repository = EmailSequenceRepository.from_session(session)
        return await repository.list_steps(sequence_id)

    async def get_enrollments(
        self, session: AsyncReadSession, sequence_id: UUID
    ) -> list[EmailSequenceEnrollment]:
        repository = EmailSequenceRepository.from_session(session)
        return await repository.list_enrollments(sequence_id)


email_sequence = EmailSequenceService()
