from datetime import datetime
from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import (
    UUID4,
    AfterValidator,
    BeforeValidator,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)
from pydantic.json_schema import SkipJsonSchema
from pydantic.networks import HttpUrl

from polar.config import settings
from polar.enums import SubscriptionProrationBehavior, TaxBehaviorOption
from polar.kit.currency import PresentmentCurrency
from polar.kit.email import EmailStrDNS
from polar.kit.schemas import (
    ORGANIZATION_ID_EXAMPLE,
    EmptyStrToNoneValidator,
    HttpUrlToStr,
    IDSchema,
    MergeJSONSchema,
    Schema,
    SelectorWidget,
    SlugValidator,
    TimestampedSchema,
)
from polar.models.organization import (
    OrganizationCustomerEmailSettings,
    OrganizationCustomerPortalSettings,
    OrganizationNotificationSettings,
    OrganizationStatus,
    OrganizationSubscriptionSettings,
)
from polar.models.organization_review import OrganizationReview

OrganizationID = Annotated[
    UUID4,
    MergeJSONSchema({"description": "The organization ID."}),
    SelectorWidget("/v1/organizations", "Organization", "name"),
    Field(examples=[ORGANIZATION_ID_EXAMPLE]),
]

NameInput = Annotated[str, StringConstraints(min_length=3)]


def validate_reserved_keywords(value: str) -> str:
    if value in settings.ORGANIZATION_SLUG_RESERVED_KEYWORDS:
        raise ValueError("This slug is reserved.")
    return value


SlugInput = Annotated[
    str,
    StringConstraints(to_lower=True, min_length=3),
    SlugValidator,
    AfterValidator(validate_reserved_keywords),
]


def _discard_logo_dev_url(url: HttpUrl) -> HttpUrl | None:
    if url.host and url.host.endswith("logo.dev"):
        return None
    return url


AvatarUrl = Annotated[HttpUrlToStr, AfterValidator(_discard_logo_dev_url)]


class OrganizationFeatureSettings(Schema):
    issue_funding_enabled: bool = Field(
        False, description="If this organization has issue funding enabled"
    )
    seat_based_pricing_enabled: bool = Field(
        False, description="If this organization has seat-based pricing enabled"
    )
    course_player_white_label: bool = Field(
        False,
        description=(
            "When true, the course lesson player hides Spaire branding. "
            "Requires the white_label_course_player tier feature (Scale)."
        ),
    )
    revops_enabled: bool = Field(
        False, description="If this organization has RevOps enabled"
    )
    wallets_enabled: bool = Field(
        False, description="If this organization has Wallets enabled"
    )
    member_model_enabled: bool = Field(
        False, description="If this organization has the Member model enabled"
    )
    tinybird_read: bool = Field(
        False, description="If this organization reads from Tinybird"
    )
    tinybird_compare: bool = Field(
        False,
        description="If this organization compares Tinybird results with database",
    )
    perks_unlocked: bool = Field(
        False,
        description="If this organization has unlocked the Startup Stack perks by completing their first sale",
    )


class StorefrontLink(Schema):
    id: str = Field(description="Unique identifier for the link")
    url: HttpUrlToStr = Field(description="The URL of the link")
    title: Annotated[
        str | None,
        Field(max_length=100, description="Display title for the link"),
        EmptyStrToNoneValidator,
    ] = None
    description: Annotated[
        str | None,
        Field(max_length=200, description="Short description shown on the card"),
        EmptyStrToNoneValidator,
    ] = None
    image_url: str | None = Field(
        None, description="Thumbnail image URL for the link card"
    )
    type: Literal["standard", "embedded"] = Field("standard", description="Link type")
    platform: str | None = Field(
        None,
        description="Detected platform (youtube, spotify, tiktok, soundcloud, instagram)",
    )
    layout: Literal["classic", "carousel", "image_grid", "card"] | None = Field(
        None,
        description=(
            "Per-link visual layout (list / cards / grid / carousel). Embeds "
            "ignore this — they always render full-width. When unset, the link "
            "falls back to the section's links_layout."
        ),
    )


