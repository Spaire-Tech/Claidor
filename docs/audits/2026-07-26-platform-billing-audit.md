# Platform Billing Audit — 2026-07-26

> **Status update (2026-07-27):** every finding below has been addressed on
> this branch except the two that require production access (verify the
> scheduler process is deployed; run `scripts/reconcile_quota_usage.py` and
> let the new `platform.lapse_legacy_trials` cron clear the stranded-trial
> backlog after deploy). Overage (§7) was resolved by making the promise
> honest (durable `spaire.quota.overage` audit events, docs corrected)
> rather than silently shipping overage *billing*, which is a pricing
> decision. One extra defect was found while fixing: reminder markers were
> stored as a list in `user_metadata`, which crashes webhook payload
> serialization for any subscription carrying them — now a scalar
> comma-string.

Scope: the Spaire platform-billing system (Spaire billing its own creator
organizations — trials, plans, fees, invoices, emails) plus the settings
billing UI. Four independent review passes: trial-to-charge trace, platform
module audit, settings-UI audit, invoice/email/money-trail audit.

Reported symptoms this audit was triggered by:

1. 14-day trial ended (Jul 24) — no charge, no invoice, two days later.
2. Settings still shows "Your trial ends on Jul 24, 2026. You won't be
   charged until then."
3. Usage bar always reads zero.
4. Unreadable (white) text on the billing settings page.

All four symptoms were root-caused. Findings below, ordered by severity.

---

## 1. CRITICAL — Stranded "orphaned" trials never charge, never end (the reported bug)

The pre-Phase-7 org-creation hook auto-created card-less local trial
subscriptions stamped `user_metadata.managed_by = "trial"`.

- Phase 1 (`6a0eeda`) excluded those rows from the billing scheduler:
  `server/polar/subscription/scheduler.py:132-134` — and made the
  `platform.expire_trials` cron their sole owner.
- Phase 7 (`46ca4c1`) deleted that cron and stopped creating such subs —
  but shipped **no migration/backfill** for rows already in the DB.

Any `managed_by="trial"` subscription still in the database is in a dead
zone: the scheduler skips it, nothing else touches it. It stays `trialing`
forever — never flips to active, never creates an order or invoice, never
charges, never lapses. Entitlements keep granting the paid tier for free
(`server/polar/platform/repository.py:96-119`,
`server/polar/entitlements/service.py:75`), and the settings endpoint keeps
returning `status="trialing"` with the past `trial_end`
(`server/polar/platform/endpoints.py:201-293`), which the UI renders
verbatim, forever. `endpoints.py:268-279` still reads `managed_by ==
"trial"` off live rows, indicating such rows exist.

This matches every detail of the report, including "no invoice at all"
(these subs never even get the $0 trial order a checkout-created trial gets).

**Fix:** one-off backfill for
`status='trialing' AND user_metadata->>'managed_by'='trial'`
(cancel, or convert-and-bill), and either reinstate a lapse cron or assert
none remain.

## 2. CRITICAL (operational) — The entire trial-end charge hangs on one scheduler process

There is **no Stripe subscription** in this design (despite comments claiming
otherwise — see §14). Billing is Polar-native: APScheduler jobstore
(`server/polar/subscription/scheduler.py`, started via
`polar/worker/scheduler.py`) → `subscription.cycle` → order →
`order.trigger_payment`. If the deploy omits the scheduler process
(production terraform runs it standalone: `terraform/production/render.tf:143-148`),
**no subscription of any kind ever cycles**, with no alert. Verify it is
deployed and alive in the real environment.

The happy path itself was verified end-to-end for checkout-created
card-backed trials: setup intent saves the payment method
(`integrations/stripe/payment.py:120-155`), `cycle()` flips trialing→active
(`subscription/service.py:655-767`), order is created and charged with
dunning on failure (`order/service.py:600-787`). The code path is correct
when the processes run.

## 3. MAJOR — One-shot scheduler lock with no reaper

