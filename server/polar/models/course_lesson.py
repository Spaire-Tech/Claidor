from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.course_module import CourseModule


class CourseLesson(RecordModel):
    __tablename__ = "course_lessons"

    module_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("course_modules.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(500), nullable=False)

    content_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="text",
    )

    content: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)

    video_asset_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, default=None
    )

    duration_seconds: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )

    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    is_free_preview: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    published: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    # Mux video fields. mux_upload_id is unique so the webhook handler's
    # scalar_one_or_none() lookup can never raise MultipleResultsFound.
    mux_upload_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, default=None, index=True, unique=True
    )
    mux_asset_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, default=None
    )
    mux_playback_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, default=None
    )
    mux_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True, default=None
    )

    # Plain-text transcript, fetched from the Mux auto-generated caption track
    # once it is ready. Feeds the Course Assistant knowledge base. For text
    # lessons this stays null (their text lives in `content`).
    transcript: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )
    # pending | ready | failed | unavailable (no audio / captions disabled).
    # Drives the "is this course ingestable yet?" gate for the assistant build.
    transcript_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True, default=None
    )
    # Timestamped caption cues: [{"t": int_seconds, "text": str}, ...], aligned
    # with `transcript` (which is their plain-text join). Lets the Course
    # Assistant map an answer citation back to the moment in the video so a
    # citation can open the lesson at that second.
    transcript_cues: Mapped[list[dict[str, object]] | None] = mapped_column(
        JSONB, nullable=True, default=None
    )
    # AI lesson-draft pipeline: once the transcript lands, the AI writes the
    # lesson's description / overview / takeaways into any empty fields.
    # pending (queued behind the transcript) | done | failed | cancelled (the
    # creator clicked "I'll write it myself"). Null = not started / no video.
    ai_autofill_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True, default=None
    )

    thumbnail_url: Mapped[str | None] = mapped_column(
        String(2048), nullable=True, default=None
    )

    thumbnail_object_position: Mapped[str | None] = mapped_column(
        String(32), nullable=True, default=None
    )

    description: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )

    release_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    drip_days: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )

    comments_mode: Mapped[str] = mapped_column(
        String(16), nullable=False, default="visible"
    )

    @declared_attr
    def module(cls) -> Mapped["CourseModule"]:
        return relationship("CourseModule", lazy="raise", back_populates="lessons")
