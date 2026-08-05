from pydantic import Field

from polar.kit.schemas import Schema

from .tiers import (
    TierEntitlements as TierEntitlementsDataclass,
    TierFeatures as TierFeaturesDataclass,
    TierKey,
    TierLimits as TierLimitsDataclass,
    TransactionFee as TransactionFeeDataclass,
)


class TransactionFee(Schema):
    percent_basis_points: int = Field(
        description="Transaction fee percentage in basis points (500 = 5.00%)."
    )
    fixed_cents: int = Field(
        description="Per-transaction fixed fee, in the smallest currency unit (cents)."
    )

    @classmethod
    def from_dataclass(cls, source: TransactionFeeDataclass) -> "TransactionFee":
        return cls(
            percent_basis_points=source.percent_basis_points,
            fixed_cents=source.fixed_cents,
        )


class TierLimits(Schema):
    published_courses: int | None = Field(
        description="Max published courses (null = unlimited)."
    )
    lessons_per_course: int | None = Field(
        description="Max lessons per course (null = unlimited)."
    )
    active_email_sequences: int | None = Field(
        description="Max simultaneously-active email sequences (null = unlimited)."
    )
    video_hours_hosted: int | None = Field(
        description="Max video hours hosted (null = unlimited)."
    )
    video_views_monthly: int | None = Field(
        description="Max video views per month (null = unlimited)."
    )
    storage_gb: int | None = Field(
        description="Max downloadable file storage in GB (null = unlimited)."
    )
    email_subscribers: int | None = Field(
        description="Max email subscribers (null = unlimited)."
    )
    email_sends_monthly: int | None = Field(
        description="Max outbound emails per month (null = unlimited)."
    )
    dashboard_team_seats: int | None = Field(
        description="Max dashboard team members (null = unlimited)."
    )

    @classmethod
    def from_dataclass(cls, source: TierLimitsDataclass) -> "TierLimits":
        return cls(
            published_courses=source.published_courses,
            lessons_per_course=source.lessons_per_course,
            active_email_sequences=source.active_email_sequences,
            video_hours_hosted=source.video_hours_hosted,
            video_views_monthly=source.video_views_monthly,
            storage_gb=source.storage_gb,
            email_subscribers=source.email_subscribers,
            email_sends_monthly=source.email_sends_monthly,
            dashboard_team_seats=source.dashboard_team_seats,
        )


class TierFeatures(Schema):
    drip_scheduling: bool
    email_sequences_and_segments: bool
    email_ab_testing: bool
    stackable_discounts: bool
    custom_email_sender_domain: bool
    seat_based_product_pricing: bool
    cohort_analytics: bool
    custom_pricing_negotiation: bool
    customer_wallet: bool
    white_label_course_player: bool
    sandbox_mode: bool
    custom_storefront_domain: bool
    custom_checkout_domain: bool
    sso: bool
    audit_logs: bool

    @classmethod
    def from_dataclass(cls, source: TierFeaturesDataclass) -> "TierFeatures":
        return cls(
            drip_scheduling=source.drip_scheduling,
            email_sequences_and_segments=source.email_sequences_and_segments,
            email_ab_testing=source.email_ab_testing,
            stackable_discounts=source.stackable_discounts,
            custom_email_sender_domain=source.custom_email_sender_domain,
            seat_based_product_pricing=source.seat_based_product_pricing,
            cohort_analytics=source.cohort_analytics,
            custom_pricing_negotiation=source.custom_pricing_negotiation,
            customer_wallet=source.customer_wallet,
            white_label_course_player=source.white_label_course_player,
            sandbox_mode=source.sandbox_mode,
            custom_storefront_domain=source.custom_storefront_domain,
            custom_checkout_domain=source.custom_checkout_domain,
            sso=source.sso,
            audit_logs=source.audit_logs,
        )


class Entitlements(Schema):
    tier: TierKey = Field(description="Current Spaire subscription tier.")
    transaction_fee: TransactionFee = Field(
        description=(
            "List-price transaction fee for this tier. The actually-charged "
            "fee is on the merchant's Account record and may be lower for "
            "Scale customers with negotiated rates."
        )
    )
    limits: TierLimits
    features: TierFeatures
    rate_limit_group: str = Field(
        description="API rate-limit group assigned to this tier."
    )
    monthly_price_cents: int = Field(
        description="Monthly Spaire subscription price, in cents (0 = Legacy)."
    )

    @classmethod
    def from_dataclass(
        cls, source: TierEntitlementsDataclass
    ) -> "Entitlements":
        return cls(
            tier=source.tier,
            transaction_fee=TransactionFee.from_dataclass(source.transaction_fee),
            limits=TierLimits.from_dataclass(source.limits),
            features=TierFeatures.from_dataclass(source.features),
            rate_limit_group=source.rate_limit_group,
            monthly_price_cents=source.monthly_price_cents,
        )
