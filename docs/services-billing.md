# What the server does for the app, part 3: plans and billing

Simeon sells three plans to the person who signs in from the Mac: Standard
($20 a month), Pro ($60) and Max ($200), each with a 30-day free trial on a
card (seven days until 12 October 2026), and each with a number of credits
a week. Stripe Billing owns the
products, the prices, the trial, the subscription, the invoices and the
usage meters. The server creates the Stripe customer, opens Stripe Checkout
and Stripe's Customer Portal, keeps one copy of each person's subscription
written by webhook, and tells Stripe what each person used. This file says
how that fits together, what each piece needs on Render and on Stripe, and
which log line to read when it misbehaves. Section 2 of `services-core.md`
covers what a credit is and how the proxy meters one.

The iPhone app sells the same three plans through Apple's in-app purchase
(12 October 2026): Apple takes the payment and the server keeps a copy of
what Apple signed. Section 9 says how. Its trial is the free month: 30
days with no card, started by the app at the first sign-in, one per
person and one per iPhone (section 10).

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
| Standard | $20 | $192 | 3,750,000 | 30 days, 5,000,000 credits once |
| Pro | $60 | $576 | 12,500,000 | same |
| Max | $200 | $1,920 | 40,000,000 | same |

Every allowance is five times what it was until 8 October 2026 (the founder:
"a simple onboarding run eats it all. multiply all by 5. at least for now").
At list price the week's credits of each plan cost more than the plan when
fully used; the plans are priced for the person who comes back.

The numbers live in one place, `server/simeon/entitlements/tiers.py`
(`weekly_credits`, `trial_credits`, `monthly_price_cents`), and
`server/simeon/plans/catalog.py` turns them into what Stripe sells. The
billing page reads them from the server (`GET /v1/plans/`); the site's
pricing section repeats them by hand.

A credit is one input token on the middle model at $3 per million
(`services-core.md`, section 2). A typical task is about 100,000 credits; a
job on the computer (a form, a site driven by screenshots) is 300,000 to
800,000, measured from the call sizes of the insurance log of 6 October 2026
(the cost test set has not been run yet).
Weekly credits count from Monday 00:00 UTC to the next Monday and do not
carry over; Stripe cannot reset a meter weekly, so the week is counted by
the server from `desktop_usage`. The hourly brake, 1,000,000 credits in a
sliding hour, applies on every plan.

## 2. What is on Stripe

`server/scripts/stripe_catalog.py` creates and updates it, idempotently,
from `plans/catalog.py`. `list` prints what the server expects; `run
--dry-run` says what it would change; `run` changes it. Run it against a
test key first, then the live key.

| On Stripe | Found by | What |
|---|---|---|
| Product × 3 | `metadata.simeon_tier` = `standard`, `pro`, `max` | "Simeon Standard", "Simeon Pro", "Simeon Max", with the weekly and trial credits in metadata, and the app's icon as their picture (`https://www.simeonlabs.com/img/simeon-icon.png`, so Checkout shows it beside the plan's name, not a grey square). |
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

**E-mails about payments** (16 October 2026). Simeon sends none of its own
for plans. A plan bought in the iPhone app is Apple's: Apple e-mails the
receipt, the renewals and any billing problem to the person's Apple
Account. A plan bought on the Mac or the website is Stripe's, and Stripe
sends its own e-mails once they are switched on, in live mode (test mode
sends none), to the e-mail on the Stripe customer (the account's, set at
checkout):

- Settings → Business → Customer emails: **Successful payments** (the
  receipt for each payment, renewals included) and **Refunds**.
- Settings → Billing → Subscriptions and emails: failed payments (with a
  link to update the card), upcoming renewals, expiring cards, trial
  ending and cancellations. Stripe also sends a trial reminder before any
  trial longer than seven days ends, whatever this page says.
- Settings → Business → Branding: the icon (the same picture), the logo
  and the colour, which Checkout, the Customer Portal and these e-mails
  all use.

## 3. How a person gets a plan

