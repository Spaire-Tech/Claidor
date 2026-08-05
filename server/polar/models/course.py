from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.course_module import CourseModule
    from polar.models.product import Product


class Course(RecordModel):
    __tablename__ = "courses"

    product_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("products.id", ondelete="cascade"),
        nullable=False,
        unique=True,
        index=True,
    )

    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    title: Mapped[str | None] = mapped_column(
        String(500), nullable=True, default=None
    )

    slug: Mapped[str | None] = mapped_column(
        String(200), nullable=True, default=None, index=True
    )

    course_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="evergreen",
    )

    # "course" = structured modules → lessons (default).
    # "series" = flat, episode-based, narrative format. Persisted on the
    # same table because every downstream relationship (modules, lessons,
    # paywall, enrollments, comments, mux assets) applies to both formats
    # — series just renders the single implicit module as a flat episode
    # list and skips progression UI.
    format: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="course",
        server_default="course",
    )

    paywall_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    paywall_lesson_id: Mapped[UUID | None] = mapped_column(
        Uuid, nullable=True, default=None
    )

    paywall_position: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )

    ai_generated: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    # ── Course Assistant ─────────────────────────────────────────────────────
    # The student-facing AI teaching assistant. Stateless: it answers from the
    # live course (metadata + transcripts) plus Claude's general knowledge. No
    # snapshot, no approval gate — these two columns are the whole config.
    #
    # assistant_enabled defaults ON for new courses; the creator can switch it
    # off in course Settings.
    assistant_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    # assistant_strictness controls how far the TA may roam from the course.
    #   "course_only"        — answer strictly from the course; route/orient
    #                          rather than improvise when it isn't covered.
    #   "course_plus_general" — course first, Claude's general subject knowledge
    #                          as labeled backup (the default).
    assistant_strictness: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="course_plus_general",
        server_default="course_plus_general",
    )

    # ── Onboarding presentation choices ──────────────────────────────────────
    # These are picked in the create-course wizard and drive how the public
    # portal (now both landing + player) renders. They are NOT decorative:
    # the portal reads them to pick the hero layout, the lesson-card layout,
    # and the "try before you buy" affordance.
    #
    # hero_variant: how the top of the portal renders.
    #   "marquee" — cinematic, full-bleed streaming-title hero.
    #   "cover"   — the boxed editorial hero (legacy default).
    hero_variant: Mapped[str] = mapped_column(
        String(20), nullable=False, default="cover", server_default="cover"
    )
    # lesson_card_variant: how every lesson tile renders in the episode grid.
    #   "spotlight" — title + details rest over the image.
    #   "catalog"   — details sit below the image (legacy default).
    lesson_card_variant: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="catalog",
        server_default="catalog",
    )
    # trial_mode: how a prospect samples the course before buying.
    #   "free_preview"  — the first `paywall_position` lessons play in full.
    #   "lesson_sample" — a short clip (the Episode Sample block) plays instead.
    trial_mode: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="free_preview",
        server_default="free_preview",
    )

    description: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )

    thumbnail_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True, default=None
    )

    thumbnail_object_position: Mapped[str | None] = mapped_column(
        String(32), nullable=True, default=None
    )

    instructor_name: Mapped[str | None] = mapped_column(
        String(200), nullable=True, default=None
    )

    instructor_bio: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )

    trailer_url: Mapped[str | None] = mapped_column(
        String(2048), nullable=True, default=None
    )

    instructor_name_italic: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    instructor_name_bold: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    instructor_name_uppercase: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    landing_overrides: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, default=None
    )

    # Series-only "Episode Sample" block on the landing. A series creator
    # picks one of their episodes and a window inside it (start_seconds +
    # duration_seconds), and that slice auto-plays as a sub-hero below the
    # main hero on the public landing. The block is a marketing surface —
    # the clip can run past the free-preview boundary, but the rest of the
    # episode stays paywalled.
    #
    # Shape: {
    #   "enabled": bool,
    #   "lesson_id": str (UUID, refers to a CourseLesson on this course),
    #   "start_seconds": int,
    #   "duration_seconds": int,    # 5-180, creator picks
    # }
    # All keys required when the object is present; setting the column to
    # NULL or `enabled=false` hides the block. The lesson_id is validated
    # at write time against the course's own lessons.
    sample: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, default=None
    )

    @declared_attr
    def product(cls) -> Mapped["Product"]:
        return relationship("Product", lazy="raise")

    @declared_attr
    def modules(cls) -> Mapped[list["CourseModule"]]:
        # primaryjoin filters out soft-deleted modules so the customer
        # portal never serves a deleted module / its lessons. The cascade
        # only kicks in on hard-delete.
        return relationship(
            "CourseModule",
            lazy="selectin",
            order_by="CourseModule.position",
            cascade="all, delete-orphan",
            back_populates="course",
            primaryjoin=(
                "and_(Course.id == CourseModule.course_id, "
                "CourseModule.deleted_at.is_(None))"
            ),
        )
