from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any, Self, TypedDict
from urllib.parse import urlparse
from uuid import UUID

from sqlalchemy import (
    TIMESTAMP,
    CheckConstraint,
    ColumnElement,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    and_,
)
from sqlalchemy.dialects.postgresql import CITEXT, JSONB
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.config import settings
from polar.enums import (
    InvoiceNumbering,
    SubscriptionProrationBehavior,
    TaxBehaviorOption,
)
from polar.kit.currency import PresentmentCurrency
from polar.kit.db.models import RateLimitGroupMixin, RecordModel
from polar.kit.extensions.sqlalchemy import StringEnum

from .account import Account

if TYPE_CHECKING:
    from polar.email.sender import EmailFromReply

    from .organization_review import OrganizationReview
    from .product import Product


class OrganizationSocials(TypedDict):
    platform: str
    url: str


class SpaceItem(TypedDict, total=False):
    # Discriminator: 'product' references a ProductStorefront by id;
    # 'link' references a StorefrontLink dict by its id (already kept
    # inside storefront_links).
    kind: str  # "product" | "link"
    id: str
    hidden: bool  # default False; lets creators take items off the Space
    # without deleting them. Products restore from the
    # picker; links restore by toggling the flag back.


class OrganizationStorefrontSettings(TypedDict, total=False):
    enabled: bool
    show_header: bool
    header_image_url: str | None
    show_logo: bool
    show_name: bool
    show_description: bool
    description: str | None
    thumbnail_size: str  # "small" | "medium" | "large"
    show_product_details: bool
    profile_title: str | None
    skills: list[str]
    languages: list[str]
    available_for_work: bool
    contact_url: str | None  # mailto: or https:// for the "Available for work" CTA
    featured_mode: str  # "all" | "curated"
    featured_product_ids: list[str]
    show_card_products: bool
    storefront_links: list[dict]  # list of StorefrontLink dicts
    links_position: (
        str  # "before_products" | "after_products" — DEPRECATED, see block_order
    )
    block_order: list[str]  # explicit ordering, e.g. ["products", "links", "forms"]
    links_layout: str  # "classic" | "carousel" | "image_grid" | "card"
    header_focal_point: str | None  # e.g. "50% 30%"
    # New flat-ordering model. When non-empty, this is the single source
    # of truth for what shows on the Space and in what order — products
    # and links can interleave freely (a link between two products,
    # etc.). Empty → renderers fall back to deriving from
    # featured_product_ids + storefront_links + block_order so existing
    # rows keep rendering identically until a creator hits Arrange.
    space_items: list[SpaceItem]


_default_storefront_settings: OrganizationStorefrontSettings = {
    "enabled": False,
    "show_header": True,
    "header_image_url": None,
    "show_logo": True,
    "show_name": True,
    "show_description": True,
    "description": None,
    "thumbnail_size": "large",
    "show_product_details": True,
    "profile_title": None,
    "skills": [],
    "languages": [],
    "available_for_work": False,
    "contact_url": None,
    "featured_mode": "curated",
    "featured_product_ids": [],
    "show_card_products": True,
    "storefront_links": [],
    "links_position": "after_products",
    "block_order": ["products", "links"],
    "links_layout": "classic",
    "header_focal_point": None,
}


class OrganizationDetails(TypedDict):
    about: str
    product_description: str
    intended_use: str
    customer_acquisition: list[str]
    future_annual_revenue: int
    switching: bool
    switching_from: str | None
    previous_annual_revenue: int


class OrganizationNotificationSettings(TypedDict):
    new_order: bool
    new_subscription: bool


_default_notification_settings: OrganizationNotificationSettings = {
    "new_order": True,
    "new_subscription": True,
}


class OrganizationSubscriptionSettings(TypedDict):
    allow_multiple_subscriptions: bool
    # Legacy - to be removed separately
    allow_customer_updates: bool
    proration_behavior: SubscriptionProrationBehavior
    benefit_revocation_grace_period: int
    prevent_trial_abuse: bool


_default_subscription_settings: OrganizationSubscriptionSettings = {
    "allow_multiple_subscriptions": False,
    "allow_customer_updates": True,
    "proration_behavior": SubscriptionProrationBehavior.prorate,
    "benefit_revocation_grace_period": 0,
    "prevent_trial_abuse": False,
}


class OrganizationOrderSettings(TypedDict):
    invoice_numbering: InvoiceNumbering


_default_order_settings: OrganizationOrderSettings = {
    "invoice_numbering": InvoiceNumbering.customer,
}