class SpaceItem(Schema):
    """A single entry in the Space's ordered list. The Space renders
    items in the order they appear in `space_items`; products and links
    can interleave freely (e.g. link → product → link → course → link).
    `kind` discriminates against ProductStorefront (`product`) vs a
    StorefrontLink already stored in `storefront_links` (`link`).
    `hidden` lets creators take an item off the Space without losing
    the item itself — products restore via the picker, links by
    flipping the flag.
    """

    kind: Literal["product", "link", "form"] = Field(
        description=(
            "What `id` refers to: a product, a storefront_links entry, or a form."
        )
    )
    id: str = Field(description="Identifier of the referenced product or link.")
    hidden: bool = Field(
        False,
        description=(
            "If true, the renderer skips this item. Lets creators hide "
            "an item without removing it from the Space's order or "
            "deleting it outright."
        ),
    )


class OrganizationStorefrontSettings(Schema):
    enabled: bool = Field(False, description="Whether the storefront is enabled")
    theme: Literal["light", "dark"] = Field(
        "light", description="Color theme for the public storefront"
    )
    show_header: bool = Field(True, description="Show the storefront header/banner")
    header_image_url: str | None = Field(
        None, description="URL of the storefront header/banner image"
    )
    show_logo: bool = Field(True, description="Show the organization logo")
    show_name: bool = Field(True, description="Show the organization name")
    show_description: bool = Field(True, description="Show the storefront description")
    description: Annotated[
        str | None,
        Field(max_length=160, description="Storefront description"),
        EmptyStrToNoneValidator,
    ] = None
    # ── Search & sharing (SEO) ──────────────────────────────────────
    meta_title: Annotated[
        str | None,
        Field(
            max_length=70,
            description=(
                "SEO title for the storefront — used as the page <title> and "
                "social card title. Falls back to the organization name."
            ),
        ),
        EmptyStrToNoneValidator,
    ] = None
    meta_description: Annotated[
        str | None,
        Field(
            max_length=200,
            description=(
                "SEO meta description / social card summary. Falls back to the "
                "storefront description."
            ),
        ),
        EmptyStrToNoneValidator,
    ] = None
    index: bool = Field(
        True,
        description="Allow search engines to index the storefront",
    )
    thumbnail_size: Literal["small", "medium", "large"] = Field(
        "large", description="Product thumbnail size"
    )
    show_product_details: bool = Field(
        True, description="Show product details (name, price)"
    )
    profile_title: Annotated[
        str | None,
        Field(max_length=50, description="Profile title (e.g. Designer, 3D Artist)"),
        EmptyStrToNoneValidator,
    ] = None
    skills: list[str] = Field(
        default_factory=list,
        description="Skill/expertise tags displayed on the profile",
    )
    languages: list[str] = Field(default_factory=list, description="Languages spoken")
    available_for_work: bool = Field(
        False, description="Show 'Available for work' badge on the profile"
    )
    contact_url: Annotated[
        str | None,
        Field(
            max_length=400,
            description=(
                "Where the 'Available for work' badge sends visitors. Accepts "
                "an https:// URL (e.g. a contact form, calendar booking link) "
                "or a mailto: URL. When unset, the badge is non-interactive."
            ),
        ),
        EmptyStrToNoneValidator,
    ] = None
    featured_mode: Literal["all", "curated"] = Field(
        "curated",
        description=(
            "How to choose which products appear on the storefront. 'curated' "
            "(default) shows only the products the creator explicitly added "
            "via featured_product_ids. 'all' is a legacy mode that auto-shows "
            "every active product; kept so existing rows still validate."
        ),
    )
    featured_product_ids: list[str] = Field(
        default_factory=list,
        description=(
            "Product IDs to feature on the storefront when featured_mode is "
            "'curated'. Ignored when featured_mode is 'all'."
        ),
    )
    show_card_products: bool = Field(
        True, description="Show product images in the profile card"
    )
    storefront_links: list[StorefrontLink] = Field(
        default_factory=list,
        description="Links displayed in a carousel on the storefront",
    )
    links_position: Literal["before_products", "after_products"] = Field(
        "after_products",
        description=(
            "DEPRECATED — use block_order. Where to show the links section "
            "relative to products. Kept so existing rows still validate."
        ),
    )
    block_order: list[Literal["products", "links", "forms"]] = Field(
        default_factory=lambda: ["products", "links"],
        description=(
            "Explicit ordering for the storefront's content blocks. The "
            "renderer iterates this list top-to-bottom, so creators can "
            "drag-reorder Products / Links / Forms freely. Backfilled from "
            "links_position for existing rows."
        ),
    )
    links_layout: Literal["classic", "carousel", "image_grid", "card"] = Field(
        "classic",
        description="Visual layout for the links section (default per-link layout)",
    )
    header_focal_point: str | None = Field(
        None,
        description="CSS object-position value for the cover image focal point (e.g. '50% 30%')",
    )
    space_items: list[SpaceItem] = Field(
        default_factory=list,
        description=(
            "Flat ordered list of everything on the Space. When non-"
            "empty this is the single source of truth for the Space's "
            "render order — products and links interleave freely. When "
            "empty, the renderer falls back to deriving order from "
            "featured_product_ids + storefront_links + block_order for "
            "backwards compatibility with Spaces created before this "
            "model existed."
        ),
    )

    @field_validator("contact_url")
    @classmethod
    def _validate_contact_url(cls, v: str | None) -> str | None:
        if v is None:
            return None
        scheme = v.split(":", 1)[0].lower() if ":" in v else ""
        if scheme not in {"http", "https", "mailto"}:
            raise ValueError(
                "contact_url must start with https://, http://, or mailto:"
            )
        return v