`scheduler.py:62-72` stamps `scheduler_locked_at` then fire-and-forgets the
dramatiq message. If that message is lost (Redis restart, crash), the row is
excluded from scheduling forever and is never billed or retried. No sweep
job exists. Add a reaper for stale `scheduler_locked_at` rows.

## 4. CRITICAL — Silent charging: money emails go to an undeliverable placeholder

Platform Customers are created with
`creator-{slug}@billing.spairehq.internal` (`platform/billing.py:61-68`).
The real email is only applied at upgrade-checkout, and only when provided:

- `platform/endpoints.py:355-357` falls back to the caller's email only for
  user tokens; an org-token call without `billing_email` passes `None`, and
  `_apply_real_billing_email` (`platform/upgrade.py:139-140`) no-ops.
- On email collision, if the plus-tagged variant is also taken or
  unparseable, it silently keeps the placeholder (`upgrade.py:158-165`).
- The checkout form cannot fix it: for existing customers,
  `checkout/service.py:2128-2129, 2478-2551` never updates `customer.email`.

Consequence: welcome, receipt+invoice (`order/service.py:1562-1567`),
past-due, revoked, and cancellation emails all go to a dead address — the
creator is charged in total silence.

## 5. MAJOR — Trial reminder emails silently not sent (and marked sent)

`platform/trial_notifications.py:193-204` resolves the recipient via
`get_admin_user`, which returns `None` when `organization.account_id` is
`None` (`organization/repository.py:163-168`) — i.e. any creator who hasn't
connected payouts yet, the common case during a trial. The reminder is
skipped **but the idempotency marker is stamped anyway**, so it never
retries. Combined with §4, a creator can be charged at day 14 with zero
communication before or after.

Related reminder bugs:
- Canceled trials keep getting "your card will be charged" copy — no
  `cancel_at_period_end` check (`trial_notifications.py:243-261`).
- Legacy card-less trials get "the card on file is charged" emails
  (`platform/repository.py:138-159` has no `managed_by` filter).
- Mid-trial tier switch resets markers → duplicate/wrong reminders (new sub,
  fresh metadata).
- `scripts/extend_platform_trial.py:183-190` — marker-reset filter inverted:
  extended trials get **no** reminders at all. Also `:148-150` naive
  datetime bug (`--until` raises TypeError), and the script never clears
  `scheduler_locked_at` so it can't rescue §3 rows.
- Day math truncation can send "last day" a day early; email dates rendered
  in UTC.

## 6. MAJOR — Receipt/invoice paper-trail defects

- **Receipt sent before/regardless of payment**: `order/service.py:1770-1771`
  enqueues the confirmation email when the pending cycle order is created;
  payment runs async. A declined card still produces "Thanks for your
  payment" + invoice PDF, followed by a past-due email.
- **Invoice failure kills the receipt**: `order/service.py:1552-1554` (and
  `:1468-1470`) await invoice generation inline before `enqueue_email`; an
  S3/PDF failure means charged-with-no-receipt.
- Receipt template hardcodes "Your invoice is attached as a PDF"
  (`emails/src/emails/platform_receipt.tsx:31-34`) but the invoice is
  silently skipped when billing name/address is missing
  (`order/service.py:1547-1551`).
- Invoice PDF footer says "issued by Spaire, Inc. on behalf of Spaire, Inc.
  … Merchant of Record" (`invoice/generator.py:310-312`) — wrong framing for
  first-party billing.
- Only `send_confirmation_email` was Spaire-branded (c392069). Past-due /
  revoked / canceled / uncanceled / updated emails still use
  creator-commerce templates with the platform org as "merchant"
  (`subscription/service.py:2360-2433`).

## 7. MAJOR — Overage revenue is never collected

`scripts/seed_platform_products.py:119-151` seeds overage meters on the
platform org, but quota events are emitted with the **creator org's** id and
no customer linkage (`quotas/producers.py:_add_quota_event`), so the meters
can never match any event. The `spaire.email.sent` meter has no producer at
all. `tiers.py:126-130` promises overage "recorded for billing
reconciliation"; in reality it is only a log line. Promised overage revenue
is silently never billed.

## 8. MAJOR — Fee leaks via lifecycle-bypassing mutations

