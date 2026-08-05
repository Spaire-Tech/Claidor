from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.community_post import CommunityPost
    from polar.models.file import File


class CommunityPostMedia(RecordModel):
    """Attachment on a community post. Images go through polar.file (S3
    presign); videos go through Mux direct-upload — same mux_* fields as
    course_lessons so video posts ride the existing pipeline."""

    __tablename__ = "community_post_media"
    __table_args__ = (
        CheckConstraint(
            "media_type IN ('image', 'video', 'gif')",
            name="community_post_media_type_check",
        ),
        # Image rows need file_id; video rows need at least an upload or
        # asset id from Mux; gif rows carry an external (GIPHY) URL.
        CheckConstraint(
            "(media_type = 'image' AND file_id IS NOT NULL) "
            "OR (media_type = 'video' "
            "    AND (mux_upload_id IS NOT NULL OR mux_asset_id IS NOT NULL)) "
            "OR (media_type = 'gif' AND external_url IS NOT NULL)",
            name="community_post_media_branch_check",
        ),
    )

    post_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("community_posts.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    media_type: Mapped[str] = mapped_column(String(20), nullable=False)

    # Image branch.
    file_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("files.id", ondelete="set null"),
        nullable=True,
        default=None,
    )

    # GIF branch — the external (GIPHY) media URL.
    external_url: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )

    # Video branch — mirrors course_lessons.
    mux_upload_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, default=None
    )
    mux_asset_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, default=None
    )
    mux_playback_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, default=None
    )
    mux_status: Mapped[str | None] = mapped_column(
        String(30), nullable=True, default=None
    )
    duration_seconds: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )
    thumbnail_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True, default=None
    )

    @declared_attr
    def post(cls) -> Mapped["CommunityPost"]:
        return relationship("CommunityPost", lazy="raise", back_populates="media")

    @declared_attr
    def file(cls) -> Mapped["File | None"]:
        # selectin so the post-render path can read `media.file.path` to
        # build the public URL without N+1 lookups across the feed.
        return relationship("File", lazy="selectin")