class OrganizationSubscribePromoteSettings(Schema):
    promote: bool = Field(True, description="Promote email subscription (free)")
    show_count: bool = Field(True, description="Show subscription count publicly")
    count_free: bool = Field(
        True, description="Include free subscribers in total count"
    )


class OrganizationDetails(Schema):
    about: str = Field("", description="Brief information about you and your business.")
    product_description: str = Field(
        ..., description="Description of digital products being sold."
    )
    intended_use: str = Field(
        "", description="How the organization will integrate and use Spaire."
    )
    customer_acquisition: list[str] = Field(
        default_factory=list, description="Main customer acquisition channels."
    )
    future_annual_revenue: int = Field(
        0, ge=0, description="Estimated revenue in the next 12 months"
    )
    switching: bool = Field(True, description="Switching from another platform?")
    switching_from: (
        Literal["paddle", "lemon_squeezy", "gumroad", "stripe", "other"] | None
    ) = Field(None, description="Which platform the organization is migrating from.")
    previous_annual_revenue: int = Field(
        0, ge=0, description="Revenue from last year if applicable."
    )


class OrganizationSocialPlatforms(StrEnum):
    x = "x"
    github = "github"
    facebook = "facebook"
    instagram = "instagram"
    youtube = "youtube"
    tiktok = "tiktok"
    linkedin = "linkedin"
    whatsapp = "whatsapp"
    spotify = "spotify"
    threads = "threads"
    soundcloud = "soundcloud"
    snapchat = "snapchat"
    pinterest = "pinterest"
    patreon = "patreon"
    twitch = "twitch"
    apple_music = "apple_music"
    website = "website"
    other = "other"


PLATFORM_DOMAINS = {
    "x": ["twitter.com", "x.com"],
    "github": ["github.com"],
    "facebook": ["facebook.com", "fb.com"],
    "instagram": ["instagram.com"],
    "youtube": ["youtube.com", "youtu.be"],
    "tiktok": ["tiktok.com"],
    "linkedin": ["linkedin.com"],
    "whatsapp": ["wa.me", "whatsapp.com"],
    "spotify": ["spotify.com", "open.spotify.com"],
    "threads": ["threads.net"],
    "soundcloud": ["soundcloud.com"],
    "snapchat": ["snapchat.com"],
    "pinterest": ["pinterest.com", "pin.it"],
    "patreon": ["patreon.com"],
    "twitch": ["twitch.tv"],
    "apple_music": ["music.apple.com"],
}


class OrganizationSocialLink(Schema):
    platform: OrganizationSocialPlatforms = Field(
        ..., description="The social platform of the URL"
    )
    url: HttpUrlToStr = Field(..., description="The URL to the organization profile")

    @model_validator(mode="before")
    @classmethod
    def validate_url(cls, data: dict[str, Any]) -> dict[str, Any]:
        platform = data.get("platform")
        url = data.get("url", "").lower()

        if not (platform and url):
            return data

        if platform in ("other", "website"):
            return data

        valid_domains = PLATFORM_DOMAINS.get(platform, [])
        if not valid_domains:
            return data
        if not any(domain in url for domain in valid_domains):
            raise ValueError(
                f"Invalid URL for {platform}. Must be from: {', '.join(valid_domains)}"
            )

        return data


