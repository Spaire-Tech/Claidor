from uuid import UUID

from fastapi import Depends

from polar.kit.schemas import Schema
from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter

from .schemas import ProductReviewCreate, ProductReviewRead, ProductReviewStats
from .service import product_review as product_review_service

router = APIRouter(
    prefix="/product-reviews",
    tags=["product-reviews", APITag.private],
)


class ProductReviewListResponse(Schema):
    reviews: list[ProductReviewRead]
    stats: ProductReviewStats


@router.get(
    "/product/{product_id}",
    summary="Get Product Reviews",
    response_model=ProductReviewListResponse,
)
async def get_product_reviews(
    product_id: UUID,
    session: AsyncSession = Depends(get_db_session),
) -> ProductReviewListResponse:
    reviews = await product_review_service.list_by_product(session, product_id)
    avg_rating, total = await product_review_service.get_stats(session, product_id)

    return ProductReviewListResponse(
        reviews=[
            ProductReviewRead(
                id=r.id,
                product_id=r.product_id,
                rating=r.rating,
                title=r.title,
                text=r.text,
                customer_name=r.customer_name,
                created_at=r.created_at,
                modified_at=r.modified_at,
            )
            for r in reviews
        ],
        stats=ProductReviewStats(
            product_id=product_id,
            average_rating=round(avg_rating, 1),
            total_reviews=total,
        ),
    )


@router.post(
    "/",
    summary="Submit Product Review",
    response_model=ProductReviewRead,
    status_code=201,
)
async def submit_review(
    body: ProductReviewCreate,
    session: AsyncSession = Depends(get_db_session),
) -> ProductReviewRead:
    # For now, accept reviews with customer info in the body
    # In production, this would use customer session auth
    from polar.product.repository import ProductRepository

    product_repo = ProductRepository.from_session(session)
    product = await product_repo.get_by_id(body.product_id)
    if product is None:
        from polar.exceptions import ResourceNotFound
        raise ResourceNotFound()

    review = await product_review_service.create(
        session,
        customer_id=body.customer_id if hasattr(body, 'customer_id') else product.organization_id,
        customer_name="Customer",
        organization_id=product.organization_id,
        create_schema=body,
    )

    return ProductReviewRead(
        id=review.id,
        product_id=review.product_id,
        rating=review.rating,
        title=review.title,
        text=review.text,
        customer_name=review.customer_name,
        created_at=review.created_at,
        modified_at=review.modified_at,
    )
