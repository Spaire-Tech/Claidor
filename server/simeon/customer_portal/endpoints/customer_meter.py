from fastapi import Depends, Query

from simeon.customer_meter.schemas import CustomerMeterID
from simeon.exceptions import ResourceNotFound
from simeon.kit.pagination import ListResource, PaginationParamsQuery
from simeon.kit.schemas import MultipleQueryFilter
from simeon.meter.schemas import MeterID
from simeon.models import CustomerMeter
from simeon.openapi import APITag
from simeon.postgres import AsyncSession, get_db_session
from simeon.routing import APIRouter

from .. import auth
from ..schemas.customer_meter import CustomerCustomerMeter as CustomerMeterSchema
from ..service.customer_meter import customer_meter as customer_meter_service
from ..sorting import customer_meter as sorting

router = APIRouter(
    prefix="/meters",
    tags=["customer_meters", APITag.public],
)


CustomerMeterNotFound = {
    "description": "Customer meter not found.",
    "model": ResourceNotFound.schema(),
}


@router.get(
    "/",
    summary="List Meters",
    response_model=ListResource[CustomerMeterSchema],
)
async def list(
    auth_subject: auth.CustomerPortalUnionRead,
    pagination: PaginationParamsQuery,
    sorting: sorting.ListSorting,
    meter_id: MultipleQueryFilter[MeterID] | None = Query(
        None, title="MeterID Filter", description="Filter by meter ID."
    ),
    query: str | None = Query(None, description="Filter by meter name."),
    session: AsyncSession = Depends(get_db_session),
) -> ListResource[CustomerMeterSchema]:
    """List meters of the authenticated customer."""
    results, count = await customer_meter_service.list(
        session,
        auth_subject,
        meter_id=meter_id,
        query=query,
        pagination=pagination,
        sorting=sorting,
    )

    return ListResource.from_paginated_results(
        [CustomerMeterSchema.model_validate(result) for result in results],
        count,
        pagination,
    )


@router.get(
    "/{id}",
    summary="Get Customer Meter",
    response_model=CustomerMeterSchema,
    responses={404: CustomerMeterNotFound},
)
async def get(
    id: CustomerMeterID,
    auth_subject: auth.CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> CustomerMeter:
    """Get a meter by ID for the authenticated customer."""
    customer_meter = await customer_meter_service.get(session, auth_subject, id)

    if customer_meter is None:
        raise ResourceNotFound()

    return customer_meter