# Deprecated
class OrganizationProfileSettings(Schema):
    enabled: bool | None = Field(
        None, description="If this organization has a profile enabled"
    )
    description: Annotated[
        str | None,
        Field(max_length=160, description="A description of the organization"),
        EmptyStrToNoneValidator,
    ] = None
    featured_projects: list[UUID4] | None = Field(
        None, description="A list of featured projects"
    )
    featured_organizations: list[UUID4] | None = Field(
        None, description="A list of featured organizations"
    )
    links: list[HttpUrl] | None = Field(
        None, description="A list of links associated with the organization"
    )
    subscribe: OrganizationSubscribePromoteSettings | None = Field(
        OrganizationSubscribePromoteSettings(
            promote=True,
            show_count=True,
            count_free=True,
        ),
        description="Subscription promotion settings",
    )
    accent_color: str | None = Field(
        None, description="Accent color for the organization"
    )


class OrganizationBase(IDSchema, TimestampedSchema):
    name: str = Field(
        description="Organization name shown in checkout, customer portal, emails etc.",
    )
    slug: str = Field(
        description="Unique organization slug in checkout, customer portal and credit card statements.",
    )
    custom_domain: str | None = Field(
        None,
        description=(
            "Active custom storefront domain (e.g. learn.creator.com) "
            "serving the organization's landing and customer portal. Null "
            "when the storefront is served from the platform host."
        ),
    )
    avatar_url: str | None = Field(
        description="Avatar URL shown in checkout, customer portal, emails etc."
    )
    customer_portal_sign_in_image_url: str | None = Field(
        None,
        description=(
            "Image shown on the left panel of the customer portal sign-in "
            "screen. Configured from the course builder's Auth tab and applies "
            "to the whole organization's portal sign-in. When unset, the "
            "portal falls back to the organization's most recent course "
            "thumbnail."
        ),
    )
    customer_portal_sign_in_image_position: str | None = Field(
        None,
        description=(
            "CSS object-position (e.g. '50% 30%') for the customer portal "
            "sign-in image, set by dragging to reposition in the Auth tab."
        ),
    )
    customer_portal_sign_in_theme: str | None = Field(
        None,
        description=(
            "Creator-chosen appearance for the customer portal sign-in screen: "
            "'light' or 'dark'. Null is treated as 'light'."
        ),
    )
    proration_behavior: SubscriptionProrationBehavior = Field(
        description="Proration behavior applied when customer updates their subscription from the portal.",
    )
    allow_customer_updates: bool = Field(
        description="Whether customers can update their subscriptions from the customer portal.",
    )

    # Deprecated attributes
    bio: SkipJsonSchema[str | None] = Field(..., deprecated="")
    company: SkipJsonSchema[str | None] = Field(
        ...,
        deprecated="Legacy attribute no longer in use.",
    )
    blog: SkipJsonSchema[str | None] = Field(
        ...,
        deprecated="Legacy attribute no longer in use. See `socials` instead.",
    )
    location: SkipJsonSchema[str | None] = Field(
        ...,
        deprecated="Legacy attribute no longer in use.",
    )
    twitter_username: SkipJsonSchema[str | None] = Field(
        ...,
        deprecated="Legacy attribute no longer in use. See `socials` instead.",
    )

    pledge_minimum_amount: SkipJsonSchema[int] = Field(0, deprecated=True)
    pledge_badge_show_amount: SkipJsonSchema[bool] = Field(False, deprecated=True)
    default_upfront_split_to_contributors: SkipJsonSchema[int | None] = Field(
        None, deprecated=True
    )
    profile_settings: SkipJsonSchema[OrganizationProfileSettings | None] = Field(
        None, deprecated=True
    )


class LegacyOrganizationStatus(StrEnum):
    """
    Legacy organization status values kept for backward compatibility in schemas
    using OrganizationPublicBase.
    """

    CREATED = "created"
    ONBOARDING_STARTED = "onboarding_started"
    UNDER_REVIEW = "under_review"
    DENIED = "denied"
    ACTIVE = "active"

    @classmethod
    def from_status(cls, status: OrganizationStatus) -> "LegacyOrganizationStatus":
        mapping = {
            OrganizationStatus.CREATED: LegacyOrganizationStatus.CREATED,
            OrganizationStatus.ONBOARDING_STARTED: (
                LegacyOrganizationStatus.ONBOARDING_STARTED
            ),
            OrganizationStatus.INITIAL_REVIEW: LegacyOrganizationStatus.UNDER_REVIEW,
            OrganizationStatus.ONGOING_REVIEW: LegacyOrganizationStatus.UNDER_REVIEW,
            OrganizationStatus.DENIED: LegacyOrganizationStatus.DENIED,
            OrganizationStatus.ACTIVE: LegacyOrganizationStatus.ACTIVE,
        }
        try:
            return mapping[status]
        except KeyError as e:
            raise ValueError("Unknown OrganizationStatus") from e


