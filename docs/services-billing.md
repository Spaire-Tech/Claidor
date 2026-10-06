# What the server does for the app, part 3: plans and billing

Simeon sells three plans to the person who signs in from the Mac: Standard
($20 a month), Pro ($60) and Max ($200), each with a week of free trial on a
card, and each with a number of credits a week. Stripe Billing owns the
products, the prices, the trial, the subscription, the invoices and the
usage meters. The server creates the Stripe customer, opens Stripe Checkout
and Stripe's Customer Portal, keeps one copy of each person's subscription
written by webhook, and tells Stripe what each person used. This file says
how that fits together, what each piece needs on Render and on Stripe, and
which log line to read when it misbehaves. Section 2 of `services-core.md`
covers what a credit is and how the proxy meters one.

Nothing here gates anyone until `SIMEON_DESKTOP_BILLING_REQUIRED` is
`true`. Without it, every person has the free monthly allowance
(`SIMEON_DESKTOP_MONTHLY_CREDITS`) and the sign-in asks for no card. The
earlier, engine-based billing (the platform organisation,
`SIMEON_PLATFORM_ORG_ID`, `scripts/seed_platform_products.py`) is retired
from the desktop path on 6 October 2026: leave `SIMEON_PLATFORM_ORG_ID`
unset. The code stays with the inherited shop
(`server/simeon/platform/`) and gates nothing of Simeon's.

## 1. The plans

| Plan | Monthly | Yearly | Credits a week | Trial |
|---|---|---|---|---|
| Standard | $20 | $192 | 750,000 | 7 days, 1,000,000 credits once |
| Pro | $60 | $576 | 2,500,000 | same |
| Max | $200 | $1,920 | 8,000,000 | same |

The numbers live in one place, `server/simeon/entitlements/tiers.py`
(`weekly_credits`, `trial_credits`, `monthly_price_cents`), and
`server/simeon/plans/catalog.py` turns them into what Stripe sells. The web
app's billing page reads the prices from the server (`GET /v1/plans/`);
the site's pricing section repeats them by hand.

A credit is one input token on the middle model at $3 per million
(`services-core.md`, section 2). A typical task is about 100,000 credits.
Weekly credits count from Monday 00:00 UTC to the next Monday and do not
carry over; Stripe cannot reset a meter weekly, so the week is counted by
the server from `desktop_usage`. The hourly brake, 200,000 credits in a
sliding hour, applies on every plan.

## 2. What is on Stripe

`server/scripts/stripe_catalog.py` creates and updates it, idempotently,
from `plans/catalog.py`. `list` prints what the server expects; `run
--dry-run` says what it would change; `run` changes it. Run it against a
test key first, then the live key.

| On Stripe | Found by | What |
|---|---|---|
| Product × 3 | `metadata.simeon_tier` = `standard`, `pro`, `max` | "Simeon Standard", "Simeon Pro", "Simeon Max", with the weekly and trial credits in metadata. |
| Price × 6 | `lookup_key` = `simeon_<tier>_<month\|year>` | Recurring, USD, tax inclusive. Monthly at the list price, yearly at twenty percent off. A changed amount archives the old price and moves the lookup key to the new one. |
| Billing Meter × 2 | `event_name` = `simeon_credits`, `simeon_box_seconds` | Sum of `payload.value`, by `stripe_customer_id`. What a person used, for Stripe's dashboard and, later, for on-demand prices. |

The four creator-era meters the seed script made (storage, e-mails, video,
subscribers) are not recreated: Simeon meters credits and cloud-computer
time, nothing else.

The one thing the script cannot do is the Customer Portal's configuration:
in Stripe, Settings → Billing → Customer portal, allow cancelling,
switching between the six prices, and updating the card, and set the
business name people see. The legal name on the account can stay what it
was; the public name and statement descriptor are what a person sees.

## 3. How a person gets a plan

1. **Starting.** The billing page (`app.simeonlabs.com/billing`) posts
   `POST /v1/plans/checkout` with a tier and an interval. The server makes
   the Stripe customer on first use (kept on `users.stripe_customer_id`),
   finds the price by its lookup key, and opens a Stripe Checkout session:
   `mode=subscription`, the card always collected, a seven-day trial for a
   person who never had one, the charge at once for anyone who did,
   `client_reference_id` and `metadata.simeon_user_id` set so the webhook
   can find the person. The browser goes to Stripe's checkout page and
   comes back to the `success_url` with `checkout_session_id` appended.
