"""Read-only quotas service.

Wraps the entitlements service (which gives the tier-defined limit) and
the event aggregation repository (which gives current usage) to answer
two questions:

  1. What's the current usage for quota X on org Y?
  2. Would emitting `requested` more storage units of quota X exceed the
     cap?

Producers (file upload, email send, mux webhook, video play) call
`check_quota()` before doing the work and act on `result.allowed`:

    # Storage producer: passes the file size in bytes.
    result = await quotas.check(
        session, org_id, QuotaKey.storage_gb,
        requested_storage_units=file.size,
    )
    if not result.allowed:
        raise QuotaExceededError(result)

`used`/`limit`/`remaining` on the result are exposed in DISPLAY units
(GB, hours, count) for UI rendering; arithmetic on the check path is
done in STORAGE units (bytes, seconds, count) for precision.

Enforcement policy (block vs. overage-bill) is a downstream decision —
this service only reports facts.
"""

from dataclasses import dataclass
from uuid import UUID

from polar.entitlements.service import entitlements as entitlements_service
from polar.entitlements.tiers import TierEntitlements
from polar.postgres import AsyncReadSession

from .definitions import QuotaKey, get_definition
from .repository import quota_event_repository


@dataclass(frozen=True)
class QuotaUsage:
    """Snapshot of one quota for one organization, in display units."""

    quota: QuotaKey
    limit: int | None  # display units; None = unlimited
    used: int  # display units (floor of storage / units_per_display)
    remaining: int | None  # display units; None = unlimited
    used_storage_units: int  # for callers that need precise arithmetic
    # Exact usage in display units (e.g. 0.87 GB). The floored `used`
    # renders anything under one display unit as a flat 0 — which the
    # dashboard shows as an empty bar even when there is real usage.
    used_exact: float = 0.0

    @property
    def is_unlimited(self) -> bool:
        return self.limit is None

    @property
    def is_exceeded(self) -> bool:
        return self.limit is not None and self.used >= self.limit


@dataclass(frozen=True)
class QuotaCheckResult:
    """Decision for a single check-then-emit operation."""

    quota: QuotaKey
    allowed: bool
    limit: int | None  # display units; None = unlimited
    used: int  # display units
    requested_storage_units: int  # what the producer asked to consume
    remaining: int | None  # display units; None = unlimited
    reason: str
    # Storage units past the tier limit, after this operation would have
    # consumed `requested_storage_units`. 0 when under the limit. Positive
    # when within overage grace ("soft" overage) and the operation is
    # still allowed. Positive AND `allowed=False` when past grace too.
    overage_storage_units: int = 0

    @property
    def is_unlimited(self) -> bool:
        return self.limit is None

    @property
    def is_overage(self) -> bool:
        return self.overage_storage_units > 0


def _limit_for(entitlements: TierEntitlements, quota: QuotaKey) -> int | None:
    mapping = {
        QuotaKey.video_hours_hosted: entitlements.limits.video_hours_hosted,
        QuotaKey.video_views_monthly: entitlements.limits.video_views_monthly,
        QuotaKey.storage_gb: entitlements.limits.storage_gb,
    }
    return mapping[quota]


class QuotasService:
    async def get_usage(
        self,
        session: AsyncReadSession,
        organization_id: UUID,
        quota: QuotaKey,
    ) -> QuotaUsage:
        entitlements = await entitlements_service.get_for_organization(
            session, organization_id
        )
        limit_display = _limit_for(entitlements, quota)

        definition = get_definition(quota)
        repository = quota_event_repository(session)
        used_storage = await repository.get_quota_usage_storage_units(
            organization_id=organization_id, definition=definition
        )
        used_display = used_storage // definition.storage_units_per_display_unit

        remaining_display: int | None
        if limit_display is None:
            remaining_display = None
        else:
            remaining_display = max(limit_display - used_display, 0)

        return QuotaUsage(
            quota=quota,
            limit=limit_display,
            used=used_display,
            remaining=remaining_display,
            used_storage_units=used_storage,
            used_exact=round(
                used_storage / definition.storage_units_per_display_unit, 2
            ),
        )

    async def get_all_usage(
        self,
        session: AsyncReadSession,
        organization_id: UUID,
    ) -> dict[QuotaKey, QuotaUsage]:
        result: dict[QuotaKey, QuotaUsage] = {}
        for quota in QuotaKey:
            result[quota] = await self.get_usage(session, organization_id, quota)
        return result

    async def check(
        self,
        session: AsyncReadSession,
        organization_id: UUID,
        quota: QuotaKey,
        *,
        requested_storage_units: int = 1,
    ) -> QuotaCheckResult:
        """Returns a QuotaCheckResult.

        `requested_storage_units` is in the quota's storage unit:
          - bytes for storage_gb
          - seconds for video_hours_hosted
          - count for video_views_monthly
        Producers always know the precise amount they want to consume,
        so this is the natural interface.

        Tier-aware grace:
          - Free / Legacy: hard-block at the limit (grace = 0%).
          - Pro / Scale: allow up to (limit * (1 + grace_pct / 100));
            the operation is `allowed=True` with positive
            `overage_storage_units` so the caller can record the
            soft overage for billing.
        """
        usage = await self.get_usage(session, organization_id, quota)

        if usage.limit is None:
            return QuotaCheckResult(
                quota=quota,
                allowed=True,
                limit=None,
                used=usage.used,
                requested_storage_units=requested_storage_units,
                remaining=None,
                reason="unlimited",
            )

        definition = get_definition(quota)
        limit_storage = usage.limit * definition.storage_units_per_display_unit
        projected_storage = usage.used_storage_units + requested_storage_units

        # Tier-defined overage grace lets paid plans temporarily exceed
        # their limit so creators are not blocked by a single byte.
        entitlements_dataclass = await entitlements_service.get_for_organization(
            session, organization_id
        )
        grace_pct = entitlements_dataclass.overage_grace_pct
        grace_limit_storage = limit_storage + (limit_storage * grace_pct // 100)

        overage_storage = max(projected_storage - limit_storage, 0)

        if projected_storage > grace_limit_storage:
            return QuotaCheckResult(
                quota=quota,
                allowed=False,
                limit=usage.limit,
                used=usage.used,
                requested_storage_units=requested_storage_units,
                remaining=usage.remaining,
                reason="exceeded",
                overage_storage_units=overage_storage,
            )

        if overage_storage > 0:
            return QuotaCheckResult(
                quota=quota,
                allowed=True,
                limit=usage.limit,
                used=usage.used,
                requested_storage_units=requested_storage_units,
                remaining=usage.remaining,
                reason="overage",
                overage_storage_units=overage_storage,
            )

        return QuotaCheckResult(
            quota=quota,
            allowed=True,
            limit=usage.limit,
            used=usage.used,
            requested_storage_units=requested_storage_units,
            remaining=usage.remaining,
            reason="ok",
            overage_storage_units=0,
        )


quotas = QuotasService()
