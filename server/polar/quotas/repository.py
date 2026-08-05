from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import Float, cast, func, select

from polar.kit.repository import RepositoryBase
from polar.models import Event
from polar.models.event import EventSource
from polar.postgres import AsyncReadSession

from .definitions import QuotaDefinition


def _start_of_current_month_utc() -> datetime:
    now = datetime.now(UTC)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


class _QuotaEventRepository(RepositoryBase[Event]):
    model = Event

    async def get_quota_usage_storage_units(
        self,
        *,
        organization_id: UUID,
        definition: QuotaDefinition,
    ) -> int:
        """Aggregate matching events for an organization and return usage
        in storage units (bytes for storage_gb, seconds for video hours,
        count for email/view quotas).

        Display-unit conversion is the service's responsibility — callers
        wanting "GB" or "hours" go through QuotasService.

        - Aggregation `count` returns the number of matching events.
        - Aggregation `sum` reads `user_metadata.<aggregation_property>`
          as a float and sums it.
        - Scope `monthly` restricts events to the current UTC calendar month.
        """
        base = select().where(
            Event.organization_id == organization_id,
            Event.name == definition.event_name,
            # Use system events only — these are emitted by Spaire's own
            # producers (file uploads, mux webhooks, email sender). User-
            # submitted events with the same name should not be counted.
            Event.source == EventSource.system,
        )

        if definition.scope == "monthly":
            base = base.where(Event.timestamp >= _start_of_current_month_utc())

        if definition.aggregation == "count":
            statement = base.with_only_columns(func.count(Event.id))
        else:
            assert definition.aggregation_property is not None
            value = cast(
                Event.user_metadata[definition.aggregation_property].astext,
                Float,
            )
            statement = base.with_only_columns(func.coalesce(func.sum(value), 0))

        result = await self.session.execute(statement)
        raw = result.scalar_one() or 0
        # Clamp at zero. Producers can emit negative deltas (e.g. file
        # delete), but the running total dropping below zero would be a
        # producer bug and must never let a creator "earn" extra quota.
        return max(int(raw), 0)


def quota_event_repository(session: AsyncReadSession) -> _QuotaEventRepository:
    return _QuotaEventRepository.from_session(session)
