from uuid import UUID

from sqlalchemy import Select, func, select

from polar.kit.repository import RepositoryBase
from polar.models.product_review import ProductReview


class ProductReviewRepository(RepositoryBase[ProductReview]):
    model = ProductReview

    def get_by_product_statement(self, product_id: UUID) -> Select[tuple[ProductReview]]:
        return (
            self.get_base_statement()
            .where(ProductReview.product_id == product_id)
            .order_by(ProductReview.created_at.desc())
        )

    async def get_by_product_and_customer(
        self, product_id: UUID, customer_id: UUID
    ) -> ProductReview | None:
        statement = self.get_base_statement().where(
            ProductReview.product_id == product_id,
            ProductReview.customer_id == customer_id,
        )
        return await self.get_one_or_none(statement)

    async def get_stats(
        self, product_id: UUID
    ) -> tuple[float, int]:
        statement = select(
            func.coalesce(func.avg(ProductReview.rating), 0),
            func.count(ProductReview.id),
        ).where(
            ProductReview.product_id == product_id,
            ProductReview.deleted_at.is_(None),
        )
        result = await self.session.execute(statement)
        row = result.one()
        return float(row[0]), int(row[1])
