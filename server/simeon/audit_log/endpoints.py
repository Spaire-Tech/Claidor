"""Audit log endpoint — Scale-tier feature.

Returns a paginated history of admin-relevant system events for the
organization, gated by the audit_logs tier feature. Today the gate
maps to Scale only; Free/Pro return 402.
"""

import math

from fastapi import Depends

from simeon.entitlements.service import entitlements as entitlements_service
from simeon.event.system import SYSTEM_EVENT_LABELS
from simeon.exceptions import ResourceNotFound
from simeon.kit.pagination import ListResource, Pagination, PaginationParamsQuery
from simeon.openapi import APITag
from simeon.organization.repository import OrganizationRepository
from simeon.organization.schemas import OrganizationID
from simeon.postgres import AsyncReadSession, get_db_read_session
from simeon.routing import APIRouter

from . import auth
from .repository import audit_log_repository
from .schemas import AuditLogEntry

router = APIRouter(prefix="/audit-log", tags=["audit_log", APITag.private])


@router.get(
    "/{organization_id}",
    summary="List Audit Log Entries",
    response_model=ListResource[AuditLogEntry],
)
async def list_audit_log(
    organization_id: OrganizationID,
    auth_subject: auth.AuditLogRead,
    pagination: PaginationParamsQuery,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> ListResource[AuditLogEntry]:
    """List admin-relevant system events for the organization, newest
    first. Gated on the audit_logs tier feature (Scale).
    """
    org_repository = OrganizationRepository.from_session(session)
    readable = org_repository.get_readable_statement(auth_subject).where(
        OrganizationRepository.model.id == organization_id
    )
    organization = await org_repository.get_one_or_none(readable)
    if organization is None:
        raise ResourceNotFound("Organization not found.")

    # Tier gate — raises FeatureNotInPlanError (402) on Free/Pro.
    await entitlements_service.require_feature(session, organization.id, "audit_logs")

    repository = audit_log_repository(session)
    events, total = await repository.list_for_organization(
        organization_id=organization.id, pagination=pagination
    )

    items = [
        AuditLogEntry(
            id=event.id,
            timestamp=event.timestamp,
            name=event.name,
            label=SYSTEM_EVENT_LABELS.get(event.name, event.name),
            customer_id=event.customer_id,
            user_metadata=event.user_metadata or {},
        )
        for event in events
    ]
    max_page = math.ceil(total / pagination.limit) if pagination.limit else 1
    return ListResource(
        items=items,
        pagination=Pagination(total_count=total, max_page=max_page),
    )
