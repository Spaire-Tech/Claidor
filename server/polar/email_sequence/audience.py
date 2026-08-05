"""Audience filter evaluation for email sequences.

The new sequence editor authors a list of filter rules under
`flow_doc.audience.filters`, plus an `excludeTags` list. enroll_for_trigger
already drops subscribers whose tags overlap excludeTags; this module adds
the rest of the rule evaluation (tag / source / subscribed-for / engagement
/ country) so the editor's "Only subscribers who match…" mode is enforced.

Every rule must pass for the subscriber to be eligible — the design's
"Where … And …" copy is the AND semantics. Rules with unknown fields or
operators default to pass-through so authoring an unsupported filter
doesn't accidentally lock everyone out.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import func, select

from polar.kit.utils import utc_now
from polar.models.email_sequence_step_send import (
    EmailSequenceStepSend,
    EmailSequenceStepSendStatus,
)
from polar.models.email_subscriber import EmailSubscriber
from polar.postgres import AsyncSession

log = structlog.get_logger()


def _norm(v: Any) -> str:
    return (str(v) if v is not None else "").strip().lower()


def _parse_days(value: Any) -> int | None:
    """Accept '30', '30d', '7 days', or plain int — return integer days."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    s = str(value).strip().lower()
    if not s:
        return None
    digits = ""
    for ch in s:
        if ch.isdigit():
            digits += ch
        else:
            break
    if not digits:
        return None
    try:
        return int(digits)
    except ValueError:
        return None


async def evaluate_audience(
    session: AsyncSession,
    subscriber: EmailSubscriber,
    audience: dict | None,
) -> bool:
    """Return True if the subscriber matches the audience config.

    Mode `all` (or missing config) → True. Mode `filtered` runs every rule;
    every rule must pass.
    """
    if not isinstance(audience, dict):
        return True
    mode = audience.get("mode")
    if mode != "filtered":
        return True
    rules = audience.get("filters") or []
    if not isinstance(rules, list):
        return True
    for rule in rules:
        if not isinstance(rule, dict):
            continue
        ok = await _evaluate_rule(session, subscriber, rule)
        if not ok:
            return False
    return True


async def _evaluate_rule(
    session: AsyncSession,
    subscriber: EmailSubscriber,
    rule: dict,
) -> bool:
    field = rule.get("field")
    op = rule.get("op", "is")
    value = rule.get("value")

    if field == "tag":
        return await _eval_tag(session, subscriber.id, op, value)
    if field == "source":
        return _eval_string(getattr(subscriber, "source", None), op, value)
    if field == "subscribed-for":
        return _eval_subscribed_for(subscriber, op, value)
    if field == "engagement":
        score = await _engagement_score(session, subscriber.id)
        return _eval_numeric(score, op, value)
    if field == "country":
        return await _eval_country(session, subscriber, op, value)

    log.debug(
        "email_sequence.audience.unknown_field",
        field=field,
        subscriber_id=str(subscriber.id),
    )
    return True


async def _eval_country(
    session: AsyncSession,
    subscriber: EmailSubscriber,
    op: str,
    value: Any,
) -> bool:
    """Country filter — resolves the subscriber's country from the linked
    Customer's billing_address, since EmailSubscriber itself doesn't store
    a country column. ISO-alpha-2 strings are compared case-insensitively.

    Pass-through when the subscriber has no linked customer or no billing
    address — without a signal we don't have grounds to exclude them.
    `is-not` returns True in that case for the same reason (filtering out
    "not US" against an unknown country is meaningless).
    """
    if subscriber.customer_id is None:
        return True
    from polar.models.customer import Customer

    customer = await session.get(Customer, subscriber.customer_id)
    if customer is None:
        return True
    address = getattr(customer, "billing_address", None)
    actual = getattr(address, "country", None) if address is not None else None
    if not actual:
        return True
    return _eval_string(actual, op, value)


