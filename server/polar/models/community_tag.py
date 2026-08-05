from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.course import Course


class CommunityTag(RecordModel):
    """Creator-customizable post-type label (Question / Win / Prompt /
    Milestone). The four seeded slugs are referenced by the milestone job
    and the default filter chip set; the label is what the creator renames."""

    __tablename__ = "community_tags"

    course_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("courses.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    # Stable identifier; label is the rename target.
    slug: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(50), nullable=False)

    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    @declared_attr
    def course(cls) -> Mapped["Course"]:
        return relationship("Course", lazy="raise")
