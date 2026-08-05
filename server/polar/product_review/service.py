from collections.abc import Sequence
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from polar.models.product_review import ProductReview
from polar.product_review.repository import ProductReviewRepository
from polar.product_review.schemas import ProductReviewCreate


class ProductReviewService:
    async def list_by_product(
        self,
        session: AsyncSession,
        product_id: UUID,
    ) -> Sequence[ProductReview]:
        repository = ProductReviewRepository.from_session(session)
        statement = repository.get_by_product_statement(product_id)
        return await repository.get_all(statement)

    async def get_stats(
        self,
        session: AsyncSession,
        product_id: UUID,
    ) -> tuple[float, int]:
        repository = ProductReviewRepository.from_session(session)
        return await repository.get_stats(product_id)

    async def create(
        self,
        session: AsyncSession,
        *,
        customer_id: UUID,
        customer_name: str,
        organization_id: UUID,
        create_schema: ProductReviewCreate,
    ) -> ProductReview:
        repository = ProductReviewRepository.from_session(session)

        # Check if customer already reviewed this product
        existing = await repository.get_by_product_and_customer(
            create_schema.product_id, customer_id
        )
        if existing:
            # Update existing review
            return await repository.update(
                existing,
                {
                    "rating": create_schema.rating,
                    "title": create_schema.title,
                    "text": create_schema.text,
                },
            )

        review = ProductReview(
            product_id=create_schema.product_id,
            customer_id=customer_id,
            organization_id=organization_id,
            rating=create_schema.rating,
            title=create_schema.title,
            text=create_schema.text,
            customer_name=customer_name,
        )
        return await repository.create(review, flush=True)


product_review = ProductReviewService()