class OrganizationPublicBase(OrganizationBase):
    # Attributes that we used to have publicly, but now want to hide from
    # the public schema.
    # Keep it for now for backward compatibility in the SDK
    email: SkipJsonSchema[str | None]
    website: SkipJsonSchema[str | None]
    socials: SkipJsonSchema[list[OrganizationSocialLink]]
    status: Annotated[
        SkipJsonSchema[LegacyOrganizationStatus],
        BeforeValidator(LegacyOrganizationStatus.from_status),
    ]
    details_submitted_at: SkipJsonSchema[datetime | None]
    ai_onboarding_completed_at: SkipJsonSchema[datetime | None] = None

    feature_settings: SkipJsonSchema[OrganizationFeatureSettings | None]
    subscription_settings: SkipJsonSchema[OrganizationSubscriptionSettings]
    notification_settings: SkipJsonSchema[OrganizationNotificationSettings]
    customer_email_settings: SkipJsonSchema[OrganizationCustomerEmailSettings]


class Organization(OrganizationBase):
    email: str | None = Field(description="Public support email.")
    website: str | None = Field(description="Official website of the organization.")
    socials: list[OrganizationSocialLink] = Field(
        description="Links to social profiles.",
    )
    status: OrganizationStatus = Field(description="Current organization status")
    details_submitted_at: datetime | None = Field(
        description="When the business details were submitted.",
    )
    ai_onboarding_completed_at: datetime | None = Field(
        default=None,
        description=(
            "When the creator finished the onboarding flow (plan + review "
            "+ assistant). Until this is set, the dashboard layout redirects "
            "the creator back to /onboarding/plan to prevent skipping the "
            "plan-selection step."
        ),
    )

    default_presentment_currency: PresentmentCurrency = Field(
        description=(
            "Default presentment currency. "
            "Used as fallback in checkout and customer portal, "
            "if the customer's local currency is not available."
        )
    )
    default_tax_behavior: TaxBehaviorOption = Field(
        description="Default tax behavior applied on products."
    )

    feature_settings: OrganizationFeatureSettings | None = Field(
        description="Organization feature settings",
    )
    subscription_settings: OrganizationSubscriptionSettings = Field(
        description="Settings related to subscriptions management",
    )
    notification_settings: OrganizationNotificationSettings = Field(
        description="Settings related to notifications",
    )
    customer_email_settings: OrganizationCustomerEmailSettings = Field(
        description="Settings related to customer emails",
    )
    customer_portal_settings: OrganizationCustomerPortalSettings = Field(
        description="Settings related to the customer portal",
    )
    storefront_settings: OrganizationStorefrontSettings | None = Field(
        None, description="Storefront settings"
    )


class OrganizationCreate(Schema):
    name: NameInput
    slug: SlugInput
    avatar_url: AvatarUrl | None = None
    email: EmailStrDNS | None = Field(None, description="Public support email.")
    website: HttpUrlToStr | None = Field(
        None, description="Official website of the organization."
    )
    socials: list[OrganizationSocialLink] | None = Field(
        None,
        description="Link to social profiles.",
    )
    details: OrganizationDetails | None = Field(
        None,
        description="Additional, private, business details Spaire needs about active organizations for compliance (KYC).",
    )
    default_tax_behavior: TaxBehaviorOption = Field(
        default=TaxBehaviorOption.location,
        description="Default tax behavior applied on products.",
    )
    feature_settings: OrganizationFeatureSettings | None = None
    subscription_settings: OrganizationSubscriptionSettings | None = None
    notification_settings: OrganizationNotificationSettings | None = None
    customer_email_settings: OrganizationCustomerEmailSettings | None = None
    customer_portal_settings: OrganizationCustomerPortalSettings | None = None
    storefront_settings: OrganizationStorefrontSettings | None = None


