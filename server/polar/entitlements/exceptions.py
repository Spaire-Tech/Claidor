"""Errors surfaced by entitlements guards.

Both are 402 Payment Required — the operation cannot proceed on the
current tier but would succeed after upgrading.
"""

from polar.exceptions import PolarError

from .tiers import TierKey


_FEATURE_LABEL: dict[str, str] = {
    "drip_scheduling": "Drip-scheduled lesson release",
    "email_sequences_and_segments": "Email sequences and segments",
    "email_ab_testing": "Email A/B testing",
    "stackable_discounts": "Stackable and cart-rule discounts",
    "custom_email_sender_domain": "Custom email sender domain",
    "seat_based_product_pricing": "Seat-based B2B product pricing",
    "cohort_analytics": "Cohort retention analytics",
    "custom_pricing_negotiation": "Custom pricing negotiation",
    "customer_wallet": "Customer wallet (prepaid balance)",
    "white_label_course_player": "White-label course player",
    "sandbox_mode": "Sandbox / test mode",
    "custom_storefront_domain": "Custom storefront domain",
    "custom_checkout_domain": "Custom checkout domain",
    "sso": "Single sign-on (SSO)",
    "audit_logs": "Audit logs",
}


_LIMIT_LABEL: dict[str, str] = {
    "published_courses": "published courses",
    "lessons_per_course": "lessons per course",
    "video_hours_hosted": "video hours hosted",
    "video_views_monthly": "video views per month",
    "storage_gb": "GB of file storage",
    "email_subscribers": "email subscribers",
    "email_sends_monthly": "email sends per month",
    "dashboard_team_seats": "dashboard team seats",
}


class FeatureNotInPlanError(PolarError):
    def __init__(self, feature: str, tier: TierKey) -> None:
        label = _FEATURE_LABEL.get(feature, feature.replace("_", " "))
        super().__init__(
            (
                f"{label} is not available on the {tier.value} plan. "
                "Upgrade your Spaire plan to unlock it."
            ),
            402,
        )
        self.feature = feature
        self.tier = tier


class TierLimitReachedError(PolarError):
    def __init__(self, key: str, limit: int, tier: TierKey) -> None:
        label = _LIMIT_LABEL.get(key, key.replace("_", " "))
        super().__init__(
            (
                f"Your {tier.value} plan allows {limit} {label}. Upgrade "
                "your Spaire plan to raise this limit."
            ),
            402,
        )
        self.key = key
        self.limit = limit
        self.tier = tier
