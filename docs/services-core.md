# What the server does for the app, part 1

This page covers four things the server at `api.simeonlabs.com` does for the
Simeon app on the Mac: sign-in, the model proxy with its prices and spend
limits, memory sync, and the cloud computer.

Server code lives in `server/simeon/` (the Python package is `simeon`). App code
lives in `desktop/source/`.

**Settings on Render.** Every server setting is read as `SIMEON_<NAME>`. The
older `CLAIDOR_<NAME>` is still read when the `SIMEON_` name is not set
(`server/simeon/config.py`). This page always uses the `SIMEON_` form. Settings
that are durations (for example `SIMEON_BOX_IDLE_HIBERNATE_AFTER`) are written
as ISO 8601, such as `PT30M`.

**Logs.** Server log lines are structured events such as
`desktop.proxy.upstream_refused`. Inside the person's computer (the box), the
host writes one line per event to `/tmp/sand-host.log`. Every such line starts
with `[simeon]` (`desktop/source/shared/host-log.ts`).

---

## 1. Sign-in

**What it does for the person.** The person clicks sign in, confirms in the
browser, and the app is signed in to their Simeon account. After that the app
stays signed in by itself until the person signs out.

### How it works

The app calls three routes. They sit at the **root** of the API host, not under
`/desktop`, because the app builds each URL with a leading slash
(`server/simeon/desktop/app_sign_in.py`):

| Route | What it does |
|---|---|
| `GET /loginDeepControl?challenge=…&uuid=…[&provider=apple\|google]` | The browser page. With no web session and no `provider` (the Mac) it redirects to the web app's sign-in page, `app.simeonlabs.com/login?return_to=…` (18 October 2026: Continue with Google, Continue with Apple, or an e-mail and its six-character code, `clients/apps/web/src/components/Auth/SignInPage.tsx`), each of which signs the browser in and comes back here; the page's Continue with Apple, while Apple is not set up on the server, comes back to that page with `error=apple_unavailable` and says so. With `provider=google` or `provider=apple` (the iPhone's buttons, 9 October 2026) it goes straight to the API's own Google or Apple sign-in (`/v1/integrations/google/login/authorize`, `/v1/integrations/apple/authorize`), or, while Apple is not set up, to a page that says so and offers Google. With a session and no plan (billing required, no trialing or active subscription on Stripe) it redirects to the web app's `/billing?plan=standard&return_to=…`, the one page the web app is for, which opens Stripe Checkout and comes back with `checkout_session_id` (`services-billing.md`); never for the iPhone (`redirectTarget=simeon-ios`), whose plans are Apple's in-app purchase and which Apple does not let send people to buy on the web (12 October 2026). Otherwise it shows a confirm page naming the account. |
| `POST /loginDeepControl` | The confirm form. Same-origin only. Records the pending sign-in; no sign-in is written before this post. |
| `POST /auth/poll` (body `{uuid, verifier}`) | The app polls here. `404` means "not yet"; `200` returns `{accessToken, refreshToken}` once. `GET /auth/poll` with query parameters is still served for older builds. |
| `GET /auth/google/config`, `POST /auth/google` (body `{code, codeVerifier}`) | The iPhone's own Google sign-in (12 October 2026), replacing the web page's "Continue as …" step after Google's picker. The config route gives the app its OAuth client (`SIMEON_GOOGLE_IOS_CLIENT_ID`, an OAuth client of type iOS in the web client's Google Cloud project), the redirect (the client id reversed, `com.googleusercontent.apps.…:/oauthredirect`), Google's page and the scopes; `{"google": null}` without the setting, and the app then signs in through the web page as before. The app opens Google's page itself with a PKCE challenge and posts the code and its verifier; the server trades them with Google (no secret: an iOS client has none) and reads the person from Google's userinfo. The account is the web's Google sign-in's for the same Google account (else the one with that verified e-mail, else a new one). `200` returns `{accessToken, refreshToken}`; `400` (`google_unverified`) when Google refuses the code; `403` with a `message` when the Google account can't be used. Log lines: `desktop.sign_in.google_native`, `google_native.exchange_refused`, `google_native.unreachable`. |
| `POST /auth/apple` (body `{identityToken, nonce, authorizationCode?, givenName?, familyName?}`) | The iPhone's own Sign in with Apple sheet (12 October 2026): no browser. The identity token must be Apple's (its keys), for `SIMEON_APPLE_BUNDLE_ID`, and carry `sha256(nonce)` in hex; the code is traded with Apple for the person's Apple tokens, kept to revoke them when the account is deleted. The account is the web's Sign in with Apple's for the same Apple ID (else the one with that verified e-mail, else a new one). `200` returns `{accessToken, refreshToken}`; `400` (`apple_unverified`) when the token does not check out; `403` with a `message` when the Apple account can't be used. Log lines: `desktop.sign_in.apple_native`, `integrations.apple.native.unverified`, `…nonce`, `…code_refused`. |
| `POST /auth/email/code` (body `{email}`), `POST /auth/email/verify` (body `{email, code}`), `POST /auth/email/password` (body `{email, password}`) | The iPhone's Log in or sign up (19 October 2026, the founder's ChatGPT reference; `server/simeon/desktop/email_sign_in.py`, the app's `EmailSignInSheet`): an e-mail, then the six-character code sent to it (the web's login codes, `simeon.login_code`, 30 minutes) or the account's password. `code` answers `202` whether or not the e-mail has an account; `verify` and `password` answer the pair, `{accessToken, refreshToken}`. A new e-mail becomes a new account at its code (the code proves the e-mail). Every password refusal (no account, no password, the wrong one) is the same `401` sentence, after the same work. `APP_REVIEW_EMAIL` with `APP_REVIEW_OTP_CODE` signs in with that fixed code and no e-mail (the login code service's own bypass, for Apple's review). Per e-mail, 5 codes sent and 10 wrong codes or passwords in 15 minutes, then `429` with a sentence (Redis, keyed by the e-mail's hash). Log lines: `desktop.sign_in.email` (`how`: code or password), `desktop.sign_in.email.code_limited`. |
| `POST /v1/login-password/authenticate?return_to=…` (form `email`, `password`) | app.simeonlabs.com's password sign-in (19 October 2026, the same choice as the iPhone's): on the web's "Check your email" page, under the code, OR and **Continue with password** go to `/login/password` (`clients/apps/web/src/app/(main)/login/password/`), whose form posts here. The right password gives the browser its session cookie, as the code's `/v1/login-code/authenticate` does, and goes on to `return_to` (from the Mac app, its `/loginDeepControl` link); a refusal goes back to `/login/password` with the same one sentence, under the same per-e-mail limits as the app's. Log line: `desktop.sign_in.email` with `web=True`. |
| `GET` / `PUT /desktop/api/account/password` (body `{password}`) | Settings › Account › Password on the iPhone: whether the signed-in person has a password, and setting or changing it (at least 8 characters, at most 128, not the e-mail; `400` with a sentence otherwise). Only a signed-in person can set one, so nobody puts a password on an account whose e-mail they haven't proved; a forgotten one is replaced after signing in with a code. Stored as scrypt's salt and digest in `users.password_hash` (`server/simeon/desktop/passwords.py`: N=2^14, r=8, p=5, OWASP's 16 MiB setting). Log line: `desktop.account.password_set`. |
| `POST /oauth/token` (`grant_type=refresh_token`) | The refresh. Returns a new pair. A spent or expired refresh token gets `200` with `shouldLogout: true`; only a malformed request gets `400`. |

The challenge is `base64url(sha256(verifier))`. The server recomputes it from
the verifier the app sends, so only the app that started the sign-in can
finish it. The app sends the verifier in a POST body so it never lands in an
access log.

**The access-token envelope.** The app reads `sub`, `email` and `exp` from its
access token. If it cannot read `exp`, it refreshes before every call. So the
server wraps the real, opaque access token in a signed JWT
(`envelope_access_token` in `server/simeon/desktop/service.py`). The prefix stays
on the outside. When a request comes in, `authenticate` unwraps the envelope
and looks the inner token up by its hash in `desktop_sessions`. There is still
only one way to check a desktop credential.

**Token prefixes** (`server/simeon/desktop/tokens.py`):

| Token | Prefix now | Older prefix still accepted |
|---|---|---|
| Sign-in code | `simeon_dc_` | |
| Access token | `simeon_da_` | `claidor_da_` |
| Refresh token | `simeon_dr_` | |
| Box renewal credential | `simeon_db_` | `claidor_db_` |

Older tokens stay valid because a token is found by the hash of the whole
string.

**Lifetimes** (`server/simeon/config.py`):

- Access token: 1 hour (`SIMEON_DESKTOP_ACCESS_TOKEN_TTL`).
- Refresh token: 30 days (`SIMEON_DESKTOP_REFRESH_TOKEN_TTL`), from the last
  refresh: the apps refresh every hour they are used, so only 30 days
  without opening one signs the person out.
- Sign-in code: 5 minutes (`SIMEON_DESKTOP_AUTH_CODE_TTL`).

**Refresh grace.** A refresh spends the old refresh token. The old access
token stays good for up to `SIMEON_DESKTOP_REFRESH_GRACE` (5 minutes), so a
copy of it held elsewhere does not fail right after a refresh.

**A lost refresh answer** (28 October 2026). When the answer to a refresh never
reached the app (the Mac asleep, the phone leaving the app, the network
dropping), the app still held the spent token and its next refresh signed the
person out. Now `desktop_sessions.replaced_by_id` names the session a refresh
traded a row for, and `first_used_at` is set the first time a row's access
token is presented or its refresh token traded. A spent token whose successor
was never used is traded again: the unused successor is revoked, a new pair is
issued and the box credential moves to it (`desktop.refresh.answer_lost`). Once
the successor has been used, the spent token is refused as before.

**A 401 in the apps** (28 October 2026). Any 401 from a call used to sign the
apps out. A provider's 401 passed on (OpenAI refusing our key on dictation or
a picture) did so too. Now the apps first ask with one refresh
(`SimeonAPI.refused`): a new pair, or no answer, keeps the person signed in;
only a refused refresh signs out. The server also passes a provider's 401 on
as `502` (`capabilities._refusal`).

**Sign-out.** The app posts `POST /desktop/api/auth/logout`. The server revokes
the session and any access token of that person still inside its refresh
grace. The box credential that belongs to it moves to another app the person
is still signed in on (the Mac, the iPhone or the web window), and is revoked
only when the last one signs out (20 October 2026; before, signing out of the
iPhone cut the box off from the Mac too). The Mac's local-exec credential is
always revoked. A box credential or a cloud job's token cannot sign anyone out.

**Rate limits** (`server/simeon/rate_limit.py`):

