"""Flow-doc walker for email sequences.

The new sequence editor stores its authored steps as a flat
`flow_doc.steps` list on `EmailSequence.trigger_config`, where a `branch`
node implicitly consumes its next two siblings as the Yes (i+1) and No
(i+2) paths and the flow resumes at i+3. This module is the worker-side
interpreter of that document.

It runs alongside the legacy email-step walker. A sequence with no
flow_doc still uses the old code path; sequences with a flow_doc use the
walker here. The cursor lives in `EmailSequenceEnrollment.flow_index`.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import datetime, time, timedelta, timezone
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import select

from polar.kit.utils import utc_now
from polar.models.email_sequence import EmailSequence
from polar.models.email_sequence_enrollment import (
    EmailSequenceEnrollment,
    EmailSequenceEnrollmentStatus,
)
from polar.models.email_sequence_step_send import (
    EmailSequenceStepSend,
    EmailSequenceStepSendStatus,
)
from polar.postgres import AsyncSession

from .service import apply_send_window

log = structlog.get_logger()


# ── Flow-doc shape helpers ────────────────────────────────────────────────────


def get_flow_doc(sequence: EmailSequence) -> dict | None:
    """Return the sequence's flow_doc, or None for legacy sequences."""
    cfg = sequence.trigger_config or {}
    flow = cfg.get("flow_doc")
    if not isinstance(flow, dict):
        return None
    if flow.get("version") != 1:
        return None
    if not isinstance(flow.get("steps"), list):
        return None
    return flow


def get_node(flow: dict, index: int) -> dict | None:
    """Look up a step by 0-based index in the *root* steps list.

    Retained for the legacy linear walker. Tree-shaped flow_docs use
    `find_step_in_tree` and friends below.
    """
    steps = flow.get("steps") or []
    if 0 <= index < len(steps):
        node = steps[index]
        if isinstance(node, dict):
            return node
    return None


def is_flow_terminal(flow: dict, index: int) -> bool:
    return get_node(flow, index) is None


# ── Tree traversal (Phase 3b) ────────────────────────────────────────────────


def _arm_children(node: dict, arm: str) -> list[dict]:
    """Return the `yes` or `no` children of a branch node."""
    raw = node.get(arm)
    if isinstance(raw, list):
        return [c for c in raw if isinstance(c, dict)]
    return []


def find_step_in_tree(
    steps: list[dict] | None, target_id: str
) -> dict | None:
    """Depth-first lookup of a step by id, including branch arm children.

    Returns the step dict or None. Used by the engine when an enrollment
    has `flow_next_step_id` set and we need to know what to execute.
    """
    if not steps:
        return None
    for node in steps:
        if not isinstance(node, dict):
            continue
        if node.get("id") == target_id:
            return node
        if node.get("type") == "branch":
            for arm in ("yes", "no"):
                found = find_step_in_tree(_arm_children(node, arm), target_id)
                if found is not None:
                    return found
    return None


def next_after(
    steps: list[dict] | None, target_id: str
) -> str | None:
    """Find the step that follows `target_id` in pre-order traversal,
    crossing branch arm boundaries: when `target_id` is the last step in a
    branch arm we resume at the next sibling of the branch in the parent
    list (not at the start of the No arm — that path is for a different
    subscriber).

    Returns the next step's id, or None when the traversal would walk past
    the end of the entire tree.
    """
    if not steps:
        return None

    def walk(nodes: list[dict], parent_next: str | None) -> tuple[bool, str | None]:
        for i, node in enumerate(nodes):
            if not isinstance(node, dict):
                continue
            sibling_next = (
                nodes[i + 1].get("id")
                if i + 1 < len(nodes)
                and isinstance(nodes[i + 1], dict)
                else parent_next
            )
            if node.get("id") == target_id:
                return True, sibling_next
            if node.get("type") == "branch":
                # Both arms resume at sibling_next on completion.
                for arm in ("yes", "no"):
                    found, after = walk(
                        _arm_children(node, arm), sibling_next
                    )
                    if found:
                        return True, after
        return False, None

    found, after = walk(steps, None)
    return after if found else None


def first_in_arm(
    branch_node: dict, arm: str, parent_next: str | None
) -> str | None:
    """Return the id of the first step in a branch arm; if the arm is
    empty, fall through to whatever comes after the branch in its parent.
    """
    arm_steps = _arm_children(branch_node, arm)
    for node in arm_steps:
        if isinstance(node, dict) and node.get("id"):
            return node["id"]
    return parent_next


