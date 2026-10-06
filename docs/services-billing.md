# What the server does for the app, part 3: plans and billing

Simeon sells three plans to the person who signs in from the Mac: Standard
($20 a month), Pro ($60) and Max ($200), each with a week of free trial on a
card, and each with a number of credits a week. This file says what the
billing engine is, how a person gets a plan, how the app's allowance follows
it, what each piece needs on Render, and which log line to read when it
misbehaves. Section 2 of `services-core.md` covers what a credit is and how
the proxy meters one.

Nothing here runs until `SIMEON_PLATFORM_ORG_ID` is set. Without it, every
person has the free monthly allowance (`SIMEON_DESKTOP_MONTHLY_CREDITS`) and
the sign-in asks for no card, as before 5 October 2026.

## 1. The plans

| Plan | Monthly | Yearly | Credits a week | Trial |
|---|---|---|---|---|
| Standard | $20 | $192 | 750,000 | 7 days, 1,000,000 credits once |
| Pro | $60 | $576 | 2,500,000 | same |
| Max | $200 | $1,920 | 8,000,000 | same |

The numbers live in one place, `server/simeon/entitlements/tiers.py`
(`weekly_credits`, `trial_credits`, `monthly_price_cents`), and the products
the engine sells are seeded from `server/scripts/seed_platform_products.py`.
The web app's billing page reads the prices from the server
(`GET /v1/platform/plans`); the site's pricing section repeats them by hand.

A credit is one input token on the middle model at $3 per million
(`services-core.md`, section 2). A typical task is about 100,000 credits.
Weekly credits count from Monday 00:00 UTC to the next Monday and do not
carry over. The hourly brake, 200,000 credits in a sliding hour, applies on
every plan.

## 2. The billing engine

The server is derived from an open-source billing platform (`docs/kept-names.md`)
and carries its billing engine whole:
products and prices, checkouts, subscriptions, a scheduler that charges the
saved card when a period ends, dunning when a charge fails, orders and
invoices, a customer portal, and the Stripe integration that does the actual
card work (`server/simeon/checkout`, `subscription`, `order`, `payment`,
`integrations/stripe`). Stripe holds the card and runs the charges as payment
intents; there are no Stripe Subscriptions. Recurring billing is Simeon's own
(`server/simeon/subscription/scheduler.py`, started by the worker).

Simeon Labs is itself an Organization in that engine, the **platform
organisation** (`server/simeon/platform/`). Every person's own organisation
is a Customer of it, and that Customer holds the Subscription to a plan
product. The person's own organisation is the one the web app makes on a
first visit (`provisionWorkspace`) or the Mac sign-in makes
(`DesktopService.ensure_personal_organization`): the earliest organisation
the person belongs to.

The plan a person is on is read by `simeon.entitlements.service` from
`Product.user_metadata.tier` of that subscription. The old creator-tier keys
(`starter`, `studio`, `scale`) resolve to the plan that replaced them.

## 3. How a person gets a plan

**From the Mac.** The app opens `/loginDeepControl`. After the web login,
that page checks the person's allowance (`server/simeon/desktop/app_sign_in.py`,
`_needs_a_plan`). With no active or trialing subscription it redirects to
`app.simeonlabs.com/billing?plan=standard&return_to=<this link>`. The billing
page shows the three cards; "Start free trial" creates an upgrade checkout
(`POST /v1/platform/organizations/{id}/upgrade-checkout`, `success_url` =
the sign-in link), and the checkout page saves the card with a Stripe setup
intent and no charge. A card or e-mail that already had a trial is refused
(`prevent_trial_abuse`, `trial_redemptions`). The checkout then sends the
browser back to the sign-in link, which now asks the person to confirm, as
before. Nobody is signed in to the app without a card on file.

**From the web.** `/dashboard/<org>` sends a person with no plan to
`/billing` the same way.

**From the site.** Each "Try it free" opens `app.simeonlabs.com/billing?plan=…`.

**Day 8.** The scheduler cycles the subscription at `trial_end`: it charges
the card, the subscription turns `active`, and the allowance becomes the
plan's week. A failed charge turns it `past_due`; the allowance keeps working
through the dunning window (`past_due_deadline`), then the subscription is
cancelled and the person has no plan.

**Reminders.** `platform.notify_trial_reminders` e-mails on the trial's day
4 (T-3), day 6 (T-1) and last day (`server/simeon/platform/trial_notifications.py`).

