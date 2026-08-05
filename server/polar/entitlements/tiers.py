"""Static tier definitions — the source of truth for what each tier includes.

These mirror the customer-facing PRICING.md table. When updating prices or
limits here, update PRICING.md in the same PR.
"""

from dataclasses import dataclass
from enum import StrEnum

from polar.config import settings


class TierKey(StrEnum):
    starter = "starter"
    studio = "studio"
    scale = "scale"
    # `unmanaged`: platform billing is not in play at all — the platform org
    # is unconfigured (single-tenant / self-hosted / dev), or the org being
    # resolved IS the platform org itself. Unlimited, no enforcement. This
    # preserves open-source / single-tenant behavior. It is NOT a state any
    # real creator can land in.
    unmanaged = "unmanaged"
    # `inactive`: a real creator org on a configured platform that has NO
    # active paid/trialing plan — never converted, trial lapsed, or churned.
    # Deliberately restrictive (everything gated off) so "no plan == no
    # access": there is no free, unlimited fallback. The dashboard plan-gate
    # routes these orgs to /onboarding/plan; the delinquency lifecycle owns
    # the storefront/admin side. There is no public `inactive` product.
    inactive = "inactive"


# The Starter tier originally shipped under the key "pro". Existing platform
# product/subscription metadata, older API clients, and historical analytics
# may still carry "pro"; normalize it to the canonical "starter" before any
# enum resolution so no existing record silently resolves wrong.
_TIER_ALIASES: dict[str, str] = {"pro": "starter"}

# Tiers a creator actively pays for. Used by fee-sync and access checks to
# tell a "real plan" apart from the unmanaged/inactive fallbacks.
PAID_TIERS: tuple[TierKey, ...] = (TierKey.starter, TierKey.studio, TierKey.scale)


def normalize_tier_value(value: str) -> str:
    """Map a (possibly legacy) tier string onto its canonical TierKey value.

    Unknown values pass through unchanged so the caller's own
    ``TierKey(...)`` lookup raises/falls back as before.
    """
    return _TIER_ALIASES.get(value, value)


def tier_from_value(value: str) -> TierKey | None:
    """Resolve a raw tier string (honoring aliases) to a TierKey, or None
    when it doesn't name a known tier."""
    try:
        return TierKey(normalize_tier_value(value))
    except ValueError:
        return None


@dataclass(frozen=True)
class TransactionFee:
    """List price for the tier's transaction fee.

    The actually-charged fee is stored on Account._platform_fee_percent and
    Account._platform_fee_fixed. Tier sync (PR 5) keeps Account aligned with
    the tier; Scale customers with negotiated rates may diverge. Use this
    field for UI display ("list rate"); use the Account fields for actual
    fee deduction.
    """

    percent_basis_points: int  # 500 = 5.00%
    fixed_cents: int  # 50 = $0.50


@dataclass(frozen=True)
class TierLimits:
    """Quota caps. None = unlimited / no enforcement."""

    published_courses: int | None
    lessons_per_course: int | None
    active_email_sequences: int | None
    video_hours_hosted: int | None
    video_views_monthly: int | None
    storage_gb: int | None
    email_subscribers: int | None
    email_sends_monthly: int | None
    dashboard_team_seats: int | None


@dataclass(frozen=True)
class TierFeatures:
    """Boolean feature gates."""

    # Pro+
    drip_scheduling: bool
    email_sequences_and_segments: bool
    email_ab_testing: bool
    stackable_discounts: bool
    custom_email_sender_domain: bool
    seat_based_product_pricing: bool
    cohort_analytics: bool
    # Scale+
    custom_pricing_negotiation: bool
    customer_wallet: bool
    white_label_course_player: bool
    sandbox_mode: bool
    custom_storefront_domain: bool
    custom_checkout_domain: bool
    sso: bool
    audit_logs: bool


@dataclass(frozen=True)
class TierEntitlements:
    """Everything a downstream consumer needs to know about a tier."""

    tier: TierKey
    transaction_fee: TransactionFee
    limits: TierLimits
    features: TierFeatures
    rate_limit_group: str
    # The monthly fee Spaire charges for this tier itself (informational —
    # the actual billing is driven by the platform-org subscription).
    monthly_price_cents: int
    # Soft overage grace above the limit, expressed as a percent. Legacy
    # uses 0% (no enforcement anyway). Starter/Studio/Scale use 10% so
    # creators are not surprised by abrupt blocks when they slightly
    # exceed their cap. Overage inside the grace band is recorded as
    # `spaire.quota.overage` events for operator review — it is NOT
    # billed automatically (the platform products carry no metered
    # prices; shipping overage billing is a deliberate pricing decision,
    # and these events would be its input).
    overage_grace_pct: int