1. **Starting.** The billing page is `app.simeonlabs.com/billing`, and it
   is the one thing the web app is for (6 October 2026): a plan and a
   card, then Stripe's portal. The site's "Try it free" buttons, the
   Mac app's upgrade button, the sign-in gate and the window's access
   cover all open it. A visitor with no session signs in with Google
   there first. Choosing a plan posts `POST /v1/plans/checkout` with a
   tier and an interval. The server makes
   the Stripe customer on first use (kept on `users.stripe_customer_id`),
   finds the price by its lookup key, and opens a Stripe Checkout session:
   `mode=subscription`, the card always collected, a 30-day trial for a
   person who never had one (no card trial, no Apple free week, no free
   month on the iPhone: `free_month.had_trial`), the charge at once for
   anyone who did,
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
4. **Changing and ending.** The page's buttons post `POST /v1/plans/portal`
   and open Stripe's Customer
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
   to the web app's `/billing?plan=standard&return_to=<this page>`; the
   checkout returns there with `checkout_session_id`, the page copies it
   in and, since the person just saved a card for this very sign-in in
   this browser, confirms the sign-in without asking again (7 October
   2026): the app's poll gets its pair and the page brings the app
   forward. A checkout that is not theirs confirms nothing. So nobody is
   signed in to the app without a card on file, and nobody clicks twice.
   With no session in the browser at all, the sign-in page goes to the
   API's Google sign-in first; the web app is not in the path.