class OrganizationUpdate(Schema):
    name: NameInput | None = None
    avatar_url: AvatarUrl | None = None

    customer_portal_sign_in_image_position: str | None = Field(
        None,
        max_length=32,
        description=(
            "CSS object-position (e.g. '50% 30%') for the customer portal "
            "sign-in image. Set by dragging to reposition in the Auth tab."
        ),
    )
    customer_portal_sign_in_theme: str | None = Field(
        None,
        max_length=16,
        description=(
            "Creator-chosen appearance for the customer portal sign-in screen: "
            "'light' or 'dark'."
        ),
    )

    email: EmailStrDNS | None = Field(None, description="Public support email.")
    website: HttpUrlToStr | None = Field(
        None, description="Official website of the organization."
    )
    socials: list[OrganizationSocialLink] | None = Field(
        None, description="Links to social profiles."
    )
    details: OrganizationDetails | None = Field(
        None,
        description="Additional, private, business details Spaire needs about active organizations for compliance (KYC).",
    )
    default_presentment_currency: PresentmentCurrency | None = Field(
        None,
        description="Default presentment currency for products and checkout.",
    )
    default_tax_behavior: TaxBehaviorOption | None = Field(
        None, description="Default tax behavior applied on products."
    )

    feature_settings: OrganizationFeatureSettings | None = None
    subscription_settings: OrganizationSubscriptionSettings | None = None
    notification_settings: OrganizationNotificationSettings | None = None
    customer_email_settings: OrganizationCustomerEmailSettings | None = None
    customer_portal_settings: OrganizationCustomerPortalSettings | None = None
    storefront_settings: OrganizationStorefrontSettings | None = None

    email_sender_domain: str | None = Field(
        default=None,
        description=(
            "Custom outbound email sender domain (Pro+). Setting this "
            "clears the verification timestamp; operations re-verifies "
            "DKIM and stamps email_sender_verified_at when ready. Pass "
            "an empty string to clear the domain (reverts to the platform "
            "default sender)."
        ),
        max_length=253,
    )


class OrganizationPaymentStep(Schema):
    id: str = Field(description="Step identifier")
    title: str = Field(description="Step title")
    description: str = Field(description="Step description")
    completed: bool = Field(description="Whether the step is completed")


class OrganizationPaymentStatus(Schema):
    payment_ready: bool = Field(
        description="Whether the organization is ready to accept payments"
    )
    steps: list[OrganizationPaymentStep] = Field(description="List of onboarding steps")
    organization_status: OrganizationStatus = Field(
        description="Current organization status"
    )


class OrganizationAppealRequest(Schema):
    reason: Annotated[
        str,
        StringConstraints(min_length=50, max_length=5000),
        Field(
            description="Detailed explanation of why this organization should be approved. Minimum 50 characters."
        ),
    ]


class OrganizationAppealResponse(Schema):
    success: bool = Field(description="Whether the appeal was successfully submitted")
    message: str = Field(description="Success or error message")
    appeal_submitted_at: datetime = Field(description="When the appeal was submitted")


class OrganizationReviewStatus(Schema):
    verdict: Literal["PASS", "FAIL", "UNCERTAIN"] | None = Field(
        default=None, description="AI validation verdict"
    )
    reason: str | None = Field(default=None, description="Reason for the verdict")
    appeal_submitted_at: datetime | None = Field(
        default=None, description="When appeal was submitted"
    )
    appeal_reason: str | None = Field(default=None, description="Reason for the appeal")
    appeal_decision: OrganizationReview.AppealDecision | None = Field(
        default=None, description="Decision on the appeal (approved/rejected)"
    )
    appeal_reviewed_at: datetime | None = Field(
        default=None, description="When appeal was reviewed"
    )


class OrganizationDeletionBlockedReason(StrEnum):
    """Reasons why an organization cannot be immediately deleted."""

    HAS_ORDERS = "has_orders"
    HAS_ACTIVE_SUBSCRIPTIONS = "has_active_subscriptions"
    STRIPE_ACCOUNT_DELETION_FAILED = "stripe_account_deletion_failed"


class OrganizationDeletionResponse(Schema):
    """Response for organization deletion request."""

    deleted: bool = Field(
        description="Whether the organization was immediately deleted"
    )
    requires_support: bool = Field(
        description="Whether a support ticket was created for manual handling"
    )
    blocked_reasons: list[OrganizationDeletionBlockedReason] = Field(
        default_factory=list,
        description="Reasons why immediate deletion is blocked",
    )
