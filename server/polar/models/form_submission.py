from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    ForeignKey,
    String,
    Uuid,
)
from sqlalchemy.orm import (
    Mapped,
    declared_attr,
    mapped_column,
    relationship,
)

from polar.custom_field.data import CustomFieldDataMixin
from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models import EmailSubscriber, Form, Organization


class FormSubmission(CustomFieldDataMixin, RecordModel):
    """A single submission of a :class:`Form`. Stores the captured basic
    fields (email, name) plus any attached custom field values, and links to
    the :class:`EmailSubscriber` the submission created or reactivated."""

    __tablename__ = "form_submissions"

    form_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("forms.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    name: Mapped[str | None] = mapped_column(String(256), nullable=True, default=None)
    email_subscriber_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("email_subscribers.id", ondelete="set null"),
        nullable=True,
        default=None,
    )

    @declared_attr
    def form(cls) -> Mapped["Form"]:
        return relationship("Form", lazy="raise")

    @declared_attr
    def organization(cls) -> Mapped["Organization"]:
        return relationship("Organization", lazy="raise")

    @declared_attr
    def email_subscriber(cls) -> Mapped["EmailSubscriber | None"]:
        return relationship("EmailSubscriber", lazy="raise")