Two paths mutate subscription status directly, skipping
`_after_subscription_updated` (no webhooks, no fee sync, no benefit
revocation, no customer-state event):

- Dashboard trial cancel: `platform/management.py:230-243` (immediate
  revoke). Since fee sync writes the paid tier's discounted transaction fee
  at trial **start**, a creator who starts a Scale trial and cancels keeps
  3% + $0.30 (vs 5% + $0.50 default) and `elevated` rate limits
  indefinitely.
- Trial supersede on conversion: `platform/fee_sync.py:272-282` (fee is
  rescued only by the new sub's creation hook; events/benefits still skipped).

Also: `list_active_for_customer` (`platform/repository.py:121-136`) misses
`past_due` siblings during supersede → narrow double-billing window.

Fee economics note: churned/`inactive` orgs reset to the 5% + $0.50 default,
which is a *lower percentage* than paying Starter customers' 7% + $0.30 —
inverted incentive worth a deliberate decision.

## 9. MAJOR — Legacy trial holders can get a second free trial

`trial_consumed_at` is stamped only via `_after_subscription_created`
(`platform/fee_sync.py:293-320`). Pre-Phase-7 local trials were inserted
directly (`platform/billing.py:210-288`) and never stamped, so
`upgrade.py:272-275` grants those customers a fresh 14-day trial.

## 10. MAJOR — Broken customer flows

- **Past-due creators can't pay**: `upgrade.py:252-264` treats `past_due` as
  active → 409 "already on a paid plan"; `switch_plan` also unavailable. A
  delinquent creator who *wants* to pay is wedged.
- **Cancel contract is false**: `endpoints.py:441-447` claims automatic
  re-subscribe to Legacy; `fee_sync.maybe_enqueue_resubscribe_from_revoke`
  (referenced in `management.py:2-8`) does not exist. Reality: revoke →
  `inactive` → all limits zero.
- Dashboard trial cancel is immediate (loses remaining days) while portal
  path and reminder emails promise access to trial end; the UI toast says
  "ended" while the endpoint only sets `cancel_at_period_end`
  (`SpairePlanCards.tsx:133-141` vs `endpoints.py:430-461`) — the two cancel
  paths disagree with each other *and* with their own copy.
- No un-cancel path from the dashboard (`subscription/service.py:947-948`
  raises on canceled subs; no platform uncancel endpoint).
- No lock on `switch_plan` (`management.py:135-206`) or upgrade-checkout →
  double-click can duplicate prorations/charges; superseded duplicate is
  canceled **without refund**.
- Mid-trial tier switch sends a second "Welcome to Spaire… the next 14 days
  are yours" (routed via $0 trial order → `user_welcome`,
  `order/service.py:1505-1522`) even with 3 days left; no plan-change email
  exists.

## 11. HIGH — Usage metering reads zero / limits under-enforced

- **No backfill**: quota `used` comes from events emitted only after the
  producers shipped; pre-existing files/videos count as zero — both in the
  settings bar and in enforcement (`quotas/service.py`, producers in
  `file/service.py`, `course/service.py`).
- **Integer flooring**: `quotas/service.py:114` floors to display units
  (1 GiB / 3600 s) — 900 MB + 50 min of video renders `0 / 50 GB`, and the
  frontend `Math.round((used/limit)*100)` keeps the bar at 0%.
- **Invisible fill in OS-dark**: see §12.

## 12. HIGH — Theme system is broken (white-on-white text, invisible bar)

Tailwind v4 with **no `@custom-variant dark`** → `dark:` utilities bind to
the OS `prefers-color-scheme`, while the app forces light theme via
next-themes class (`apps/web/src/app/providers.tsx:48-52`). Any user whose
OS is in dark mode gets dark-mode styles painted onto the forced-light page.
Worse, `polar-*` colors are undefined in the v4 theme, so `dark:bg-polar-*`
classes are inert while `dark:text-white` / `dark:bg-white` work:

- `QuotaUsageCard.tsx:69,72` — quota labels and "used / limit" numbers turn
  white on the white card → the unreadable text reported.
