from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.course_enrollment import CourseEnrollment
    from polar.models.user import User


# Fixed reaction set for v1. Stored as a CHECK constraint in the migration
# rather than an enum so adding/removing emojis later is a one-line
# migration instead of a Postgres enum rebuild.
COMMUNITY_REACTION_EMOJIS = (
    "thumbsup",
    "clap",
    "heart",
    "fire",
    "idea",
    "pray",
)

# Target discriminator — extend if reactions ever land on something other
# than posts or comments.
COMMUNITY_REACTION_TARGETS = ("post", "comment")


class CommunityReaction(RecordModel):
    """Fixed-emoji toggle row. One row per (target, actor, emoji); the
    composite uniqueness is enforced at the index level (see migration
    b8f3c9a2e571) — Postgres needs two partial unique indexes because
    the actor union splits across two NULL-able columns."""

    __tablename__ = "community_reactions"
    __table_args__ = (
        CheckConstraint(
            "(actor_enrollment_id IS NOT NULL)::int "
            "+ (actor_user_id IS NOT NULL)::int = 1",
            name="community_reactions_actor_exactly_one_check",
        ),
        CheckConstraint(
            "emoji IN ('thumbsup', 'clap', 'heart', 'fire', 'idea', 'pray')",
            name="community_reactions_emoji_check",
        ),
        CheckConstraint(
            "target_type IN ('post', 'comment')",
            name="community_reactions_target_type_check",
        ),
    )

    target_type: Mapped[str] = mapped_column(String(20), nullable=False)
    target_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)

    # Exactly one of the next two is non-null (CHECK constraint above).
    actor_enrollment_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("course_enrollments.id", ondelete="cascade"),
        nullable=True,
    )
    actor_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="cascade"),
        nullable=True,
    )

    emoji: Mapped[str] = mapped_column(String(20), nullable=False)

    @declared_attr
    def actor_enrollment(cls) -> Mapped["CourseEnrollment | None"]:
        return relationship("CourseEnrollment", lazy="raise")

    @declared_attr
    def actor_user(cls) -> Mapped["User | None"]:
        return relationship("User", lazy="raise")