# ── Wait helpers ──────────────────────────────────────────────────────────────


def _wait_to_hours(value: dict) -> float:
    if value.get("mode") != "duration":
        return 0.0
    amount = value.get("amount") or 0
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        amount = 0.0
    unit = value.get("unit", "day")
    if unit == "min":
        return amount / 60.0
    if unit == "hour":
        return amount
    if unit == "day":
        return amount * 24.0
    if unit == "week":
        return amount * 24.0 * 7.0
    return 0.0


def _wait_until_time(value: dict, base: datetime) -> datetime:
    """Return the next datetime matching `time` on the requested day offset."""
    offset_map = {"next": 1, "+2": 2, "+3": 3, "+7": 7}
    days = offset_map.get(value.get("dayOffset", "next"), 1)
    raw = value.get("time") or "09:00"
    parts = raw.split(":") if isinstance(raw, str) else []
    try:
        hour = max(0, min(23, int(parts[0]))) if len(parts) >= 1 else 9
        minute = max(0, min(59, int(parts[1]))) if len(parts) >= 2 else 0
    except (TypeError, ValueError):
        hour, minute = 9, 0
    target = base + timedelta(days=days)
    return target.replace(hour=hour, minute=minute, second=0, microsecond=0)


def schedule_wait(
    value: dict,
    *,
    base: datetime,
    sequence_config: dict | None,
    subscriber_timezone: str | None = None,
) -> datetime | None:
    """Compute the next_step_at for a wait node.

    `until-event` returns None — the enrolment is parked until an external
    event fires; once tags / event hooks land, callers will reschedule.
    """
    mode = value.get("mode", "duration")
    if mode == "duration":
        candidate = base + timedelta(hours=_wait_to_hours(value))
    elif mode == "until-time":
        candidate = _wait_until_time(value, base)
    elif mode == "until-event":
        return None
    else:
        candidate = base
    return apply_send_window(
        candidate, sequence_config, subscriber_timezone=subscriber_timezone
    )


# ── Branch evaluation ─────────────────────────────────────────────────────────


async def evaluate_branch(
    session: AsyncSession,
    enrollment: EmailSequenceEnrollment,
    branch_value: dict,
    sequence: EmailSequence | None = None,
) -> bool:
    """Return True for the Yes path, False for No.

    Supports `opened-prev`, `clicked-prev` (against EmailSequenceStepSend),
    `has-tag` (against email_subscriber_tags), `product-bought` (against
    the orders table), `engagement` (rolling-window send activity), and
    the course-progress family — `lesson-completed`, `module-completed`,
    `course-progress`, `course-completed-within` — which read against
    CourseEnrollment / CourseLessonProgress for the sequence's linked
    course (`sequence.course_id`).

    Unknown fields fail closed to the No path (audit issue #14 — the
    previous default-Yes silently routed every subscriber down the
    success branch on a typo, which usually meant "send everyone the
    happy-path email").
    """
    field = branch_value.get("field")
    if field == "opened-prev":
        return await _last_send_reached(
            session,
            enrollment.id,
            min_status=EmailSequenceStepSendStatus.opened,
        )
    if field == "clicked-prev":
        return await _last_send_reached(
            session,
            enrollment.id,
            min_status=EmailSequenceStepSendStatus.clicked,
        )
    if field == "has-tag":
        from .tags import has_tag

        tag = (branch_value.get("tag") or "").strip()
        if not tag:
            return False
        return await has_tag(session, enrollment.subscriber_id, tag)
    if field == "product-bought":
        return await _evaluate_product_bought(
            session, enrollment.subscriber_id, branch_value
        )
    if field == "engagement":
        return await _evaluate_engagement(
            session, enrollment.subscriber_id, branch_value
        )
    if field in (
        "lesson-completed",
        "module-completed",
        "course-progress",
        "course-completed-within",
    ):
        if sequence is None or sequence.course_id is None:
            log.warning(
                "email_sequence.flow.branch_course_without_course_id",
                field=field,
                sequence_id=str(sequence.id) if sequence else None,
                enrollment_id=str(enrollment.id),
            )
            return False
        return await _evaluate_course_progress(
            session,
            enrollment.subscriber_id,
            sequence.course_id,
            field,
            branch_value,
        )
    log.warning(
        "email_sequence.flow.branch_unknown_field",
        field=field,
        enrollment_id=str(enrollment.id),
    )
    return False