6. **The window's access cover**, for a person already signed in whose
   plan lapsed, was cancelled, or who signed in before billing was
   required. The window asks `GetSandAccessStatus` once at sign-in
   (`server/simeon/sand/dashboard.py`): payment required, with "Start a
   Simeon trial" for a person who never had one and "Check Access" for
   one who did. It shows its cover the moment `EnsureSandBox` refuses the
   box with `permission_denied` (`box_broker.require_a_plan`), the way the
   upstream app paywalls; the cover's button opens
   `app.simeonlabs.com/billing?plan=standard&from=app` (the renderer
   patch, `desktop/scripts/lib/router-renderer-patch.mjs`). The window
   keeps asking for its box; once the plan is on Stripe the next ask
   succeeds and the cover goes, with nothing to restart or sign in to
   again. Metered calls get the same answer meanwhile: `402`, code
   `40200`, naming the billing page. **Since 14 October 2026 the box is
   not refused for want of a plan** (`DESKTOP_COMPUTER_WITHOUT_PLAN`, on by
   default; section 6): the founder, signed in to an account whose payment
   had failed, was held on the cover, and its Update card opened the web's
   sign-in page ("what should happen, is still access to the app. just cant
   send message. and explain the reason below"). Now the apps open as
   usual with the account's agents and chats; `GetSandAccessStatus` still
   says payment required, so Send waits and the line over the composer
   says why, with the button (section 4, "No plan in the apps"). A rebuild
   (`RecreateSandBox`) still waits for a plan. Turned off, the cover comes
   back as before. Every link the app opens carries
   `from=app` (the cover, Usage & Billing's `upgradeUrl`, a served
   error): the page afterwards says "Go back to Simeon" and brings the
   app forward on its own link (`simeon://app/v1/open`) instead of
   offering the download.
7. **From the site.** "Try it free" opens the billing page with the plan
   chosen. A visitor with no account signs in with Google, saves a card,
   and the page comes back saying the free month has started, with the
   Download button (`api.simeonlabs.com/desktop/download/mac`) and one
   line: open Simeon and sign in with the same account. The app then finds
   the trial already there and shows no cover. Only a link from the site
   ends on the download: one from the app ends on the app (above), and
   the Mac sign-in's ends in the app signed in (5).

## 4. How the app's allowance follows the plan

`server/simeon/desktop/allowance.py` resolves one person's `Allowance`
from the `desktop_subscriptions` row and the person's Apple rows
(`desktop_app_store_subscriptions`, section 9): two indexed lookups, no
Stripe or Apple call. `simeon.plans.effective.plan_of` picks the one that
counts: a live plan (the bigger if two are live), else the Stripe row.

| State | Window | Limit | `subscriptionStatus` |
|---|---|---|---|
| Billing not required, or an exempt e-mail | calendar month | `SIMEON_DESKTOP_MONTHLY_CREDITS` | `free` |
| Trialing | `trial_start` to `trial_end` | the plan's `trial_credits` | `trialing` |
| Active, or past due after a paid period | Monday to Monday | the plan's `weekly_credits` | `active`, `past_due` |
| No plan (none, cancelled, unpaid, incomplete) | the week | 0 | `none` |
| The first charge after the trial failed | the week | 0 | `none`, with `paymentFailed: true` |

**A failed first charge is no plan** (14 October 2026). When the trial
ends and the card is refused, Stripe marks the subscription `past_due` and
retries the card for a while; Apple, with its billing grace period on, does
the same. Until then `past_due` counted, so a person whose card never paid
had the plan anyway (the founder's own test). Now a `past_due` subscription
whose current period is the first one after the trial
(`DesktopSubscription.unpaid_after_trial`: `current_period_start` within a
day of `trial_end`; for Apple, a `past_due` row whose latest transaction is
still the free week's) gives no allowance. The quota says so
(`paymentFailed: true`, `billedBy` naming who holds the card), the proxy's
refusal says "Your payment didn't go through … Update your card at
app.simeonlabs.com/billing" (for Apple: "… in your Apple Account
settings"), and the apps hold Send with that reason over the composer (the
cloud computer is refused with the same sentence only when
`DESKTOP_COMPUTER_WITHOUT_PLAN` is off). The
subscription itself stays Stripe's: the web billing page shows it as past
due with "Update your card", and a second checkout is still refused. Once a
retried charge goes through, the webhook writes `active` and the plan
starts. A renewal that fails after a paid month keeps the plan while the
card is retried, as before.

Two dashboard settings go with it: in Stripe, Billing › Revenue recovery ›
Retries, "If all retries for a payment fail" should be **Cancel the
subscription** (so a card that never pays ends the subscription instead of
leaving it past due), and the customer e-mails for failed payments should
be on; in App Store Connect, the app's Billing Grace Period, if it is on,
should be for paid-to-paid renewals only.

Every metered route reads it before calling a provider (`budget_refusal`,
`server/simeon/desktop/proxy_common.py`) and refuses with `402`, code
`40200`, and a sentence that says which: "This week's credits are used …
They reset on Monday …", "Your trial credits are used up …", "Your payment
didn't go through …", "No active plan …", each naming
`app.simeonlabs.com/billing` (but Apple's failed payment).

**What the apps say about the credits** (iPhone and Mac, over the composer,
grey, never red; `ios/SimeonCore/Sources/SimeonCore/Upgrade.swift`):
spent ("This week’s credits are used", "You’ve used your free credits",
with Upgrade), and since 13 October 2026 **near the limit**: "You’re
approaching your usage limit / You’ve used 81% of this week’s credits. They
reset on Monday." from 80% of `creditsLimit`, again from 95%
(`PhoneUpgrade.approaching`). The person can close it; it stays closed for
that step of that period (`ApproachingClosed`, kept in the app's settings).
The Electron window never had this line. The apps read the quota as a chat
opens and as each answer ends, at most every 30 s (`loadUsage`). On the
iPhone, Upgrade opens the plans (or the web, by the rules of
`PhoneUpgrade.route`); on the Mac, Settings › Usage & Billing.

**No plan in the apps** (14 October 2026). With no plan, a failed payment
included, the iPhone and the Mac open as usual: the agents, their chats
and the computer are all there, Send waits (`SandAccess.pausesSending`),
and the line over the composer, grey like the credits' line, says why
(`PhoneUpgrade.banner`, `MacUpgrade.cover`):

| Account | Title / words | Button, iPhone | Button, Mac |
|---|---|---|---|
| Card failed, plan bought on the web | "Your payment didn’t go through" / "You can’t send messages until your card is updated." | Update card: Stripe's card form (where Apple allows the link; else no button) | Update card: Stripe's card form |
| Payment failed, plan bought on the iPhone | "… / You can’t send messages until your Apple payment method is updated." | See plans: the plans, with a line over them and Update payment (Apple's page) | Update payment: Apple's page |
| Free month over | "Your free month has ended" / "Choose a plan to send messages again." | See plans | See plans: the web's plans page |
| Never had a plan | "Choose a plan to start" (iPhone), "Start your free trial to send messages" or "Simeon needs a plan" (Mac) | See plans | the web's plans page |

Stripe's page opens **in the app**, not the web: the app asks
`POST /desktop/api/billing/portal` with `flow` (`payment_method` for the
card form, `update_confirm` and the plan above for an upgrade) and `back`
(its URL scheme, `simeon-ios` or `simeon`), and shows the link in Apple's
sign-in sheet (`BillingPage` on the iPhone, `MacBillingPage` on the Mac).
The link already carries the person, so there is no sign-in on the way;
until then every button opened `app.simeonlabs.com/billing`, which asked
the person to sign in again. Stripe's page ends on
`/desktop/billing/back?to=<scheme>` (also as soon as the card is saved,
through the flow's `after_completion`), which hands over to the app's own
link and closes the sheet. After a failed payment the app then asks
`POST /desktop/api/billing/settle` (`PlansService.settle_unpaid`): the
subscription is moved to the card just saved (a checkout put the old card
on the subscription itself, and Stripe keeps retrying that one), its open
invoice is charged now instead of at Stripe's next retry, and the copy is
updated, so the line goes and Send comes back at once. A card refused
again leaves everything as it was. Settings' Manage Plan and the credits'
Upgrade for a plan bought on the web open the same page the same way.

**The Mac with no plan** (14 October 2026). The iPhone starts the free
month itself at first sign-in; the Mac does not. An account with no plan
gets the cover over the Mac's window (`AccessCover`, `MacUpgrade` in
`ios/SimeonCore/Sources/SimeonCore/Upgrade.swift`): one that never had a
trial reads "Start your free trial to send messages / 30 days free, then
your plan. Add a card on the web; cancel anytime." and Start Free Trial
opens the plans page (`upgradeUrl`, `app.simeonlabs.com/billing?from=app`),
where Stripe's checkout takes a card and starts the 30-day trial (the
founder's choice that day); one that had its trial reads "Simeon needs a
plan" with See plans to the same page; a failed payment reads "Your payment
didn't go through" with Update card. The cover names the account it is
signed in to and has Sign Out. Until then the window's own words said
"Start your free month", and every button opened simeonlabs.com, where
nothing starts a trial.

**What the apps never say.** No banner, card, alert or notice names what is
behind Simeon: a model company (its credits, limits or name), a status code,
a setting's name, an address or the plumbing's words. Since 13 October 2026
the engine turns such a refusal into "Simeon isn't available at the moment.
Try again in a little while." (`simeonFacingProviderError`,
`desktop/source/host/extensions/transcript/agent-run-error.ts`, live once a
new host bundle is published), and both apps pass every error they show
through `PlainWords` (`ios/SimeonCore/Sources/SimeonCore/PlainWords.swift`),
which keeps plain words and replaces the rest. The words themselves stay in
the log (the computer's `/tmp/sand-host.log`, the apps' trace).

`GET /desktop/api/user/quota` carries the plan to the app. Its first eight
keys are what every shipped app reads and keep their meaning (`creditsLimit`,
`creditsUsed`, `creditsRemaining`, `periodStart`, `periodEnd`, …). The keys
added on 5 October 2026 feed the app's usage summary
(`desktop/source/electron-main/account/account-profile.ts`,
`usageSummaryFromSimeonQuota`): `tier`, `trialEndsAt`, `trialCancelable`,
`onDemand` (null until the server meters it), `upgradeUrl`; and since 12
October 2026 `billedBy` (`stripe`, `apple`, or null without a plan), which
the iPhone and Mac apps read to send an Apple plan's changes to Apple.

**The Manage plan card** (Settings → Usage & Billing, 6 October 2026). The
window's own page had one, filled from the upstream's dashboard calls;
the renderer patch (`desktop/scripts/lib/router-renderer-patch.mjs`,
`MANAGE_PLAN_REPLACEMENTS`) redraws it under the meters from the usage
summary's `managePlan` (the quota's plan, status, `periodEnd` and the next
plan up, `desktop/source/electron-main/account/account-profile.ts`): the
plan's name, when it resets or the trial ends, an "Upgrade to Pro" (or
Max) button and a "Manage Billing" button. Both ask the server for a
Stripe Customer Portal link, `POST /desktop/api/billing/portal` (bearer
auth; `flow=update_confirm` with a `tier` opens the confirmation of that
one change, nothing opens the portal's front page), and open it in the
browser. Nothing is drawn without a plan on Stripe.

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
  A box that wakes has `usage_metered_at` moved past its sleep, keeping
  the seconds it ran before the sleep that were not sent yet
  (`box_service.mark_running`); a box found stopped outside the broker
  records when (`mark_stopped`). Until 16 October 2026 nothing moved it on
  a wake, and the next report counted the whole sleep as running time
  (`test_a_woken_box_is_not_billed_for_its_sleep`).
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
| `SIMEON_DESKTOP_COMPUTER_WITHOUT_PLAN` | API | `true` (the default): an account with no plan still reaches its cloud computer, so the apps stay open with Send held (section 3, item 6). `false`: the computer is refused and the apps show the full-screen cover, as before 14 October 2026. Every metered call is refused either way. |
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
- **`sand.box.ensure.no_plan`**: an app asked for its box without a
  plan; `allowed=True` when it was let through (the app open with Send
  held), `allowed=False` when it was refused and shown the cover. One line
  per ask.
- **`plans.settle`**: after Stripe's card page closed in the app, whether
  the unpaid plan is now paid (`paid`). **`plans.settle.declined`**: the
  card just saved was refused too, with Stripe's code; the person still
  sees "Your payment didn't go through".
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
- **In-app purchase on an iPhone** (section 9): nothing has run on a
  device or in Apple's sandbox yet, and the StoreKit code has not been
  compiled (it was written without Xcode). The server tests sign
  transactions with a test certificate chain, not Apple's.
- **A second free week through Apple.** The free week was removed from the
  six products on 12 October 2026 (the free month replaced it, section
  10); the code still applies one if a product carries it. Apple decides
  who gets its free week (once per Apple ID), not the server. A person who had the web's
  trial, or Apple's on another Apple ID, gets Apple's free week again and
  the trial's credits with it. StoreKit's server-signed offer eligibility
  (`Product.PurchaseOption.introductoryOfferEligibility`, signed with an
  In-App Purchase key) would let the server say no; it is not built.

## 9. Bought in the iPhone app (12 October 2026)

Apple requires that a subscription unlocking features in an iPhone app be
sold through its in-app purchase (App Review Guideline 3.1.1). So the
iPhone app sells the web's plans through the App Store: Apple's purchase
sheet, Face ID, the person's Apple account, Apple's receipts, and Apple's
own screen to change or cancel (Settings › your name › Subscriptions). The
person never leaves the app.

**The money.** Apple keeps 30% of the first year of each subscription and
15% after it, or 15% from the start under the App Store Small Business
Program (under $1 million a year of proceeds; apply in the developer
account). The
prices are the web's; Apple's cut comes out of them. People who pay on the
Apple side get the same credits as on the web and no top-up, since the web
has none either (section 8).

**The web as well, in the United States.** Since the court ruling of 30
April 2025, an app on the US storefront may link to its own website to buy,
with no fee to Apple for now. The plans sheet shows "Subscribe on the web"
only when the App Store's storefront is the United States
(`Storefront.current.countryCode == "USA"`, `ApplePlans.webLinkAllowed`);
everywhere else it shows Apple's purchase alone, and a plan bought on the
web keeps working but its Stripe links are not shown in the app.

### The plans as products

One subscription group, "Simeon", with six auto-renewable subscriptions.
Their ids are `<SIMEON_APPLE_PRODUCT_PREFIX>.<tier>.<monthly|yearly>`
(`server/simeon/plans/app_store.py`, `product_id`); the server tells the
app which to ask StoreKit for (`GET /desktop/api/billing/apple/products`),
so a renamed product is a setting, not an app release.

| Product id | Price (US) | Level in the group |
|---|---|---|
| `com.simeonlabs.simeon.max.monthly` | $200.00 a month | 1 |
| `com.simeonlabs.simeon.max.yearly` | not sold through Apple yet (below) | 1 |
| `com.simeonlabs.simeon.pro.monthly` | $60.00 a month | 2 |
| `com.simeonlabs.simeon.pro.yearly` | $579.00 a year (Apple has no $576) | 2 |
| `com.simeonlabs.simeon.standard.monthly` | $20.00 a month | 3 |
| `com.simeonlabs.simeon.standard.yearly` | $191.99 a year (Apple has no $192) | 3 |

Each has an introductory offer: free, one week, for new subscribers. The
levels make a move between plans an upgrade (at once, prorated by Apple)
or a downgrade (at the next renewal), as Apple's own sheet does them.

Apple sets the price points, so two yearly prices differ from the web's
by a few dollars (12 October 2026). Max yearly ($1,920) is above Apple's
standard price points, which stop at $1,000; prices above it need the
Account Holder to request Apple's higher price points. Until that is
granted the product is not created, and the plans sheet shows only what
the App Store returns (`Purchases.sold`), so Max is monthly on the iPhone.
The server never reads a price: the tier comes from the product id, so a
changed price needs no server change.

### How a purchase reaches the server

1. **Choosing.** Settings › Usage & Billing (Change Limit, Upgrade) and
   the access cover open the plans sheet (`ios/Simeon/PlansSheet.swift`):
   monthly or yearly, the three plans with the App Store's price in the
   person's currency, "Start Free Week" while Apple still offers it to
   this Apple ID, the price, period and renewal line Apple asks for,
   Restore Purchases, and the Terms and Privacy Policy.
2. **Buying.** `Purchases.buy` (`ios/Simeon/Purchases.swift`) runs
   StoreKit 2's purchase with the Simeon account's id as its
   `appAccountToken`. StoreKit hands back the transaction Apple signed.
3. **Starting the plan.** The app posts every signed transaction, with its
   signed renewal info, to `POST /desktop/api/billing/apple/transactions`
   (bearer auth). The server checks Apple's signature with Apple's library
   (`app-store-server-library`) against Apple's root certificate
   (`server/simeon/plans/apple_roots/AppleRootCA-G3.cer`), for the bundle
   id `com.simeonlabs.simeon.ios`, in production and then the sandbox; it
   refuses a purchase tagged with another account or already held by one
   (409), unless that account was deleted: then the subscription moves to
   the account sending it (12 October 2026; the same Apple ID signing up
   again keeps its plan), copies the subscription into `desktop_app_store_subscriptions`
   (one row per original transaction id), and answers the plan and the
   quota. The app then finishes the transaction. One it could not deliver
   comes back from StoreKit at the next launch and is sent again.
4. **Afterwards.** Apple's App Store Server Notifications (version 2) post
   every renewal, plan change, failed charge, grace period, cancellation,
   expiry and refund to `POST /desktop/apple/notifications`. The server
   checks the signature, finds the row by its original transaction id (or
   the person by the purchase's `appAccountToken`), and copies the new
   state in. A notification signed before what is already applied is
   skipped. The app also sends what the Apple ID holds at each launch and
   on Restore Purchases, and listens to StoreKit's updates, so a missed
   notification is caught up.
5. **How a row counts.** Before its expiry: `trialing` in the free week,
   `active` after. Past it while Apple retries the charge in its billing
   grace period: `past_due`, which still counts after a paid period, and
   not after the free week, when nothing was paid yet (section 4).
   Refunded or revoked:
   `canceled` at once. Each row counts until its expiry (or the grace
   period's end) plus 12 hours, so a renewal Apple has not told the server
   about yet does not cut anyone off. Apple's free week counts as the
   person's one trial: a plan bought on the web afterwards starts paid.
6. **What the other surfaces do with an Apple plan.** The web billing
   page's checkout and portal, the Mac's Manage Billing and Cancel Trial,
   and Connect `CancelSandTrial` answer 409 with "Your plan is billed
   through Apple. Change or cancel it on your iPhone in Settings › your
   name › Subscriptions." (`BilledByApple`). The iPhone app opens Apple's
   own subscription sheet instead. Deleting the account does not cancel an
   Apple plan (only the person can); Delete Account says so before and
   after (`appleSubscription` in its answer).

### Settings on Render

| Setting | Where | Value |
|---|---|---|
| `SIMEON_APPLE_APP_ID` | API | The app's Apple ID, the number in App Store Connect › the app › App Information (General). Apple's library needs it to check production purchases; without it only sandbox purchases are accepted and a production one answers 503 ("Purchases in the app aren't set up …"), logged as `plans.app_store.unverified` with `production_configured=false`. |
| `SIMEON_APPLE_BUNDLE_ID` | API | Only if the iPhone app's bundle id changes; default `com.simeonlabs.simeon.ios`. |
| `SIMEON_APPLE_PRODUCT_PREFIX` | API | Only if the products are named differently; default `com.simeonlabs.simeon`. |
| `SIMEON_APPLE_ONLINE_CHECKS` | API | `true` by default: Apple's library also checks the certificates' revocation online. `false` only if Apple's OCSP host is unreachable from Render. |

The migration `desktop_app_store_1012` adds `desktop_app_store_subscriptions`.

### In App Store Connect (once, by the founder)

1. **Agreements, Tax and Banking**: accept the Paid Apps agreement, add
   the bank account and the tax forms, as Spaire, Inc. Nothing can be sold
   until it is active.
2. **App Store Small Business Program**: apply in the developer account
   (developer.apple.com › Programs › App Store Small Business Program).
3. **The subscription group and products**: in the app › Monetization ›
   Subscriptions, create the group "Simeon" and the six products of the
   table, each with its price, a display name ("Simeon Pro") and a
   description ("12,500,000 credits a week"), no introductory offer (the
   free week was removed on 12 October 2026: the free month replaces it,
   section 10), and a review screenshot of the plans sheet.
4. **Server notifications**: in the app › App Information › App Store
   Server Notifications, Version 2, set both the production and the
   sandbox URL to `https://api.simeonlabs.com/desktop/apple/notifications`.
   A test notification from Apple logs
   `plans.app_store.notification type=TEST`.
5. **The app's Apple ID** on Render as `SIMEON_APPLE_APP_ID`.
6. **The listing**: the App Store description ends with links to the Terms
   (`https://simeonlabs.com/terms`, as the licence agreement) and the
   Privacy Policy (`https://simeonlabs.com/privacy`); App Review rejects
   subscriptions without them.
7. **Testing**: a sandbox Apple account (Users and Access › Sandbox), then
   a TestFlight build: buy, see the plan start, Restore Purchases, cancel
   in Settings › Subscriptions. The sandbox renews a monthly plan every
   five minutes, so a year of renewals takes an hour.

### When it misbehaves

- **`plans.app_store.synced`**: a purchase or notification was applied,
  with the person, the status, the tier and the environment (`Sandbox`
  or `Production`).
- **`plans.app_store.unverified`**: a signature did not check out, with
  each environment's failure (`INVALID_ENVIRONMENT`, `INVALID_APP_IDENTIFIER`,
  `VERIFICATION_FAILURE`, `INVALID_CHAIN`, …). `INVALID_APP_IDENTIFIER`
  means the bundle id or the app's Apple ID setting is wrong.
- **`plans.app_store.not_yours`**: the app sent a purchase that belongs to
  another Simeon account (the person is told to sign in with that one or
  use another Apple ID).
- **`plans.app_store.moved_from_deleted`**: a subscription whose account
  was deleted moved to the account that sent it (`from_user_ids`). Until
  12 October 2026 this was refused, and a person who deleted their account
  and signed up again was held on the plans screen.
- **`plans.app_store.nobody`**: a notification for a subscription no
  account matches (bought before the account's id was attached, or with
  another app's bundle). **`plans.app_store.not_ours`**: a product id that
  is not one of the six.
- **`plans.app_store.stale`**: a late notification older than what is
  applied, skipped.
- **`plans.app_store.notification`**: every notification, with its type
  and subtype and whether it changed a row.
- A person with a plan bought on the iPhone who sees "No active plan":
  check `desktop_app_store_subscriptions` for their user id. No row means
  the app never reached the server and no notification matched (Restore
  Purchases sends it again); a row with `tier` null means a product id the
  server does not know.

## 10. The free month on the iPhone (12 October 2026)

The founder dropped Apple's free week ("the whole free trial makes it
complicated"): a person who signs in on the iPhone has 30 days and the
trial's 5,000,000 credits, with no checkout and no card. When the days or
the credits run out the app offers the plans sheet. On the web and the Mac
the trial still takes a card: a browser or a Mac cannot be told apart, an
iPhone can.

**One per person and one per iPhone** (`server/simeon/plans/free_month.py`):

- the person: no free month, card trial or Apple free week before, by
  account and by e-mail. The row (`desktop_free_trials`) keeps a SHA-256 of
  the e-mail, so deleting the account and signing up again with the same
  address gives no second month;
- the iPhone: Apple's DeviceCheck (`server/simeon/plans/device_check.py`).
  Apple keeps two bits per device for the developer team, through deleting
  the app and signing in with another account; bit 0 means "this iPhone had
  its free month". The server reads it before a month starts and sets it
  after.

**The call.** After every sign-in the app sends
`POST /desktop/api/billing/free-month {deviceToken, development}` (the
token from `DCDevice.generateToken()`; `development` for a build run from
Xcode, whose token only Apple's development service knows; the other
service is asked when Apple does not know the token). The answer is
always 200: `outcome` (`started`, `running`, `not_needed` for a plan or
billing off, `had_trial`, `device_used`, `unavailable`), `endsAt`, and the
quota.

**How it counts.** With no live plan, `resolve_allowance` reads the free
month: while it runs, status `trialing`, plan name "Free trial", no tier
and nobody billing it, the window the month and the credits its own. It
opens the computer, the model calls and app connections like a plan's
trial. Once over, status `none` with `trialEndsAt` still set, so the app
says the free month has ended. A plan bought later is a plan like any
other, with no trial (it is the person's one trial).

**Settings on Render** (the shared environment group the API and the worker read):

| Setting | What |
|---|---|
| `SIMEON_APPLE_DEVICECHECK_KEY_ID` | The key's id (developer account › Keys, DeviceCheck ticked) |
| `SIMEON_APPLE_DEVICECHECK_KEY_VALUE` | The `.p8` file's text, with its BEGIN and END lines |
| `SIMEON_APPLE_TEAM_ID` | `496QXRMJXG`, already set for Sign in with Apple |
| `SIMEON_DESKTOP_FREE_TRIAL_TEST_EMAILS` | Optional: e-mails whose free month may start again on an iPhone that had one, to try the first run more than once (delete the account in the app, sign in again) |

Without the DeviceCheck key the iPhone gets no free month (`unavailable`)
and is offered the plans.

**When it misbehaves:**

- **`free_month.started`**: a month began, with its end and whether it was
  a test e-mail.
- **`free_month.device_used`**: the iPhone already had one.
- **`free_month.device_check_not_configured`**: the key settings are
  missing.
- **`free_month.device_check_failed`** with **`device_check.query_refused`**
  or **`device_check.unknown_token`**: Apple refused the question (a wrong
  key or team gives 401) or knows the token in neither service.
- **`free_month.device_mark_failed`**: the month started but Apple did not
  keep the mark; the account and the e-mail still count it.