- `/loginDeepControl`: 20 a minute, 100 an hour.
- `/auth/poll`: 120 a minute.
- `/oauth/token`: 30 a minute.
- `/v1/login-code` and `/v1/login-password` (the web's codes and passwords): 6 a minute, 12 an hour.
- `/auth/email` (the apps' codes and passwords): 10 a minute, 60 an hour; per e-mail limits sit behind it.

**The person's name.** When the person signs in with Google, the server keeps
their Google name in `user.meta` (`server/simeon/integrations/google/service.py`).
`GET /desktop/api/user/profile` returns it as `name`, Google's first name as
`suggestedName`, and the name the person chose as `preferredName`.

- **Asked during onboarding.** The step "How should we call you?" (`__simeonNameStep`
  in `desktop/scripts/lib/router-renderer-patch.mjs`) comes after the computer
  step, filled in with `suggestedName`, and saves through the account's rename
  (`POST /desktop/api/user/name`, kept in `user.meta["preferred_name"]`). It may be
  left empty.
- **In the Mac and iPhone apps** (29 October 2026). The first run asks "What
  should we call you?" and Simeon is made only after Continue has saved the
  name and the computer has read it again (`AppStore.finishNameStep`, then the
  engine's `refreshUserName`): the computer read Google's name as it started,
  and Simeon, made while the name screen showed, greeted the person by it.
  Settings › Account's rename tells an awake computer the same way.
- **Asked again only if skipped.** The window shows "What should your agents call
  you?" (`__simeonNameSheet`) while the profile has no `preferredName` and
  onboarding is done; "Not now" asks again at the next launch.
- **Where it is used.** The agents' system prompt (`preferredName`, else `name`;
  `host/extensions/auth/user-full-name-service.ts`, read again every 5 minutes, and
  at once when an app asks with `refreshUserName`), the voice call's prompt and greeting, and the
  call recap. `nickname` is made from the e-mail's local part and is never used
  as the person's name.

### Settings on Render

- `SIMEON_BASE_URL` (`https://api.simeonlabs.com`)
- `SIMEON_FRONTEND_BASE_URL` (`https://app.simeonlabs.com`, where `/login` lives)
- `SIMEON_SECRET` (signs the envelope and keys the token hashes)
- The durations above, only to change the defaults.
- For Sign in with Apple (the iPhone's Continue with Apple): `SIMEON_APPLE_CLIENT_ID`
  (a Services ID with Sign in with Apple, its return URL
  `https://api.simeonlabs.com/v1/integrations/apple/callback` and its domain
  `api.simeonlabs.com`), `SIMEON_APPLE_TEAM_ID`, and a Sign in with Apple key's
  `SIMEON_APPLE_KEY_ID` and `.p8` contents as `SIMEON_APPLE_KEY_VALUE`. Until all four
  are set, the Apple button's page says "Sign in with Apple is coming soon" and offers
  Google (`apple_sign_in_ready` in `server/simeon/desktop/app_sign_in.py`). The
  iPhone's own sheet (`POST /auth/apple`) checks tokens with Apple's keys alone; the
  same key also trades its code and revokes on Delete Account (for
  `SIMEON_APPLE_BUNDLE_ID`, the key's primary App ID).
- For Log in or sign up's codes to reach anyone: `SIMEON_EMAIL_SENDER=resend` and
  `SIMEON_RESEND_API_KEY`, with `SIMEON_EMAIL_FROM_DOMAIN` verified at Resend, on **both**
  `simeon-api` and `simeon-worker`. The API only queues the e-mail (`email.send`,
  `simeon/email/sender.py`) with its From address (`mail@` the API's domain); the worker
  sends it with its own sender and key (`simeon/email/tasks.py`). On Render these are set
  on the two services themselves, not in `simeon-shared` (checked 19 October 2026, under
  their `CLAIDOR_` names). With the default `logger` the code is only written to the
  worker's log and no e-mail goes out: the worker's `email.send.actor_start` line says
  `sender_class=ResendEmailSender` when it sends.
- The website's contact form (simeonlabs.com/contact, 24 October 2026) goes out the same
  way: `POST /desktop/api/contact` (no sign-in, `server/simeon/desktop/contact.py`) queues
  one e-mail to `SIMEON_CONTACT_EMAIL` (bass@simeonlabs.com unless set) with the person
  as its reply-to, so it needs the same Resend settings. Nothing is stored. The log says
  `desktop.contact.received` for each message and `desktop.contact.dropped` for a form
  whose hidden field a bot filled; `rate_limit.py` allows 5 a minute and 20 an hour from
  one address.
- Send Feedback and Report an Issue in the apps (30 October 2026; Settings on the iPhone,
  Settings › Help & support and the account menu on the Mac) go out the same way:
  `POST /desktop/api/feedback` (signed in, `server/simeon/desktop/feedback.py`) queues one
  e-mail to `SIMEON_CONTACT_EMAIL`, from the person's account and with them as the
  reply-to. It says the app and its version, the device and its system, the language,
  the time zone, the agent or the topics picked, then the words; up to four screenshots
  come attached (JPEG or PNG, shrunk by the app). An issue asks first whether to include
  logs and diagnostics; when the person agrees, `diagnostics.txt` is attached: what the
  app knows of its state, its recent activity (console lines and failed or slow calls to
  this server, `RecentActivity` in SimeonCore) and, on the Mac, the last lines of
  `computer-stream.log` and `voice-call.log`. Never messages, and every line is scrubbed
  of tokens, keys and query strings first (`Diagnostics.scrub`). Nothing is stored. The
  log says `desktop.feedback.received` (kind, topics, agent, counts) and
  `desktop.feedback.screenshot_refused` for a picture that is not one;
  `rate_limit.py` allows 10 a minute and 40 an hour.
- For Apple's review: `SIMEON_APP_REVIEW_EMAIL` (the review account's e-mail) and
  `SIMEON_APP_REVIEW_OTP_CODE` (six digits), in `simeon-shared` (only the API reads
  them). That e-mail then signs in with that code and no inbox; the reviewer can also be
  given a password, set in the iPhone app (Settings › Account › Password) after signing
  in that way once. app.simeonlabs.com has no page that sets one.

The pages the browser shows (the confirm page, "You're signed in", the Apple page)
are drawn in the iPhone sign-in screen's design since 9 October 2026: simeonlabs.com's
mark and wordmark in the middle, the buttons at the foot in the app's own (the first
in the ink, black on light and white on dark, the next in the plain glass), light or
dark as the device is (`_page`;
the marks are `sign_in_brand.py`, generated with the app's by
`node ios/scripts/make-sign-in-assets.mjs`). The confirm page is only the mark, its
two buttons (Continue as the account, Use a different account) and the Terms and
Privacy line under them, as under the app's (`LEGAL`): no heading and no line naming
the device (the founder: "its noise").

Every title a browser shows, on those pages, the page after an app is connected, the
Slack and GitHub install pages and the web app's (sign-in, "Choose your plan", "You're
all set"), is the web sign-in's "Log in or sign up": Geist at 24, regular (30 October
2026, the founder: "i want to maintain a consistency"). This host serves the font
itself (`/desktop/fonts/geist-400.woff2`, `page_heading.py`), so its pages load
nothing from elsewhere.

### In the app

Every setting the app, the host in the box and the helpers read as
`SAND_<NAME>` is also read as `SIMEON_<NAME>` since 5 October 2026: each
process copies `SIMEON_<NAME>` to `SAND_<NAME>` at start when the latter is not
set (`desktop/source/shared/node/env-names.ts`), and `SAND_<NAME>` wins when both
are set. The server still writes the `SAND_` names into a box, because the box
image's own scripts read them.

The packaged app points sign-in at `https://api.simeonlabs.com` through
`SIMEON_API_BASE_URL`, `SIMEON_WEBSITE_URL` and `SAND_BACKEND_URL`
(`desktop/scripts/lib/config.mjs`). `SAND_BACKEND_URL` alone is not enough:
the login and poll URLs come from the first two.

### When it misbehaves

- A sign-in that never completes: the app keeps getting `404` from
  `/auth/poll`. Check that the confirm form was posted from the same origin.
- A person signed out without asking: `/oauth/token` answered `shouldLogout`.
  Search the API's log for `desktop.refresh.refused`: its `reason` says which
  (`spent`: traded before and its new pair used since; `expired`: 30 days;
  `revoked`: signed out elsewhere or the account deleted; `unknown`: a token
  this server never issued; `account`: the account can't sign in).
  `desktop.refresh.answer_lost` is a lost answer that was mended.

**Not yet verified:** a full sign-in round trip from the packaged app against
`api.simeonlabs.com`, and the refresh grace in use on a Mac.

### The person's language

Since 20 October 2026 the iPhone and Mac apps send their language as
`Accept-Language` on every request, and after every sign-in tell it to
`POST /desktop/api/user/profile` with `{"language": "fr"}` (`""` forgets it).
The server keeps it in `users.language` (`simeon/desktop/language.py`) and
answers it in the profile as `language`; none is English. A tag that is not a
language is refused with 400 and nothing changes. The same sign-in writes it on
the person's computer as the host setting `userLanguage`, which the agents and
calls read (`docs/localization.md`). The shop's `customer.locale` is not this.

### Deleting an account

Apple asks every app that makes accounts to let people delete theirs from
inside it. Settings › your account › Delete Account on the iPhone and in the
Swift Mac app (Settings › General › Account) asks first, then calls
`DELETE /desktop/api/account` (`server/simeon/desktop/account_deletion.py`).
The Electron app and the web app have no button yet. In order:

1. The subscription ends now at Stripe (`stripe_billing.cancel_subscription`).
2. Each cloud computer the person ever had is removed with both of its volumes
   (`/workspace` and the data folder), then its backups in the backup bucket
   (`box_store.delete_user`; a failure there is reported, not blocking).
3. The apps signed in through the apps provider are disconnected there,
   Link's grant is revoked at Link and its tokens forgotten
   (`link_wallet.disconnect`, docs/services-agents.md §7d), each AI account
   the person connected is signed out at its provider and forgotten
   (`model_accounts.disconnect_all`, section 2 below), and each call's
   transcript is deleted at the voice provider.
4. The person's rows go (`account_repository.py`: memory, call records, the
   Link connection,
   routines, listeners, sharing, cloud agents, their own skills and the skill
   archives in file storage, the computers' rows, every session, so every
   device is signed out).
5. The user is anonymised (`soft_delete_user`).

Kept, as the Privacy Policy says: usage and subscription rows (billing
records) and the trial redemption.

Steps 1 and 2 must succeed. When Stripe or a computer's server cannot be
reached, nothing else is done, the server answers `503` with the sentence the
app shows ("… Try again in a few minutes."), and the person is still signed
in. Both steps are safe to repeat.

**"It said it failed, and the account was deleted anyway"** (the founder, 14
October 2026). Two things together. The delete takes a while (Stripe, the
container and its volumes, one call per connected app and per call
transcript), and the apps waited one minute (URLSession's default) before
saying "The request timed out." And removing the container dropped the app's
connection, so within seconds the app asked for its computer again
(`EnsureSandBox`), which rebuilt the container the delete had just removed and
held locks on the person's sessions, stalling the delete further. Now:

- Before step 1 the delete takes the person's ensure lock, the one
  `EnsureSandBox` takes (`_hold_the_computer`), so the reconnect is told the
  computer is still starting and tries again; by then the sessions are gone and
  it is signed out. If a computer is being started when the delete begins, the
  delete waits up to 30 seconds, then answers `503` "Your agents' computer is
  starting. Try again in a few minutes." having done nothing.
- The apps wait five minutes for the answer (`SimeonAPI.deleteTimeout`). If it
  still does not come (or a gateway answers 502/504), they ask the server
  whether the account is gone (`/desktop/api/user/profile` refused with 401)
  for about half a minute before saying anything.
- A call made before the delete and refused after it no longer turns "Your
  account was deleted." into "Your Simeon sign-in ended."

When it misbehaves:

- `desktop.account.delete_blocked step=subscription|computer|computer_starting`:
  the step that stopped it, with the error.
- `desktop.account.delete_incomplete incomplete=[…]`: an app sign-in, a call
  transcript or a skill archive the provider would not delete. The account is
  gone; finish those by hand at the provider.
- `desktop.account.deleted`: done, with what was removed.
- Until 12 October 2026 every account with an Apple or Google sign-in got a
  `500` at step 5 (`soft_delete_user` saved the user after removing its
  sign-in rows, and the session refused the removed rows; the log said
  `Instance '<OAuthAccount …>' has been deleted`). The rows were rolled back
  after steps 1 to 3 had happened, so such an account lost its computer and
  apps but stayed. Deleting it again now finishes it.
- `Unhandled exception … ix_users_email_case_insensitive` on `DELETE
  /desktop/api/account` (15 October 2026, 14:40 PT): an address deleted,
  signed up with again and deleted again. Step 5 replaced the e-mail with a
  hash of it, and every e-mail is unique, deleted rows included, so the second
  deletion collided with the first and was rolled back. The hash now takes the
  account's id too (`soft_delete_user`; `tests/user/test_service.py`,
  `test_the_same_address_deleted_twice`). The free month keeps its own hash
  of the address (`DesktopFreeTrial.email_hash`), unchanged, so deleting and
  signing up again still starts no second free month.

**Not yet verified:** a deletion from the packaged iPhone or Mac app against
`api.simeonlabs.com`.

---

## 2. The model proxy, model roles, prices and spend guards

**What it does for the person.** Every model call the agent makes goes through
Simeon's server, on Simeon's provider keys. The person never needs an API key.
Usage counts against the plan's weekly allowance (the trial's, while trialing;
a monthly one where no billing is configured; `services-billing.md`), and
limits stop a runaway agent before it spends much.

### Routes

All are under `/desktop` (`server/simeon/desktop/endpoints.py`,
`server/simeon/desktop/capabilities.py`, `server/simeon/desktop/voice.py`):

| Route | Wire |
|---|---|
| `POST /desktop/api/proxy/v1/responses` | OpenAI Responses. This is the one the agent uses. Reasoning and tools travel together here. |
| `POST /desktop/api/proxy/v1/chat/completions` | OpenAI Chat Completions, for general OpenAI-compatible clients. |
| `POST /desktop/api/proxy/v1/messages` | Anthropic Messages. |
| `POST /desktop/api/proxy/v1beta/models/{model}:streamGenerateContent` | Gemini, for the video subagents. |
| `POST /desktop/api/proxy/v1/web/search` | One web search. `{query}` in, `{answer, documents}` out. |
| `POST /desktop/api/proxy/v1/images/generations` | Image generation. |
| `POST /desktop/api/proxy/v1/audio/transcriptions` | Speech to text. |
| `POST /desktop/api/proxy/v1/audio/speech` | Text to speech. |
| `POST /desktop/api/proxy/v1/voice/calls` | Opens a voice call: `{token, conversation_id, agent_id}` for ElevenLabs Agents (`server/simeon/desktop/voice.py`, `docs/services-agents.md` section 9). |
| `POST /desktop/api/proxy/v1/voice/calls/{conversation_id}/end` | The app hung up: `{seconds}` in, `{seconds, summary}` out. Bills the call once. |
| `GET /desktop/api/proxy/v1/voice/voices` | The voice picker's curated list, cached for an hour. |
| `GET /desktop/api/models/available` | The models offered to the app, with their roles under the person's policy. The box's credential reads it too: the engine follows the roles. |
| `GET /desktop/api/models/pricing-catalog` | Their prices. |
| `GET /desktop/api/user/quota` | The person's allowance and usage, for the Usage tab: the plan, the window, the limit, the trial's end, where to change plan (`services-billing.md`, section 4). |

The body goes through to the provider untouched. The usage the provider
reports is converted to credits and stored as a `desktop_usage` row.

### Model roles and prices

The catalogue is `MODELS` in `server/simeon/desktop/pricing.py`. One credit is
one input token at $3.00 per million.

**One setting chooses the family** (13 October 2026). `SIMEON_DESKTOP_MODELS`
picks a policy (`ModelPolicy`, `POLICY_ROLES`), and
`SIMEON_DESKTOP_MODELS_BY_EMAIL` picks one for a few people first:

| Policy | `primary`: the agent loop, every reply, its helpers | `cheap`: summaries, memory, safety checks, titles | `computer`: the computerUse helper, on the screen | `fallback`: a step whose provider failed |
|---|---|---|---|---|
| `claude` (the default since 18 October 2026) | `claude-sonnet-5-5` | `claude-haiku-5-5` | the primary | `gpt-6-sol` |
| `claude-haiku` (the default for part of 18 October 2026; its answers repeated themselves) | `claude-haiku-5-5` | `claude-haiku-5-5` | `claude-sonnet-5-5` | `gpt-6-sol` |
| `openai` (the default until 18 October 2026) | `gpt-6-sol` | `gpt-6-luna` | the primary | `claude-sonnet-5-5` |
| `claude-opus` | `claude-opus-5-5` | `claude-haiku-5-5` | the primary | `gpt-6-sol` |

Under `claude-haiku` one model holds two roles. A row of the list carries one
role and the engine takes the first row holding each, so
`/desktop/api/models/available` lists Haiku twice, as `primary` and again as
`cheap` (`POLICY_SECOND_ROLES`, `available_rows`); the window's menu shows
only `primary` rows, and `/v1/models`, the pricing catalogue and
`AvailableModels` name it once. Sonnet 5.5 drives the desktop (`computer`),
as the upstream app runs its computer-use helper on Claude Opus above its own
model (`SAND_COMPUTER_USE_MODEL_SELECTION`, `shared/agents/sand-agent-model.ts`);
an engine built before 18 October ignores that row and drives it on Haiku.
The helper keeps the helpers' low effort. The upstream also turns thinking off
there; Sonnet 5.5 refuses `thinking: {type: "disabled"}`, and Anthropic
advises adaptive thinking at low effort over its `between_tools` setting, so
thinking stays adaptive. Opus 5.5 stays served as `retired`, so a turn
already running on it when the setting changes is still answered. The
founder's reason: Haiku is a twentieth of Sonnet's price, and most of an
agent's work is tool calls and connectors; the screen is where a small model
slips. Not yet compared with Sonnet on the cost test set
(`docs/cost-test-set.md`).

The engine reads the roles from `/desktop/api/models/available` when the host
starts and every five minutes after (`simeon-model-roles.ts`), so a change of
setting reaches every cloud computer within minutes, with no release. The
last answer is kept on the box's data volume (`model-roles.json`) and taken
back when the host starts, and until a first read succeeds the host asks
again every five seconds (14 October 2026). Before that, a computer that
woke up used GPT-6 Sol and Luna until its first read, which failed while the
box's sign-in was not there yet and was retried only thirty seconds later:
under the Claude policy the first messages after a wake went to GPT. Only a
computer that has never read the roles now uses GPT-6 Sol and Luna, which
every policy serves; an engine built before 13 October names them whatever
the setting says, so the Claude policies keep serving GPT-6 Luna as
`retired`.

| Model id | Price per million tokens: input, cache write, cache read, output |
|---|---|
| `claude-sonnet-5-5` | $2.00, $2.50, $0.10, $10.00 |
| `claude-opus-5-5` | $4.00, $5.00, $0.20, $20.00 |
| `claude-haiku-5-5` | $0.10, $0.125, $0.01, $0.50; five times each past a 100,000-token prompt |
| `gpt-6-sol` | $2.00, nothing, $0.20, $10.00 |
| `gpt-6-luna` | $0.10, nothing, $0.01, $0.50 |
| `gemini-2.5-flash` (`video`) | $0.30 in (to confirm) |
| `gpt-5.6-terra`, `gpt-5.6-luna`, `claude-sonnet-5` (`retired`: served, never offered) | $2.00 / $0.20 / $2.00 in |
| `gpt-6-astra`, `claude-opus-5`, `claude-haiku-4-5-20251001`, `gemini-2.5-pro` (no role: priced, never served) | |

The Claude prices were read off platform.claude.com on 13 October 2026; the
earlier Claude rows were listed at older, higher prices until then.

`/desktop/api/models/available` lists only models that have a role under the
person's policy, are not retired, and whose provider has a key on the server.
The proxy serves a model with any role under that policy, `retired` included,
and refuses the rest: "This model is not offered by the desktop app."

**Claude on the wire** (`claude-messages.ts`). The engine writes three things
the AI SDK's Anthropic provider does not: `output_config.effort` (our levels;
`none` reads as `low`), `thinking: {type: "adaptive", block_binding:
{prefix_mismatch_behavior: "drop_block"}}` with the beta header
`thinking-binding-controls-2026-08-01` (a Claude 5.5 thinking block whose
earlier prompt changed, after a summary for instance, is dropped rather than
refused with a 400), and the cache breakpoints: after the system prompt, and
the top-level `cache_control` that the API moves to each request's last
block. An agent's own conversation (call reasons `chat`, `first_message`,
`wake`, `agent_wake`, `nudge`, `routine`, `background`) is kept for an hour
since 16 October 2026: the system prompt and the person's last two messages
carry `ttl: "1h"`, and the steps inside one answer keep the five-minute
top-level breakpoint; helpers, summaries, memory, the safety check and voice
keep five minutes. Before, the first answer after any pause read the whole
conversation fresh (about 97,000 tokens; 5 to 8 s for that call, against 2.7
to 3.4 s read back). An hour's write costs 2× an input token against 1.25×;
the server prices it from `usage.cache_creation.ephemeral_1h_input_tokens`
(`pricing.py`). Bedrock takes the same breakpoints. Thinking blocks go back
on later calls with their signatures. When
Claude fails before it has said anything (overloaded, rate limited, a server
error, not offered), the step runs once on the fallback and writes
`[simeon] model-fallback`.

