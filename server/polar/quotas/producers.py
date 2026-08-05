"""Producer helpers that emit usage events feeding the quotas.

Each producer is called by a domain-specific code path (file upload,
mux webhook, email sender, video playback) and writes one Event row.
The QuotasService aggregates those events to compute usage.

All producer events use `EventSource.system` and the standard event
names listed in `definitions.QUOTA_DEFINITIONS`. User-source events
are deliberately ignored by the aggregation repository so that the
public events API cannot be used to fake quota usage.
"""

from uuid import UUID

import structlog

from polar.models import Event, Organization
from polar.models.event import EventSource
from polar.postgres import AsyncSession

from .definitions import QuotaKey, get_definition
from .service import QuotaCheckResult, quotas

log: structlog.stdlib.BoundLogger = structlog.get_logger()

# Audit-trail event for soft overage on paid tiers. Not a quota-feeding
# event (no QuotaDefinition references it) and not billed automatically —
# it exists so overage volume is queryable from the database instead of
# only greppable from logs.
OVERAGE_EVENT_NAME = "spaire.quota.overage"


def _add_quota_event(
    session: AsyncSession,
    *,
    organization_id: UUID,
    name: str,
    metadata: dict[str, int | str | bool] | None = None,
) -> Event:
    event = Event(
        organization_id=organization_id,
        name=name,
        source=EventSource.system,
        user_metadata=metadata or {},
    )
    session.add(event)
    return event


# ---------------------------------------------------------------------------
# Storage (file uploads / deletes)
# ---------------------------------------------------------------------------


def emit_storage_delta(
    session: AsyncSession,
    *,
    organization_id: UUID,
    bytes_delta: int,
) -> Event:
    """Record a storage usage change. Positive delta on upload, negative
    delta on delete. Use the file's `size` (bytes) directly.

    Called from file/service.py:complete_upload (positive) and
    file/service.py:delete (negative).
    """
    definition = get_definition(QuotaKey.storage_gb)
    return _add_quota_event(
        session,
        organization_id=organization_id,
        name=definition.event_name,
        metadata={"bytes_delta": int(bytes_delta)},
    )


# ---------------------------------------------------------------------------
# Video uploads & views — reserved for PR 10 / PR 11.
# ---------------------------------------------------------------------------


def emit_video_uploaded(
    session: AsyncSession,
    *,
    organization_id: UUID,
    duration_seconds: int,
) -> Event:
    definition = get_definition(QuotaKey.video_hours_hosted)
    return _add_quota_event(
        session,
        organization_id=organization_id,
        name=definition.event_name,
        metadata={"duration_seconds": int(duration_seconds)},
    )


def emit_video_viewed(
    session: AsyncSession,
    *,
    organization_id: UUID,
) -> Event:
    definition = get_definition(QuotaKey.video_views_monthly)
    return _add_quota_event(
        session,
        organization_id=organization_id,
        name=definition.event_name,
    )


# ---------------------------------------------------------------------------
# Enforcement helper — check + raise in one call.
# ---------------------------------------------------------------------------


async def enforce(
    session: AsyncSession,
    organization: Organization,
    quota: QuotaKey,
    *,
    requested_storage_units: int = 1,
) -> QuotaCheckResult:
    """Check the quota and raise QuotaExceededError if disallowed.

    Tier-aware behavior:
      - Free / Legacy: hard-block once usage reaches the limit (matches
        the previous behavior).
      - Pro / Scale: allowed within the tier's overage grace (10% above
        the limit today, see polar/entitlements/tiers.py). The operation
        proceeds and the overage volume is logged via
        ``quotas.enforce.overage`` so operators can reconcile against
        the next platform-subscription invoice. Past the grace ceiling
        the operation still hard-blocks.

    Note on TOCTOU: enforcement is best-effort. We do not lock the
    organization between check and the subsequent producer emit, so
    concurrent uploads can over-allocate by the size of one batch.
    The overshoot is bounded and acceptable at our cost rates;
    backoffice can flag accounts with sustained excess usage.
    """
    from .exceptions import QuotaExceededError

    result = await quotas.check(
        session,
        organization.id,
        quota,
        requested_storage_units=requested_storage_units,
    )
    if not result.allowed:
        log.info(
            "quotas.enforce.blocked",
            organization_id=str(organization.id),
            quota=quota.value,
            used=result.used,
            limit=result.limit,
            requested_storage_units=requested_storage_units,
            overage_storage_units=result.overage_storage_units,
        )
        raise QuotaExceededError(result)
    if result.is_overage:
        log.info(
            "quotas.enforce.overage",
            organization_id=str(organization.id),
            quota=quota.value,
            used=result.used,
            limit=result.limit,
            requested_storage_units=requested_storage_units,
            overage_storage_units=result.overage_storage_units,
        )
        # Durable audit record (a log line is not a billing artifact):
        # one event per overage-consuming operation, so operators can
        # aggregate actual overage per org/quota straight from the
        # events table when reconciling or deciding to bill for it.
        # NOTE: overage is NOT billed automatically today — the platform
        # products carry no metered prices. If overage billing ships,
        # these events are its input.
        _add_quota_event(
            session,
            organization_id=organization.id,
            name=OVERAGE_EVENT_NAME,
            metadata={
                "quota": quota.value,
                "overage_storage_units": int(result.overage_storage_units),
                "requested_storage_units": int(requested_storage_units),
                "limit_display_units": int(result.limit)
                if result.limit is not None
                else 0,
            },
        )
    return result
