"""End-of-life owner for legacy card-less trials.

The old design auto-created local trialing subscriptions
(``user_metadata.managed_by = "trial"``, no payment method) at org
signup. Those rows are excluded from the billing scheduler on purpose,
and the cron that used to end them (``platform.expire_trials``) was
deleted with the card-required trial redesign — stranding any leftover
row in ``trialing`` forever: never charged, never lapsed, paid
entitlements granted for free, dashboard showing a stale trial date.

``lapse_stale_legacy_trials`` is the reinstated owner: it revokes
expired legacy trials through the real subscription service (webhooks,
benefit revocation, and fee resync all fire) and stamps
``trial_consumed_at`` on every customer who ever held one, so none of
them is handed a second free trial on re-subscribe.
"""

import structlog

from polar.exceptions import PolarError
from polar.kit.utils import utc_now
from polar.postgres import AsyncSession

from .repository import platform_subscription_repository
from .service import platform as platform_service

log: structlog.stdlib.BoundLogger = structlog.get_logger()


async def lapse_stale_legacy_trials(session: AsyncSession) -> dict[str, int]:
    """Revoke expired legacy trials and backfill trial-consumed stamps.

    Idempotent: revoked rows stop matching the query, and the stamp is
    written at most once per customer. Returns counters for logging.
    """
    from polar.subscription.service import subscription as subscription_service

    counters = {"lapsed": 0, "trial_consumed_stamped": 0, "markers_healed": 0}
    repository = platform_subscription_repository(session)

    # Data repair, runs regardless of platform configuration: legacy
    # list-encoded reminder markers crash webhook serialization for any
    # lifecycle event on the row (see
    # trial_notifications.normalize_reminder_markers_metadata). Heal them
    # in bulk so stuck cycle retries succeed without waiting to be
    # individually touched.
    counters[
        "markers_healed"
    ] = await repository.normalize_legacy_reminder_marker_metadata()

    if not platform_service.is_configured():
        return counters

    platform_org_id = platform_service.get_id()
    now = utc_now()

    for subscription in await repository.list_stale_legacy_trials(
        platform_org_id, before=now
    ):
        try:
            await subscription_service.revoke(session, subscription)
        except PolarError as exc:
            # A row that raced into a non-cancelable state (e.g. another
            # worker just revoked it) is fine — it won't match next run.
            log.warning(
                "platform.lapse_legacy_trials.revoke_failed",
                subscription_id=str(subscription.id),
                error=str(exc),
            )
            continue
        counters["lapsed"] += 1
        log.info(
            "platform.lapse_legacy_trials.lapsed",
            subscription_id=str(subscription.id),
            customer_id=str(subscription.customer_id),
            trial_end=subscription.trial_end.isoformat()
            if subscription.trial_end
            else None,
        )

    # Backfill: every customer who ever held a legacy trial (any status)
    # has consumed their one free trial. Without this stamp, the
    # upgrade-checkout flow would grant them a fresh 14 days.
    for customer in await repository.list_legacy_trial_customers_missing_consumed(
        platform_org_id
    ):
        metadata = dict(customer.user_metadata or {})
        if metadata.get("trial_consumed_at"):
            continue
        metadata["trial_consumed_at"] = now.isoformat()
        customer.user_metadata = metadata
        counters["trial_consumed_stamped"] += 1

    await session.flush()
    return counters
