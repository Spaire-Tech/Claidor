from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import TIMESTAMP, ForeignKey, Index, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.course import Course
    from polar.models.customer import Customer


class CourseEnrollment(RecordModel):
    __tablename__ = "course_enrollments"
    __table_args__ = (
        # One active enrollment per (customer, course). Soft-deleted rows are
        # excluded so a refunded customer can re-buy and re-enroll cleanly.
        Index(
            "ix_course_enrollments_customer_course_active",
            "customer_id",
            "course_id",
            unique=True,
            postgresql_where="deleted_at IS NULL",
        ),
        # Powers the Customers tab in the course editor — listing every
        # active enrollment for a course, newest first. Without this partial
        # index the dashboard query degrades into a full table scan as soon
        # as a course racks up a few thousand enrollments.
        Index(
            "ix_course_enrollments_course_active",
            "course_id",
            "enrolled_at",
            postgresql_where="deleted_at IS NULL",
            postgresql_ops={"enrolled_at": "DESC"},
        ),
    )

    customer_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("customers.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    course_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("courses.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    product_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("products.id", ondelete="set null"),
        nullable=True,
        index=True,
    )

    enrolled_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
    )

    @declared_attr
    def customer(cls) -> Mapped["Customer"]:
        return relationship("Customer", lazy="raise")

    @declared_attr
    def course(cls) -> Mapped["Course"]:
        return relationship("Course", lazy="selectin")