async def _evaluate_product_bought(
    session: AsyncSession,
    subscriber_id: UUID,
    branch_value: dict,
) -> bool:
    """True iff the subscriber has at least one paid order for the named
    product. Resolves the subscriber's customer_id then checks Order rows.

    `product` is a UUID string in the branch_value (the editor stores the
    selected product id). Empty/missing product means "any product" — the
    branch yes-path then triggers when the subscriber has any paid order.

    Org scope: customer_id can collide across organizations (it's a UUID,
    but customer rows belong to specific orgs), and product_id is also
    org-scoped. We join through Customer.organization_id and constrain
    to the subscriber's own org so a branch can never read order data
    from a different organization.
    """
    from polar.models.customer import Customer
    from polar.models.email_subscriber import EmailSubscriber
    from polar.models.order import Order, OrderStatus

    subscriber = await session.get(EmailSubscriber, subscriber_id)
    if subscriber is None or subscriber.customer_id is None:
        return False

    product_id_raw = (branch_value.get("product") or "").strip()
    statement = (
        select(Order.id)
        .join(Customer, Customer.id == Order.customer_id)
        .where(
            Order.customer_id == subscriber.customer_id,
            Customer.organization_id == subscriber.organization_id,
            Order.status == OrderStatus.paid,
            Order.deleted_at.is_(None),
        )
    )
    if product_id_raw:
        try:
            product_uuid = UUID(product_id_raw)
        except ValueError:
            log.warning(
                "email_sequence.flow.product_bought_invalid_uuid",
                product=product_id_raw,
            )
            return False
        statement = statement.where(Order.product_id == product_uuid)
    statement = statement.limit(1)
    row = (await session.execute(statement)).first()
    return row is not None


async def _evaluate_engagement(
    session: AsyncSession,
    subscriber_id: UUID,
    branch_value: dict,
) -> bool:
    """Branch on the subscriber's recent engagement signal.

    Re-uses the audience-side `_engagement_score` (0-100, neutral 50 for
    subscribers we have no data on). The branch's `op` and `threshold`
    determine the predicate; defaults are `op=gte` and `threshold=50`,
    which matches the editor's "engaged subscribers" template copy.
    """
    from .audience import _engagement_score

    score = await _engagement_score(session, subscriber_id)
    op = (branch_value.get("op") or "gte").lower()
    try:
        threshold = float(branch_value.get("threshold", 50))
    except (TypeError, ValueError):
        threshold = 50.0

    if op in ("gte", "ge", ">="):
        return score >= threshold
    if op in ("lte", "le", "<="):
        return score <= threshold
    if op in ("gt", ">"):
        return score > threshold
    if op in ("lt", "<"):
        return score < threshold
    if op in ("eq", "is", "=="):
        return abs(score - threshold) < 0.5
    if op in ("ne", "is-not", "!="):
        return abs(score - threshold) >= 0.5
    return score >= threshold