2. **Knowing.** Stripe sends `checkout.session.completed` and
   `customer.subscription.created`, later `.updated` and `.deleted`, to
   `https://api.simeonlabs.com/v1/integrations/stripe/webhook`. Each is
   stored as an external event and handled by a worker actor
   (`server/simeon/plans/tasks.py`) that copies the subscription into
   `desktop_subscriptions`: one row per person with Stripe's status, the
   tier (from the price's lookup key), the period and trial dates,
   `cancel_at_period_end`, and the whole object in `raw`. A dead
   subscription's late event never overwrites a live one.
   Because the browser is usually back before the webhook, the billing
   page and the Mac sign-in page also post `POST /v1/plans/sync` (or
   carry `checkout_session_id`) and the server fetches that checkout's
   subscription and copies it in at once.
3. **One trial per card.** Checkout cannot refuse a card by its number
   before the subscription exists. So the first time a subscription is
   seen `trialing`, the server reads the card's fingerprint and the
   person's e-mail: a fingerprint or e-mail that already had a trial
   (`desktop_trial_redemptions`) ends this trial on Stripe at once
   (`trial_end=now`), so the card is charged today; otherwise the trial is
   recorded. A person who had a trial gets none on a later checkout
   either.
4. **Changing and ending.** `POST /v1/plans/portal` opens Stripe's Customer
   Portal, optionally on one step (`flow`: `cancel`, `update`,
   `payment_method`). Cards, invoices, receipts, a plan switch and a
   cancellation all happen there; Stripe sends the resulting
   `customer.subscription.updated` and the copy follows. The Mac app's
   Settings page has a Cancel trial button; it calls Connect
   `DashboardService/CancelSandTrial` (`server/simeon/sand/dashboard.py`),
   which sets `cancel_at_period_end` on Stripe, so the person keeps the
   remaining days and is never charged.
5. **The Mac sign-in.** `GET /loginDeepControl` reads the person's
   allowance before asking them to confirm the sign-in. With billing
   required and no trialing or active subscription, it sends the browser
   to `/billing?plan=standard&return_to=<this page>`; the checkout returns
   there with `checkout_session_id`, the page copies it in, and asks. So
   nobody is signed in to the app without a card on file.
6. **The window's access cover**, for a person already signed in whose
   plan lapsed, was cancelled, or who signed in before billing was
   required. The window asks `GetSandAccessStatus` once at sign-in
   (`server/simeon/sand/dashboard.py`): payment required, with "Start a
   Simeon trial" for a person who never had one and "Check Access" for
   one who did. It shows its cover the moment `EnsureSandBox` refuses the
   box with `permission_denied` (`box_broker.require_a_plan`), the way the
   upstream app paywalls; the cover's button opens
   `app.simeonlabs.com/billing?plan=standard` (the renderer patch,
   `desktop/scripts/lib/router-renderer-patch.mjs`). The window keeps
   asking for its box; once the plan is on Stripe the next ask succeeds
   and the cover goes, with nothing to restart or sign in to again. Metered
   calls get the same answer meanwhile: `402`, code `40200`, naming the
   billing page.

## 4. How the app's allowance follows the plan

`server/simeon/desktop/allowance.py` resolves one person's `Allowance`
from the `desktop_subscriptions` row: one indexed lookup, no Stripe call.

| State | Window | Limit | `subscriptionStatus` |
|---|---|---|---|
| Billing not required, or an exempt e-mail | calendar month | `SIMEON_DESKTOP_MONTHLY_CREDITS` | `free` |
| Trialing | `trial_start` to `trial_end` | the plan's `trial_credits` | `trialing` |
| Active or past due | Monday to Monday | the plan's `weekly_credits` | `active`, `past_due` |
| No plan (none, cancelled, unpaid, incomplete) | the week | 0 | `none` |

Every metered route reads it before calling a provider (`budget_refusal`,
`server/simeon/desktop/proxy_common.py`) and refuses with `402`, code
`40200`, and a sentence that says which: "This week's credits are used …
They reset on Monday …", "Your trial credits are used up …", "No active
plan …", each naming `app.simeonlabs.com/billing`.

`GET /desktop/api/user/quota` carries the plan to the app. Its first eight
keys are what every shipped app reads and keep their meaning (`creditsLimit`,
`creditsUsed`, `creditsRemaining`, `periodStart`, `periodEnd`, …). The keys
added on 5 October 2026 feed the app's usage summary
(`desktop/source/electron-main/account/account-profile.ts`,
`usageSummaryFromSimeonQuota`): `tier`, `trialEndsAt`, `trialCancelable`,
`onDemand` (null until the server meters it), `upgradeUrl`.

Connections (`services-agents.md`, section 7) are included on every plan and
on the trial (`ENTITLED_PLANS` in `server/simeon/connectors/service.py`).
`SIMEON_CONNECTORS_ENTITLED_EMAILS` stays for staff and for a server with no
billing.

## 5. What Stripe is told about usage

Every five minutes the worker's `plans.report_usage` actor sends meter
events (`server/simeon/plans/service.py`, `report_usage`):

- **Credits.** The sum of `desktop_usage.credits` per person for rows not
  yet stamped `stripe_reported_at`, as one `simeon_credits` event per
  person, then the rows are stamped. A failed call leaves them unstamped
  for the next run; the event's `identifier`
  (`credits:<user>:<run>`) makes a retried run idempotent on Stripe's side.
- **Cloud-computer seconds.** For each box running, or hibernated since
  its last report, the seconds between `sand_boxes.usage_metered_at` (or
  when it was last started) and now (or when it hibernated), as one
  `simeon_box_seconds` event per box; then `usage_metered_at` moves.
- A person with no Stripe customer (free month, exempt) is skipped and
  counted in `skipped`.

The meters charge nothing today: no price is attached to them. They give
Stripe's dashboard the usage per customer and are the basis for on-demand
spend (section 8).

## 6. Settings on Render and on Stripe

| Setting | Where | Value |
|---|---|---|
| `SIMEON_DESKTOP_BILLING_REQUIRED` | API, worker | `true` once the catalogue is on Stripe and the portal is configured. Unset: no billing, free monthly allowance. |
| `SIMEON_DESKTOP_BILLING_EXEMPT_EMAILS` | API | Staff and friends, as a JSON list of e-mails; they stay on the free month. |
| `SIMEON_STRIPE_SECRET_KEY`, `SIMEON_STRIPE_PUBLISHABLE_KEY` | API, worker | Stripe keys. |
| `SIMEON_STRIPE_WEBHOOK_SECRET` | API | The Stripe webhook for `https://api.simeonlabs.com/v1/integrations/stripe/webhook`. Besides the `payment_intent.*`, `setup_intent.*`, `charge.*` and `refund.*` events it already carries, add `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. |
| `SIMEON_STRIPE_CREDITS_METER_EVENT`, `SIMEON_STRIPE_BOX_SECONDS_METER_EVENT` | API, worker | Only to rename the meters; the defaults are `simeon_credits` and `simeon_box_seconds`. |
| `SIMEON_DESKTOP_MONTHLY_CREDITS` | API | The free month, for a server with no billing and for exempt e-mails. |

Then, once per Stripe environment (test first):

```sh
cd server && uv run python -m scripts.stripe_catalog list
cd server && uv run python -m scripts.stripe_catalog run --dry-run
cd server && uv run python -m scripts.stripe_catalog run
```

and the Customer Portal configuration by hand (section 2). The migration
`desktop_billing_1006` adds the two tables and the two watermark columns.

## 7. When it misbehaves

- **`plans.checkout.created`**: a checkout was made, with the person, the
  plan, the interval and whether a trial was given.
- **`plans.subscription.synced`**: a webhook or a sync wrote the copy, with
  the status and tier. **`plans.subscription.nobody`**: a subscription
  arrived that no person matches (no `simeon_user_id` in its metadata and
  an unknown customer): made in the Stripe dashboard for a customer the
  server never made.
- **`plans.trial.repeated`**: a second trial on a known card or e-mail was
  ended at once. **`plans.trial.card_unreadable`**: the card could not be
  read, so the check passed the person.
- **`plans.trial.cancelled`**: the app's Cancel trial button worked.
- **`sand.box.ensure.no_plan`**: the window asked for its box without a
  plan and was shown the cover; one line per ask, so a person stuck on
  the cover shows up as a run of them.
- **`plans.report_usage.done`**: the five-minute report, with how many
  credit and box events were sent and how many people were skipped.
  **`plans.usage.credits_not_sent`** and **`plans.usage.box_not_sent`**:
  Stripe refused an event; the next run retries.
- A person who sees "No active plan (code 40200)" in the app with a plan
  they just bought: check `desktop_subscriptions` for their user id. No row
  means the webhook never arrived (the endpoint's events, section 6) and
  the sync was not posted; a row with `tier` null means the price's lookup
  key is not one of ours (`simeon.plans.catalog.parse_lookup_key`).
- `python -m scripts.desktop_usage_report someone@example.com` prints what
  a person spent, by model and by reason, this week included.

## 8. Not yet

- **On-demand spend** past the week's allowance. The quota route answers
  `onDemand: null` and the app shows no bar. The meters are in place; what
  is missing is a metered price on each product, a cap per person, and the
  allowance letting a metered call through once the week's credits are
  used.
- **The access cover on a Mac.** The patch that points its button at the
  billing page and the refusal that shows it have run in tests, not in the
  packaged app. Read the window's cover and its recovery after a checkout
  on a Mac before relying on them.
- **Teams**: an organisation with several members and pooled credits.
- **Verified on a Mac**: nothing in this file has run in the packaged app
  against a Stripe test account yet. The server tests cover the catalogue,
  the webhook copy, the one-trial-per-card rule, the checkout and portal
  calls (Stripe replaced by a fake), the sign-in gate, the Connect cancel
  and the usage report. No live charge has been made.