- `QuotaUsageCard.tsx:88-92` — bar fill becomes white on a light track →
  bar looks empty at any percentage.
- Same pattern across `SpaireBillingManagement.tsx` (payment method, orders,
  billing address, modal heading).

**Fix:** add `@custom-variant dark (&:where(.dark, .dark *));` to
`globals.css` (or strip the orphaned `dark:`/`polar-*` classes) and define
or remove the `polar-*` palette.

## 13. MEDIUM — Settings UI correctness

- `spaireTier.ts:568-586` `renewalSentence()` renders "Your trial ends on
  {date}. You won't be charged until then." with no past-date check (stale
  forever for §1 rows) and formats `current_period_end`, not `trial_end`.
  The copy also contradicts the card-on-file reality ("won't be charged" →
  "will be charged on {date} unless you cancel").
- `trial_end` never cleared on conversion; endpoint returns it for any
  status (`endpoints.py:259/287` vs schema doc `platform/schemas.py:96-98`).
- `SpairePlanCards.tsx:54-56` — interval toggle seeded from
  possibly-undefined query data, never re-synced → annual subscribers see
  "Monthly" + "Switch" on their own plan.
- `endpoints.py:254` — `monthly_price_cents = amount // 12` truncates
  ($470/yr → $39.16 vs advertised $39); `annual_savings_percent` hardcoded
  20; currency hardcoded "usd".
- Dates formatted with `toLocaleDateString` in browser TZ → off-by-one for
  non-UTC users.
- `TIER_ORDER` missing legacy `'pro'` key → NaN comparisons on stale cache.

## 14. MINOR — Lies in comments/docs (operational landmines)

`subscription/scheduler.py:124-131`, `platform/tasks.py:54-58`,
`platform/trial_notifications.py:6-9, 245-247`, `platform/billing.py:150-159`
all claim "Stripe bills the card at trial_end". False — no Stripe
subscription exists; Polar's own scheduler bills. An operator debugging a
missed charge will look in Stripe and find nothing. Also
`management.py:2-8` references a nonexistent function, and the trial-cancel
comment ("no payment method") is outdated.

## 15. MINOR — Dead automation triggers

- `on_subscription_cancelled` (win-back) — template exists
  (`email_sequence/templates.py:409`), never fired anywhere.
- `on_form_submit` — defined, never fired (`form/service.py:216` routes to
  `on_subscribe` only).
- `on_purchase` — only fires for course enrollments;
  `email_subscriber/tasks.py:18-24` never passes `product_id`.

## 16. MINOR — Misc

- Dev-docker worker consumes no `webhooks` queue
  (`dev/docker/scripts/startup.sh:140`) — outbound webhooks pile up in that
  environment.
- First platform order triggers "startup perks" logic for the platform org
  itself and notifies Spaire's own members (`order/service.py:1901-1931`).
- `trial_reminders_sent` markers leak into cycle orders' metadata
  (`order/service.py:742`).
- Auth: any-of scope semantics mean org-scoped third-party tokens can manage
  billing; any org member (no role check) can cancel. `get_order_invoice`
  (GET) requires write scope. No cross-org data leak found (all 16 routes
  verified membership-scoped).
- Seed fixes from `2dd2365` only apply after re-running the seed per
  environment; pre-fix subscribers keep snapshot prices ($470.40 etc.).

## Untested money paths (test-gap summary)

- `switch_plan`: zero tests (proration, locks, races).
- `check_pending_trial_reminders` / `_notify`: only pure date math tested —
  none of the swallow/idempotency/addressing behavior.
- No endpoint tests for GET subscription/usage, switch-plan, cancel.
- Trial-conversion receipt path end-to-end, placeholder-recipient path,
  receipt-on-pending-order, missing-billing-info invoice skip: untested.
- Scheduler exclusion of `managed_by=trial` + perpetual-trial state: untested.
- Fee sync from cancel/revoke/supersede: untested.
- `scripts/extend_platform_trial.py`: untested (two live bugs).

## Recommended fix order