async def _evaluate_course_progress(
    session: AsyncSession,
    subscriber_id: UUID,
    course_id: UUID,
    field: str,
    branch_value: dict,
) -> bool:
    """Course-progress branch family.

    Resolves the subscriber → customer → CourseEnrollment for the sequence's
    course, then answers progress questions against CourseLessonProgress.
    All four predicates fail closed if the subscriber has no customer, no
    enrollment, or the course has no published lessons (so the editor can't
    accidentally route every subscriber down the Yes path for a freshly
    created course with no content yet).
    """
    from sqlalchemy import func

    from polar.models.course_enrollment import CourseEnrollment
    from polar.models.course_lesson import CourseLesson
    from polar.models.course_lesson_progress import CourseLessonProgress
    from polar.models.course_module import CourseModule
    from polar.models.email_subscriber import EmailSubscriber

    subscriber = await session.get(EmailSubscriber, subscriber_id)
    if subscriber is None or subscriber.customer_id is None:
        return False

    enrollment_row = await session.execute(
        select(CourseEnrollment.id, CourseEnrollment.enrolled_at)
        .where(
            CourseEnrollment.customer_id == subscriber.customer_id,
            CourseEnrollment.course_id == course_id,
            CourseEnrollment.deleted_at.is_(None),
        )
        .limit(1)
    )
    enrollment_data = enrollment_row.first()
    if enrollment_data is None:
        return False
    course_enrollment_id, enrolled_at = enrollment_data

    if field == "lesson-completed":
        lesson_raw = (branch_value.get("lesson") or "").strip()
        if not lesson_raw:
            return False
        try:
            lesson_uuid = UUID(lesson_raw)
        except ValueError:
            log.warning(
                "email_sequence.flow.lesson_completed_invalid_uuid",
                lesson=lesson_raw,
            )
            return False
        row = await session.execute(
            select(CourseLessonProgress.id)
            .where(
                CourseLessonProgress.enrollment_id == course_enrollment_id,
                CourseLessonProgress.lesson_id == lesson_uuid,
                CourseLessonProgress.deleted_at.is_(None),
            )
            .limit(1)
        )
        return row.first() is not None

    if field == "module-completed":
        module_raw = (branch_value.get("module") or "").strip()
        if not module_raw:
            return False
        try:
            module_uuid = UUID(module_raw)
        except ValueError:
            log.warning(
                "email_sequence.flow.module_completed_invalid_uuid",
                module=module_raw,
            )
            return False
        # All published lessons in the module must have a progress row.
        # Use scalar subqueries so a module with zero published lessons can
        # never accidentally evaluate to "completed" — both counts must
        # match AND be >= 1.
        total_stmt = (
            select(func.count(CourseLesson.id))
            .join(CourseModule, CourseModule.id == CourseLesson.module_id)
            .where(
                CourseModule.id == module_uuid,
                CourseModule.course_id == course_id,
                CourseModule.deleted_at.is_(None),
                CourseLesson.published.is_(True),
                CourseLesson.deleted_at.is_(None),
            )
        )
        completed_stmt = (
            select(func.count(CourseLessonProgress.id))
            .join(
                CourseLesson, CourseLesson.id == CourseLessonProgress.lesson_id
            )
            .where(
                CourseLessonProgress.enrollment_id == course_enrollment_id,
                CourseLessonProgress.deleted_at.is_(None),
                CourseLesson.module_id == module_uuid,
                CourseLesson.published.is_(True),
                CourseLesson.deleted_at.is_(None),
            )
        )
        total = (await session.execute(total_stmt)).scalar_one()
        if total == 0:
            return False
        completed = (await session.execute(completed_stmt)).scalar_one()
        return completed >= total

    # Both course-progress and course-completed-within need total published
    # lesson count + completed count + completion timestamp for the course.
    total_lessons_stmt = (
        select(func.count(CourseLesson.id))
        .join(CourseModule, CourseModule.id == CourseLesson.module_id)
        .where(
            CourseModule.course_id == course_id,
            CourseModule.deleted_at.is_(None),
            CourseLesson.published.is_(True),
            CourseLesson.deleted_at.is_(None),
        )
    )
    total_lessons = (await session.execute(total_lessons_stmt)).scalar_one()
    if total_lessons == 0:
        return False

    completed_stmt = (
        select(
            func.count(CourseLessonProgress.id),
            func.max(CourseLessonProgress.completed_at),
        )
        .join(CourseLesson, CourseLesson.id == CourseLessonProgress.lesson_id)
        .join(CourseModule, CourseModule.id == CourseLesson.module_id)
        .where(
            CourseLessonProgress.enrollment_id == course_enrollment_id,
            CourseLessonProgress.deleted_at.is_(None),
            CourseModule.course_id == course_id,
            CourseModule.deleted_at.is_(None),
            CourseLesson.published.is_(True),
            CourseLesson.deleted_at.is_(None),
        )
    )
    row = (await session.execute(completed_stmt)).one()
    completed_lessons: int = row[0] or 0
    last_completed_at: datetime | None = row[1]

    if field == "course-progress":
        percent = (completed_lessons / total_lessons) * 100.0
        op = (branch_value.get("op") or "gte").lower()
        try:
            threshold = float(branch_value.get("threshold", 50))
        except (TypeError, ValueError):
            threshold = 50.0
        if op in ("gte", "ge", ">="):
            return percent >= threshold
        if op in ("lte", "le", "<="):
            return percent <= threshold
        if op in ("gt", ">"):
            return percent > threshold
        if op in ("lt", "<"):
            return percent < threshold
        if op in ("eq", "is", "=="):
            return abs(percent - threshold) < 0.5
        return percent >= threshold

    # course-completed-within
    try:
        days = float(branch_value.get("days", 7))
    except (TypeError, ValueError):
        days = 7.0
    op = (branch_value.get("op") or "within").lower()
    course_completed = (
        completed_lessons >= total_lessons and last_completed_at is not None
    )
    if op == "within":
        # Yes = finished AND took <= N days from enrolment ("fast completer").
        if not course_completed or last_completed_at is None:
            return False
        delta = last_completed_at - enrolled_at
        return delta.total_seconds() <= days * 86400
    if op == "over":
        # Yes = at least N days have passed since enrolment and the course is
        # still unfinished ("slow / nurture path"). A subscriber who finished
        # *and* took longer than N days does not enter this branch — the
        # finish event is treated as terminal so the nurture path can't
        # double-send to someone who's already done.
        if course_completed:
            return False
        elapsed = utc_now() - enrolled_at
        return elapsed.total_seconds() >= days * 86400
    log.warning(
        "email_sequence.flow.course_completed_within_unknown_op",
        op=op,
    )
    return False


