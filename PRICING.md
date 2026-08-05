# Spaire Pricing

Three paid tiers — **Starter**, **Studio**, **Scale** — calibrated against what the platform actually ships today and benchmarked against Kajabi, Podia, Thinkific, Lemon Squeezy, Paddle, and Gumroad. Every paid tier ships with a **14-day free trial** so creators can build inside Spaire before being charged.

Spaire's positioning vs. those competitors:

- **Merchant of Record** built in (Kajabi/Podia/Thinkific don't do this — tax/VAT stays on the creator).
- **Developer-first** APIs, SDKs, webhooks, license keys, usage-based billing (course platforms lack these).
- **Course builder + email marketing** in the same product (Lemon Squeezy/Paddle/Gumroad don't have these).

The tiering story: "Stripe-grade infra + Kajabi-grade creator tools + MoR tax handling — pick your scale."

---

## Universal — applies to Starter, Studio, and Scale

The following are part of the product on every tier. Gating any of these would break delivery for paying customers.

| Item | Policy |
|---|---|
| Free trial on every paid tier | 14 days, card required up front (charged at day 14 unless canceled) |
| Sandbox / test environment (sandbox.spairehq.com) | every creator, no charge |
| Merchant of Record (tax/VAT handled) | ✓ |
| Customer portal (login, manage subs, access purchases) | ✓ |
| Course player + lesson access for buyers | ✓ |
| Digital download delivery | ✓ |
| License key issuance & validation | ✓ |
| Discord / GitHub benefit granting | ✓ |
| Customer invoices & receipts | ✓ |
| Full REST API + all webhook events | ✓ |
| Email broadcasts | ✓ |
| Discount codes (creator-shared) | ✓ |
| CSV exports of analytics & customer data | ✓ |
| "Powered by Spaire" badge on storefront & checkout | shown on Starter; removable on Studio & Scale |
| Payout settlement | 7-day delay from transaction date |
| Settlement grandfathering | orgs created before May 12, 2026 keep instant payouts |
| Stripe chargeback fee | $15 passthrough to creator |
| International card / FX | Stripe surcharge passthrough |
| Minimum payout threshold | $25 |
| Refund policy | Spaire's % fee retained on refund |

---

## Tier differentiators

| Lever | Starter | Studio | Scale |
|---|---|---|---|
| **Best for** | Solo creators starting out | Small teams scaling up | Established businesses |
| **Free trial** | 14 days | 14 days | 14 days |
| **Monthly** | $49 | $129 | $299 |
| **Annual** (save 20%) | $39/mo · $470/yr | $103/mo · $1,238/yr | $239/mo · $2,870/yr |
| **Transaction fee** | 7% + $0.30 | 5% + $0.30 | 3% + $0.30 |
| **Custom pricing at scale** | — | — | available above $50k/mo GMV |
| **Published courses** § | 5 | 25 | 100 |
| **Lessons per course** | 50 | unlimited | unlimited |
| **Active email sequences** | unlimited | unlimited | unlimited |
| **Email subscribers** † | 10,000 | 50,000 | 150,000 |
| **Email sends / month** | unlimited | unlimited | unlimited |
| **Course video hours hosted** ‡ | 25 | 50 | 200 |
| **Course video views / month** ‡ | 5,000 | 50,000 | 250,000 |
| **Downloadables storage** ‡ | 5 GB | 50 GB | 250 GB |
| **Dashboard team seats** | 1 | 5 | 20 |
| Products (one-time, sub, downloads, license keys, usage-based) | unlimited | unlimited | unlimited |
| Drip scheduling | ✓ | ✓ | ✓ |
| Email sequences & segments | ✓ | ✓ | ✓ |
| Email A/B testing | — | ✓ | ✓ |
| Stackable / cart-rule discounts ★ | roadmap | roadmap | roadmap |
| Checkout links | ✓ | ✓ | ✓ |
| Embedded checkout on your site | ✓ | ✓ | ✓ |
| Custom email sender domain | — | ✓ | ✓ |
| White-label course player | — | ✓ | ✓ |
| Seat-based product pricing (B2B sales) | — | ✓ | ✓ |
| Customer wallet (prepaid balance, auto-top-up) | — | ✓ | ✓ |
| Analytics — revenue, MRR, churn rate | ✓ | ✓ | ✓ |
| Analytics — cohort retention curves ★ | roadmap | roadmap | roadmap |
| CSV exports of analytics & customer data | ✓ | ✓ | ✓ |
| API rate limits | higher | higher | highest + custom |
| Custom storefront domain ★ | — | — | roadmap |
| Custom checkout domain ★ | — | — | roadmap |
| Audit logs | — | — | ✓ |
| SSO ★ | — | — | roadmap |
| Support | email, 1 business day | priority email, same day | Slack + dedicated AM, 4-hour SLA |

‡ = quota enforcement enforced via metered events.
† = Email is metered on **marketing list size only** — checked directly against the cap whenever a contact is added, not via metered usage events. **Buyers don't count:** a contact acquired through a purchase or linked to a paying customer is uncapped (they're already monetized by the transaction fee), so a creator is never pushed to upgrade by their own sales. Only marketing contacts — signups, lead-magnet opt-ins, manual adds, and imports — count toward the cap. Sends and active sequences are unlimited on every tier, with the ESP cost absorbed into the transaction-fee spine. Scale's 150k contact cap is a published ceiling, not a hard wall — larger lists are a negotiated bump under custom pricing.
§ = Counts **published** courses only — a course occupies a slot once it has a published lesson. Draft courses (no published lesson) are free and unlimited; the cap is enforced at the publish transition, never at course creation. Counting drafts toward the cap was a documented Kajabi surprise we deliberately avoid.
★ = feature itself must be built or completed before this row is shippable.

---

## Glossary

**GMV (Gross Merchandise Value):** total $ value sold through Spaire by a creator in a month — not what Spaire collects in fees. Used to determine eligibility for custom Scale pricing.

**MoR (Merchant of Record):** Spaire is the legal seller, handling sales tax / VAT collection and remittance globally. The creator does not need to register for tax in foreign jurisdictions.

**Customer wallet:** a prepaid balance a creator's customer can top up. Drawn down as they consume usage-priced products. Reduces failed-payment churn on metered billing.

**Drip scheduling:** automatic timed release of course lessons over days/weeks after enrollment, rather than all-at-once access.

**White-label course player:** option to hide Spaire branding from the course video player.

**Custom email sender domain:** outbound emails sent from `you@yourdomain.com` (with DKIM/SPF) instead of Spaire's default `notifications.spairehq.com`.

**SSO:** Single Sign-On for the merchant dashboard via the customer's identity provider (Okta, Google Workspace, Microsoft Entra).

**Audit logs:** "who did what, when" log of admin actions inside an org.

**Sandbox / test mode:** a non-production environment for testing integrations without real payments or transaction fees.

**No-plan states:** there is **no** free or unlimited fallback tier. An organization is always in exactly one of: a paid plan (Starter/Studio/Scale, possibly trialing), or one of two internal no-plan states:

- **`inactive`** — a real creator org on a configured platform with no active plan (never converted, trial lapsed, or churned). Everything is gated off (zero limits, no features); the dashboard routes them to plan selection and the delinquency lifecycle governs storefront/admin access. Not a product, not selectable; it's a resolved state.
- **`unmanaged`** — platform billing isn't configured at all (single-tenant / self-hosted / dev), or the platform org resolving itself. Unlimited, no enforcement. No real creator can land here.

---

## Pricing math sanity check

Spaire's true per-transaction cost as MoR on Stripe is roughly:

| Cost | Rate |
|---|---|
| Stripe card processing (US card) | 2.9% + $0.30 |
| Stripe card processing (international card) | +1.5% |
| Currency conversion | +1% |
| Stripe Tax | +0.5% |
| Chargeback fee (per dispute) | $15 |
| Tax remittance & compliance overhead | ongoing fixed cost |

**Floor cost is ~3.5% + $0.30**, often closer to 4.5% + $0.30 once international and FX are mixed in. International/FX cards add a **+1.5% passthrough** on top of every tier's rate (`PlatformFeeType.international_payment`), so the published rates below are US-card rates.

The fee spine is **steep on purpose** — 7% / 5% / 3% — so moving up a tier buys a real rate cut, and the entry rate covers the usage-driven serving cost (Mux video, AI, email, storage) that a thin transaction fee on a low-GMV creator otherwise wouldn't. The fixed **$0.30** on every tier covers Stripe's per-transaction floor so low-ticket sales aren't loss-making.

This is why:

- **Starter at $49/mo + 7% + $0.30** is the entry point — the high variable rate covers serving cost on creators who use the platform heavily but sell little, while the monthly fee covers compliance overhead.
- **Studio at $129/mo + 5% + $0.30** trades a higher fixed fee for a 2-point lower rate. It pays off for creators above **~$4,000/mo GMV** (the extra $80/mo ÷ the 2% rate cut).
- **Scale at $299/mo + 3% + $0.30** is at/under cost on the variable side; the monthly fee is the margin, and international/FX volume stays profitable via the +1.5% passthrough. It pays off above **~$8,500/mo GMV** vs. Studio.

There is no free tier and no $0 fallback: every active organization is on Starter, Studio, or Scale. An organization that stops paying goes through the delinquency lifecycle (retry → payout-hold/fee-netting → suspension → stop-selling), it does not drop to a free plan.

Custom pricing for the Scale tier kicks in above $50k/month GMV. The negotiated floor is around 3.0% — Stripe's processing cost — and is the same floor competitors like Paddle hold to at scale.

---

## Trial & onboarding flow

1. Creator signs up → the org is provisioned with a platform-org billing Customer row, but **no subscription**. Until they pick a plan the org has no plan (resolves to `inactive`) and the dashboard plan-gate routes them to `/onboarding/plan`.
2. Creator picks a plan (Starter / Studio / Scale) → upgrade-checkout. The trial is **card-required**: the checkout captures their card via a setup intent (no immediate charge) and starts the **14-day trial**. They now have the chosen tier's entitlements and a card on file.
3. At day 14 the generic subscription-cycle scheduler **charges the card on file** and the subscription becomes active. There is no separate "convert" step — the trial flows straight into a paid plan. (If the charge fails, Polar's dunning takes over: past_due → retry → revoke.) A creator can cancel any time before day 14 from `Settings → Plan`.
4. The trial is granted **once per creator** (`trial_consumed_at` is stamped on the platform customer): a creator who cancels and later re-subscribes is billed immediately — no second free trial. Mid-trial, switching tiers carries the remaining days onto the new tier.
5. If a creator with no active plan lapses (cancel, or a paid charge that fails through the whole dunning window), the org resolves to the restrictive `inactive` state (everything gated off). There is no free fallback. The delinquency lifecycle (retry → payout-hold) governs access for a creator who was paying and then lapsed.

---

## Audit findings — what's built today vs. needs work

### Built and shippable today

- Customer portal, course player, downloads, license keys
- Subscriptions, one-time products, usage-based / metered billing
- Discord & GitHub benefit granting
- Embedded checkout, checkout links
- Discount codes
- Email broadcasts with A/B testing (`EmailBroadcastABTest` model)
- Email sequences and segments
- Drip scheduling on course lessons (`drip_days`, `release_at` on `CourseLesson`)
- Customer wallet with Stripe off-session top-ups and tax calculation
- Seat-based product pricing (`customer_seat/`)
- CSV exports (pattern established in email analytics endpoint)
- Per-org rate limiting (`rate_limit_group` on Organization model)
- Webhooks, full REST API, OAuth2 for end-customers
- Team members with roles (`member/` module)
- Basic revenue / MRR / churn-rate analytics
- 14-day trial machinery on Product (`trial_interval`, `trial_interval_count`)
- Quota enforcement (metered usage events): video hours hosted, video views/month, storage bytes
- Email list-size cap (`email_subscribers`) enforced at subscriber-add time, counting **marketing contacts only** — buyers (purchase-sourced or customer-linked) are excluded; email sends are uncapped
- Published-courses cap enforced at the **publish** transition, counting only courses with a published lesson — draft courses are free

### Built infrastructure, needs surfacing or completion

- Custom email sender domain — Resend integration with verification hourly cron, needs the rest of the dashboard UX polished.
- White-label course player — YouTube embeds use `modestbranding=1`, main lesson player has no toggle.
- Cohort analysis — only aggregate churn rate today, no retention curves.
- Refund/chargeback fee policy — fee types tracked (`ProcessorFeeType.dispute`, `ProcessorFeeType.refund`), no policy config for absorption.

### Not built — Scale-tier roadmap

- Custom storefront domain (was previously removed in `2024-06-21-1348_remove_organization_custom_domain.py`; needs to be rebuilt).
- Custom checkout domain (no DNS verification, SSL provisioning, or domain routing).
- SSO / SAML for the merchant dashboard.
- Audit logs (model + endpoints exist; UI surface still pending).
- Sandbox / test mode (no per-org Stripe test/live toggle today).

### Trial conversion follow-ups

- Cron task to expire / lapse Starter trials that didn't capture a payment method by day 14; the org then has no active plan (resolves to `inactive`). Platform-internal trial subscriptions are excluded from the generic subscription-cycle scheduler so the trial-expiry cron is the single owner of their end-of-life.
- Creator-facing reminder emails at trial day 7, day 2, and day 0.
- "Trial extension" override for support to give a creator more time (`scripts/extend_platform_trial.py`).

### Deliberately removed from the table

- **Affiliate program** — no signup portal, dashboard, or payouts for third-party affiliates. The `campaign/` module is alpha and appears to be for Spaire's own platform-fee promo codes, not creator-facing referrals.
- **Account credits as a tier feature** — `account_credit/` is an internal lever Spaire uses to issue promo credits against platform fees, not a perk a creator gets via tier.
- **Daily payouts** — incompatible with MoR risk windows (chargebacks up to 120 days). Universal 7-day settlement applies instead.

---

## Recommended ship order

1. **Trial conversion plumbing** — lapse-expired-trial cron, reminder emails, support extension. This is the highest-leverage gap; without it Starter trials sit in `trialing` forever.
2. **Studio differentiators** — white-label player toggle, customer wallet polish so the +$80 between Starter and Studio is visible.
3. **Cohort retention curves** — closes the cohort_analytics roadmap row that's open across all three tiers.
4. **Scale-tier build** — sandbox/test mode, audit logs UI, then the domain bundles.
5. **Defer until paying Scale demand exists** — SSO, SCIM, course certificates, affiliate portal.
