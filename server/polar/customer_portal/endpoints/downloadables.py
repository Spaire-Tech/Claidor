from typing import Any, List

from fastapi import Depends, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from polar.benefit.schemas import BenefitID
from polar.file.s3 import S3_SERVICES
from polar.kit.pagination import ListResource, PaginationParamsQuery
from polar.kit.schemas import MultipleQueryFilter
from polar.models.product import Product
from polar.models.product_benefit import ProductBenefit
from polar.models.product_media import ProductMedia
from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter

from .. import auth
from ..schemas.downloadables import DownloadableRead
from ..service.downloadables import downloadable as downloadable_service

router = APIRouter(prefix="/downloadables", tags=["downloadables", APITag.public])


async def _enrich_downloadables(
    session: AsyncSession, schemas: List[DownloadableRead]
) -> List[DownloadableRead]:
    """Decorate each downloadable with the product it belongs to.

    Polar already stores `Product.category` (ebook / template / video / …),
    which the redesigned customer portal surfaces as filter chips. Doing one
    extra round-trip here keeps the schema enrichment off the hot path of
    every downloadable consumer (benefit-grant cards still work without it).
    """
    benefit_ids = {s.benefit_id for s in schemas}
    if not benefit_ids:
        return schemas

    pb_stmt = (
        select(ProductBenefit)
        .where(ProductBenefit.benefit_id.in_(benefit_ids))
        .options(
            selectinload(ProductBenefit.product)
            .selectinload(Product.product_medias)
            .joinedload(ProductMedia.file)
        )
        .order_by(ProductBenefit.order)
    )
    result = await session.execute(pb_stmt)

    # First product wins per benefit (stable order via ProductBenefit.order).
    product_by_benefit: dict[Any, Product] = {}
    for row in result.scalars().unique().all():
        product_by_benefit.setdefault(row.benefit_id, row.product)

    enriched: List[DownloadableRead] = []
    for schema in schemas:
        product: Product | None = product_by_benefit.get(schema.benefit_id)
        if product is None:
            enriched.append(schema)
            continue

        thumbnail_url: str | None = None
        for media in product.product_medias:
            file = media.file
            if file is None or not file.is_uploaded:
                continue
            s3 = S3_SERVICES.get(file.service)
            if s3 is None:
                continue
            thumbnail_url = s3.get_public_url(file.path)
            break

        enriched.append(
            schema.model_copy(
                update={
                    "product_id": product.id,
                    "product_name": product.name,
                    "product_category": product.category,
                    "product_thumbnail_url": thumbnail_url,
                }
            )
        )
    return enriched


@router.get(
    "/",
    summary="List Downloadables",
    response_model=ListResource[DownloadableRead],
)
async def list(
    auth_subject: auth.CustomerPortalUnionRead,
    pagination: PaginationParamsQuery,
    benefit_id: MultipleQueryFilter[BenefitID] | None = Query(
        None, title="BenefitID Filter", description="Filter by benefit ID."
    ),
    session: AsyncSession = Depends(get_db_session),
) -> ListResource[DownloadableRead]:
    results, count = await downloadable_service.get_list(
        session,
        auth_subject,
        pagination=pagination,
        benefit_id=benefit_id,
    )

    schemas = downloadable_service.generate_downloadable_schemas(results)
    # Carry over the live download counter the service tracks, then enrich.
    counter_by_id = {d.id: d for d in results}
    schemas = [
        schema.model_copy(
            update={
                "downloaded_count": counter_by_id[schema.id].downloaded,
                "last_downloaded_at": counter_by_id[schema.id].last_downloaded_at,
            }
        )
        for schema in schemas
    ]
    schemas = await _enrich_downloadables(session, schemas)

    return ListResource.from_paginated_results(schemas, count, pagination)


@router.get(
    "/{token}",
    summary="Get Downloadable",
    responses={
        302: {"description": "Redirected to download"},
        400: {"description": "Invalid signature"},
        404: {"description": "Downloadable not found"},
        410: {"description": "Expired signature"},
    },
    name="customer_portal.downloadables.get",
    tags=[APITag.private],
)
async def get(
    token: str,
    session: AsyncSession = Depends(get_db_session),
) -> RedirectResponse:
    downloadable = await downloadable_service.get_from_token_or_raise(
        session, token=token
    )
    signed = downloadable_service.generate_download_schema(downloadable)
    return RedirectResponse(signed.file.download.url, 302)