_STATUS_RANK = {
    EmailSequenceStepSendStatus.pending: 0,
    EmailSequenceStepSendStatus.sent: 1,
    EmailSequenceStepSendStatus.delivered: 2,
    EmailSequenceStepSendStatus.opened: 3,
    EmailSequenceStepSendStatus.clicked: 4,
    EmailSequenceStepSendStatus.bounced: -1,
    EmailSequenceStepSendStatus.failed: -1,
}


async def _last_send_reached(
    session: AsyncSession,
    enrollment_id: UUID,
    *,
    min_status: EmailSequenceStepSendStatus,
) -> bool:
    statement = (
        select(EmailSequenceStepSend.status)
        .where(
            EmailSequenceStepSend.enrollment_id == enrollment_id,
            EmailSequenceStepSend.deleted_at.is_(None),
        )
        .order_by(EmailSequenceStepSend.created_at.desc())
        .limit(1)
    )
    result = await session.execute(statement)
    row = result.first()
    if row is None:
        return False
    status = row[0]
    target = _STATUS_RANK.get(min_status, 0)
    actual = _STATUS_RANK.get(status, 0)
    return actual >= target


# ── Cursor advancement ────────────────────────────────────────────────────────


def advance_after_branch(index: int, took_yes: bool) -> int:
    """Branches consume their next two siblings: Yes at i+1, No at i+2.

    After executing whichever child applies, resume the flow at i+3 so the
    discarded sibling isn't run.
    """
    return index + 3


def advance_linear(index: int) -> int:
    return index + 1


# ── Action handlers ───────────────────────────────────────────────────────────


async def execute_action(
    session: AsyncSession,
    enrollment: EmailSequenceEnrollment,
    action_value: dict,
    *,
    organization_id: UUID | None = None,
) -> None:
    """Execute an action node.

    Supports add-tag, remove-tag, update-field (sets a custom key/value
    on the subscriber), enroll (cross-sequence enrolment), webhook
    (HMAC-signed POST), and notify (Slack incoming webhook).
    """
    action = action_value.get("action")
    if action == "add-tag":
        from .tags import add_tag

        await add_tag(session, enrollment.subscriber_id, action_value.get("tag") or "")
        return
    if action == "remove-tag":
        from .tags import remove_tag

        await remove_tag(
            session, enrollment.subscriber_id, action_value.get("tag") or ""
        )
        return
    if action == "update-field":
        from .custom_fields import set_field

        key = action_value.get("key") or action_value.get("field") or ""
        value = action_value.get("value")
        await set_field(session, enrollment.subscriber_id, key, value)
        return
    if action == "enroll":
        target_id = action_value.get("sequence")
        if target_id:
            from polar.worker import enqueue_job

            enqueue_job(
                "email_sequence.enroll_subscriber",
                sequence_id=UUID(target_id) if isinstance(target_id, str) else target_id,
                subscriber_id=enrollment.subscriber_id,
            )
            log.info(
                "email_sequence.flow.action.enroll",
                target_sequence_id=str(target_id),
                subscriber_id=str(enrollment.subscriber_id),
            )
            return
    if action == "webhook":
        from .webhooks import dispatch_action_webhook

        await dispatch_action_webhook(
            session,
            enrollment=enrollment,
            organization_id=organization_id,
            url=action_value.get("url") or "",
        )
        return
    if action == "notify":
        from .webhooks import dispatch_slack_notify

        await dispatch_slack_notify(
            session,
            enrollment=enrollment,
            organization_id=organization_id,
            text=action_value.get("text"),
            channel=action_value.get("channel"),
        )
        return
    log.info(
        "email_sequence.flow.action.unhandled",
        action=action,
        enrollment_id=str(enrollment.id),
    )


