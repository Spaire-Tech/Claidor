from fastapi import Depends, Query

from simeon.exceptions import ResourceNotFound
from simeon.kit.pagination import ListResource, PaginationParamsQuery
from simeon.kit.schemas import MultipleQueryFilter
from simeon.models import Dispute
from simeon.models.dispute import DisputeStatus
from simeon.openapi import APITag
from simeon.order.schemas import OrderID
from simeon.organization.schemas import OrganizationID
from simeon.postgres import AsyncReadSession, get_db_read_session
from simeon.routing import APIRouter

from . import auth, sorting
from .schemas import Dispute as DisputeSchema
from .schemas import DisputeID, DisputeNotFound
from .service import dispute as dispute_service

router = APIRouter(prefix="/disputes", tags=["disputes", APITag.public])


@router.get("/", summary="List Disputes", response_model=ListResource[DisputeSchema])
async def list(
    auth_subject: auth.DisputesRead,
    pagination: PaginationParamsQuery,
    sorting: sorting.ListSorting,
    organization_id: MultipleQueryFilter[OrganizationID] | None = Query(
        None, title="OrganizationID Filter", description="Filter by organization ID."
    ),
    order_id: MultipleQueryFilter[OrderID] | None = Query(
        None, title="OrderID Filter", description="Filter by order ID."
    ),
    status: MultipleQueryFilter[DisputeStatus] | None = Query(
        None, title="Status Filter", description="Filter by dispute status."
    ),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> ListResource[DisputeSchema]:
    """List disputes."""
    results, count = await dispute_service.list(
        session,
        auth_subject,
        organization_id=organization_id,
        order_id=order_id,
        status=status,
        pagination=pagination,
        sorting=sorting,
    )

    return ListResource.from_paginated_results(
        [DisputeSchema.model_validate(result) for result in results],
        count,
        pagination,
    )


@router.get(
    "/{id}",
    summary="Get Dispute",
    response_model=DisputeSchema,
    responses={404: DisputeNotFound},
)
async def get(
    id: DisputeID,
    auth_subject: auth.DisputesRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> Dispute:
    """Get a dispute by ID."""
    dispute = await dispute_service.get(session, auth_subject, id)

    if dispute is None:
        raise ResourceNotFound()

    return dispute
