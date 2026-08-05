from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    ForeignKey,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import (
    Mapped,
    declared_attr,
    mapped_column,
    relationship,
)

from polar.custom_field.attachment import AttachedCustomFieldMixin
from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models import File, Organization


class FormStatus(StrEnum):
    draft = "draft"
    published = "published"


class Form(RecordModel):
    """A lead-magnet form: a branded email-capture form whose submission
    enrolls the visitor as an email subscriber and (optionally) delivers a
    downloadable file — without going through checkout."""

    __tablename__ = "forms"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "slug", name="forms_organization_id_slug_key"
        ),
    )

    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    subtitle: Mapped[str | None] = mapped_column(
        String(255), nullable=True, default=None
    )
    button_label: Mapped[str] = mapped_column(
        String(50), nullable=False, default="Submit"
    )
    success_message: Mapped[str | None] = mapped_column(
        String(500), nullable=True, default=None
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=FormStatus.draft
    )
    # The lead magnet delivered after submission. Nullable so a form can be
    # saved as a draft before a file is attached. ON DELETE SET NULL so
    # deleting the underlying file doesn't cascade-delete the form.
    file_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("files.id", ondelete="set null"),
        nullable=True,
        default=None,
    )
    # Cover image shown on the Space card and beside the form — a public
    # file URL the creator uploads.
    image_url: Mapped[str | None] = mapped_column(
        String(1024), nullable=True, default=None
    )
    # Presentation options: accent colour, corner style, media side and
    # whether to show the consent checkbox. Stored loosely as JSONB and
    # validated by the FormStyle schema.
    style: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    @declared_attr
    def organization(cls) -> Mapped["Organization"]:
        return relationship("Organization", lazy="raise")

    @declared_attr
    def file(cls) -> Mapped["File | None"]:
        return relationship("File", lazy="raise")

    @declared_attr
    def attached_custom_fields(cls) -> Mapped[list["FormCustomField"]]:
        return relationship(
            "FormCustomField",
            back_populates="form",
            order_by="FormCustomField.order",
            cascade="all, delete-orphan",
            lazy="raise",
        )


class FormCustomField(AttachedCustomFieldMixin, RecordModel):
    __tablename__ = "form_custom_fields"
    __table_args__ = (UniqueConstraint("form_id", "order"),)

    form_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("forms.id", ondelete="cascade"),
        primary_key=True,
    )

    @declared_attr
    def form(cls) -> Mapped["Form"]:
        return relationship(
            "Form", lazy="raise", back_populates="attached_custom_fields"
        )