**Effort.** The app sends reasoning effort per call
(`desktop/source/host/extensions/inference/provider-session.ts`):

- The agent loop runs at `high` on every call, as the upstream app runs it.
- The cheap roles (summaries, memory, safety checks) run on the cheap model at
  `low`. The computer, browser and video helpers run on the main model at
  `low`, as the upstream's do (from 22 September to 8 October 2026 they ran
  on the cheap model).
- `SAND_SIMEON_REASONING_EFFORT` set to a level holds that level for every
  non-cheap call; `SAND_SIMEON_TOOL_RESULT_EFFORT` lowers the calls that
  follow a tool result.

From 2 to 8 October 2026 the loop ran a ladder (a turn's first call at
`medium`, `low` after tool results and on nudges and wakes, `high` after a
failed tool). The insurance log of 6 October showed what that bought: the
agent coasted through the middle of a job and through every revival after a
helper, repeated itself and went idle. Restored to `high`; the ladder's code
stays with every rung at `high`.

**Output ceiling.** Every call carries `max_output_tokens` 32,000
(`SAND_SIMEON_MAX_OUTPUT_TOKENS`), thinking included. A call that reaches it
writes `[simeon] model-output-limit`. An answer cut off inside a tool call
sends the tool broken arguments and the next call tries again, so the second
cut-off in a turn ends the turn (`SIMEON_MAX_CUT_OFFS_PER_TURN`).

**Why each call was made.** Every request to the proxy carries
`x-simeon-call-reason`, stored in `desktop_usage.reason`: `chat`, `helper`,
`computer`, `browser`, `video`, `summary`, `memory`, `safety`, `routine`,
`agent_wake`, `voice`, `nudge`, `wake`, `first_message`, `background` or
`cheap` from the app, `cloud_agent` from the cloud runner. Web search, images,
transcription and speech have their own routes and show by model name. Rows from older apps have none. To read what a person spent, per
model and per reason:

```sh
cd server && uv run python -m scripts.desktop_usage_report someone@example.com --hours 48
```

Add `--calls` to list every call, oldest first, with the time since the
previous call to the same model, what the model read back from its stored copy
of the prompt ("reused") and what it had to store again ("stored"). A Claude
call that stored 10,000 tokens or more again carries a note: more than five
minutes since that model's last call means Claude had let its copy go
(Anthropic keeps it five minutes after its last use); within five minutes it
means the start of the request changed, or the call belonged to another chat.
On Render it runs in the API service's Shell, from `/app/server`:
`uv run python -m scripts.desktop_usage_report someone@example.com --hours 24 --calls`.

**What the prompt keeps stable.** The system prompt puts the parts that change
while a conversation goes on last: the channels, the teammates, the list of
routines, the connected apps' instructions and the discovery notice
(`desktop/source/host/runner/system-prompt-assembly.ts`). OpenAI caches a
prompt by its longest unchanged start, so a new teammate or routine no longer
sends the whole prompt back at full price. The `prefix=sys:…` hash on each
`[simeon] model=` line changes only when that start changes.

**Screenshots.** Every tool screenshot stays in the request, as in the
upstream app. From 2 to 8 October 2026 only the latest three to seven stayed
(`SIMEON_KEPT_TOOL_IMAGES`, now Infinity; `SIMEON_TOOL_IMAGE_DROP_BATCH`), and
a helper repeating the same clicks could not see what it had done three
steps before. The pruning stays in the code for a kept count set on purpose.
On Claude the latest twenty stay (`SIMEON_CLAUDE_KEPT_TOOL_IMAGES`, 18 October
2026): Claude refuses a request with more than twenty pictures if any is over
2000 pixels on a side, and one over 8000 pixels or 5 MB at any time, so such a
picture is sent as a line of text instead (`claudeImageRefusal`). A browser
helper's full-page screenshot keeps at most 2000 pixels. The refusal, before
this, was Claude's sentence on a `desktop.proxy.upstream_refused` line with
`status=400`.

**Empty answers.** Every `[simeon] model=` line ends with `outcome=` (`tools`,
`text` or `empty`: a paid call that produced neither) and `reason=` (the
call's `x-simeon-call-reason`). An empty call also writes
`[simeon] empty-answer model=… effort=… reason=… output=… reasoning=…`, so
`grep empty-answer` on the host log finds the calls that bought nothing.

**Older model ids.** If the server does not offer `gpt-6-sol` or `gpt-6-luna`
yet, the app retries the step on the model it replaced (`gpt-5.6-terra` or
`gpt-5.6-luna`, `LEGACY_SIMEON_MODELS`) and writes a `[simeon] model-legacy`
line. This means the server and the app can be deployed in either order.

### Capabilities

| Capability | Model | Price |
|---|---|---|
| Web search | `claude-haiku-5-5` with Claude's server-side `web_search` tool (`web_search_20250305`, up to 3 searches), one non-streaming `/v1/messages` call on `ANTHROPIC_API_KEY` (Bedrock serves no web search); a 400 is asked once more on `claude-sonnet-5-5` with `web_search_20260209`. Until 18 October 2026 it was `gpt-5.6-luna` with OpenAI's hosted search, and it stopped when the OpenAI account ran out of money. A search that failed (`web_search_tool_result_error`) logs `desktop.search.failed` and, with nothing found, answers 502 | tokens, plus $0.01 per search (`claude-web-search` rows) |
| Images | `gpt-image-2.5-flare` for a new picture, `gpt-image-2.5-sunburst` when editing one (a call with reference images); quality `medium` unless asked (avatars `low`). If OpenAI will not serve the new model to the account, the same call is made once on `gpt-image-1` and a `desktop.images.model_unavailable` line is logged | $5 text in, $8 image in, $30 image out, per million tokens (`gpt-image-1`: $10 image in, $40 out) |
| Transcription | `gpt-4o-mini-transcribe` | $0.003 per minute of audio; 25 MB upload limit |
| Speech | `gpt-4o-mini-tts`, voice `alloy` | $15 per million characters; 4,000 characters a call |

### Spend guards

On the server, every metered route checks two limits before calling a provider
(`budget_refusal` in `server/simeon/desktop/proxy_common.py`):

- **The allowance:** the plan's week (seven days from the person's own plan
  start since 27 October 2026; Monday to Monday UTC before), then any extra
  credits bought on the web, the trial's credits while trialing, or
  `SIMEON_DESKTOP_MONTHLY_CREDITS` (15,000,000 a calendar month) where no
  billing is configured (`server/simeon/desktop/allowance.py`,
  `services-billing.md`). Over it, or with no plan at all, the route answers
  `402` with code `40200` and a sentence that says which allowance and where
  to change plan.
- **Hourly cap:** the plan's own since 27 October 2026, about a fifth of its
  week (2,000,000 on Standard and on a trial, 7,000,000 on Pro, 18,000,000
  on Max); `SIMEON_DESKTOP_HOURLY_CREDITS` (1,000,000 over a sliding hour;
  200,000 until 8 October 2026, when it stopped every real job halfway)
  where there is no plan.
  Over it, the route answers `402` with code `40201`: "Hourly spending budget
  reached … The agent stops here; it can continue as the hour passes."

In the app, a turn has a limit on how many model calls it may make
(`desktop/source/shared/inference/turn-step-budget.ts`):

| Turn | Limit | Switch |
|---|---|---|
| A turn the person asked for | 5,000 calls | `SAND_AGENT_MAX_STEPS` |
| The first message | 5,000 calls (`fullStepBudget`) | `SAND_AGENT_MAX_STEPS` |
| A routine's run | 5,000 calls | `SAND_ROUTINE_MAX_STEPS` |
| Any other hidden turn (reply nudges, wake-ups, memory extraction) | 5,000 calls | `SAND_HIDDEN_TURN_MAX_STEPS` |

