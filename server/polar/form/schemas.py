from datetime import datetime
from typing import Annotated, Literal

from pydantic import UUID4, Field, field_validator

from polar.custom_field.data import CustomFieldDataInputMixin
from polar.custom_field.schemas import (
    AttachedCustomField,
    AttachedCustomFieldListCreate,
)
from polar.kit.schemas import IDSchema, Schema, TimestampedSchema
from polar.models.form import FormStatus
from polar.organization.schemas import OrganizationID

# Character limits mirror the form-builder UI counters. They are enforced
# here (the API contract) while the DB columns keep generous headroom so the
# limits can be tuned without a migration.
FormTitle = Annotated[
    str, Field(min_length=1, max_length=50, description="Form heading.")
]
FormSubtitle = Annotated[
    str | None,
    Field(default=None, max_length=100, description="Supporting line under the title."),
]
FormButtonLabel = Annotated[
    str,
    Field(min_length=1, max_length=30, description="Submit button label."),
]
FormSuccessMessage = Annotated[
    str | None,
    Field(
        default=None,
        max_length=500,
        description="Message shown after a successful submission.",
    ),
]
FormSlug = Annotated[
    str | None,
    Field(
        default=None,
        max_length=255,
        description=(
            "URL-friendly identifier, unique within the organization. "
            "Auto-generated from the title when omitted."
        ),
    ),
]


class FormStyle(Schema):
    """Presentation options for the lead-magnet card."""

    accent: str = Field(default="#3b49f4", max_length=32, description="Accent hex.")
    corner: Literal["sharp", "rounded", "pill"] = "sharp"
    media_side: Literal["left", "right"] = "left"
    show_consent: bool = True
    media_position: str = Field(
        default="50% 50%",
        max_length=32,
        description=(
            "object-position of the cover image, as a CSS value "
            '(e.g. "50% 50%"). Lets the creator reposition the focal point.'
        ),
    )

    @field_validator("media_position", mode="before")
    @classmethod
    def _coerce_media_position(cls, value: object) -> object:
        # Older forms (and any malformed value) fall back to centered so a
        # bad/missing position never breaks reads of already-stored forms.
        if not isinstance(value, str):
            return "50% 50%"
        parts = value.strip().split()
        if len(parts) != 2:
            return "50% 50%"
        return value.strip()

    @field_validator("media_side", mode="before")
    @classmethod
    def _coerce_media_side(cls, value: object) -> object:
        # Backward compatibility: an option we've since removed (e.g. "top")
        # may still be persisted on older forms' JSONB style. Coerce anything
        # we no longer support to the default so reading those forms doesn't
        # raise a validation error (which would 500 every list/storefront call).
        if value not in ("left", "right"):
            return "left"
        return value

    @field_validator("corner", mode="before")
    @classmethod
    def _coerce_corner(cls, value: object) -> object:
        # Same backward-compat guard for corner, so a future change to the
        # allowed set can never break reads of already-stored forms.
        if value not in ("sharp", "rounded", "pill"):
            return "sharp"
        return value


class FormCreate(Schema):
    title: FormTitle
    subtitle: FormSubtitle = None
    button_label: FormButtonLabel = "Submit"
    success_message: FormSuccessMessage = None
    status: FormStatus = FormStatus.draft
    slug: FormSlug = None
    file_id: UUID4 | None = Field(
        default=None,
        description="ID of the uploaded file delivered as the lead magnet.",
    )
    image_url: str | None = Field(
        default=None,
        max_length=1024,
        description="Public URL of the cover image shown beside the form.",
    )
    style: FormStyle = Field(default_factory=FormStyle)
    attached_custom_fields: AttachedCustomFieldListCreate = Field(default_factory=list)
    organization_id: OrganizationID | None = Field(
        default=None,
        description=(
            "The ID of the organization owning the form. "
            "Required when using a user token."
        ),
    )


class FormUpdate(Schema):
    title: str | None = Field(default=None, min_length=1, max_length=50)
    subtitle: str | None = Field(default=None, max_length=100)
    button_label: str | None = Field(default=None, min_length=1, max_length=30)
    success_message: str | None = Field(default=None, max_length=500)
    status: FormStatus | None = None
    slug: str | None = Field(default=None, max_length=255)
    file_id: UUID4 | None = None
    image_url: str | None = Field(default=None, max_length=1024)
    style: FormStyle | None = None
    attached_custom_fields: AttachedCustomFieldListCreate | None = None


class Form(TimestampedSchema, IDSchema):
    id: UUID4
    organization_id: UUID4
    slug: str
    title: str
    subtitle: str | None = None
    button_label: str
    success_message: str | None = None
    status: FormStatus
    file_id: UUID4 | None = None
    image_url: str | None = None
    style: FormStyle = Field(default_factory=FormStyle)
    attached_custom_fields: list[AttachedCustomField]


class FormPublic(Schema):
    """Renderable form definition exposed to anonymous visitors (Space card /
    iframe embed). Never includes a download URL — that's issued only after a
    successful submission."""

    id: UUID4
    organization_id: UUID4
    title: str
    subtitle: str | None = None
    button_label: str
    success_message: str | None = None
    has_lead_magnet: bool = False
    lead_magnet_name: str | None = None
    image_url: str | None = None
    style: FormStyle = Field(default_factory=FormStyle)
    attached_custom_fields: list[AttachedCustomField]


class FormSubmit(CustomFieldDataInputMixin, Schema):
    email: str = Field(description="Subscriber email address", max_length=320)
    name: str | None = Field(
        default=None, description="Subscriber name", max_length=256
    )


class FormDownload(Schema):
    url: str = Field(description="Presigned, time-limited download URL.")
    expires_at: datetime


class FormSubmitResult(Schema):
    success: bool = True
    success_message: str | None = None
    download: FormDownload | None = Field(
        default=None,
        description="Immediate download for the lead magnet, when the form has one.",
    )


class FormSubmission(TimestampedSchema, IDSchema):
    id: UUID4
    form_id: UUID4
    email: str
    name: str | None = None
    email_subscriber_id: UUID4 | None = None
    custom_field_data: dict[str, str | int | bool | datetime | None] = Field(
        default_factory=dict
    )