# `unmanaged` keeps unlimited features/quotas (no enforcement) and bills at
# the global config default. It exists ONLY for the cases where platform
# billing isn't in play — an unconfigured / single-tenant / self-hosted
# deployment, or the platform org resolving itself. No real creator lands
# here, so "unlimited" is safe.
_UNMANAGED = TierEntitlements(
    tier=TierKey.unmanaged,
    transaction_fee=TransactionFee(
        percent_basis_points=settings.PLATFORM_FEE_BASIS_POINTS,
        fixed_cents=settings.PLATFORM_FEE_FIXED,
    ),
    limits=TierLimits(
        published_courses=None,
        lessons_per_course=None,
        active_email_sequences=None,
        video_hours_hosted=None,
        video_views_monthly=None,
        storage_gb=None,
        email_subscribers=None,
        email_sends_monthly=None,
        dashboard_team_seats=None,
    ),
    features=TierFeatures(
        drip_scheduling=True,
        email_sequences_and_segments=True,
        email_ab_testing=True,
        stackable_discounts=True,
        custom_email_sender_domain=True,
        seat_based_product_pricing=True,
        cohort_analytics=True,
        custom_pricing_negotiation=True,
        customer_wallet=True,
        white_label_course_player=True,
        sandbox_mode=True,
        custom_storefront_domain=True,
        custom_checkout_domain=True,
        sso=True,
        audit_logs=True,
    ),
    rate_limit_group="default",
    monthly_price_cents=0,
    overage_grace_pct=0,
)


# `inactive` is the restrictive state for a real creator org with no active
# plan (never converted / trial lapsed / churned). Everything is gated off —
# zero limits, no features — so there is no free, unlimited fallback. The
# dashboard plan-gate routes these orgs to plan selection; the delinquency
# lifecycle handles storefront/admin access. Billed at the global default if
# any stray transaction occurs.
_INACTIVE = TierEntitlements(
    tier=TierKey.inactive,
    transaction_fee=TransactionFee(
        percent_basis_points=settings.PLATFORM_FEE_BASIS_POINTS,
        fixed_cents=settings.PLATFORM_FEE_FIXED,
    ),
    limits=TierLimits(
        published_courses=0,
        lessons_per_course=0,
        active_email_sequences=0,
        video_hours_hosted=0,
        video_views_monthly=0,
        storage_gb=0,
        email_subscribers=0,
        email_sends_monthly=0,
        dashboard_team_seats=0,
    ),
    features=TierFeatures(
        drip_scheduling=False,
        email_sequences_and_segments=False,
        email_ab_testing=False,
        stackable_discounts=False,
        custom_email_sender_domain=False,
        seat_based_product_pricing=False,
        cohort_analytics=False,
        custom_pricing_negotiation=False,
        customer_wallet=False,
        white_label_course_player=False,
        sandbox_mode=False,
        custom_storefront_domain=False,
        custom_checkout_domain=False,
        sso=False,
        audit_logs=False,
    ),
    rate_limit_group="default",
    monthly_price_cents=0,
    overage_grace_pct=0,
)


_STARTER = TierEntitlements(
    tier=TierKey.starter,
    # Steep fee spine (7% / 5% / 3%, all + $0.30) so moving up a tier buys a
    # real rate cut, and the entry rate covers the usage-driven serving cost
    # (Mux/AI/email/storage) that a transaction fee on a low-GMV creator
    # otherwise wouldn't. The fixed $0.30 covers Stripe's per-transaction
    # floor so low-ticket sales aren't loss-making.
    transaction_fee=TransactionFee(percent_basis_points=700, fixed_cents=30),
    limits=TierLimits(
        # Email is metered on ONE dimension only — list size (email_subscribers).
        # Sends and active sequences are unlimited so we never recreate the
        # "10 emails and you're capped" failure; the ESP cost is absorbed into
        # the fee spine. Studio still has clear reasons to upgrade (bigger
        # list, custom sender domain, A/B testing, wallet, team seats).
        published_courses=5,
        lessons_per_course=50,
        active_email_sequences=None,
        video_hours_hosted=25,
        video_views_monthly=5_000,
        storage_gb=5,
        email_subscribers=10_000,
        email_sends_monthly=None,
        dashboard_team_seats=1,
    ),
    features=TierFeatures(
        drip_scheduling=True,
        # email_sequences gate (feature on/off). The active-sequence count
        # is no longer capped on any tier — active_email_sequences is None
        # everywhere now that email is metered on list size only.
        email_sequences_and_segments=True,
        # Pulled up to Studio+. Starter doesn't get A/B testing — most
        # Starter customers have lists where A/B testing has little
        # statistical power, and it helps justify the Studio price.
        email_ab_testing=False,
        # stackable_discounts: roadmap — discount engine doesn't support
        # combining codes yet. Flip to True when the engine ships it.
        stackable_discounts=False,
        # Pulled up to Studio+. Domain warming + DKIM is a serious-
        # business need; making it a Studio differentiator helps justify
        # the Studio price.
        custom_email_sender_domain=False,
        # Pulled up to Studio+. B2B seat pricing is for orgs selling to
        # other orgs — that's not a $49 starter use case.
        seat_based_product_pricing=False,
        # cohort_analytics: roadmap — only basic churn rate is computed
        # today. Flip to True when retention curves and segment-level
        # cohort views ship.
        cohort_analytics=False,
        custom_pricing_negotiation=False,
        customer_wallet=False,
        white_label_course_player=False,
        # Sandbox is a separate environment (sandbox.spairehq.com)
        # available to every creator; the entitlement is informational
        # and not used as a require_feature gate.
        sandbox_mode=True,
        custom_storefront_domain=False,
        custom_checkout_domain=False,
        sso=False,
        audit_logs=False,
    ),
    rate_limit_group="elevated",
    monthly_price_cents=4900,
    overage_grace_pct=10,
)