The limits on work nobody asked for, added on 2 October 2026, were taken
out on 8 October (the founder, after the insurance log of 6 October: "bring
back everything"); each switch still sets a limit on purpose:

- **Routines** run on their schedule, with no shortest gap
  (`ROUTINE_MIN_INTERVAL_MS` 0 on the Mac, `ROUTINE_MIN_INTERVAL` 0 on the
  server) and no daily cap (`SAND_ROUTINE_MAX_RUNS_PER_DAY` sets one; a
  dropped run shows as `daily_run_cap`).
- **Agents messaging each other** have no cap on messages in a row
  (`SAND_AGENT_MESSAGE_MAX_HOPS` sets one; the next is then refused and the
  agent told to tell the person instead).
- **Reply nudges:** three, as the upstream app does, when a turn the person
  started ends without a reply (`MAX_REPLY_NUDGES`; one from 2 to 8 October).
- **Plain-text replies** are not delivered by the host any more (3 to 8
  October they were): a turn that writes its answer as bare text is nudged.
  Until 28 October that held only for a turn that had sent nothing: after an
  opening message ("Checking now"), an answer written as text was lost with
  no nudge (Iris's mail check). The closing nudge (`turnEndedOnSilentToolCalls`,
  `host/runner/turn-shape.ts`) runs once for a turn that opened with a message
  and ended in tool calls, on a SendMessage that failed, or in words after work
  (or after an opening marked `final: false`). Never when a message the agent
  marked `final` went out, nor for words after an answer sent first: from 28
  October morning to afternoon it did, and Iris sent her answer twice. The
  nudge asks for the result only if no message already gave it.

How a turn stays short (3 October 2026, from the OpenAI log of a Gmail
question that took about twenty calls; replayed offline in
`desktop/tests/connector-replay.test.mjs`, 21 calls before, 2 after):

- **A final message ends the turn.** Every SendMessage carries `final`. A
  step whose calls are all delivered SendMessages marked final (or a question
  widget, or a secret request) ends the turn there (`stepEndsTurn`,
  `host/runner/turn-shape.ts`). Before, the loop asked the model once more
  after every reply, and it answered nothing: a full paid call per turn.
  Without the flag the old way holds; a message that failed to deliver never
  ends the turn.
- **Blank arguments are no arguments.** For every tool, an optional field the
  model filled with `""` or `null` is dropped before the tool reads it
  (`withoutBlankOptionalArgs`, `packages/agent/tools/common.ts`). SendMessage's
  `widget` and `secret` take `null`, which the model writes instead of
  `{"prompt":"x",…}`.
- **The brief does not change mid-conversation.** The teammates, routines,
  channels and connector instructions are frozen with the
  conversation, like memory, until its next summary. A change reaches the
  model as a note on the next message (`getPromptUpdateForTurn`,
  `host/runner/system-prompt-assembly.ts`). The provider caches a request by
  its unchanged start, and the brief comes before the whole history: one new
  teammate used to send every agent's whole conversation back at full price.
- **The reminder on each message is short.** It rides on every message the
  person sends and stays in the history.
- **Memory upkeep** waits for a quiet minute and reads the burst in one pass;
  a refused proposal is not retried; the assistant's own claims about its
  setup are not remembered. A trivial reply is not remembered at all
  (8 October 2026): "ok no worries", "thanks", "kk go" and other short
  messages made only of acknowledgement words skip memory on both paths
  (`isMemorableExchange`, `host/runner/sand-memory.ts`; `turn-settle.ts`).
  The synthesis path used to skip that filter, as the upstream app's trial
  did, and each such reply cost two cheap-model calls a minute later.

What the staffing log changed (8 October 2026; the founder's log of hiring
three agents, where the 1M tokens-a-minute limit was hit nine times in about
three minutes):

- **Agent messages that arrive together wake their agent once.** Messages
  queued for an agent run as one turn (`groupAgentInboundTurns`,
  `buildAgentInboundBatchWakePrompt`); a priority message and a new agent's
  staffing brief keep a turn of their own. A reply in a back-and-forth (a
  message sent from a turn another agent's message woke) waits 15 s
  (`AGENT_REPLY_SETTLE_MS`) so the replies that come back together share that
  turn; a message from a turn the person or a routine started, and a priority
  one, wake at once (`host/extensions/transcript/agent-to-agent-messaging.ts`).
  Before, each message was a turn of its own on the whole conversation, as in
  the upstream app: the Chief of Staff, at 161k tokens a call, took one per
  teammate reply.
- **A long conversation is summarized from about 108k tokens, not 180k.**
  Summarization reads `SIMEON_SUMMARIZATION_WINDOW_TOKENS` (120,000;
  `shared/inference/simeon-context-window.ts`): it starts at 90% and the
  summary is swapped in once it is ready. Above 150k a turn waits for the
  summary. The instructions and tools alone are about 50k. The skills list
  keeps its budget on the 200k working window. The upstream app read the
  window per model from its server; ours is fixed. The cost: older detail is
  compressed sooner. (For part of 18 October 2026 the window was 95,000, to
  keep Claude Haiku 5.5 under its 100k-token price step.) A turn that ends
  past the start line waits for the summary it started and keeps it
  (`keepStartedSummaryAtTurnEnd`, `turn-agent-composition.ts`): an agent's
  turn here is one or two steps, shorter than the 13–15 s a summary takes,
  and the upstream rule threw away any summary unfinished, or finished short
  of 95%, when its turn ended. In the founder's checkout log (18 October)
  that was ten summaries in six minutes, each about 40k tokens on Haiku, none
  used, while every main call carried 108k–126k.
  Until 18 October 2026 a conversation on Claude was never summarized: the
  AI SDK counts Claude's uncached tokens only, so the loop saw 1–3k a step
  while 115k–125k was sent (the founder's Haiku checkout log). The loop now
  reads the whole prompt (`settleAiSdkStream`, `provider-session.ts`), as it
  does on OpenAI.
- **An agent with no routines gets a pointer to the routines guide, not the
  guide.** About 16,000 characters (3,900 tokens) came off each of its calls;
  the guide is `/home/box/reference/routines.md`, written with the other
  reference files (`renderAutomationsPointerSystemPrompt`,
  `host/automations/automation.ts`; `box-reference-docs.ts`), and an agent
  with routines keeps it in its prompt. The upstream app's switch that hides
  most tools behind a lookup (`simeon_dynamic_tools`) stays off: it would hide
  CreateAgent, SendToAgent, update_state and Task too, each then costing an
  extra call on the whole conversation to find, while the tool list itself is
  billed at the cached rate after an agent's first call.

Check a run with the `[simeon] model=` lines in `/tmp/sand-host.log`: a
greeting is one line, a connector question two or three, and the `prefix=sys:`
hash stays the same across a conversation's turns.

**Stopping the box on quit.** This applies only to the Docker box on the Mac,
which is a testing path (`SAND_BOX_RUNTIME=local-docker`). When Simeon quits,
it asks the box whether any routine is enabled. If none is, it stops the box.
If one is, it keeps the box running. `SAND_STOP_BOX_ON_QUIT=1` always stops the
box and `SAND_KEEP_BOX_RUNNING_ON_QUIT=1` always keeps it running
(`desktop/source/electron-main/box/local-docker-host-connector.ts`).

### The person's own AI accounts (8 November 2026)

The founder: "allow people to bring their own subscriptions and charge only
for the computer", then "use codex sign in. everybody does. even reason"
(the plan: `docs/your-own-models.md`). The first piece is on the server: a
person connects their ChatGPT account and Simeon keeps its sign-in, sealed
(`server/simeon/desktop/model_accounts.py`, table `desktop_model_accounts`).
Once the person chooses one of its models, their agents' calls go to ChatGPT
on that account (`server/simeon/desktop/own_models.py`, below). The apps
show it in **Settings › AI Models** (9 November 2026): the Mac
(`mac/Simeon/SettingsModels.swift`), the iPhone (`ios/Simeon/AIModels.swift`)
and the web and Windows app (`clients/apps/app/src/window/SettingsModels.tsx`),
all on the shared core's model (`AIModels.swift`, `src/core/aiModels.ts`): the
accounts connected with Add Another, Rename and Disconnect in their `⋯`, the
providers not yet connected under Subscriptions, and the Connect sheets. The
model the agents use is chosen on the composer (9 November 2026,
`ComposerModelMenu` on each), which `PUT models/own` as the page did.

Since 11 November 2026 the page opens on a card, as External Agents' does
(the founder: "ai models should have the same above"; design B, without
a model's pill and with Meta): "Connect your own AI models", what it does,
Learn more (`simeonlabs.com/models`), and ChatGPT's, Claude's, Grok's and
Meta's marks fanned on Connect apps' tiles (`AIModels.Card`, `modelsCard`;
the marks in `Marks/<provider>` and `assets/marks/`). The account menu on
the Mac and the web has an AI Models row, those four marks at its end. An
account that can be used says "Active" in green (it said "Usage available";
the founder: "can we change the wording to Active"). Meta's mark is drawn
in its blue in light and dark mode ("meta keeps it blue in dark mode as
well").

**Everything on the person's own plan or key** (11 November 2026, the
founder: "small jobs is their own plan and chosen model. and make sure
everything else is like that, the api keys included"). With ChatGPT, Grok or
an API key chosen, every role the engine reads is the chosen model
(`own_models.rows`: primary, cheap and computer), so the agent, its small jobs
(titles, summaries, memory, the safety review) and its helper on the screen
all run on the person's account; web search too (Grok searches on Grok 4.6,
the one model with the proxy's search). Until then the small jobs ran on a
cheaper model of the plan or key (GPT-6 Luna, a key provider's `cheap`) at
low effort.

**The effort: the agent's turns as chosen, background work at low** (12
November 2026, the founder: every way of running the agents behaves the
same, as Simeon's own models already did). The agent's own replies (its
chat, its group chats) and a general helper it starts think at the effort
chosen on the composer. Background work runs on the same model and account
at low, or the lowest a model takes when it has no low: the helpers on the
screen, in the browser and on a video, the safety review, memory, a
summary, a title, a web search. The relay reads which a call is from the
engine's `x-simeon-call-reason`: `computer`, `browser`, `video`, `safety`,
`memory`, `summary` and `cheap` are background work
(`own_models.BACKGROUND_REASONS`, `call_effort`, passed to `codex_body`,
`responses_body` and the key wires); every other reason keeps the effort
chosen. From 11 to 12 November every call ran at the effort chosen: at High
on the founder's Claude plan, the helper on the screen thought for about
2 s before each click and the safety review took 6 to 8 s per command.

With Claude chosen, the engine runs all of it in Claude Code on the computer,
on the chosen model: the agent's turns; its helpers (the one on
the computer's screen, whose screenshots reach Claude as pictures, the one
driving Chrome, the general ones) and its turns in group chats
(`turn-agent-composition.ts`, `claudeCodeKind`); and each small job as one
`claude -p` with no tools and nothing kept (`claude-code-text.ts`, routed in
`provider-session.ts`). The agent's turns, its group-chat turns and its
general helpers get the effort chosen; the helpers on the screen and in the
browser (`claudeCodeBackground` in the agent's config, from
`isHelperSimeonSession`) and each small job (`claudeCodeTextChoice`) get
`--effort low`. Only these stay on Simeon's: a video helper (Claude
can't watch video), voice calls, dictation, cloud agents launched by
an engine from before 11 November 2026 (they answer in words on Simeon's
server; since then a cloud agent codes in Claude Code on the person's own
computer and plan, `services-agents.md`, section 1), and any of the above when Claude Code can't answer (the
plan's limit, the sign-in gone), as the card says. The host log says which,
and at what effort: `claude-code turn helper=… model=… effort=low
outcome=…`, `claude-code job model=… effort=low outcome=…`.

The sign-in is OpenAI's device code, with Codex's client id until OpenAI
approves Simeon for Sign in with ChatGPT (then only
`SIMEON_CHATGPT_CLIENT_ID` changes). The steps are Codex's own
(openai/codex, `codex-rs/login`): a code from
`auth.openai.com/api/accounts/deviceauth/usercode`, which the person enters at
`auth.openai.com/codex/device`; the server asks
`/api/accounts/deviceauth/token` until they approve, then trades the
authorization code at `/oauth/token` for ID, access and refresh tokens. The ID
token names the ChatGPT account (`chatgpt_account_id`), its e-mail and its
plan. Signing in to the same ChatGPT account again replaces its row and keeps
the name the person gave it.

Routes (signed-in app, `get_desktop_session`):

| Route | What |
|---|---|
| `GET /desktop/api/models/accounts` | The person's accounts: id, provider, kind, name, plan, `status` (`available`, `limited` with `limitedUntil`, `signed_out`). Never a token. |
| `POST /desktop/api/models/accounts/chatgpt/start` | `{connectId, userCode, verificationUrl, interval, expiresIn}`; the sign-in waits 15 minutes (Codex's own). `502 {error: {code: device_code_off, message}}` when OpenAI answers 404 (device code off for that client), `502 {error: {code: provider_unavailable, message}}` otherwise. |
| `POST /desktop/api/models/accounts/claude` | `{label, plan}` (9 November 2026): the person's computer finished Claude Code's own sign-in (below). One row per person (`account_key` `claude-code`), no token: the e-mail Claude Code named as its name, and its plan. Signing in again keeps the name the person gave it. `{account}`. |
| `POST /desktop/api/models/accounts/chatgpt/poll` | `{connectId}` in, every `interval` seconds: `{status}` `waiting`, `connected` with the account, `expired` (over, already used, or someone else's), or `failed` with OpenAI's code as `reason`. |
| `PATCH /desktop/api/models/accounts/{id}` | `{label}`: renamed (`400 {error: {code: empty_label}}` for an empty one; `404 {error: {code: not_found}}` for another person's or a gone account, as for `DELETE`). |
| `DELETE /desktop/api/models/accounts/{id}` | Revoked at OpenAI (`/oauth/revoke`), then forgotten, even when OpenAI can't be reached: `{disconnected, revoked}`. A Claude row has nothing to revoke (`revoked: false`); the apps sign Claude Code out on the computer first (`claudeCodeSignOut`). |

For a model call (the relay, next), `model_accounts.access_for` gives a live
access token and the account id for Codex's `chatgpt-account-id` header. It
holds the row (`with_for_update`) and refreshes a token with less than five
minutes left; OpenAI rotates the refresh token, so the new one is written at
once. `refresh_token_expired`, `_reused`, `_invalidated` or `invalid_grant`
mark the account `signed_out` (the person connects again); OpenAI unreachable
keeps a token that is still valid, and otherwise raises `ChatGptUnavailable`.

**The agents' calls on the account** (`own_models.py`):

- The person's models are named `own:chatgpt:<model>` (GPT-6.1 Sol, GPT-6
  Astra, GPT-6.1 Terra, GPT-6 Sol, GPT-6 Luna, from Codex's own list). The
  prefix keeps them apart from Simeon's GPT-6 Sol and Luna. It starts with an
  "o" because the engine's AI SDK sends a model named that way as a reasoning
  model, with its effort and its brief as a `developer` message. So no
  engine release is needed.
- `GET /desktop/api/models/own` gives the models the person may choose and
  the one chosen. `PUT` with `{model}` chooses one, kept in `users.meta`
  (`own_model`); `{model: null}` goes back to Simeon's; a model not offered
  is `400 {error: {code: not_offered}}`. Every refusal of these routes is
  `{error: {code, message}}`, the shape the apps read a code from.
- With a choice and an account signed in, `/desktop/api/models/available`
  puts the chosen model first for `primary` and `computer`, and GPT-6 Luna
  for `cheap`. The engine follows within five minutes.
- `/desktop/api/proxy/v1/responses` sends such a call to
  `{SIMEON_CHATGPT_CODEX_BASE_URL}/responses` with the account's token,
  `chatgpt-account-id` and `originator`. The body is changed the way Codex
  sends its own: `store: false`, `stream: true`, the brief as `developer`, no
  `max_output_tokens`, `temperature` or `metadata`. A call sent without a
  stream gets the stream's last response as one answer.
- The usage row names the model, says `chatgpt` as who was paid, and costs
  **0 credits**. Stripe is sent only rows with credits, so it never sees
  them. The week's credits and the hourly brake aren't checked for these
  calls, since they cost Simeon nothing.
- **A person with no plan is refused** (402, code 40200), as on Simeon's
  models: the computer is Simeon's, whoever pays for the model.
- **A person back on Simeon's models** (nothing chosen) has an `own:` call
  answered by Simeon's model, on credits, and never on their account. This
  covers an engine that hasn't read the new roles yet.
- Only the models the account's plan includes are offered and used (from
  Codex's list: GPT-6 Sol and Luna aren't on `promax`). Without Luna, the
  helpers run on the chosen model.
- ChatGPT's plan limit (429 `usage_limit_reached`, or a stream that fails
  with `subscription_sharing_usage_limit_exceeded`) marks the account
  `limited` until the time ChatGPT names (an hour when it names none). Its
  calls skip it until then.
- When no account can answer for the moment (a limit, a 5xx, ChatGPT
  unreachable, the sign-in gone), the call goes to Simeon's own OpenAI model
  under the person's allowance (GPT-6 Sol under the Claude policies), and
  costs credits.
- When ChatGPT refuses the request itself (any other 4xx: its shape, a model
  the plan lacks), its refusal goes back to the agent as it came. Simeon's
  model doesn't take it on silently on the person's credits.
- A 401 is answered once more with a refreshed token.
- An effort ChatGPT's models lack (`none`) is sent as `low`.
- A call sent without a stream (the cloud runner's) gets the last response,
  its output filled from the items streamed before it when it carries none.

**The logic check (the founder, 8 November 2026: "think of everything").**
What each path does, each one a test in `test_own_models.py`:

| The person | A call naming | Goes to | Credits |
|---|---|---|---|
| Nothing chosen | Simeon's model | Simeon's model, exactly as before: under `claude-haiku`, Haiku answers and does the helper work, Sonnet drives the computer, GPT-6 Sol stands by | yes |
| Nothing chosen | `own:` (an engine not caught up) | Simeon's model | yes |
| ChatGPT chosen | `own:` | their ChatGPT account; then their next account; then Simeon's model | none on ChatGPT, yes on Simeon's |
| ChatGPT chosen | Simeon's model (an engine not caught up) | Simeon's model | yes |
| ChatGPT chosen | a web search or a picture | their ChatGPT account; then their next account; then Simeon's search or picture | none on ChatGPT, yes on Simeon's |
| No plan | anything | refused, 40200 | none |
| Any | `own:` on the Claude or Chat Completions wire | refused, 400 | none |

The roles the engine is given with ChatGPT chosen: the chosen model for
`primary` and `computer`, GPT-6 Luna for `cheap`, and Simeon's own for
`fallback` and `video`, which never moves to ChatGPT. The engine
summarises a conversation at 120,000 tokens, inside ChatGPT's 272,000.
Nothing on the computer pins a model (`SAND_SIMEON_MODEL` and the rest are
set nowhere).

**Web search and pictures go to ChatGPT too** (the founder, 8 November 2026:
"it's ok to keep video, dictation and voice calls. the rest goes to chat").
With ChatGPT chosen:

- `/desktop/api/proxy/v1/web/search` runs on the account, as Codex runs it:
  the Responses API's own `web_search` tool (`external_web_access: true`) on
  GPT-6 Luna (the chosen model where the plan has no Luna). The answer keeps
  the route's shape: the text, the cited pages with the words they cite,
  then the other pages found, and how many searches ran.
- `/desktop/api/proxy/v1/images/generations` draws on the account with
  `gpt-image-2`: `/images/generations`, or `/images/edits` with the
  reference pictures inline when there are any (Codex's image tool).
- Both cost 0 credits (usage rows `own:chatgpt:gpt-6-luna` and
  `own:chatgpt:gpt-image-2`, paid by `chatgpt`). They follow the same rules
  as the chat: no plan, refused; nothing chosen, Simeon's search (Claude
  Haiku) and pictures (GPT Image) as before; can't answer for now, the
  next account, then Simeon's on credits; a request ChatGPT refuses,
  handed back. The log lines are the chat's, with `what=search` or
  `what=images`.

**Claude, through Claude Code on the computer** (the founder, 9 November
2026: "do it like Reason. Claude code."; the plan:
`docs/your-own-models.md`, section 6). Anthropic doesn't let Simeon keep a
Claude sign-in or make calls on it, so the server's part is small:

- AI Models › Claude › Connect runs Claude Code's own sign-in on the
  person's computer (the engine's `claudeCodeSignInStart`, then
  `claudeCodeSignInFinish` with the code the person pastes). Signed in, the
  app posts the e-mail and plan Claude Code named to
  `/desktop/api/models/accounts/claude`. The row holds no token
  (`access_token` empty); `access_for` gives nothing for it.
- The models are Claude Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.1 and
  Fable 5 (`own:claude:claude-opus-5-5`…, the slug Claude Code's own model
  name), offered once the row is there, chosen as ChatGPT's are. The first
  choices, `own:claude:opus` and `own:claude:sonnet` (9 November 2026),
  still read as Opus 5.5 and Sonnet 5.5. The plan decides which Claude Code
  runs; one it refuses falls back to Simeon's with the chat's line.
- With one chosen, `/desktop/api/models/available` gives one row for
  `primary`: `transportApi` and `apiFormat` `claude-code`, `claudeCodeModel`
  the model's name (`claude-opus-5-5`), `costMultiplier` 0. The other roles stay Simeon's. An
  engine that doesn't know `claude-code` skips the row and keeps Simeon's
  model (today's engines); the engine that runs a turn through Claude Code
  is the plan's step C4.
- The relay never calls Anthropic for it: a call named `own:claude:…`, and
  any search or picture with Claude chosen, is answered on Simeon's own, on
  credits.
- Log line: `desktop.models.connected provider=claude plan=…`.

What stays on Simeon's credits with ChatGPT chosen: dictation
(transcription), speech, voice calls (ElevenLabs) and video (Gemini). With
the week's credits spent, those are refused while the agent itself still
answers, searches and draws on ChatGPT.

Still open:

- No line in the chat yet when a call moves to Simeon's model (Reason
  says so); it comes with the apps.
- A shared agent's work runs on its owner's account.
- The computer itself still costs nothing (`simeon_box_seconds` is
  metered, not charged).

**Not verified against chatgpt.com.** Codex sends the tools inside `input`
(`additional_tools`, "Responses Lite") for the models it marks
`use_responses_lite`, which is most of them. The relay sends the standard
`tools`, as OpenAI's public Responses API takes them. If ChatGPT refuses
that, `desktop.models.relay_refused` says so in ChatGPT's own words, and the
agent shows ChatGPT's refusal (it is a request refused, so Simeon's model
doesn't take it on). The founder's first call on their own account shows which.

Settings (none needed on Render; the defaults are OpenAI's):

- `SIMEON_CHATGPT_CLIENT_ID`: Codex's `app_EMoamEEZ73f0CkXaXp7hrann` until
  OpenAI gives Simeon its own.
- `SIMEON_CHATGPT_AUTH_BASE_URL`: `https://auth.openai.com`.
- `SIMEON_CHATGPT_CODEX_BASE_URL`: `https://chatgpt.com/backend-api/codex`,
  where the relay sends the calls.
- `SIMEON_CHATGPT_ORIGINATOR`: the `originator` header, Codex's own
  `codex_cli_rs`.

When it misbehaves (nothing here logs a token, a code or a verifier):

- `desktop.models.start_failed status=… error=…`: OpenAI refused a code. A
  404 means device-code sign-in is off for the client id.
- `desktop.models.poll_failed`: the exchange was refused; the app starts
  again.
- `desktop.models.signed_out`: OpenAI ended the sign-in at a refresh.
- `desktop.models.usage provider=claude windows=five_hour=42,weekly=18`: the
  engine said how much of the Claude plan is used (ChatGPT's comes with each
  answer and is kept without a line); `desktop.models.usage_not_kept` when
  the relay couldn't keep ChatGPT's (the answer goes on).
- `desktop.models.refresh_failed`: OpenAI didn't refresh; the account stays.
- `desktop.models.revoke_failed`: the sign-in wasn't ended at OpenAI; the
  row is gone all the same.
- `desktop.models.unreadable`: sealed under another `SIMEON_SECRET`; marked
  signed out.
- `desktop.models.chosen model=…`: the person chose a model (none: Simeon's).
- `desktop.models.relay_refused status=… preview=…`: one account didn't
  answer a call, with ChatGPT's words. Read this first.
- `desktop.models.limited until=…`: the account's plan limit was reached.
- `desktop.models.on_simeon to=…`: no account answered; Simeon's model took
  the call, on credits.

**Verified:** `server/tests/desktop/test_model_accounts.py` and
`test_own_models.py` (38 tests, ChatGPT and OpenAI stood in by respx), and
the migration up and down on PostgreSQL. **Not verified:** a real sign-in at
auth.openai.com and a real call at chatgpt.com (no app calls them yet).

**Grok** (10 November 2026, the founder: "lets do grok"; the plan:
`docs/your-own-models.md`, section 9). The same as ChatGPT's, on xAI's side
(`server/simeon/desktop/grok.py`, read from Grok Build's code):

- `POST /desktop/api/models/accounts/grok/start` and `…/grok/poll`: xAI's
  device code at `auth.x.ai` (Grok Build's client id, `referrer=simeon`).
  `start` answers the code and the page with the code in it
  (`verificationUrl`, only ever an `x.ai` or `grok.com` page over https);
  `poll` answers `waiting` (with xAI's `interval`, five seconds more after
  its `slow_down`; asked sooner, xAI isn't asked), `connected`, `expired`,
  or `failed` with xAI's reason. Signed in, the plan is asked whether it may
  use Grok here (`{proxy}/settings`, `allow_access`); a plan it bars answers
  `failed`, `not_allowed`, and the sign-in is revoked, not kept.
- The row: `provider` `grok`, `account_key` the ID token's `sub` (a team's
  sign-in `team:<id>`), `plan` the access token's `tier` (`supergrok`,
  `supergrok_heavy`, `x_premium`, `x_premium_plus`…). Refresh and revoke are
  OAuth's, at `auth.x.ai`; `invalid_grant` and `invalid_client` end it.
- Models: `own:grok:grok-4.6` and `own:grok:grok-4.5` for every role (the
  machinery on the chosen model, as Grok Build does). Efforts low to xhigh
  on 4.6, low to high on 4.5; high until the person chooses.
- The relay: `POST {proxy}/responses` with Grok Build's headers
  (`X-XAI-Token-Auth`, `x-grok-client-version`, `x-grok-model-override`…,
  `x-grok-client-identifier: simeon`), the brief as `system`, no `status` on
  reasoning sent back, `store: false`. Out of credits (402; 403 or 429
  saying so; a stream that fails so) marks the account limited until its
  period ends (xAI's billing; an hour when it doesn't say), and the call
  goes to the next account, then Simeon's. Any other 4xx is handed back.
- Usage: `GET {proxy}/billing?format=credits` after an answer, at most every
  five minutes (`GROK_USAGE_EVERY`), and at once when the credits run out:
  one window, `weekly` or `monthly`, kept on the account as ChatGPT's.
- Search: the proxy's `web_search` tool on Grok 4.6, answered whole.
  Pictures: `POST https://api.x.ai/v1/images/generations` (or `/edits`)
  with `grok-imagine-image-quality`, the same sign-in as the bearer; Free
  and X Basic draw on Simeon's.

Settings (none needed on Render; the defaults are xAI's):

- `SIMEON_GROK_CLIENT_ID`: Grok Build's public
  `b1a00492-073a-47ea-816f-4c329264a828` until xAI gives Simeon its own.
- `SIMEON_GROK_AUTH_BASE_URL` (`https://auth.x.ai`),
  `SIMEON_GROK_PROXY_BASE_URL` (`https://cli-chat-proxy.grok.com/v1`),
  `SIMEON_GROK_API_BASE_URL` (`https://api.x.ai/v1`).
- `SIMEON_GROK_REFERRER` and `SIMEON_GROK_CLIENT_IDENTIFIER`: `simeon`.
- `SIMEON_GROK_CLIENT_VERSION`: `1.0.45`, Grok Build's; the proxy checks it,
  so a newer one goes here if xAI refuses an old one.
- `SIMEON_GROK_TOKEN_AUTH`: `xai-grok-cli`, the `X-XAI-Token-Auth` header.

Log lines carry `provider=grok` (`desktop.models.start_failed`,
`poll_failed`, `connected`, `refreshed`, `signed_out`, `revoke_failed`,
`relay_refused` with xAI's words, `limited`), plus
`desktop.models.grok_settings_failed` and `desktop.models.grok_billing_failed`
when xAI's gate or billing didn't answer (the sign-in and the answer go on).

**Verified:** `server/tests/desktop/test_grok.py` (26 tests, xAI stood in by
respx). **Not verified:** a real sign-in at auth.x.ai, a real call at the
proxy, xAI's real billing and error bodies: all of it is read from Grok
Build's code.

**API keys** (10 November 2026, the founder's list "below subscription";
the plan: `docs/your-own-models.md`, section 7). The person's own key for
one of 25 providers (`server/simeon/desktop/key_providers.py`; GitHub
Copilot and Meta listed, not yet connectable):

- `GET /desktop/api/models/accounts` also names the providers
  (`keyProviders`: name, key page, details asked, `available`, a hint).
- `POST /desktop/api/models/accounts/keys/{provider}` `{key, fields}`: the
  key tried at the provider (its model list, or a one-word call where it has
  none), then kept sealed with the models it reaches (`kind` `api_key`,
  `models`). Refusals: `unknown_provider` (404), `invalid_key`,
  `invalid_fields`, `key_refused` (400), `provider_unavailable` (502).
- Models `own:<provider>:<model>` (`own:deepseek:deepseek-v4-pro`), chosen as
  a plan's. The relay speaks each provider's wire: Responses as it is
  (OpenAI, SpaceXAI, Azure), Claude's Messages with its prompt cache
  (Anthropic, MiniMax), Chat Completions for the rest; the answer always
  back as Responses events.
- What a provider wants back with its tool calls (thoughts, Gemini's
  signatures, Claude's thinking blocks) is kept six hours in Redis
  (`desktop:own-kept:*`); a model that refused the rest is sent the plain
  request for a day (`desktop:own-plain:*`).

No setting: every address is the provider's own. Log lines:
`desktop.models.connected` (`kind=api_key`, how many models),
`desktop.models.key_not_taken` (the provider refused the key, with its
status), `desktop.models.key_check_failed` (it couldn't be asked),
`desktop.models.key_plain` (a model refused the full request; the
provider's words), `desktop.models.key_refused` (a key it no longer takes:
shown signed out), and the plans' own `relay_refused`, `limited` and
`on_simeon`. No key is ever logged.

**Verified:** `server/tests/desktop/test_api_keys.py`,
`test_chat_wire.py`, `test_messages_wire.py` (every provider stood in by
respx), and the engine's own AI SDK reading both translators' output. **Not
verified:** any provider with a real key. The apps' API keys section and
key sheet: `docs/your-own-models.md`, section 7.

### Settings on Render

- `SIMEON_OPENAI_API_KEY`: the OpenAI key. Without it, no OpenAI model is offered.
  Still needed on a Claude policy for pictures (GPT Image), dictation
  (`gpt-4o-mini-transcribe`, the apps' microphone), speech and the fallback
  model (GPT-6 Sol); an empty OpenAI account stops those four, not Claude.
- `ANTHROPIC_API_KEY` (or `SIMEON_ANTHROPIC_API_KEY`): Claude. Without it no
  Claude model is offered, and a Claude policy answers on GPT-6 Sol. Web search
  needs this key even when Claude goes through Bedrock.
- `SIMEON_DESKTOP_MODELS`: `claude` (the default since 18 October 2026),
  `openai`, `claude-haiku` or `claude-opus`. Set on Render, it wins over the
  default.
- `SIMEON_DESKTOP_CLAUDE_VIA`: `anthropic` (the default) or `bedrock`, Claude
  in Amazon Bedrock so AWS credits pay for it (14 October 2026,
  `server/simeon/desktop/bedrock.py`). With `bedrock`, a Claude call goes to
  Bedrock's runtime Anthropic route,
  `bedrock-runtime.{region}.amazonaws.com/anthropic/v1/messages`: the same
  request and event stream, the model named by its cross-Region inference
  profile (`global.anthropic.claude-sonnet-5-5`), without the
  thinking-binding beta Bedrock does not list, signed (SigV4, service
  `bedrock`) with `SIMEON_DESKTOP_BEDROCK_ACCESS_KEY_ID` and
  `SIMEON_DESKTOP_BEDROCK_SECRET_ACCESS_KEY` (an AWS user allowed
  `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` and
  nothing else) in `SIMEON_DESKTOP_BEDROCK_REGION` (default `us-west-2`,
  beside Render's Oregon). `SIMEON_DESKTOP_BEDROCK_ROUTE` picks the profile:
  `global` (the default, no premium, processed in any Region) or `us`, `eu`,
  `au` (kept in that geography, at a premium). Until 22 October 2026 calls
  went to `bedrock-mantle` as `anthropic.claude-…`, which answered 404 "The
  model … does not exist": Bedrock's model cards list Claude 5.5 on
  bedrock-mantle in GovCloud only. Bedrock alone is enough to offer Claude.
  A call Bedrock refuses over its thinking blocks (a 400 naming them: blocks
  bound to an earlier form of the conversation, whose instructions changed
  since) goes to Bedrock once more with every thinking block taken out of
  its history, each turn's text and tool calls kept, and logs
  `desktop.proxy.bedrock_without_thinking`. Until 27 October 2026 those calls
  went to `ANTHROPIC_API_KEY`, so Anthropic credits paid for them (105 in
  the 48 hours before). When Bedrock does not answer with a 200 otherwise
  (refused, not enabled, overloaded, unreachable), the same call is made once
  on `ANTHROPIC_API_KEY` if it is set, as the app sent it, and
  `desktop.proxy.bedrock_fallback` logs Bedrock's status and words. Each
  call Bedrock serves logs `desktop.proxy.bedrock_served` (the model, and
  `via` `bedrock` or `bedrock_without_thinking`): counted against the
  fallbacks, it says how much of Claude AWS paid for. The account's Claude
  models are subscribed through AWS Marketplace once (the console's
  playground does it). Its quotas are the bedrock-runtime ones: tokens per
  minute per model, where a request's `max_tokens` is held while it runs.
  Not verified: the retry without thinking has been tested against a stand-in,
  not yet against Bedrock itself.
- `SIMEON_DESKTOP_MODELS_BY_EMAIL`: the same choice for a few people first, as
  JSON: `{"you@example.com": "claude"}`. A value that is not a policy stops
  the deploy at boot rather than serving the wrong models.
- `SIMEON_GEMINI_API_KEY`: Gemini, for the video role.
- `SIMEON_DESKTOP_MONTHLY_CREDITS` (only a server with no billing configured
  reads it), `SIMEON_DESKTOP_HOURLY_CREDITS`: only to change the defaults.
  The plans' weekly credits are in `server/simeon/entitlements/tiers.py`.

### In the app

- `SAND_SIMEON_REASONING_EFFORT`, `SAND_SIMEON_CHEAP_REASONING_EFFORT`:
  override the effort (`none`, `low`, `medium`, `high`, `xhigh`, `max`).
- `SAND_SIMEON_MAX_OUTPUT_TOKENS`: the output ceiling per call.
- `SAND_SIMEON_MODEL`, `SAND_SIMEON_CHEAP_MODEL`, `SAND_SIMEON_FALLBACK_MODEL`,
  `SAND_SIMEON_COMPUTER_MODEL`: hold a role on one engine whatever the server
  says (testing only).
- `SAND_AGENT_MAX_STEPS`, `SAND_HIDDEN_TURN_MAX_STEPS`, `SAND_ROUTINE_MAX_STEPS`:
  the step limits.
- `SAND_AGENT_MESSAGE_MAX_HOPS`: agent messages in a row.

### When it misbehaves

- On the server, read `desktop.proxy.upstream_refused` first. It holds the
  provider's own sentence explaining the refusal. Also check
  `desktop.proxy.upstream_unreachable`, `desktop.proxy.usage_not_recorded`
  and, with Claude on Bedrock, `desktop.proxy.bedrock_fallback`,
  and for capabilities `desktop.search.*`, `desktop.images.*`,
  `desktop.transcription.*`, `desktop.speech.*` and `desktop.video.generate`.
- In the box, each model call writes a `[simeon] model=… effort=… input=…
  cached=… output=… tools=… offered=…` line; a Claude call adds `written=`,
  the prompt tokens written to the cache (input counts fresh, cached and
  written together). A failed call writes `[simeon] model-error`. A step moved
  to another model writes `[simeon] model-fallback` (GPT to the cheap model
  after a rate limit; Claude to its fallback). The roles the engine follows
  are on `[simeon] model-roles primary=… cheap=… fallback=… computer=…`, written when
  they change, `model-roles remembered …` when the host starts on the kept
  ones, or `model-roles unread` when the read fails.
- **The chat's line when an agent's model changes** (10 November 2026,
  "Changed from Simeon to Claude Opus 5.5"): at the start of an agent's own
  turn (a message, a routine, a wake), the engine compares the turn's model
  with the one it last saw for that agent (`model-seen.json` in the engine's
  data folder) and writes `[simeon] model-changed agent=… from=… to=…`
  (`simeon` for Simeon's own model). No such line after a change in AI
  Models: the roles were read as before (`model-roles …`), or the agent has
  not had a turn since, or the computer still runs an older engine (no
  `sand.box.updated_in_place` since the engine was published). An agent's
  first turn on this engine is compared with the roles the computer kept
  before it started (`model-roles remembered …`); an agent made since is
  only remembered. `model-changed unwritten` or `not kept` gives
  the reason the line or the file was not written; the turn goes on either
  way. `docs/your-own-models.md`, section 10.
- A tool the model makes up no longer fails the run (15 October 2026: Claude
  called `CheckSubagent`, and the box log read `[sand][turn] agent run failed
  … NoSuchToolError … unavailable tool 'CheckSubagent'`). The call now
  reaches the agent's loop, which answers `Tool not found: <name>. Available
  tools: …`, and the model goes on with a real one; the step's line shows it
  as `tools=CheckSubagent(…)`. Connector calls the AI SDK runs itself get the
  same answer. Only the real tools are ever offered
  (`answeringUnknownTools`, `desktop/tests/unknown-tool-call.test.mjs`).
- **"`tool_use` ids were found without `tool_result` blocks immediately
  after"** (`desktop.proxy.upstream_refused`, status 400; the founder's form,
  15 October 2026, three times in a row). Claude takes a step's results as
  the very next message, every `tool_result` first in it, before any text or
  picture. The loop keeps each result as a message of its own and puts a
  result's screenshot after it as a user message; the AI SDK merges them in
  that order, so with two calls in one step and a screenshot from the first,
  the second's result came after the picture and Claude refused the
  conversation, and every later step of it. The server put the computer to
  sleep at 15:17 PT after its 30 idle minutes (nothing running, no app
  attached), before the refusals at 15:19, so the sleep did not cut the form
  off. Now, on Claude's wire only (`pairedForClaude`, `provider-session.ts`),
  each step's results follow it at once in the order of its calls; a call
  with no result (a run stopped mid-step) is answered "This tool call was
  interrupted…" as an error, so the agent looks before it repeats it; a
  result with no call is left out. A conversation already in that shape is
  sent byte for byte as before (`desktop/tests/claude-tool-results.test.mjs`,
  which builds the request with the AI SDK's own Claude provider and checks
  it against Claude's rules). In the box, a repair writes `[simeon]
  claude-tool-results repaired reordered=… interrupted=… dropped=…`; a refused
  call writes `[simeon] model-error-messages` with the conversation's shape
  (`tool:tool-result` and `user:text+image` in order). The stored
  conversation is not rewritten: it is put in order each time it is sent, so
  a conversation that broke before this engine works again with it.

**Not yet verified:** GPT-6 Sol and Luna have not run against OpenAI. The
spend guards have not run on a Mac. The Gemini prices are marked "to confirm"
in the code. The Claude path (13 October 2026) has run only against a stubbed
proxy (`desktop/tests/claude-path.test.mjs`); no request has reached
Anthropic, and the cost test (`docs/cost-test-set.md`) has not been run on
it.

---

## 3. Memory sync

**What it does for the person.** What the agents learn about the person is
kept on Simeon's server as well as in their computer. A new computer receives
the whole memory, and changes made in one place reach the other.

### How it works

Routes, under `/desktop` (`server/simeon/desktop/endpoints.py`):

- `POST /desktop/api/memory/sync`: the client sends the files it has changed,
  each with the version it last saw (`base_version`), plus any names it
  deleted. The server merges them and answers with every file it holds, plus
  the tombstones for deleted files.
- `GET /desktop/api/memory`: lists what the server holds (name, version,
  size) without the text.

Both routes take either a signed-in desktop or the box's own credential
(`get_desktop_or_box_session`).

The server is the only side that merges (`server/simeon/desktop/memory_merge.py`).
The rule depends on the kind of file:

- **Fact files** (`agents/<id>/memory/profile.md`, the monthly `log/YYYY-MM.md` files,
  and the `user-memory/` and `projects/` shards). Each line is
  `- (YYYY-MM-DD) <fact>`. Two lines are the same fact when their ids match,
  using the app's own `memoryIdFor`: the first 16 hex digits of the sha1 of the
  normalised text. The date is not part of the id. The merge keeps the server's
  lines in order, then adds the client's new ones.
- **`MEMORY.md`**: a list, merged by markdown bullet.
- **Daily notes**: merged line by line.
- **`USER.md`**: a document. The newer text wins whole.

Limits (`server/simeon/desktop/service.py`): 1 MB per file, 8 MB per request,
2,000 files per person. Tombstones are kept for 90 days. A refused sync
answers code `40001` with a sentence.

**The client** is the host extension `desktop/source/host/extensions/memory-sync/`,
which runs in the box:

- When the box starts, it lists what the server holds, then runs one round
  that pushes local files and pulls everything.
- It then watches `agents/`, `user-memory/` and `projects/`. After a change it
  waits 5 seconds and sends only what changed, with base versions.
- It authenticates with the box's own access token, the same token the model
  proxy takes.
- It keeps its state in `<sand root>/.memory-sync/state.json`.

### Settings on Render

None beyond sign-in.

### In the app

`SAND_MEMORY_SYNC=0` switches the client off.

### When it misbehaves

Read the `[simeon] memory-sync` lines in `/tmp/sand-host.log`. Each round writes
one line: `pushed=… pulled=… deleted=… held=…`, or `refused <sentence>`,
`failed <reason>`, or `skipped: no credential`. At start, a
`memory-sync server holds N file(s)` line says what the server has.

**Not yet verified:** memory sync has not run on a Mac.

---

## 4. The cloud computer

**What it does for the person.** Each person gets their own computer in the
cloud, where their agents run, work, and keep their files. It is the only
runtime for real users. It sleeps when nobody uses it and wakes when needed.

### How it works

**The broker.** The app speaks Connect RPC to `simeon.v1.ComputerService` at
the root of the API host (`server/simeon/sand/box_broker.py`; until 5 October
2026 the service was called `aiserver.v1.GrokBotService`, and the server answers
that name too for one release, for the apps and box hosts built before). Its methods are
`EnsureSandBox`, `RecreateSandBox`, `ForceRecreateSandBox`,
`WatchSandBoxMigration` and `GetSandBoxRunState`. The logic is in
`server/simeon/sand/box_service.py`, and `server/simeon/sand/box_hosts.py` talks
to Docker Engine over its HTTP API with TLS client certificates.

`EnsureSandBox` finds the person's box, starts it if it is stopped, and
creates it if it does not exist. A box whose credential died with a sign-out
is not rebuilt (20 October 2026): the credential it already holds is made
good again for the app signing in (`revive_box_credential`, committed before
the box wakes, `sand.box.credential_revived`), and the box is woken. Until
then each sign-in after a sign-out rebuilt the computer and copied its backup
in, almost a minute behind "Setting up Simeon's computer". The box's renewer
asks again at once when a model call needs the credential, even in the middle
of a backoff (`credential-renewer.ts`, from the engine published after that
date). It replaces the container, keeping the same volumes, in any of these
cases:

- the container is gone,
- its credential is gone and cannot be made good again (no credential on the
  row, as after a failed move),
- it runs a host program other than the current bundle,
- it runs an image other than the pinned one.

A box that is busy keeps its current program (`sand.box.update_deferred`).
It is updated at the first of:

- an app connecting to it while it is idle;
- the sleeper's minute (since 19 October 2026): a running box that is out of
  date, idle and with no app attached is replaced on its files by the
  `sand.box.update_idle` job, the same way an idle connect replaces it. It is
  sent once every 10 minutes at most. A box only waiting on an approval
  card is replaced too (4 November 2026): the founder's computer, an agent
  waiting on a "Your turn on the computer" card, slept every 11 minutes and
  was never updated. The waiting turn ends with the old container. An app
  connecting still waits for the card. Before then a published engine reached a box only at an idle
  connect, and Rhea's box ran the old engine for hours after a publish;
- "Update Simeon's Computer" in the app. `GetSandBoxRunState` now answers
  `imageUpdateAvailable: true` while the box is out of date (it answered
  false always), which is what offers the entry in "/" and Search on the
  iPhone and in the Mac's sidebar. The box asks when it starts and once a
  day, so the entry can lag a publish by up to a day; the sleeper's update
  does not wait for it.

**How the apps reach it (16 October 2026).** The iPhone and Mac apps find
the box the way the Electron app does (`ios/SimeonCore/Sources/SimeonCore/Gateway.swift`):

- At launch they go straight to the address the broker gave last time, kept
  in the Keychain for that account for seven days
  (`SavedGateway.swift`), and ask `EnsureSandBox` in the background. The
  kept address is tried once. If it fails (the box slept, or was rebuilt),
  they wait for the broker's answer. Signing out forgets it.
- Once they have an address, they keep using it while the event stream is
  up. Otherwise they first ask the box's `/health` (1.5 s, trusted for 5 s),
  and call `EnsureSandBox` again only when that gets no answer.
- The event stream dials again after 1, 2, 4, 8, then every 10 seconds, and
  a stream silent for 35 seconds counts as dead (the host pings every 15).
- When the broker answers `SAND_BOX_BLOCKED`, they do not ask again until its
  `retry-after` (a minute without one, 15 minutes at most).

Each box has two volumes: `/workspace` and `/home/box/sand-data`.

**The proxy.** The API forwards the box's ports at `/sand-box/{box_id}/p/{port}/…`,
for both HTTP and WebSocket (`server/simeon/sand/box_proxy.py`). The ports are
1340 (gateway), 6080 and 6081 (screens) and 8790 (egress tunnel). A request
passes only with the box's network token, sent as the `network_token` query
parameter or the `x-anyrun-network-token` header. Inside the box, the host runs
the same token check in front of the screen stream
(`desktop/source/host/box-stream-guard.ts`). WebSockets are passed on without
per-message deflate on either side (`--ws-per-message-deflate false` in
`server/Dockerfile`, `compression=None` towards the box): the screen's pictures
are already compressed, and deflating them cost about 10 ms per update for
nothing (`docs/services-agents.md` §15).

**Render's edge firewall (12 November 2026).** Render's edge reads the start of
each request body and refuses text that looks like an attack (shell commands,
code) with its own 403 HTML page titled "Blocked", before the request reaches
the API. Measured from the founder's Mac: a long message with shell commands
was refused, "hello" passed, and the same message in base64 passed. So the apps
can send a body in base64, with `x-simeon-body: base64`, the body's own type in
`x-simeon-content-type` (JSON when absent) and `content-type: text/plain`.
`EncodedBodyMiddleware` (`server/simeon/middlewares.py`) decodes it before
every route and before this proxy, so routes and the box see the body as it
was written, with its type and length restored and the two `x-simeon-` headers
removed. A body that is not base64, or another value of `x-simeon-body`, is
refused with 400; one over 16 MB encoded, with 413. A request without the
header passes as it is. The engine's own model calls do the same with gzip
after an edge refusal (`provider-session.ts`, `isEdgeRefusal`).

The apps send every body as it is first. When the answer is the edge's (a 403
with an HTML page, by its type or its first words; the API and the box answer
JSON), they send it once more in base64 (`EdgeFirewall` in
`ios/SimeonCore/Sources/SimeonCore/HTTP.swift`, for the Mac and the iPhone;
`sendPastEdge` in `clients/apps/app/src/core/http.ts`, for the web and Windows
app). The edge stopped the first one, so nothing is done twice. In a browser
the edge's page may come without the CORS headers, and then fetch only fails
as unreachable; the web app sends a body that failed that way once more in
base64 too, as the gateway already resends a call that never arrived. Bodies
over 12 MB are not sent again. The app's activity log, which
"Report an Issue" carries, gets `edge refused POST <path>: sent again in base64,
answered <status>`. A message that still fails says why under "Failed to send"
when the words are plain ("The Internet connection appears to be offline."), and
the log gets `send failed in <agent>: <error>` either way.

**Placement across several servers.** `SIMEON_BOX_HOSTS` lists the box servers
as JSON:

```
[{"name": "docker", "docker_host": "tcp://box1.simeonlabs.com:2376", "accepting": false},
 {"name": "us-west-1", "docker_host": "tcp://box2.simeonlabs.com:2376", "max_running": 3}]
```

- A new computer goes to the accepting server with the largest share of its
  limit free, and stays there, because its volumes live on that server.
- `"accepting": false` drains a server: it keeps its computers and takes no
  new ones.
- The first server must keep the name `"docker"`.
- If the list is empty, the one server at `SIMEON_BOX_DOCKER_HOST` is used,
  under the name `"docker"`.
- If a computer's server is removed from the list, the person gets a new,
  empty computer somewhere else.

All servers share one CA, so one client certificate opens every one of them.

**Computers on E2B** (16 October 2026, `server/simeon/sand/box_e2b.py`). An
entry with `"kind": "e2b"` puts computers on E2B's service: each one is a
small virtual machine (Firecracker) made from the template built from `box/`
(`.github/workflows/e2b_template.yml`, `box/e2b/`), frozen whole when it
sleeps and back in about a second, open tabs and running programs included.
This is the design the Electron app's own cloud used, a microVM per
computer hibernated to a snapshot. What differs from Docker:

- **Making one.** The template boots with nothing of ours running and nothing
  private in it, because every computer made from it starts from the same
  memory. Through E2B's agent in the VM the server writes the person's
  settings (`/run/simeon/box.env`), fresh randomness, the machine id (the
  box's id) and the host bundle, then starts `box/bin/start-simeon-vm`, which
  does what Docker did for the container and runs the same `start-simeon-box`.
- **Sleep and wake.** Sleep is a pause, a snapshot of the whole VM; wake is a
  resume, after which the server sets the VM's clock (the host trusts
  `Date.now()` for its one-hour token). E2B is told to pause, never kill, a
  computer whose timeout passes, and the sleeper pushes the timeout out
  every minute while the computer is awake, so the broker decides when it
  sleeps. An entry's `idle_minutes` sets its own idle time.
- **Files.** There are no volumes: the person's files are on the VM's own
  disk and in the backup (below). So a computer that needs replacing (a new
  host bundle or template) is woken if asleep, its backup is brought up to
  date, and only then is it replaced; if the backup cannot be brought up to
  date it stays as it is (`sand.box.update_deferred`, reason `backup`).
- **A new engine on the same computer** (9 November 2026). When only the
  host bundle is new, the computer is not replaced: once it is idle, the
  server writes each engine file beside the old one
  (`<path>.next`) and runs `/run/simeon/update-engine.sh` on it
  (`ENGINE_UPDATE_SCRIPT` in `box_e2b.py`), which moves the files in, stops
  the engine and the exec daemon (TERM, then KILL after 15 seconds) and
  waits up to a minute for the image's supervisor to start them again. Once
  the engine answers, the row notes the new bundle
  (`sand_boxes.host_meta.host_sha256`; E2B's own record keeps the one it was
  made with) and the log says `sand.box.updated_in_place` with how long it
  took. Everything outside the backup stays, Claude Code's sign-in first
  (`docs/your-own-models.md`, section 6): replaced for each engine
  published, every computer lost it. When the engine does not come back
  (`sand.box.update_in_place_failed` with the script's answer:
  `not-running`, `not-staged`, `not-moved`, `not-restarted`, `no-pgrep`, or
  `not ready`), its backup is brought up to date and the computer is
  replaced from it as before (or kept as it is when the backup cannot be:
  `update_deferred`, reason `backup`). A new template, or a move to another
  server, still replaces it. Run here against a stand-in supervisor and
  engine (the swap, a host ignoring TERM, nothing staged, nothing
  restarting); not yet on a real computer. Since 11 November 2026 no backup
  is asked for before the swap, which keeps the disk: asked first, a backup
  the computer could not finish put the update off on every wake, each wake
  holding the person's computer about two minutes (the app's other calls
  answered "still starting"), and the computer did not answer for about an
  hour.
- **An engine that does not answer.** A computer that runs, or was just
  woken, and whose engine has not answered after `BOX_READY_TIMEOUT` (90
  seconds) has its engine restarted in place the same way, the published
  one, its disk kept (`sand.box.revive`, then `sand.box.revived` or
  `sand.box.revive_failed`), at most once every ten minutes
  (`sand_boxes.host_meta.revived_at`), so a restart that did not help is not
  repeated on every wake.
- **Reaching it.** The API dials `https://<port>-<sandbox>.<domain>` with the
  computer's traffic token (`e2b-traffic-access-token`, kept in
  `sand_boxes.host_meta`); E2B refuses its ports to anyone without it. The
  app never sees E2B: it reaches every computer through the API's proxy.
- **Who.** An entry's `users` lists who has their computer there, or `["*"]`
  for everyone. A listed person's computer on another server moves at their
  next idle `EnsureSandBox` when there is room: backup brought up to date,
  the old computer stopped (not removed), the new one made with the backup
  copied in (`sand.box.moved`). If the new one does not come up (a template
  not built yet), the person's computer is made again where it was, on its
  own files with a fresh credential, and no move is tried for 30 minutes
  (`sand.box.move_failed`). While the entry is full or closed, new
  computers go to a server that names nobody (`sand.box.placed_fallback`)
  and move over later; an existing one stays where it is, working
  (`sand.box.move_deferred reason=full`). A person taken off `users` keeps
  the computer they have.

Setting it up on Render and GitHub: `docs/ops/box-host/render-env.md`, "E2B".

**Computers on Azure** (12 November 2026, `server/simeon/sand/box_azure.py`).
An entry with `"kind": "azure"` puts computers on Azure Container Apps
Sandboxes, the same design as E2B on Microsoft's service
(`docs/ops/box-host/azure-plan.md`). The server speaks Azure's data-plane
REST API itself (version `2026-09-01-preview`) over httpx, signed in as its
own identity (client credentials). What differs from E2B:

- **Making one.** The disk image is box2's image with `simeon-vm-init` as its
  first process (`box/azure/`). The server writes the settings to
  `/var/lib/simeon` (on the disk, so a computer started fresh starts again
  on its own), the randomness, the machine id and the engine, then the mark
  `ready`. Size: 2 cores, 4 GiB, 40 GiB. Auto-suspend is off, so the broker
  decides when a computer sleeps.
- **Sleep and wake.** Sleep is `stop` (a snapshot of the whole VM in Memory
  mode). Wake is `resume`, asked again every 10 seconds while the computer
  still sleeps, then the clock is set. A wake that has not ended after two
  minutes (Azure's bug #1869) removes the computer, and the app's next try
  makes a new one from the backup (`sand.box.azure.resume_failed`).
- **Reaching it.** Each port is `https://<sandbox>--<port>.<region>.adcproxy.io`
  and admits only the server's identity (a Microsoft token in
  `Authorization`, which Azure's proxy removes). The app's own
  `Authorization` (the gateway's password) moves into
  `x-simeon-box-authorization`, which the engine's gateway reads too
  (`box_service.with_dial`). No port wakes a sleeping computer on its own.
- **No ceiling of ours.** `max_running` is 0 for Azure (no limit); Azure's
  own limits show as the capacity hold. The sleeper asks the awake computers
  in parallel, 32 at once.

Run against a stand-in Azure (`server/tests/sand/test_box_azure.py`); not yet
on a real computer. Setting it up: `docs/ops/box-host/render-env.md`, "Azure".

**Capacity and sleep.**

- **Size.** Each box is capped at `SIMEON_BOX_MEMORY_LIMIT_MB` (4096, no swap
  beyond it) and `SIMEON_BOX_CPU_LIMIT` (2.0).
- **Capacity.** At most `SIMEON_BOX_MAX_RUNNING` (3) boxes are awake at once
  per server; a server entry may set its own `max_running`. One more is
  refused with the `SAND_BOX_BLOCKED` hold and `retry-after: 60`, and the app
  waits and asks again.
- **Sleep.** The worker job `sand.box.hibernate_idle` runs every minute
  (`server/simeon/sand/box_tasks.py`). It asks each running box's `/health`:
  - A box that is busy stays awake. A box that is only waiting on the person's
    approval can still sleep.
  - So does a box the app is attached to through the proxy, tracked by a Redis
    key that lasts 180 seconds. Each minute it stays attached, the box's
    `last_active_at` is set to now (16 October 2026), so its idle time starts
    when the app goes. The Electron app had the same effect by calling
    `EnsureSandBox` every 30 seconds while it was open.
  - Any other box idle for `SIMEON_BOX_IDLE_HIBERNATE_AFTER` (30 minutes) is
    stopped with its files kept, and the app shows it as sleeping.
  - It asks 32 boxes at a time (`SLEEPER_LOOKS_AT_ONCE`, 12 November 2026):
    each one's state on its server, then its `/health`. One after another, a
    thousand awake boxes took longer than the minute between rounds. What it
    then writes to the database and Redis is still done one box at a time.
- **Wake.** `EnsureSandBox` wakes a sleeping box. So does `sand.box.wake`,
  which is queued whenever the server publishes something for the box, such
  as a routine's fire or a shared room's turn. A wake refused for capacity is
  retried every minute for an hour.

**The pinned image.** The box image is `SIMEON_BOX_IMAGE` pinned by
`SIMEON_BOX_IMAGE_DIGEST` (default `322c3a90…c0c1c8`, the earlier maker's
build). That build's supervisor starts `/home/box/sand-host/host-main.cjs`,
which is where the host bundle is mounted. A box on any other image is
replaced, keeping its volumes. Move the pin only after checking which path a
new build's supervisor starts.

Simeon's own image is `box/` (`box/README.md`, 5 October 2026): the same
ports, files and scripts the host relies on, its supervisor starting the
mounted `/home/box/sand-host/host-main.cjs` and the mounted exec daemon,
which now takes the screenshots and clicks itself. Once it is built and
published, the switch is the two settings above (and `SIMEON_BOX_IMAGE` in
the Mac's internal Docker path); every box is replaced on its next
`EnsureSandBox`, its workspace and data kept.

**Trying an image on a few accounts first** (16 October 2026). With
`SIMEON_BOX_IMAGE_TRIAL` (a full `repo@sha256:…` reference) and
`SIMEON_BOX_IMAGE_TRIAL_USERS` (comma-separated e-mail addresses or user
ids), only the people listed get that image (`box_service.image_for`):
their box is replaced at its next idle `EnsureSandBox`, on the same volumes,
with the backup copied back; everyone else stays on the pinned image. Taking
a person off the list (or emptying either setting) puts them back on the
pinned image the same way. The log line is `sand.box.image_trial`. The Docker
server pulls an image only when it does not have it, so an image in a
private registry is pulled once by hand on each server (`docker login`, then
`docker pull` of the exact reference) before anyone is listed.

Do not list anyone with Simeon's own image (`box/`) yet. Its exec daemon
(`desktop/source/box-exec-daemon/`) cannot write files (the agents' Write
and Edit tools) or run the computer's own connectors (MCP), and refuses
paths outside `/workspace`. This was measured on 16 October 2026 with
today's engine; the details are in `docs/ops/box-host/render-env.md`
(E2B). The image's
folder for the host also holds only what is written into it, so the engine
must be one published with its workers (`HOST_COMPANIONS`).

**The host bundle channel.**

- `SIMEON_BOX_HOST_BUNDLE_URL` names either a folder or a single `.tgz`.
- A folder holds `sand-host-bundle-latest.version` (a commit id) and
  `sand-host-bundle-<commit>.tgz`.
- The server reads the version file at most every 10 minutes, with no restart
  needed.
- Each bundle is written once to `/var/lib/simeon/box-host/<key>/` on each
  server. It is mounted read-only over `/home/box/sand-host/host-main.cjs` and
  `/home/box/box-exec-daemon`, and the container is labelled with the host
  program's sha256.
- A URL ending in `.tgz` names one fixed file.
- On a Mac, `npm run publish:host-bundle` in `desktop/` publishes the packaged
  app's host in this layout.

**The box's renewal credential.** When it creates a box, the broker mints a
`simeon_db_` credential (`issue_box_credential`). This is a child row of the
person's desktop session, revoked when they sign out and moved to the new
session on each refresh. It is passed to the box as
`SAND_INFERENCE_RENEWAL_CREDENTIAL`.

The box trades it for a fresh one-hour access token at
`POST /sand-box/inference-credential`, at the root of the API host. This works
without the Mac.

The credential reaches the model proxy, the profile route and the memory
routes. Other desktop routes refuse it. A refresh never accepts it.

**Several API workers.** The proxy keeps its "attached" marks in Redis, and
the migration log that `WatchSandBoxMigration` streams is also in Redis, so
more than one API process can serve boxes.

**Backups** (14 October 2026, `server/simeon/sand/box_store.py`), the upstream
app's own design, switched on by `SIMEON_BOX_STORE_BUCKET`:

- The host in the box backs itself up (`box-store-sync` in
  `desktop/source/host/extensions/box-store-sync/`): every two minutes, and
  five seconds after an agent's turn ends, it copies the agents' data
  (`/home/box/sand-data`), the workspace, the app sign-ins (`cli-config`) and
  Chrome's cookies, saved logins and site data (the whole Chrome profile only
  when idle, at most every 15 minutes) to S3. Each file is stored once under
  its sha256 (`blobs/`), with one `manifest.json` naming what goes where. The
  box never deletes anything.
- It asks the server for presigned S3 URLs over the upstream's agent-store
  calls on `simeon.v1.CloudAgentService`: `MintAgentStoreToken` (a one-hour
  token naming the person's store, sent back as `x-agent-store-token`), then
  `PresignAgentStoreReads` and `PresignAgentStoreWrites`. A write with a
  condition (`If-None-Match: *` or `If-Match`) carries a second, conflict URL
  where the box keeps its copy when the condition fails, so nothing is lost.
  The bytes go straight between the box and S3, never through the API.
- A store belongs to one person: its id is derived from the person and the
  box (`store-<uuid>`), and every key lives under
  `box-stores/<user id>/`. Delete Account removes that prefix.
- The box is told (`box_env`): `SAND_BOX_STORE_SYNC=1`, its store
  (`SAND_BOX_STORE_ID`) and the bucket's address, which the host adds to its
  allowlist of presigned-URL hosts (`SIMEON_AGENT_STORE_BUCKET_HOSTS`). Every
  container made with backups on carries the label `com.simeonlabs.box-store`;
  an idle box made before is replaced on its volumes once (`stale_store`), as
  a box on an older host program is.
- Restoring, the upstream's order: before a container is replaced, the API
  asks the box to bring its backup up to date (`POST /api/snapshotBoxStoreNow`,
  30 seconds). The new container is told to copy the backup in before its
  host starts (`SIMEON_BOX_STORE_RESTORE` with a new
  `SIMEON_BOX_STORE_RESTORE_ID`; the host runs `host-main.cjs --box-copy-in`,
  `desktop/source/host/box/box-store-restore.ts`), once per container:
  - `always` after that backup succeeded, since Chrome and the app sign-ins
    live outside the two volumes;
  - `fresh` otherwise, only onto an empty agents folder and only when a backup
    exists (or S3 could not say), so a container lost with its volumes kept
    never trades newer files for an older backup.
  A failed copy stops the host and the supervisor starts it again; after three
  failures it starts without the backup, with backups paused in that container
  so its empty folders never replace the backup.
- The new container's credential is committed before the container starts
  (15 October 2026, `BoxBrokerService._mint_credential`). Until then it was
  written in the ensure request's own transaction, saved only when the request
  ended, after the box answered (up to `BOX_READY_TIMEOUT`); the box's first
  act, the copy, renewed with a credential the server could not see yet, and
  every rebuild for a new engine ended in three refused copies
  (`[box-copy-in] result outcome=failed … renewal failed (HTTP 401)`), about a
  minute of "connecting", and a box without its Chrome sign-ins and with
  backups paused. `tests/sand/test_box_broker.py` renews from a second
  connection while ensure is still open.
- The computer's three actions, as upstream: **Update** brings the backup up
  to date and swaps the container on the same files; **Recover computer**
  (`ForceRecreateSandBox`) backs up as far as the box answers, wipes the
  agents' data and boots from the backup; a **reset**
  (`RecreateSandBox` with `preserveData: false`) wipes the files and the
  backup together.

### Settings on Render

Put these in the environment group that both the API and the worker read,
because the worker runs the sleeper and the wake. Full steps are in
`docs/ops/box-host/render-env.md`.

| Setting | Value |
|---|---|
| `SIMEON_BOX_HOST_PROVIDER` | `docker` (empty: the broker answers "Simeon's cloud computer needs a host; set SIMEON_BOX_HOST_PROVIDER") |
| `SIMEON_BOX_HOSTS` | the JSON list above, or leave it empty and set `SIMEON_BOX_DOCKER_HOST` |
| `SIMEON_BOX_DOCKER_TLS_CA`, `_CERT`, `_KEY` | paths to the secret files, e.g. `/etc/secrets/ca.pem` |
| `SIMEON_BOX_HOST_BUNDLE_URL` | the public HTTPS folder of host bundles |
| `SIMEON_BOX_IMAGE`, `SIMEON_BOX_IMAGE_DIGEST` | defaults; change only with a checked image |
| `SIMEON_BOX_IMAGE_TRIAL`, `SIMEON_BOX_IMAGE_TRIAL_USERS` | empty; another image for the accounts listed only (above) |
| `SIMEON_BOX_IDLE_HIBERNATE_AFTER` | `PT30M`; `PT0S` never sleeps |
| `SIMEON_BOX_SLEEPS_WITH_APP_OPEN` | `false`; `true` lets an open app's computer sleep (step 4, above). On both the API and the worker; then quit and reopen each app (below) |
| `SIMEON_BOX_IDLE_AFTER_RUN` | `PT10M`; how soon after its last run a box sleeps, with the line above on |
| `SIMEON_BOX_MEMORY_LIMIT_MB`, `SIMEON_BOX_CPU_LIMIT` | `4096`, `2.0`; `0` means no limit |
| `SIMEON_BOX_MAX_RUNNING` | `3`; `0` means no limit |
| `SIMEON_BOX_STORE_BUCKET` | the backup bucket's name; empty: no backups |
| `SIMEON_BOX_STORE_REGION` | the bucket's region, `us-west-2` by default |
| `SIMEON_BOX_STORE_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY` | a key with `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` and `s3:ListBucket` on that bucket only (ListBucket makes a missing file read 404, which the box needs) |

Leave `SIMEON_BOX_HOST_ADDRESS` and `SIMEON_BOX_PUBLIC_URL_TEMPLATE` empty so
the API proxies the ports itself.

### In the app

The runtime is the cloud (`remote`) unless `SAND_BOX_RUNTIME=local-docker`,
which selects the Docker box on the Mac for testing only. A value saved in
settings is not read (`desktop/source/shared/box-runtime.ts`).

**What the apps keep (26 October 2026).** The iPhone and Mac apps keep the
agents' list and each chat opened on the device, as the computer sent them
(`ios/SimeonCore/Sources/SimeonCore/SavedChats.swift`, `StoreSaved.swift`),
so the computer asleep, updated or out of reach no longer leaves the app
empty:

- At launch the list shows at once from the kept copy, and a chat its kept
  lines when opened; the computer's copy replaces them when it answers. The
  Mac shows its window at once instead of "Setting up Simeon's computer".
- The pins and the folders (sections) are kept with the list (27 October
  2026, `layout.json`): before, every chat showed in one list at launch
  until the computer's settings came, seconds later or when it woke. A pin
  or folder change made before the computer has answered is made on the
  computer's own copy, read first (waking it), so a change made on another
  device meanwhile is not undone.
- The connectors' catalog is kept too (28 October 2026, `catalog.json`, in
  the app's language): Connectors (Mac and iPhone) opens on it at once
  instead of "Loading connectors…". At launch the connected apps and the
  catalog are read behind the list only while the computer is awake (never
  waking it); Connectors reads the catalog again behind what it shows, once
  a sign-in.
- Kept: what the computer sent in this sign-in, a moment after each change
  and when the app goes behind (or quits, on the Mac). A chat keeps its
  newest 300 lines, 100 when those pass 2 MB. Not kept: what was going on at
  that moment (a turn running, typing).
- Under the app's caches, in `saved-chats/`; the system may clear them, and
  the app then waits for the computer as before. One account's: signing out
  (or the sign-in ending, or Delete Account) removes them, and a copy kept
  for another account is never shown.
- "Reconnecting" shows only while a message waits to be sent ("Will send
  when reconnected"); since the server takes such messages (below), only
  one with files or one the server refused. "Reconnecting to your
  computer…" under the list and "Couldn't Reach Simeon's Computer" after
  two minutes are as before.

**The server's copy (26 October 2026).** The computer also sends the agents
and their chats to Simeon Labs' server as they change, and the apps read
that copy while the computer is away, so a phone or Mac that kept nothing
(a new device, the caches cleared) shows them too:

- The engine's `chat-copy` extension (`desktop/source/host/extensions/chat-copy/`)
  sends the whole list when it changes, without inline pictures or what
  each agent is doing at that moment. Chat events come for the chat on
  screen only, so it reads a chat's newest 60 lines again whenever the
  list says that chat moved: a new line, its time, or a turn ending. A line
  still streaming waits until it is whole, and a line already sent goes
  again only if it changed. At start it sends every chat whose newest line
  the server lacks, 300 lines back. A refused copy is tried again after 5 s,
  then longer, up to 5 minutes. The computer's own chats never wait on it.
- The server (`server/simeon/desktop/chats.py`, tables `desktop_chat_agents`
  and `desktop_chat_lines`) keeps each agent's row and its chat's newest 500
  lines. It skips a line over 256 KB (the computer still has it), and an
  agent no longer in the list takes its chat with it.
  - `POST /desktop/api/chats/copy` and `GET /desktop/api/chats/state` are
    for the computer, with its own credential.
  - `GET /desktop/api/chats/agents` and `GET /desktop/api/chats/lines` are
    for the apps.
  - Delete Account removes both tables.
- The apps (`showServerList`, `showServerLines` in `StoreSaved.swift`) ask
  for the list beside the computer. It shows if it comes before the
  computer's list, never after. A chat opened shows the server's lines
  while it has only the device's lines or none. The computer's copy
  replaces both, as with the device's copy.

In the box, `SAND_CHAT_COPY=0` switches the extension off. Its log lines
are `[simeon] chat-copy on: …`, `sent …`, `failed …; again in N s` and
`left out N line(s) over 256 KB`; they carry counts only, never a chat's
words. On the API the line is `desktop.chats.copy`, with the counts.

**Messages while the computer is away (26 October 2026).** A message
written in an app while the computer is out of reach (asleep, being
updated, or the network down) no longer waits on the device: the app hands
it to the server, the server wakes the computer, and the computer hands it
to the agent. It reaches the agent even if the app is closed, and
"Reconnecting" does not show for it.

- The app (`handToServer` in `Store.swift`) sends what it would have sent
  the computer (`LiveBackend.sendArguments`, the message's id as its nonce)
  to `POST /desktop/api/chats/send`. Messages go in the order written; one
  with files waits on the device (files go to the computer itself), and
  those after it wait with it. One the server refuses (too long, too many
  waiting) waits on the device as before. Once the server has it, it shows
  as sent. Nothing marks it (28 October 2026: "Sent while offline" under it
  is gone from both apps), and the agent is told it was "composed offline"
  (`composedAtMs`) only when the computer was out of reach, not when it was
  only asleep. The app then reaches for the computer at once
  (`Gateway.waking`), so the answer streams as it is written; it used to
  wait for the record's next read, up to 15 s late.
- The server (`server/simeon/desktop/chats.py`, table
  `desktop_chat_inbox`) keeps it exactly as written, at most 200 per person
  and 512 KB each, and wakes the computer (`simeon.sand.notify.publish`,
  topic `chat-inbox`, which also queues `sand.box.wake`). The sleeper keeps
  a computer awake while a message written in the last hour waits for it
  (`sand.box.sleep.deferred reason=inbox`). One no computer took in seven
  days is removed.
- The computer (`desktop/source/host/extensions/chat-copy/chat-inbox.ts`)
  asks for the waiting messages (`GET /desktop/api/chats/inbox`) at start,
  when the notify bus says `chat-inbox` and again 4 s later (the message is
  saved when the server's request ends), every 30 s while that stream is
  down, and every 2 minutes anyway. It waits until a turn can run, hands
  each to its agent with `sendPrompt` and the app's nonce, in order, then
  confirms them (`POST /desktop/api/chats/inbox/ack`). One that fails
  waits, with those after it, and is left out after 5 tries; one for an
  agent no longer there is left out at once.
- When the computer is back, the app sends the same messages to it too,
  with the same nonce: the computer's acceptance ledger takes a nonce once,
  so each lands once however it comes, and a later message never overtakes
  an earlier one.

`SAND_CHAT_COPY=0` switches this off with the copy. Log lines: on the API
`desktop.chats.inbox.queued` (with `added` and `waiting`),
`desktop.chats.inbox.delivered`, `desktop.chats.inbox.expired`; in the box
`[simeon] chat-inbox on`, `handed N message(s) to their agents`,
`left out a message for agent=…` with the reason, and `failed, …; again in
N s`. None carries a message's words.

This is step 3 of the computer as a worker (the founder, 26 October 2026),
with an agent's own Discord or Slack bot now listened to from the server
(`docs/services-agents.md` §4).

**The computer used only for runs (26 October 2026, step 4; off until
switched on).** With `SIMEON_BOX_SLEEPS_WITH_APP_OPEN=true` on the API and
the worker, an open app no longer keeps the computer awake:

- EnsureSandBox's answer says so (`letsSleep`), and an app built since
  then says it on each request to the computer (`x-simeon-lets-sleep: 1`):
  the proxy does not mark the box in use for those (`box_service.lets_sleep`).
  An app built before keeps it awake as always, and so does a screen being
  watched (its stream carries no such word).
- The sleeper puts a box to sleep `SIMEON_BOX_IDLE_AFTER_RUN` (10 minutes)
  after its last run, or after `SIMEON_BOX_IDLE_HIBERNATE_AFTER` if that is
  shorter; a message waiting for it still holds it awake.
- When the stream drops, the app (`Gateway.waitWhileAsleep`) asks the
  broker's record of the box (`GetSandBoxRunState` with `fromRecord`, which
  does not ask the box's server) instead of dialling, which would wake it.
  Asleep, it waits, reading the record every 15 s, until the box runs again
  (woken for a message, a routine, a bot) or something in the app needs it
  (a command wakes it through EnsureSandBox, as before). The Mac's local
  hands wait the same way (`MacLocalHands.run`).
- Meanwhile the store says the computer is asleep (`isAsleep`):
  "Reconnecting" does not start for it, a message goes to the server
  (above), and the stream coming back ends it. A box the record says runs,
  and that does not answer, is a failure the app shows as before.
- The launch asks the record first (`Gateway.checkedAtLaunch`), where the
  last launch's answer let the box sleep or nothing was kept (a new device,
  a new account). The record answers with the server's word (`letsSleep`),
  which wins over the one kept, so a switch turned off is heard at once.
- While the box rests, reads let it rest. The list, a chat's lines, read
  marks, the trays, the pins and sections, the language and the Mac's window
  focus fail at once (`command(_:_:wakes: false)`, `GatewayError.resting`):
  the app shows what it kept and the server's copy, with no error, and reads
  them again when the stream comes back. What a chat reads as it opens and
  keeps nothing of ("/" and "@", the Org Chart's switch, pictures, file
  cards) waits for the box instead (`commandWhenAwake`), and is read once it
  wakes for its work. Anything the person does (a message, a call, a screen,
  older lines scrolled up to, "/", Settings) wakes it through EnsureSandBox,
  as before.
- A new account (no box in the record) gets the first run without its
  computer being made at sign-in: the hand-off makes it, tells it the
  language, then makes Simeon (its first task). A box made and since removed
  reads as asleep, so an account that used Simeon never sees the first run
  again. Asleep with no agents kept or in the server's copy, the first run's
  question is asked of the computer, waking it, as before.
- An app open when the switch goes on keeps the computer awake until it is
  quit and opened again (12 November 2026, the founder's Mac). It hears the
  switch only in EnsureSandBox's answer (`Gateway.swift`, `answered`;
  `gateway.ts`), and asks again only when the computer stops answering, which
  a computer it keeps awake never does. The first launch after that still
  opens its event stream (and the Mac's hands may open theirs) on the
  address kept from before, which says nothing about sleep: such a stream
  holds the computer until it drops (the network, or a deploy of the API),
  as the app reads the broker's answer only for what it opens next. So after
  switching it on: quit Simeon on the Mac (and on Windows), close the iPhone
  app from the app switcher, reload the web page; then do it once more, or
  wait for the next deploy. `sand.box.awake reason=attached` with
  `header_sent=False` (below) is such an app.
- The record says asleep from the moment the sleeper decides (12 November
  2026, `sand:box:sleeping:<box>` in Redis, two minutes). The app's stream
  drops while the computer is being stopped, and the app asks the record at
  once; it used to read "running", because the sleeper's write is committed
  only when its pass ends, and dialled, which woke the computer again. A
  computer woken since (its `last_active_at` later than the word) reads as
  running.
- The hands' ping (every 10 s, `local-exec/responses`) no longer wakes a
  computer asleep: only a batch with an answer in it does
  (`box_proxy.carries_an_answer`).

**What holds a computer awake (12 November 2026).** The engine's `/health`
says it (`busyReasons`, `desktop/source/host/host-busy.ts`), and the sleeper
logs it (`sand.box.awake`, below):

- `turn`: an agent's turn is running.
- `background-shell`: a command an agent left running in the background is
  running, or its result is awaited after a restart. It holds the computer
  for as long as it runs, quiet or not, since its end wakes the agent
  (12 November 2026, `docs/services-agents.md`, "A long command keeps running
  in the background"). The computer's runner stops a background command
  after two hours, so one not seen at work (started, watched again, output
  written, or a turn since) for two hours and ten minutes no longer holds the
  computer, which then sleeps by the usual rule; `/health` says
  `quietBackgroundShell: true` for it. Earlier on 12 November a command quiet
  for thirty minutes stopped counting, and a long quiet one (`az … --wait`)
  could be put to sleep under, its wake with it.
- `pending-wake`: a cloud agent's result is awaited.
- `revival`: a wake turn is delivering a finished task's result.
- `coding`: a cloud agent's coding runs on this computer.

An engine built before says only `isBusy`; the line then says
`busy=unknown`. `isBusy`, `busyOnlyAwaitingApproval` and `lastBusyAtMs` are
as before.

Switch it on only once the apps built with this have been tried on an
iPhone and a Mac. Off, nothing above changes.

**Not yet verified:** the copy, the messages and the computer used only
for runs have not run on a real computer, and the apps have not used them
on an iPhone or a Mac. What holds a computer awake, the background
command's limit, the record's early "asleep" and the ping that no longer
wakes (12 November 2026) have run in the engine's and the server's tests
only, not on a real computer nor with an app open.

### When it misbehaves

- On the API:
  - `sand.box.ensure` shows the box, server, `created` and `ready`. When it
    woke a sleeping box, also `woke=True`, `start_ms` (the server starting
    it: E2B's resume, Docker's start) and `wake_ms` (until the box answered
    its health check): what waking costs, measured (26 October 2026).
  - `sand.box.ensure.refused` says what is missing.
  - `sand.box.ensure.recreate` gives the reason with `stale_host` or
    `stale_image`. `credential_live=False` there is now rare: a sign-in after a
    sign-out logs `sand.box.credential_revived` instead and keeps the box.
  - `sand.box.ensure.token_rejected` means the container at the row's address
    answered the health check with 401: it runs with another gateway token
    than the row's, so it is not the row's container (a recreate and an
    ensure that created at once). It is replaced on the same volumes with
    fresh tokens, in that same ensure. `RecreateSandBox` takes the same
    one-at-a-time lock as ensure and answers "still starting" when it is held.
  - `sand.box.ensure.not_ready` means the box did not answer its health check
    within `BOX_READY_TIMEOUT` (the URL the API tried is in the line); the
    box is still handed to the app, which keeps retrying.
  - `sand.box.ensure.timeout` with `in_progress=true` means another request
    was already seeing to this person's box (one at a time, a
    transaction-scoped advisory lock); the app retries in five seconds. With
    `in_progress=false`, a database statement timed out inside ensure, and
    the session was rolled back before answering.
  - `sand.box.update_deferred` means a new version is waiting for the box to
    be idle.
  - `sand.box.sleep`, just before the sleeper puts a box to sleep, says
    what it saw: `idle_minutes`, `idle_after_minutes`, `reachable`,
    `awaiting_approval`, whether the update check ran (`update_checked`),
    `out_of_date` with each `stale_*`, `update_sent_before` (sent
    within the last 10 minutes, so not sent again), and
    `quiet_background_shell` (a command left running, quiet for 30
    minutes; None from an older engine). Read this first when a box isn't
    updated.
  - `sand.box.awake` says why the sleeper left a running box awake, once
    every 10 minutes per box and reason, with `sleeps_with_app_open` (the
    worker's switch). Read this first when a box never sleeps.
    - `reason=busy`: the box says it works; `busy` is its `busyReasons`
      (`turn`, `background-shell`, `pending-wake`, `revival`, `coding`,
      above), `unknown` from an engine older than 12 November 2026.
    - `reason=attached`: an app holds it through the proxy. `attached_by`
      is the connection that marked it last (`events`, `local-exec`,
      `webauthn`, `command`, `health`, `avatar`, `screen`, `tunnel`,
      `other`; `unknown` for a mark made before 12 November 2026) and `path`
      its path on the box. `header_sent=False`: the app did not say it lets
      the box sleep (open since before the switch, or built before 26
      October 2026: quit and reopen it), or it is a screen being watched,
      which always holds it. `header_sent=True`: the API's own
      `SIMEON_BOX_SLEEPS_WITH_APP_OPEN` is off.
    - `reason=idle`: idle for `idle_seconds`, not yet `idle_after_seconds`,
      with `quiet_background_shell`.
  - `sand.box.update_skipped` (`reason=unreachable`) means the sleeper found
    the box out of date but could not reach it, so its backup can't be
    brought up to date; it says so every 10 minutes at most.
  - `sand.box.update_idle` (with `stale_host`, `stale_image`, `stale_store`
    and `awaiting_approval`) means the sleeper found the box idle, with no app on it, and out of date,
    and sent it to be replaced; `sand.box.update_idle.done` with
    `outcome=ensured` follows, then the usual `sand.box.ensure.recreate`.
    `sand.box.update_idle.failed` gives the reason it was left as it was
    (tried again after 10 minutes).
  - `sand.box.capacity.refused` and `sand.box.placed` cover placement.
  - `sand.box.proxy.refused` and `sand.box.proxy.unreachable` cover the proxy.
  - `sand.box.proxy.sandbox_gone` means E2B said "The sandbox was not found"
    (the box asleep, frozen, or being replaced). With `replaced=true` the
    request went again to the box an ensure left. An answer to the box's own
    request (a command's output from the Mac on `local-exec/responses`, or a
    passkey on `webauthn/responses`) also wakes it (28 October 2026, after
    Nora's Stripe check was left waiting on an answer refused while her box
    slept), unless it carries only the hands' ping and hello (12 November
    2026): `sand.box.proxy.woke` gives what the wake did (`woken`, `awake`,
    `ensuring`, `no-box`, `deferred`), and the answer is sent again for up to
    40 s until the box takes it. `sand.box.proxy.wake_failed` gives E2B's
    refusal. On the Mac, a batch the box did not take is kept and sent again
    for about two minutes; `[local-exec-provider] dropping … after 6 retries`
    in the Mac's log means it never got through.
- For the bundle: `sand.box.bundle.version` shows a new version was read, and
  `sand.box.bundle.pointer_unread` shows the version file could not be read.
- For backups: `sand.box.store` (with `restore=always|fresh|none`) for every
  container made with backups on; `sand.box.store.flush` with `flushed=` before
  a container is replaced; `sand.box_store.head_failed` when S3 could not say
  whether a backup exists; `sand.box.store.clear_failed` when a reset could not
  empty the backup. In the box, `[box-store-restore]` and `[box-store-sync]`
  lines in `/tmp/sand-host.log`, and the copy itself in `/tmp/sand-copy-in.log`
  (`[box-copy-in] result outcome=hydrated`).
- On the worker: `sand.box.awake` and `sand.box.sleep` (both above, the
  sleeper runs there), `sand.box.hibernated`, `sand.box.sleeper`,
  `sand.box.sleep.failed`, `sand.box.woken` (with `start_ms`, the server
  starting it), `sand.box.wake.deferred`, and `sand.box.sleep.deferred`
  with `reason=inbox` (a message written in an app waits for the box) or
  `reason=unreachable` (the box did not answer its health check, so it may be
  busy: it sleeps only once idle for `SIMEON_BOX_IDLE_HIBERNATE_AFTER`).
- In the box, `/tmp/sand-host.log`:
  - `[simeon] box-stream guarded on …` shows the stream guard is up.
  - `inference credential renewed with the box's own credential` shows the
    renewal worked.
- On the server machine, `docker ps` shows the container.

**Not yet verified:** the cloud computer has been tested against two real
Docker Engines, but has not run in the packaged app on a Mac. Sleep and wake
have not run against the production VM. Backups have been tested against a
local S3 and with the engine's tests, not yet on a real computer with a real
bucket; old files in the bucket are never cleaned up yet (the box only adds).

## 5. The Mac app's releases

The download on simeonlabs.com and the update an installed app pulls
(`server/simeon/desktop/releases.py`, 5 October 2026).

### How it works

A release is made on a Mac (`docs/building-the-app.md`, "A signed release
for other Macs") and its folder uploaded to the public bucket
(`simeonlabs-files-public` in production):
`releases/darwin-arm64/<version>/` holds the `.dmg`, the `.zip`,
`release.json` and `feed.json`, and `release.json` is copied once more to
`releases/darwin-arm64/latest.json`. The server reads only `latest.json`
(over HTTPS, cached five minutes) and builds the file URLs from the
bucket's address and the version.

- `GET /desktop/download/mac` sends the browser to the latest `.dmg`
  (302); the website's Download buttons point here. 404 with a sentence
  until a release is uploaded.
- `GET /desktop/download/mac/latest` is the latest release as JSON.
- `GET /desktop/api/update/{platform}/{app}/{version}/{machine}/{channel}`
  answers the app's updater in Squirrel.Mac's shape: 204 when the
  installed version is the latest, else the `.zip` URL and the version.
  The app carries `SAND_UPDATE_FEED_BASE_URL=https://api.simeonlabs.com/desktop`
  in its bundle (`desktop/scripts/lib/config.mjs`, `packagedEnvironment`)
  and checks thirty seconds after launch and hourly after that.

### Settings on Render

- `SIMEON_DESKTOP_RELEASES_BASE_URL`: where the release folders are
  served from. Unset, the public bucket's `releases/` folder
  (`S3_FILES_PUBLIC_BUCKET_NAME`).

### When it misbehaves

- `desktop.releases.index_failed` / `index_status` / `index_unreadable`
  in the API log: `latest.json` could not be read; the URL is in the
  line. The download answers 404 and the updater 204 until it can.
- A download that 404s right after an upload: the index is cached five
  minutes.