class OrganizationCustomerEmailSettings(TypedDict):
    order_confirmation: bool
    subscription_cancellation: bool
    subscription_confirmation: bool
    subscription_cycled: bool
    subscription_past_due: bool
    subscription_revoked: bool
    subscription_uncanceled: bool
    subscription_updated: bool


_default_customer_email_settings: OrganizationCustomerEmailSettings = {
    "order_confirmation": True,
    "subscription_cancellation": True,
    "subscription_confirmation": True,
    "subscription_cycled": True,
    "subscription_past_due": True,
    "subscription_revoked": True,
    "subscription_uncanceled": True,
    "subscription_updated": True,
}


class CustomerPortalUsageSettings(TypedDict):
    show: bool


class CustomerPortalSubscriptionSettings(TypedDict):
    update_seats: bool
    update_plan: bool


class OrganizationCustomerPortalSettings(TypedDict):
    usage: CustomerPortalUsageSettings
    subscription: CustomerPortalSubscriptionSettings


_default_customer_portal_settings: OrganizationCustomerPortalSettings = {
    "usage": {"show": True},
    "subscription": {
        "update_seats": True,
        "update_plan": True,
    },
}


class OrganizationStatus(StrEnum):
    CREATED = "created"
    ONBOARDING_STARTED = "onboarding_started"
    INITIAL_REVIEW = "initial_review"
    ONGOING_REVIEW = "ongoing_review"
    DENIED = "denied"
    ACTIVE = "active"

    def get_display_name(self) -> str:
        return {
            OrganizationStatus.CREATED: "Created",
            OrganizationStatus.ONBOARDING_STARTED: "Onboarding Started",
            OrganizationStatus.INITIAL_REVIEW: "Initial Review",
            OrganizationStatus.ONGOING_REVIEW: "Ongoing Review",
            OrganizationStatus.DENIED: "Denied",
            OrganizationStatus.ACTIVE: "Active",
        }[self]

    @classmethod
    def review_statuses(cls) -> set[Self]:
        return {cls.INITIAL_REVIEW, cls.ONGOING_REVIEW}  # pyright: ignore

    @classmethod
    def payment_ready_statuses(cls) -> set[Self]:
        return {cls.ACTIVE, *cls.review_statuses()}  # pyright: ignore