1. Backfill/reap stranded `managed_by='trial'` rows; add a stale
   `scheduler_locked_at` reaper; verify the scheduler process is deployed
   (§1–3).
2. Kill silent charging: real billing email guaranteed before any charge
   (§4), fix the reminder swallow + stamp-only-on-send (§5).
3. Receipt only after successful payment; decouple invoice generation from
   the email; brand/route lifecycle emails for platform subs (§6).
4. Route all platform status changes through the subscription service (fee
   sync, webhooks, benefits) (§8); stamp `trial_consumed_at` for legacy
   customers (§9).
5. Unwedge past-due re-payment; make cancel behavior match its copy; add
   locks to switch-plan/checkout (§10).
6. Fix the theme system + usage display + stale trial copy (§11–13).
7. Decide overage billing: wire the meters correctly or remove the promise
   (§7).

---

# Addendum: creator-subscription renewal & payout audit — 2026-07-27

Question audited: when a creator sells a MONTHLY subscription to their own
customer, does the charge happen every month and does the creator receive
the money?

**Verdict: yes, on this branch — the chain is intact end-to-end** (checkout
saves the card off-session → scheduler picks the sub up at period end →
cycle → order with correct amounts → off-session charge → creator's Account
credited minus fees → withdrawable payout). Load-bearing prerequisite: the
`net_amount` fix (54446ba) — before it, every renewal order INSERT crashed
and no recurring revenue existed at all.

Verified with targeted runs: scheduler/cycle/order/dunning suites, the
transaction ledger suites (payment, balance, platform_fee, processor_fee),
held-balance release, payout service incl. the fork's delinquency hold.

Fixed in this pass:

1. **Renewal errors deleted valid cards** — `order/service.py` detached-
   payment-method detection contained a bare string (`"does not belong to
   the customer"` missing `in message`), always truthy: ANY
   `InvalidRequestError` during a renewal force-deleted the customer's
   payment method (locally and at Stripe) and doomed every dunning retry →
   guaranteed churn. Fixed + regression tests.
2. **Checkout metadata could disable billing** — the scheduler's
   `managed_by=trial` exclusion applied to ALL subscriptions, but
   subscription metadata is copied verbatim from creator-controlled
   checkout metadata: `{"managed_by": "trial"}` made a customer's
   subscription silently unbillable forever. Exclusion now scoped to the
   platform org (`subscription/scheduler.py`), with tests.
3. **Held balances fee'd at the wrong rate** — sales made before a creator
   connected payouts were released at account-connect time BEFORE the tier
   fee sync ran, so they were fee'd at the global default instead of the
   creator's tier rate. `organization/tasks.py` now syncs fees
   synchronously before releasing.

Known behaviors (not bugs, but decisions to be aware of):

- **No automatic payout**: the balance grows monthly; money reaches the
  creator's bank only when they initiate a withdrawal (min $10). The hourly
  cron only processes already-created payouts.
- **First-sale review gate**: every creator's first sale marks their org
  UNDER_REVIEW; payouts are blocked until a human approves in backoffice.
  This requires ops staffing or the gate reconfigured.
- **Effective fees exceed the advertised tier rate**: upstream Polar adds a
  0.5% subscription surcharge per renewal, and payout fees ($2/active
  month + 0.25% + 25¢, US) are charged to the creator. Example: one
  $10/month Starter subscriber nets the creator $8.95/month in balance and
  ≈$15.61 in the bank after two months' withdrawal. Spaire eats the Stripe
  processing fee (~59¢) out of its ~105¢ gross take. If PRICING.md
  advertises flat "7% + 30¢", this is a disclosure mismatch to resolve.
- **Residual risks (documented, not engineered around)**: order
  `payment_lock_acquired_at` has no reaper (a renewal whose Stripe webhook
  is lost past ~20 task retries stays pending until manual intervention —
  loud, not silent), and SCA/3DS-required renewals land in dunning by
  design (no pre-cycle authentication flow).
- **Production-only checks**: Stripe webhooks registered
  (`charge.succeeded` etc.), Connect transfers enabled, worker + scheduler
  processes running.