async def execute_goal_node(
    session: AsyncSession,
    enrollment: EmailSequenceEnrollment,
    goal_value: dict,
) -> None:
    """Hitting a goal node mid-flow marks the enrolment as completed and
    halts further sends. The conversion event itself is recorded as the
    `goal.event` string for downstream attribution; analytics consumers
    can read it via the trigger_config.flow_doc."""
    enrollment.status = EmailSequenceEnrollmentStatus.completed
    enrollment.completed_at = utc_now()
    enrollment.next_step_at = None
    log.info(
        "email_sequence.flow.goal_hit",
        event=goal_value.get("event"),
        enrollment_id=str(enrollment.id),
    )


# ── Public entry: walk one node and either send/schedule/advance ──────────────


async def process_one_step(
    session: AsyncSession,
    enrollment: EmailSequenceEnrollment,
    sequence: EmailSequence,
    *,
    send_email_node: Callable[
        [EmailSequence, EmailSequenceEnrollment, dict],
        Awaitable[dict | None],
    ],
) -> None:
    """Walk a single iteration of the flow for `enrollment`.

    Two cursor models in flight (Phase 3b):

    - Tree cursor: `enrollment.flow_next_step_id` points at the next
      step.id in flow_doc. Used for any sequence whose flow_doc has tree-
      shaped branches (yes/no children) or that was authored after the
      Phase 3b migration.
    - Legacy linear cursor: `enrollment.flow_index` is an index into
      the *root* steps list. Retained for in-flight enrollments that
      haven't been advanced past the migration yet — the helper below
      derives a `flow_next_step_id` from the index on first contact.

    The caller commits the session after this returns; the cursor and
    any send-side effects move forward atomically.
    """
    flow = get_flow_doc(sequence)
    if flow is None:
        log.warning(
            "email_sequence.flow.no_doc",
            sequence_id=str(sequence.id),
            enrollment_id=str(enrollment.id),
        )
        return

    # Resolve which cursor we're working with.
    cursor_id = enrollment.flow_next_step_id
    use_tree = cursor_id is not None
    if not use_tree:
        # Translate legacy flow_index → first-step-id for one-shot
        # forward migration. After we land here once, subsequent saves
        # will use flow_next_step_id directly.
        idx = enrollment.flow_index if enrollment.flow_index is not None else 0
        node = get_node(flow, idx)
        if node is None:
            enrollment.status = EmailSequenceEnrollmentStatus.completed
            enrollment.completed_at = utc_now()
            enrollment.next_step_at = None
            return
        cursor_id = node.get("id")
        if cursor_id is not None:
            enrollment.flow_next_step_id = cursor_id

    if cursor_id is None:
        # Defensive: no id at all means we can't traverse. Mark complete.
        enrollment.status = EmailSequenceEnrollmentStatus.completed
        enrollment.completed_at = utc_now()
        enrollment.next_step_at = None
        return

    await _process_one_step_tree(
        session,
        enrollment=enrollment,
        sequence=sequence,
        flow=flow,
        cursor_id=cursor_id,
        send_email_node=send_email_node,
    )