class Organization(RateLimitGroupMixin, RecordModel):
    __tablename__ = "organizations"
    __table_args__ = (
        UniqueConstraint("slug"),
        CheckConstraint(
            "next_review_threshold >= 0", name="next_review_threshold_positive"
        ),
    )

    name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    slug: Mapped[str] = mapped_column(CITEXT, nullable=False, unique=True)
    _avatar_url: Mapped[str | None] = mapped_column(
        String, name="avatar_url", nullable=True
    )

    email: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    website: Mapped[str | None] = mapped_column(String, nullable=True, default=None)

    @property
    def avatar_url(self) -> str | None:
        if self._avatar_url:
            return self._avatar_url

        if not self.website or not settings.LOGO_DEV_PUBLISHABLE_KEY:
            return None

        parsed = urlparse(self.website)
        domain = parsed.netloc or parsed.path
        domain = domain.lower().removeprefix("www.")

        return f"https://img.logo.dev/{domain}?size=64&retina=true&token={settings.LOGO_DEV_PUBLISHABLE_KEY}&fallback=404"

    @avatar_url.setter
    def avatar_url(self, value: str | None) -> None:
        self._avatar_url = value

    socials: Mapped[list[OrganizationSocials]] = mapped_column(
        JSONB, nullable=False, default=list
    )
    details: Mapped[OrganizationDetails] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    details_submitted_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True)
    )

    customer_invoice_prefix: Mapped[str] = mapped_column(String, nullable=False)
    customer_invoice_next_number: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1
    )

    account_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("accounts.id", ondelete="set null"), nullable=True
    )
    status: Mapped[OrganizationStatus] = mapped_column(
        StringEnum(OrganizationStatus),
        nullable=False,
        default=OrganizationStatus.CREATED,
    )
    next_review_threshold: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    status_updated_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    initially_reviewed_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )

    internal_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    @declared_attr
    def account(cls) -> Mapped[Account | None]:
        return relationship(Account, lazy="raise", back_populates="organizations")

    onboarded_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    ai_onboarding_completed_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )

    # Time of blocking traffic/activity to given organization
    blocked_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=True,
        default=None,
    )

    profile_settings: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )

    storefront_settings: Mapped[OrganizationStorefrontSettings] = mapped_column(
        JSONB, nullable=False, default=_default_storefront_settings
    )

    # Active custom storefront domain (learn.creator.com), denormalized from
    # OrganizationCustomDomain so every URL builder can read it without an
    # extra query. Single writer: the organization_custom_domain service
    # sets it on verification and clears it on demotion/removal/replacement.
    # None = serve from the platform host.
    custom_domain: Mapped[str | None] = mapped_column(
        CITEXT, nullable=True, default=None
    )

    subscription_settings: Mapped[OrganizationSubscriptionSettings] = mapped_column(
        JSONB, nullable=False, default=_default_subscription_settings
    )

    order_settings: Mapped[OrganizationOrderSettings] = mapped_column(
        JSONB, nullable=False, default=_default_order_settings
    )

    notification_settings: Mapped[OrganizationNotificationSettings] = mapped_column(
        JSONB, nullable=False, default=_default_notification_settings
    )

    customer_email_settings: Mapped[OrganizationCustomerEmailSettings] = mapped_column(
        JSONB, nullable=False, default=_default_customer_email_settings
    )

    customer_portal_settings: Mapped[OrganizationCustomerPortalSettings] = (
        mapped_column(JSONB, nullable=False, default=_default_customer_portal_settings)
    )

    customer_portal_sign_in_image_url: Mapped[str | None] = mapped_column(
        String, nullable=True, default=None
    )
    """Creator-uploaded image shown on the left panel of the customer portal
    sign-in screen. Configured from the course builder's "Auth" tab and applies
    to the whole organization's portal sign-in (the portal is org-scoped, not
    per-course). When unset, the portal falls back to the organization's most
    recent course thumbnail."""

    customer_portal_sign_in_image_position: Mapped[str | None] = mapped_column(
        String, nullable=True, default=None
    )
    """CSS object-position (e.g. "50% 30%") for the sign-in image, set by
    dragging to reposition in the Auth tab. Applies to the uploaded image;
    when falling back to a course thumbnail the portal uses that course's own
    object-position instead."""

    customer_portal_sign_in_theme: Mapped[str | None] = mapped_column(
        String, nullable=True, default=None
    )
    """Creator-chosen appearance for the customer portal sign-in screen:
    "light" or "dark". The customer does not toggle this — it's part of the
    creator's design. None is treated as "light"."""

    @property
    def allow_customer_updates(self) -> bool:
        return self.customer_portal_settings["subscription"]["update_plan"]

    #
    # Feature Flags
    #

    feature_settings: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )

    #
    # Custom outbound email sender (Pro+)
    #

    email_sender_domain: Mapped[str | None] = mapped_column(
        String(253), nullable=True, default=None
    )
    """The creator's verified email domain, e.g. "creator.com". When set
    AND email_sender_verified_at is set, broadcasts and sequence steps
    use this domain in their From address instead of the platform default.
    """

    email_sender_verified_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    """Timestamp when Resend DKIM verification succeeded."""

    email_sender_resend_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default=None
    )
    """Resend's domain id, populated when the creator's domain is
    registered via POST https://api.resend.com/domains."""

    email_sender_dns_records: Mapped[list[dict[str, Any]] | None] = mapped_column(
        "email_sender_dns_records", JSONB, nullable=True, default=None
    )
    """Cached DNS records (TXT/MX/CNAME) the creator needs to install
    before DKIM can verify. Returned by Resend at domain-creation time."""

    @property
    def has_verified_sender_domain(self) -> bool:
        return (
            self.email_sender_domain is not None
            and self.email_sender_verified_at is not None
        )

    #
    # Currency settings
    #
    default_presentment_currency: Mapped[PresentmentCurrency] = mapped_column(
        String(3), nullable=False, default="usd"
    )
    default_tax_behavior: Mapped[TaxBehaviorOption] = mapped_column(
        StringEnum(TaxBehaviorOption),
        nullable=False,
        default=TaxBehaviorOption.location,
    )

    #
    # Fields synced from GitHub
    #

    # Org description or user bio
    bio: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    company: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    blog: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    location: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    twitter_username: Mapped[str | None] = mapped_column(
        String, nullable=True, default=None
    )

    #
    # End: Fields synced from GitHub
    #

    @hybrid_property
    def can_authenticate(self) -> bool:
        return self.deleted_at is None and self.blocked_at is None

    @can_authenticate.inplace.expression
    @classmethod
    def _can_authenticate_expression(cls) -> ColumnElement[bool]:
        return and_(cls.deleted_at.is_(None), cls.blocked_at.is_(None))

    @hybrid_property
    def storefront_enabled(self) -> bool:
        return self.storefront_settings.get(
            "enabled", self.profile_settings.get("enabled", False)
        )

    @storefront_enabled.inplace.expression
    @classmethod
    def _storefront_enabled_expression(cls) -> ColumnElement[bool]:
        return Organization.storefront_settings["enabled"].as_boolean()

    @hybrid_property
    def is_under_review(self) -> bool:
        return self.status in OrganizationStatus.review_statuses()

    @is_under_review.inplace.expression
    @classmethod
    def _is_under_review_expression(cls) -> ColumnElement[bool]:
        return cls.status.in_(OrganizationStatus.review_statuses())

    @property
    def polar_site_url(self) -> str:
        return f"{settings.FRONTEND_BASE_URL}/{self.slug}"

    @property
    def storefront_base_url(self) -> str:
        """Public base URL of this org's storefront/portal: the verified
        custom domain when one is live (slug-less paths), else the
        platform host + slug."""
        if self.custom_domain:
            return f"https://{self.custom_domain}"
        return f"{settings.FRONTEND_BASE_URL}/{self.slug}"

    def storefront_url(self, path: str = "") -> str:
        """Absolute storefront URL for a slug-less path like
        "/portal/authenticate" — lands on the custom domain when live,
        else on the platform host with the slug prefix."""
        return f"{self.storefront_base_url}{path}"

    @property
    def account_url(self) -> str:
        return f"{settings.FRONTEND_BASE_URL}/dashboard/{self.slug}/finance/account"

    @property
    def allow_multiple_subscriptions(self) -> bool:
        return self.subscription_settings["allow_multiple_subscriptions"]

    @property
    def proration_behavior(self) -> SubscriptionProrationBehavior:
        return SubscriptionProrationBehavior(
            self.subscription_settings["proration_behavior"]
        )

    @property
    def benefit_revocation_grace_period(self) -> int:
        return self.subscription_settings["benefit_revocation_grace_period"]

    @property
    def prevent_trial_abuse(self) -> bool:
        return self.subscription_settings.get("prevent_trial_abuse", False)

    @property
    def invoice_numbering(self) -> InvoiceNumbering:
        return InvoiceNumbering(self.order_settings["invoice_numbering"])

    @property
    def customer_portal_subscription_update_seats(self) -> bool:
        return self.customer_portal_settings.get("subscription", {}).get(
            "update_seats", True
        )

    @property
    def customer_portal_subscription_update_plan(self) -> bool:
        return self.customer_portal_settings.get("subscription", {}).get(
            "update_plan", True
        )

    @declared_attr
    def all_products(cls) -> Mapped[list["Product"]]:
        return relationship("Product", lazy="raise", back_populates="organization")

    @declared_attr
    def products(cls) -> Mapped[list["Product"]]:
        return relationship(
            "Product",
            lazy="raise",
            primaryjoin=(
                "and_("
                "Product.organization_id == Organization.id, "
                "Product.is_archived.is_(False)"
                ")"
            ),
            viewonly=True,
        )

    @declared_attr
    def review(cls) -> Mapped["OrganizationReview | None"]:
        return relationship(
            "OrganizationReview",
            lazy="raise",
            back_populates="organization",
            cascade="delete, delete-orphan",
            uselist=False,  # This makes it a one-to-one relationship
        )

    def is_blocked(self) -> bool:
        if self.blocked_at is not None:
            return True
        return False

    def is_active(self) -> bool:
        return self.status == OrganizationStatus.ACTIVE

    def statement_descriptor(self, suffix: str = "") -> str:
        max_length = settings.stripe_descriptor_suffix_max_length
        if suffix:
            space_for_slug = max_length - len(suffix)
            return self.slug[:space_for_slug] + suffix
        return self.slug[:max_length]

    @property
    def statement_descriptor_prefixed(self) -> str:
        # Cannot use *. Setting separator to # instead.
        return f"{settings.STRIPE_STATEMENT_DESCRIPTOR}# {self.statement_descriptor()}"

    @property
    def email_from_reply(self) -> "EmailFromReply":
        return {
            "from_name": f"{self.name} (via {settings.EMAIL_FROM_NAME})",
            "from_email_addr": f"{self.slug}@{settings.EMAIL_FROM_DOMAIN}",
            "reply_to_name": self.name,
            "reply_to_email_addr": self.email
            or settings.EMAIL_DEFAULT_REPLY_TO_EMAIL_ADDRESS,
        }
