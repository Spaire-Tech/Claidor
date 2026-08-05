from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import desc, func, select

from polar.kit.pagination import PaginationParams
from polar.kit.repository import RepositoryBase
from polar.models import Event
from polar.models.event import EventSource
from polar.postgres import AsyncReadSession


# Subset of SystemEvent names that represent admin-relevant state changes.
# Tier consumption events (meter_credited, meter_reset) are excluded — those
# are usage noise and would drown out the actual audit trail.
ADMIN_ACTION_EVENT_NAMES: tuple[str, ...] = (
    "benefit.granted",
    "benefit.cycled",
    "benefit.updated",
    "benefit.revoked",
    "subscription.created",
    "subscription.canceled",
    "subscription.cycled",
    "subscription.revoked",
    "subscription.uncanceled",
    "subscription.product_updated",
    "subscription.seats_updated",
    "subscription.billing_period_updated",
    "order.paid",
    "order.refunded",
    "checkout.created",
    "customer.created",
    "customer.updated",
    "customer.deleted",
    "balance.order",
    "balance.credit_order",
    "balance.refund",
    "balance.refund_reversal",
    "balance.dispute",
    "balance.dispute_reversal",
)


class AuditLogRepository(RepositoryBase[Event]):
    model = Event

    async def list_for_organization(
        self,
        *,
        organization_id: UUID,
        pagination: PaginationParams,
    ) -> tuple[Sequence[Event], int]:
        """Return system-source events from ADMIN_ACTION_EVENT_NAMES for
        the organization, newest first, paginated.
        """
        base = (
            select(Event)
            .where(
                Event.organization_id == organization_id,
                Event.source == EventSource.system,
                Event.name.in_(ADMIN_ACTION_EVENT_NAMES),
            )
            .order_by(desc(Event.timestamp), desc(Event.id))
        )
        return await self.paginate(
            base, limit=pagination.limit, page=pagination.page
        )


def audit_log_repository(session: AsyncReadSession) -> AuditLogRepository:
    return AuditLogRepository.from_session(session)