async def _eval_tag(
    session: AsyncSession, subscriber_id: UUID, op: str, value: Any
) -> bool:
    from .tags import has_any_tag, has_tag, list_tags

    needle = _norm(value)
    if not needle:
        return True
    if op == "is":
        return await has_tag(session, subscriber_id, needle)
    if op == "is-not":
        return not await has_tag(session, subscriber_id, needle)
    if op == "contains":
        # Substring match against the subscriber's tag set.
        tags = await list_tags(session, subscriber_id)
        return any(needle in t.lower() for t in tags)
    # Unknown op → fall back to membership.
    return await has_any_tag(session, subscriber_id, [needle])


def _eval_string(actual: Any, op: str, value: Any) -> bool:
    a = _norm(actual)
    b = _norm(value)
    if op == "is":
        return a == b
    if op == "is-not":
        return a != b
    if op == "contains":
        return b in a if b else True
    return True


def _eval_subscribed_for(
    subscriber: EmailSubscriber, op: str, value: Any
) -> bool:
    days = _parse_days(value)
    if days is None:
        return True
    created = subscriber.created_at
    if created is None:
        return False
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    elapsed_days = (utc_now() - created).total_seconds() / 86400.0
    if op == "is":
        return abs(elapsed_days - days) < 1.0
    if op == "is-not":
        return abs(elapsed_days - days) >= 1.0
    if op == "gte":
        return elapsed_days >= days
    return True


def _eval_numeric(actual: float, op: str, value: Any) -> bool:
    try:
        threshold = float(value)
    except (TypeError, ValueError):
        return True
    if op == "is":
        return abs(actual - threshold) < 0.5
    if op == "is-not":
        return abs(actual - threshold) >= 0.5
    if op == "gte":
        return actual >= threshold
    if op == "lte":
        return actual <= threshold
    if op == "eq":
        return abs(actual - threshold) < 0.5
    return True


async def _engagement_score(
    session: AsyncSession, subscriber_id: UUID, *, window_days: int = 30
) -> float:
    """Simple engagement score in [0, 100].

    Counts sequence step sends in the window; opens count for 1 point,
    clicks for 3, sends for 0.2 (just so super-active subscribers without
    explicit opens still register). Result is clamped 0-100. If we have
    nothing for the subscriber, return 50 (neutral) so a missing signal
    doesn't accidentally exclude someone.
    """
    cutoff = utc_now() - timedelta(days=window_days)
    # Opens/clicks come from the timestamp columns rather than status —
    # status can drift when webhooks arrive out of order or when a late
    # bounce overwrites engagement, which would understate the score.
    statement = select(
        func.count(EmailSequenceStepSend.id)
        .filter(
            EmailSequenceStepSend.status.in_(
                (
                    EmailSequenceStepSendStatus.sent,
                    EmailSequenceStepSendStatus.delivered,
                    EmailSequenceStepSendStatus.opened,
                    EmailSequenceStepSendStatus.clicked,
                )
            )
        )
        .label("sent_total"),
        func.count(EmailSequenceStepSend.id)
        .filter(EmailSequenceStepSend.opened_at.is_not(None))
        .label("opens"),
        func.count(EmailSequenceStepSend.id)
        .filter(EmailSequenceStepSend.clicked_at.is_not(None))
        .label("clicks"),
    ).where(
        EmailSequenceStepSend.subscriber_id == subscriber_id,
        EmailSequenceStepSend.deleted_at.is_(None),
        EmailSequenceStepSend.created_at >= cutoff,
    )
    row = (await session.execute(statement)).one()
    sent_total = int(row[0] or 0)
    opens = int(row[1] or 0)
    clicks = int(row[2] or 0)
    if sent_total == 0:
        return 50.0
    raw = (opens / sent_total) * 70.0 + (clicks / sent_total) * 30.0
    return max(0.0, min(100.0, raw))


_ = datetime  # silence unused-import; helpers above use the type indirectly