async def _process_one_step_tree(
    session: AsyncSession,
    *,
    enrollment: EmailSequenceEnrollment,
    sequence: EmailSequence,
    flow: dict,
    cursor_id: str,
    send_email_node: Callable[
        [EmailSequence, EmailSequenceEnrollment, dict],
        Awaitable[dict | None],
    ],
) -> None:
    """Tree-walking advancement (Phase 3b)."""
    steps = flow.get("steps") or []
    visited = 0
    while visited < 64:
        visited += 1
        node = find_step_in_tree(steps, cursor_id)
        if node is None:
            # Cursor points at nothing — flow drifted or completed.
            enrollment.status = EmailSequenceEnrollmentStatus.completed
            enrollment.completed_at = utc_now()
            enrollment.next_step_at = None
            enrollment.flow_next_step_id = None
            return

        node_type = node.get("type")
        value = node.get("value") or {}
        after_id = next_after(steps, cursor_id)

        if node_type == "email":
            outcome = await send_email_node(sequence, enrollment, value)
            if isinstance(outcome, dict) and "deferred_until" in outcome:
                deferred = outcome["deferred_until"]
                if isinstance(deferred, datetime):
                    enrollment.next_step_at = deferred
                # Park on the same node — we'll retry the send next tick.
                enrollment.flow_next_step_id = cursor_id
                return
            enrollment.flow_next_step_id = after_id
            enrollment.next_step_at = utc_now() if after_id else None
            if after_id is None:
                enrollment.status = EmailSequenceEnrollmentStatus.completed
                enrollment.completed_at = utc_now()
            return

        if node_type == "wait":
            subscriber_tz = await _subscriber_timezone(
                session, enrollment.subscriber_id
            )
            next_at = schedule_wait(
                value,
                base=utc_now(),
                sequence_config=sequence.trigger_config,
                subscriber_timezone=subscriber_tz,
            )
            enrollment.flow_next_step_id = after_id
            enrollment.next_step_at = next_at
            if after_id is None and next_at is None:
                enrollment.status = EmailSequenceEnrollmentStatus.completed
                enrollment.completed_at = utc_now()
            return

        if node_type == "branch":
            took_yes = await evaluate_branch(
                session, enrollment, value, sequence=sequence
            )
            arm_first = first_in_arm(node, "yes" if took_yes else "no", after_id)
            if arm_first is None:
                # Empty arm + no after-branch sibling → flow ends.
                enrollment.status = EmailSequenceEnrollmentStatus.completed
                enrollment.completed_at = utc_now()
                enrollment.next_step_at = None
                enrollment.flow_next_step_id = None
                return
            cursor_id = arm_first
            enrollment.flow_next_step_id = cursor_id
            continue

        if node_type == "action":
            await execute_action(
                session,
                enrollment,
                value,
                organization_id=sequence.organization_id,
            )
            if after_id is None:
                enrollment.status = EmailSequenceEnrollmentStatus.completed
                enrollment.completed_at = utc_now()
                enrollment.next_step_at = None
                enrollment.flow_next_step_id = None
                return
            cursor_id = after_id
            enrollment.flow_next_step_id = cursor_id
            continue

        if node_type == "goal":
            await execute_goal_node(session, enrollment, value)
            enrollment.flow_next_step_id = None
            return

        log.warning(
            "email_sequence.flow.unknown_node_type",
            node_type=node_type,
            enrollment_id=str(enrollment.id),
        )
        if after_id is None:
            enrollment.status = EmailSequenceEnrollmentStatus.completed
            enrollment.completed_at = utc_now()
            enrollment.next_step_at = None
            enrollment.flow_next_step_id = None
            return
        cursor_id = after_id
        enrollment.flow_next_step_id = cursor_id

    log.warning(
        "email_sequence.flow.advance_cap_hit",
        enrollment_id=str(enrollment.id),
        sequence_id=str(sequence.id),
    )


# ── Legacy linear walker (retained for in-flight enrollments) ────────────────


