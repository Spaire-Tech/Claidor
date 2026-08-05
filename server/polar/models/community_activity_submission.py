from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.community_activity import CommunityActivity
    from polar.models.customer import Customer
    from polar.models.file import File


class CommunityActivitySubmission(RecordModel):
    """One submission to a CommunityActivity.

    No (activity_id, customer_id) UNIQUE — students can submit multiple
    times (re-do the bake, etc.). The card progress bar counts distinct
    contributing customers, not raw submission rows.

    Media reuses the existing community pipeline:
      - photo: `file_id` -> a File row in `community_post_image` service
      - video: `mux_playback_id` / `mux_upload_id` (same Mux flow as
        community_post_media)
      - link:  `link_url`
      - text:  body only
    """

    __tablename__ = "community_activity_submissions"
    __table_args__ = (
        CheckConstraint(
            "submission_type IN ('photo', 'video', 'text', 'link')",
            name="community_activity_submissions_submission_type_check",
        ),
        CheckConstraint(
            "visibility IN ('cohort', 'all', 'instr')",
            name="community_activity_submissions_visibility_check",
        ),
    )

    activity_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("community_activities.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    customer_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("customers.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    submission_type: Mapped[str] = mapped_column(String(20), nullable=False)

    body: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)

    file_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("files.id", ondelete="set null"),
        nullable=True,
        default=None,
    )

    mux_playback_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default=None
    )
    mux_upload_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default=None
    )
    mux_asset_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default=None
    )

    # Lifecycle for video submissions. Mirrors community_post_media.mux_status:
    #   waiting    — direct upload created, bytes not yet finalized
    #   processing — Mux has the asset and is transcoding
    #   ready      — playable; mux_playback_id is set
    #   errored    — upload or transcode failed
    #   deleted    — asset deleted on Mux side
    # Non-video submissions leave this NULL.
    mux_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True, default=None
    )

    link_url: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)

    # CSS `object-position` string ("43.5% 62.0%") chosen by the
    # submitter from the ThumbnailPositioner — applied when the photo
    # is rendered as a card thumbnail so the focal point survives the
    # crop. Null = center (50% 50%). Only meaningful for photo
    # submissions.
    image_object_position: Mapped[str | None] = mapped_column(
        String(32), nullable=True, default=None
    )

    # Visibility scope chosen by the submitter:
    #   cohort — visible to enrolled customers + host (default)
    #   all    — visible to everyone enrolled across cohorts (same as
    #            cohort while we have a single cohort per course; kept
    #            so the UI selection round-trips honestly)
    #   instr  — visible to the host + the submitter only
    # Enforced in the customer-side list endpoint.
    visibility: Mapped[str] = mapped_column(
        String(20), nullable=False, default="cohort"
    )

    @declared_attr
    def activity(cls) -> Mapped["CommunityActivity"]:
        return relationship("CommunityActivity", lazy="raise")

    @declared_attr
    def customer(cls) -> Mapped["Customer"]:
        return relationship("Customer", lazy="raise")

    @declared_attr
    def file(cls) -> Mapped["File | None"]:
        return relationship("File", lazy="raise")


_ = "CommunityPostMedia"