**Changing and cancelling.** The billing page: switch plan
(`POST …/switch-plan`, prorated on the card on file), cancel
(`POST …/cancel`, at the end of the period, or at the trial's end with no
charge), cards and invoices (the engine's customer portal session). The
app's Settings page has the same Cancel trial button; it calls Connect
`DashboardService/CancelSandTrial` (`server/simeon/sand/dashboard.py`).

## 4. How the app's allowance follows the plan

`server/simeon/desktop/allowance.py` resolves one person's `Allowance`:

| State | Window | Limit | `subscriptionStatus` |
|---|---|---|---|
| No platform organisation configured | calendar month | `SIMEON_DESKTOP_MONTHLY_CREDITS` | `free` |
| Trialing | `trial_start` to `trial_end` | the plan's `trial_credits` | `trialing` |
| Active or past due | Monday to Monday | the plan's `weekly_credits` | `active`, `past_due` |
| No plan | the week | 0 | `none` |

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
`onDemand` (null until the server meters it), `upgradeUrl`. The renderer
already has the "Trial usage" meter, the Cancel trial button, the upgrade
button and the on-demand bar; they light up from these keys.

Connections (`services-agents.md`, section 7) are included on every plan and
on the trial (`ENTITLED_PLANS` in `server/simeon/connectors/service.py`).
`SIMEON_CONNECTORS_ENTITLED_EMAILS` stays for staff and for a server with no
billing.

## 5. Settings on Render

| Setting | Where | Value |
|---|---|---|
| `SIMEON_PLATFORM_ORG_ID` | API, worker | The Simeon Labs organisation's id. Unset: no billing, free monthly allowance. |
| `SIMEON_STRIPE_SECRET_KEY`, `SIMEON_STRIPE_PUBLISHABLE_KEY` | API, worker | Stripe keys. |
| `SIMEON_STRIPE_WEBHOOK_SECRET` | API | The Stripe webhook for `https://api.simeonlabs.com/integrations/stripe/webhook`: `payment_intent.*`, `setup_intent.*`, `charge.*`, `refund.*`. |
| `NEXT_PUBLIC_STRIPE_KEY` | web app (Vercel) | The publishable key, for the checkout page's card form. |
| `SIMEON_DESKTOP_MONTHLY_CREDITS` | API | Only for a server with no billing. |

Then, once per environment:

```sh
cd server && uv run python -m scripts.seed_platform_products run --dry-run
cd server && uv run python -m scripts.seed_platform_products run
```

The seed makes the six products (three plans, monthly and yearly), the
creator-era meters the inherited quotas still read, and sets
`allow_multiple_subscriptions` on the platform organisation (the upgrade
checkout needs it). Set `prevent_trial_abuse` on the platform organisation
too, so one card gets one trial. The API refuses to start with the
organisation set and the products missing (`server/simeon/platform/startup.py`).

## 6. When it misbehaves

- **`platform.upgrade_checkout.created`**: a checkout was made, with the
  organisation, plan, interval and whether trial days were carried over.
- **`platform.cancel.trial_scheduled`**: a trial was cancelled; it ends with
  no charge.
- **`subscription.cycle`** (the actor's own log) and `order.trigger_payment`:
  the day-8 charge. A failed one goes to `order.process_dunning`.
- **`platform.trial_reminder.no_recipient`**: a reminder could not find an
  address; it retries the next day.
- A person who sees "No active plan (code 40200)" in the app with a plan
  they just bought: check that the subscription's Customer carries
  `creator_org_id` equal to the person's own organisation
  (`DesktopOrganizationRepository.get_first_for_user`), and that the product
  carries `user_metadata.tier`.
- `python -m scripts.desktop_usage_report someone@example.com` prints what
  a person spent, by model and by reason, this week included.

## 7. Not yet

- **On-demand spend** past the week's allowance. The quota route answers
  `onDemand: null` and the app shows no bar. The plan: a cap in cents on
  the platform Customer, overage rows stamped in `desktop_usage`, a daily
  task feeding the engine's meters, a metered unit price on each product.
- **The renderer's paywall cover** opens the upstream's URL; until it is patched
  (`desktop/scripts/lib/router-renderer-patch.mjs`), Connect
  `GetSandAccessStatus` keeps answering GRANTED and the gate is the sign-in
  page plus the proxy's 402.
- **Teams**: an organisation with several members and pooled credits.
- **Verified on a Mac**: nothing in this file has run in the packaged app
  against a Stripe test account yet. The server tests cover the allowance,
  the sign-in gate and the Connect cancel; the day-8 charge is the engine's
  own, tested in `server/tests/platform` and `server/tests/subscription`.