_STUDIO = TierEntitlements(
    tier=TierKey.studio,
    transaction_fee=TransactionFee(percent_basis_points=500, fixed_cents=30),
    limits=TierLimits(
        # Studio is the "real business" tier — generous on courses /
        # lessons but bounded on contacts (list size) and video so Scale
        # stays meaningful. Email is metered on list size only: sends and
        # active sequences are unlimited (ESP cost absorbed in the fee
        # spine), so the only email lever between tiers is the contact cap.
        published_courses=25,
        lessons_per_course=None,
        active_email_sequences=None,
        video_hours_hosted=50,
        video_views_monthly=50_000,
        storage_gb=50,
        email_subscribers=50_000,
        email_sends_monthly=None,
        dashboard_team_seats=5,
    ),
    features=TierFeatures(
        drip_scheduling=True,
        email_sequences_and_segments=True,
        email_ab_testing=True,
        # stackable_discounts: roadmap — see Pro definition.
        stackable_discounts=False,
        custom_email_sender_domain=True,
        seat_based_product_pricing=True,
        # cohort_analytics: roadmap — see Pro definition.
        cohort_analytics=False,
        custom_pricing_negotiation=False,
        customer_wallet=True,
        white_label_course_player=True,
        # See Pro definition.
        sandbox_mode=True,
        # Hosted (custom) storefront domain — serve the masterclass landing
        # + customer portal from the creator's own subdomain. Studio+.
        custom_storefront_domain=True,
        custom_checkout_domain=False,
        sso=False,
        audit_logs=False,
    ),
    rate_limit_group="elevated",
    monthly_price_cents=12900,
    overage_grace_pct=10,
)


_SCALE = TierEntitlements(
    tier=TierKey.scale,
    # 3% base is at/under the true MoR cost floor (~3.5%); it stays profitable
    # only because international/FX cards add the +1.5% passthrough
    # (PlatformFeeType.international_payment) on top. Margin on this tier comes
    # from the monthly fee, not the variable rate.
    transaction_fee=TransactionFee(percent_basis_points=300, fixed_cents=30),
    limits=TierLimits(
        # Scale caps are the ceiling above which custom pricing kicks
        # in. Anything bigger → talk-to-sales. The 150k contact cap is set
        # deliberately high so a published Scale plan can hold a whale on
        # day one; bigger lists are a negotiated bump, not a hard wall.
        # Sends and active sequences are unlimited like every tier — email
        # is metered on list size alone.
        published_courses=100,
        lessons_per_course=None,
        active_email_sequences=None,
        video_hours_hosted=200,
        video_views_monthly=250_000,
        storage_gb=250,
        email_subscribers=150_000,
        email_sends_monthly=None,
        dashboard_team_seats=20,
    ),
    features=TierFeatures(
        drip_scheduling=True,
        email_sequences_and_segments=True,
        email_ab_testing=True,
        # stackable_discounts: roadmap — see Pro definition.
        stackable_discounts=False,
        custom_email_sender_domain=True,
        seat_based_product_pricing=True,
        # cohort_analytics: roadmap — see Pro definition.
        cohort_analytics=False,
        custom_pricing_negotiation=True,
        customer_wallet=True,
        white_label_course_player=True,
        # See Pro definition.
        sandbox_mode=True,
        # Hosted (custom) storefront domain — Studio and above.
        custom_storefront_domain=True,
        custom_checkout_domain=False,
        sso=False,
        audit_logs=True,
    ),
    rate_limit_group="elevated",
    monthly_price_cents=29900,
    overage_grace_pct=10,
)


def get_definition(tier: TierKey) -> TierEntitlements:
    return _TIER_DEFINITIONS[tier]


_TIER_DEFINITIONS: dict[TierKey, TierEntitlements] = {
    TierKey.starter: _STARTER,
    TierKey.studio: _STUDIO,
    TierKey.scale: _SCALE,
    TierKey.unmanaged: _UNMANAGED,
    TierKey.inactive: _INACTIVE,
}
