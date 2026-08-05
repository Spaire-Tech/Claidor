"""Send threshold-warning emails to org admins when their tier quotas
approach (80%) or hit (100%) the cap.

Runs as a daily cron actor (`quotas.notify_thresholds`). The check is
idempotent — a row in `quota_notifications` records that we've already
sent for a given (org, quota, threshold, period). For monthly quotas
the period key resets each calendar month so notifications fire once
per month. For lifetime quotas the period key is the constant
"lifetime"; the cron deletes the row when usage drops back below the
threshold so future crossings re-fire.
"""

import logging
from datetime import UTC, datetime
from uuid import UUID

import structlog

from polar.email.sender import enqueue_email
from polar.models import Organization, QuotaNotification
from polar.organization.repository import OrganizationRepository
from polar.postgres import AsyncSession

from .definitions import QuotaKey, get_definition
from .notification_repository import quota_notification_repository
from .service import QuotaUsage, quotas

log: structlog.stdlib.BoundLogger = structlog.get_logger()
logging.getLogger(__name__)


_HUMAN_LABEL: dict[QuotaKey, tuple[str, str]] = {
    QuotaKey.video_hours_hosted: ("video hosting", "hours"),
    QuotaKey.video_views_monthly: ("video views this month", "views"),
    QuotaKey.storage_gb: ("file storage", "GB"),
}

_THRESHOLDS = (80, 100)


def _period_key(quota: QuotaKey, now: datetime) -> str:
    definition = get_definition(quota)
    if definition.scope == "monthly":
        return now.strftime("%Y-%m")
    return "lifetime"


def _percent(usage: QuotaUsage) -> int | None:
    """Usage as an integer percent of the limit, or None when unlimited."""
    if usage.limit is None or usage.limit == 0:
        return None
    return int(usage.used * 100 / usage.limit)


def _render_email(
    organization: Organization,
    usage: QuotaUsage,
    threshold: int,
) -> tuple[str, str]:
    label, unit = _HUMAN_LABEL.get(usage.quota, (usage.quota.value, "units"))
    limit = usage.limit if usage.limit is not None else "unlimited"

    if threshold >= 100:
        subject = f"You've reached your Spaire {label} limit"
        headline = (
            f"Your organization has used {usage.used} of {limit} {unit} of "
            f"{label}. New activity for this quota is blocked on your "
            "current plan."
        )
    else:
        subject = f"You're approaching your Spaire {label} limit"
        headline = (
            f"Your organization has used {usage.used} of {limit} {unit} of "
            f"{label} ({threshold}% of the cap)."
        )

    html_content = (
        "<!DOCTYPE html>"
        "<html><body style=\"font-family:sans-serif;line-height:1.5;\">"
        f"<h2>{subject}</h2>"
        f"<p>Hi {organization.name},</p>"
        f"<p>{headline}</p>"
        "<p>Upgrade your Spaire plan to raise this limit.</p>"
        "<p>— Spaire</p>"
        "</body></html>"
    )
    return subject, html_content


async def _notify(
    session: AsyncSession,
    organization: Organization,
    usage: QuotaUsage,
    threshold: int,
    period_key: str,
) -> bool:
    """Send the threshold email and record the notification. Returns
    True if the email was actually enqueued."""
    organization_repository = OrganizationRepository.from_session(session)
    admin_user = await organization_repository.get_admin_user(session, organization)
    if admin_user is None:
        # No admin user resolves — skip the email but still record the
        # notification so we don't keep retrying every cron pass.
        log.info(
            "quotas.notify.no_admin",
            organization_id=str(organization.id),
            quota=usage.quota.value,
            threshold=threshold,
        )
    else:
        subject, html_content = _render_email(organization, usage, threshold)
        enqueue_email(
            to_email_addr=admin_user.email,
            subject=subject,
            html_content=html_content,
        )

    repository = quota_notification_repository(session)
    notification = QuotaNotification(
        organization_id=organization.id,
        quota_key=usage.quota.value,
        threshold=threshold,
        period_key=period_key,
    )
    session.add(notification)
    await session.flush()
    return admin_user is not None


async def check_organization(
    session: AsyncSession, organization: Organization
) -> dict[str, int]:
    """Evaluate every gated quota for this organization and emit emails
    for newly-crossed thresholds. Returns a counter dict suitable for
    structured logging.
    """
    now = datetime.now(UTC)
    repository = quota_notification_repository(session)
    counters = {"notified": 0, "already_sent": 0, "cleared": 0, "below": 0}

    for quota in QuotaKey:
        usage = await quotas.get_usage(session, organization.id, quota)
        if usage.limit is None:
            # Unlimited tier — no thresholds to cross.
            counters["below"] += 1
            continue

        percent = _percent(usage)
        if percent is None:
            counters["below"] += 1
            continue

        period_key = _period_key(quota, now)
        definition = get_definition(quota)

        for threshold in _THRESHOLDS:
            existing = await repository.get_by_key(
                organization_id=organization.id,
                quota_key=quota.value,
                threshold=threshold,
                period_key=period_key,
            )
            if percent >= threshold:
                if existing is not None:
                    counters["already_sent"] += 1
                    continue
                await _notify(session, organization, usage, threshold, period_key)
                counters["notified"] += 1
            else:
                # For lifetime quotas, clear the old notification row so
                # the next crossing can fire again. Monthly quotas reset
                # naturally via period_key rollover.
                if (
                    definition.scope == "lifetime"
                    and existing is not None
                ):
                    await repository.delete_lifetime_for(
                        organization_id=organization.id,
                        quota_key=quota.value,
                        threshold=threshold,
                    )
                    counters["cleared"] += 1
                else:
                    counters["below"] += 1

    return counters


async def check_organization_by_id(
    session: AsyncSession, organization_id: UUID
) -> dict[str, int] | None:
    organization_repository = OrganizationRepository.from_session(session)
    organization = await organization_repository.get_by_id(organization_id)
    if organization is None:
        return None
    return await check_organization(session, organization)