async def _legacy_process_linear(
    session: AsyncSession,
    enrollment: EmailSequenceEnrollment,
    sequence: EmailSequence,
    flow: dict,
    send_email_node: Callable[
        [EmailSequence, EmailSequenceEnrollment, dict],
        Awaitable[dict | None],
    ],
) -> None:
    """Untouched flat-array walker. Reachable only when an enrollment has
    `flow_index` set but `flow_next_step_id` unset *and* the caller routes
    here explicitly — the new entry point migrates to the tree cursor on
    first contact, so this path is dead code in practice. Kept for one
    release in case we discover an edge case in the migration we need to
    revert to the old behaviour.
    """
    index = enrollment.flow_index if enrollment.flow_index is not None else 0
    visited = 0
    # Defensive cap: long action/goal chains advance synchronously, but a
    # malformed doc could loop. 64 is plenty for any realistic authored flow.
    while visited < 64:
        visited += 1
        node = get_node(flow, index)
        if node is None:
            enrollment.status = EmailSequenceEnrollmentStatus.completed
            enrollment.completed_at = utc_now()
            enrollment.next_step_at = None
            enrollment.flow_index = index
            return

        node_type = node.get("type")
        value = node.get("value") or {}

        if node_type == "email":
            # Sending is delegated; the callback may return
            # `{"deferred_until": datetime}` to signal a frequency-cap
            # throttle. In that case we leave flow_index where it is and
            # park the enrolment until the deferral time.
            outcome = await send_email_node(sequence, enrollment, value)
            if isinstance(outcome, dict) and "deferred_until" in outcome:
                deferred = outcome["deferred_until"]
                if isinstance(deferred, datetime):
                    enrollment.next_step_at = deferred
                return
            enrollment.flow_index = advance_linear(index)
            enrollment.next_step_at = utc_now()
            return

        if node_type == "wait":
            subscriber_tz = await _subscriber_timezone(
                session, enrollment.subscriber_id
            )
            next_at = schedule_wait(
                value,
                base=utc_now(),
                sequence_config=sequence.trigger_config,
                subscriber_timezone=subscriber_tz,
            )
            enrollment.flow_index = advance_linear(index)
            enrollment.next_step_at = next_at
            return

        if node_type == "branch":
            branch_index = index
            took_yes = await evaluate_branch(
                session, enrollment, value, sequence=sequence
            )
            child_index = branch_index + (1 if took_yes else 2)
            child = get_node(flow, child_index)
            post_branch_index = branch_index + 3
            if child is None:
                index = post_branch_index
                enrollment.flow_index = index
                continue
            child_type = child.get("type")
            child_value = child.get("value") or {}
            if child_type == "email":
                outcome = await send_email_node(sequence, enrollment, child_value)
                if isinstance(outcome, dict) and "deferred_until" in outcome:
                    deferred = outcome["deferred_until"]
                    if isinstance(deferred, datetime):
                        enrollment.next_step_at = deferred
                    return
                enrollment.flow_index = post_branch_index
                enrollment.next_step_at = utc_now()
                return
            if child_type == "wait":
                subscriber_tz = await _subscriber_timezone(
                    session, enrollment.subscriber_id
                )
                next_at = schedule_wait(
                    child_value,
                    base=utc_now(),
                    sequence_config=sequence.trigger_config,
                    subscriber_timezone=subscriber_tz,
                )
                enrollment.flow_index = post_branch_index
                enrollment.next_step_at = next_at
                return
            if child_type == "action":
                await execute_action(
                    session,
                    enrollment,
                    child_value,
                    organization_id=sequence.organization_id,
                )
                index = post_branch_index
                enrollment.flow_index = index
                continue
            if child_type == "goal":
                await execute_goal_node(session, enrollment, child_value)
                return
            # Nested branches and unknown types: skip the branch group.
            index = post_branch_index
            enrollment.flow_index = index
            continue

        if node_type == "action":
            await execute_action(
                session,
                enrollment,
                value,
                organization_id=sequence.organization_id,
            )
            index = advance_linear(index)
            enrollment.flow_index = index
            continue

        if node_type == "goal":
            await execute_goal_node(session, enrollment, value)
            return

        log.warning(
            "email_sequence.flow.unknown_node_type",
            node_type=node_type,
            enrollment_id=str(enrollment.id),
        )
        index = advance_linear(index)
        enrollment.flow_index = index

    log.warning(
        "email_sequence.flow.advance_cap_hit",
        enrollment_id=str(enrollment.id),
        sequence_id=str(sequence.id),
    )


# ── Flow-doc helpers used at enrolment time ──────────────────────────────────


def initial_flow_index(flow: dict) -> int:
    """Where a fresh enrolment starts. Always 0 today."""
    _ = flow
    return 0


async def _subscriber_timezone(
    session: AsyncSession, subscriber_id: UUID
) -> str | None:
    from polar.models.email_subscriber import EmailSubscriber

    subscriber = await session.get(EmailSubscriber, subscriber_id)
    if subscriber is None:
        return None
    return getattr(subscriber, "timezone", None)


def initial_send_at(
    flow: dict,
    sequence_config: dict | None,
    *,
    now: datetime | None = None,
    subscriber_timezone: str | None = None,
) -> datetime | None:
    """Worker picks up the enrolment at this time and walks from index 0.

    We don't preemptively defer for opening waits — the worker handles the
    wait node itself on first tick, which avoids double-applying delays."""
    _ = flow
    base = now or utc_now()
    return apply_send_window(
        base, sequence_config, subscriber_timezone=subscriber_timezone
    )


# Unused-imports guard — these stay imported so static analysers see the
# datetime/time symbols used in helpers above (time only used implicitly
# through datetime.replace).
__all__ = [
    "advance_after_branch",
    "advance_linear",
    "evaluate_branch",
    "execute_action",
    "execute_goal_node",
    "get_flow_doc",
    "get_node",
    "initial_flow_index",
    "initial_send_at",
    "is_flow_terminal",
    "process_one_step",
    "schedule_wait",
]
_ = time  # silence unused-import; replace() below uses datetime API
_ = (datetime, timezone)
_ = Any
