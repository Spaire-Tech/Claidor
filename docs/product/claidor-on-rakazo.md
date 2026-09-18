# Claidor's API, one model service, one voice

**Written 18 September 2026. Every claim below is tied to a file or to a
command that was run. Where something was not run, it says so.**

Rakazo is bring-your-own-key. Claidor is not: it holds the Anthropic and
OpenAI keys, meters what a person spends, and stops them at their monthly
allowance. This document is how the two were joined, and then how the
bring-your-own-key half was taken out.

---

## The short version

**One model service, internal, and no screen anywhere takes a key.** Set one
variable on the Rakazo deployment and every run uses Claidor:

```env
CLAIDOR_API_KEY=claidor_pat_…
RAKAZO_OPENAI_COMPAT_ALLOW_PUBLIC=1
```

| | |
|---|---|
| Base URL | `https://api.claidor.com/desktop/api/proxy/v1` (override: `CLAIDOR_API_BASE_URL`) |
| Model ids | `gpt-5.6-terra`, `gpt-5.6-luna` (override: `CLAIDOR_MODEL`, `CLAIDOR_MODELS`) |
| Key | a Claidor personal access token carrying `model_proxy` |

Two things were added to **Claidor** in `server/`:

1. **A credential a server can hold.** See "The one-hour problem" below.
2. **`GET /desktop/api/proxy/v1/models`.** An OpenAI-compatible client asks
   for the model list before anything else. That GET fell through to the
   catch-all and answered 404, measured live on 18 September.

And the model surface inside **`rakazo/`** was removed, which is the second
half of this document. That part is a real fork of their code: see "What it
costs at merge time".

---

## The one-hour problem, which is the only hard part

A Claidor desktop access token lives **one hour**
(`server/polar/config.py:188`, `DESKTOP_ACCESS_TOKEN_TTL`). The app
refreshes it behind the person's back and never notices.

Rakazo cannot. Its model connection is a base URL, a model id and **one
static key**, entered once and stored
(`rakazo/packages/adapters/src/pi-openai-compatible-provider.ts`,
`prepareOpenAiCompatibleConnect`; `rakazo/docs/self-host.md`, "Connect a
model"). There is no refresh loop for it to run. Paste a session token in
there and it works for an hour, then answers 401 in the middle of
somebody's conversation.

So the session token is the wrong credential, and no amount of
configuration fixes that. This is the one place the connection needed
real work rather than a setting.

**The answer was already in the repository.** Claidor ships
`claidor_pat_` personal access tokens
(`server/polar/personal_access_token/service.py`): user-scoped, revocable,
stored only as an HMAC, a year by default and two years at most. That is
exactly the shape a server wants. What was missing was a scope saying
"this token may spend the allowance and do nothing else".

- `Scope.model_proxy` — `server/polar/auth/scope.py`. The house already
  had this pattern: `redline_*` and `tieout_*` exist because the Word and
  PowerPoint panels are iframes that cannot hold a cookie session. Same
  reason, different client.
- `get_proxy_caller` — `server/polar/desktop/auth.py`. The proxy routes
  now take a `ProxyCaller` instead of a `DesktopSession`, and a
  `ProxyCaller` comes from either credential.
- Metering is unchanged. `DesktopUsage.session_id` has always been
  nullable and `record_usage` has always taken `UUID | None`, so a token
  caller meters against the same monthly allowance as the app. A second
  door that did not meter would be a hole, not a feature — there is a test
  for exactly that.

**The grant is deliberately narrow.** Every other route under `/desktop`
asks for a desktop session, and a token is not one. So a leaked
`model_proxy` token can spend an allowance and read nothing: not the
profile, not the quota, not memory. There is a test for that too.

---

## One model service, and no key fields

The founder, 18 September: *"remove their model you can add you key api logic
completely and make it a one api thing internal for me."*

So the bring-your-own-key surface is gone from `rakazo/`. Not disabled —
removed. What a person sees now: **Settings → Models** lists the models
Claidor serves and the deployment owner picks which one answers. Onboarding
has no model step at all. There is no provider list, no key field, no base
URL, no model-id probe and no OAuth, on web or on mobile.

**The seam this was built on is theirs, not a new one.**
`resolveDeploymentModel` (`packages/adapters/src/deployment-model.ts`) already
decided which provider a run falls back to when no user credential applies,
and `deploymentKeyFor` in `executor.ts` already fed it to runs. Two things
were missing and both are small: it carried no base URL, which an
OpenAI-compatible provider needs, and nothing stopped a user connecting their
own key beside it.

| What changed | Where |
|---|---|
| Claidor as the deployment model, with its base URL, winning over every other provider | `packages/adapters/src/deployment-model.ts` |
| The base URL travels with the key | `executor.ts` `deploymentKeyFor`, `apps/api/src/team-chat-judge.ts` |
| A model Claidor serves needs no credential | `packages/adapters/src/model-selection.ts` |
| Eight procedures deleted: `connect`, `credentials`, `probeOpenAiCompatible` and the five OAuth ones. `list` and `setDefault` remain | `packages/contracts/src/rpc.ts` |
| Their handlers deleted (145 lines); `list` returns Claidor's menu; `setDefault` writes `DeploymentSettings` instead of a credential row | `apps/api/src/router.ts` |
| The 1,173-line model overlay became a 170-line read-only pane | `apps/web/src/pages/ModelSettingsOverlay.tsx` |
| The onboarding model step deleted (288 lines of markup plus its state) | `apps/web/src/pages/Onboarding.tsx` |
| The 1,183-line mobile model screen became a 137-line pane | `apps/mobile/app/models.tsx` |
| Bot model pickers read the catalogue instead of credentials | `bot-panel.tsx`, `bot-settings.tsx` |
| Deleted outright | `model-auth.ts` and `use-model-oauth-signin.ts` (web), `model-auth.ts` (mobile), `model-oauth/model-probe/model-providers` (core), five e2e specs |

**`setDefault` had to change, not just survive.** It used to look up a
`userModelCredential` row and hang a `SpaceModelPreference` off it. There are
no credential rows any more, so it would have 404'd every time. It now writes
`DeploymentSettings.defaultModelProvider/defaultModelId`, which
`selectConfiguredModel` already reads before falling back to the environment —
no migration, and no new concept. It is deployment-owner only: one model
service, one allowance, one default. A bot can still be pointed at a different
model of its own through `bots.update`, unchanged.

**What was deliberately kept.** The bring-your-own-key path still exists
underneath and is used when `CLAIDOR_API_KEY` is blank, because
`rakazo/docs/agent-verification.md`'s offline harness and the eval runner
(`packages/testkit/src/cli/evals.ts`, which parses `ModelConnectInputSchema`)
must run with no Claidor account. Deleting it would have broken the one part
of their engineering worth copying. Voice, memory and integration keys are
untouched — those are separate features and the founder asked about the model.
Voice changed next, and is the section below.

## No model is named anywhere (18 September, second pass)

The founder, on seeing a model list in Settings: *"should not be anywhere. You
don't see this in grok bot. You dont see what they use. Its the same for us.
Please remove that from everywhere, research how we used to handle these two
models. It was cost efficient and made sense. Check caisra old code."*

They were right, and the archived Caisra code says so in its own words.
`git show 4118ac0f:rakazo/packages/core/src/caisra-settings.ts`:

> **And what is deliberately not here.** No Models group. There was one for a
> day … the founder: *"i told you only use my claude code account. i told you
> to remove that settings for api keys."* And on keys in general: *"my users
> should never put a key. everything happens under the hood. not a setting."*
> **Which models run is decided in code, through the metered proxy.**

It had a test to keep it that way: `expect(everything.some((row) =>
row.id.includes("model"))).toBe(false)`. I shipped a picker in the first pass.
That was a straight regression against a written decision.

**Removed:** the Models section in web Settings, the whole
`ModelSettingsOverlay`, the mobile Models screen and its route, the per-agent
model row on both agent panels, and `models.setDefault` from the contract, with
a test that fails if it returns. `models.list` survives because the app still
has to know what it is speaking to — capabilities, not choices — and is never
drawn as a menu.

### The cost design, which is what "made sense" meant

Claidor's catalogue does not name models to the app. It declares **roles**
(`server/polar/desktop/pricing.py`, `ModelRole`), and its reasoning is worth
quoting because it is the whole answer:

> The app does not choose a model per message — it cannot know how hard a task
> is before doing it, the extra round trip costs a beat in an app whose whole
> feel is timing, and a price that moves for reasons a person cannot see makes
> the usage meter untrustworthy. Instead there is one model they talk to and
> cheap ones for machinery they never see.

- `primary` — every reply the person reads. `gpt-5.6-terra`.
- `cheap` — sub-agents, compaction, memory flushes, heartbeats, titles,
  previews. Never read as "the agent". `gpt-5.6-luna`.
- `fallback` — when the primary's provider is down. Never shown, never a menu.

**Rakazo had no such notion**, checked rather than assumed: there is no
`smallModel`, `cheapModel` or `summaryModel` anywhere in their tree, and
`history-compaction.ts:258` says in its own comment that it matches *"normal
run model selection"*. So summarising a long thread — reading the whole
conversation back to write text nobody opens — ran on the everyday model.

`CLAIDOR_CHEAP_MODEL` now exists and compaction uses it, but only when the run
is already on this deployment's provider: a bot on somebody else's endpoint
keeps its own model, because our model id would mean nothing there.

## Three questions about the setup, answered from source

### `RAKAZO_OPENAI_COMPAT_ALLOW_PUBLIC=1` — what is that, and is it ours?

It is **their** variable, not ours, and the name goes away whenever the fork is
renamed; it is a string in their code, nothing more.

What it does: Rakazo refuses to send a model request to a public hostname
unless it is set (`packages/adapters/src/openai-compatible-url.ts`,
`assertAllowedOpenAiCompatibleRequestUrl`). It is an SSRF guard — without it a
misconfigured endpoint could be pointed at something internal.

**Is it still needed now that the connect screen is gone?** Yes, and I checked
rather than assumed: the guard is called from `createOpenAiCompatibleFetch`
(`pi-openai-compatible-provider.ts:167`), which wraps **every runtime request**,
not just the deleted connect flow. `api.claidor.com` is a public hostname, so
without the flag every model call is refused.

### `CLAIDOR_API_KEY` — what is it, where from, is it needed?

It is a Claidor **personal access token** carrying the `model_proxy` scope. You
make one in Claidor's own dashboard: Settings → access tokens
(`clients/apps/web/src/components/Settings/AccessTokenSettings.tsx`, backed by
`POST /v1/personal_access_tokens`). Shown once, stored only as a hash.

**Is it needed?** Yes. Claidor's proxy authenticates every request
(`server/polar/desktop/auth.py`); without a bearer it answers 401. Something
has to carry one, and a token is the only credential a server can hold — the
app's session token expires in an hour.

**But one thing about it is worth deciding rather than discovering.** Usage
meters against the token's owner (`record_usage(user_id=caller.user.id)`), and
the monthly allowance is that account's (`DESKTOP_MONTHLY_CREDITS`, 3,000,000
credits). So **one `CLAIDOR_API_KEY` means the whole deployment spends one
Claidor account's allowance**, however many people use it. That is probably
what you want while you are the only user and you are paying. It stops being
what you want the moment you have customers who should each have their own
allowance — at which point Rakazo would need to mint a token per person, which
is a build, not a setting. Not started.

### The `/models` endpoint I added to Claidor is now unused

Commit `d9a10d62` added `GET /desktop/api/proxy/v1/models` because Rakazo's
Connect screen probed it. That screen is deleted, and
`probeOpenAiCompatibleModels` now has no callers anywhere. The endpoint still
works and is still the honest answer to "what do you serve", but nothing in
Rakazo calls it today. Said here rather than left to be found.

## The voice, the same way

The founder, 18 September: *"Let eleven labs be the main voice provider. I
already have the key on render."*

**ElevenLabs was already a first-class adapter in the fork** —
`packages/adapters/src/elevenlabs-voice.ts`, 128 lines, Flash v2.5 for speech
and `scribe_v1` for transcription — alongside OpenAI, Cartesia and Fish Audio.
What did not exist was any way for the deployment to hold the key. Every voice
key was a per-user `UserVoiceCredential` row, entered on a screen. So this was
the same job as the model, with one extra piece.

| What changed | Where |
|---|---|
| `resolveDeploymentVoice()`: ElevenLabs by default, keyed from `ELEVENLABS_API_KEY`, a row per provider | `packages/adapters/src/deployment-voice.ts` (new) |
| Every voice path resolves the deployment's voice before any per-user row | `apps/api/src/voice.ts` `loadVoiceCredential` |
| `voice.connect` and `voice.credentials` deleted; `catalog`, `status`, `setVoice`, `voices`, `prepare` remain | `packages/contracts/src/rpc.ts` |
| Their handlers and `persistVoiceCredential` deleted | `apps/api/src/router.ts`, `voice.ts` |
| The 317-line voice overlay became a voice picker with a sample button | `apps/web/src/pages/VoiceSettingsOverlay.tsx` |
| The 265-line mobile voice screen became the same | `apps/mobile/app/voice.tsx` |
| The e2e that connected a key now asserts there is no field to connect one | `apps/web/e2e/voice.spec.ts`, `group-chats.spec.ts` |

**The extra piece: a migration.** `voice.setVoice` wrote a
`SpaceVoicePreference`, whose `credentialId` is a non-null foreign key to
`UserVoiceCredential`. With no credential rows it would have failed exactly as
`models.setDefault` would have. The model had somewhere to go —
`DeploymentSettings` already had `defaultModelProvider`/`defaultModelId`. Voice
had nothing, so `defaultVoiceId` was added:
`packages/db/prisma/migrations/20260918120000_deployment_default_voice`, one
nullable text column, hand-written in their style. **It has not been applied
anywhere.** The API runs `prisma migrate deploy` before it serves, so a
deployment picks it up on the next start; nothing here has a database to try it
against.

**What is kept.** All four adapters. `VOICE_PROVIDER` plus that provider's own
key switches between them, and a provider named without its key yields no voice
rather than another vendor's. The scripted provider still speaks with no key
at all under `AGENT_RUNTIME=scripted`, which is how the e2e suite runs.

**One bug this caught in my own code.** The first version of
`resolveDeploymentVoice` read `AGENT_RUNTIME` from `process.env` through their
`scriptedVoiceEnabled()` while taking `env` as a parameter for everything else.
The test suite runs with `AGENT_RUNTIME=scripted`, so it answered "scripted" to
every question and six of seven new tests failed. It reads the env it is handed
now. Worth recording because the failure was loud; a function that is pure
except for one line is the shape that hides this.

### What it costs at merge time

This is the first change that touches their apps. Before it, our whole
conflict surface was seven files. It is now considerably larger: `apps/web`,
`apps/mobile`, `apps/api`, `packages/contracts`, `packages/core` and
`packages/adapters` all carry edits. Upstream ships roughly 24 commits a day,
so a `git subtree pull` will now conflict where it used not to. That is the
price of the founder's decision and it was made knowingly; it is written here
so nobody is surprised by it later.

---

## How it is set up

1. In Claidor, create a personal access token with the **model_proxy** scope.
   Copy it — it is shown once and stored only as a hash.
2. On the Rakazo deployment, set `CLAIDOR_API_KEY` to it and
   `RAKAZO_OPENAI_COMPAT_ALLOW_PUBLIC=1`.
3. That is all. Nobody signing in is asked for anything.

`api.claidor.com` is a public hostname, and Rakazo blocks public model
endpoints unless that flag is set
(`rakazo/packages/adapters/src/openai-compatible-url.ts`,
`assertAllowedOpenAiCompatibleRequestUrl`). HTTPS is not optional either: an
endpoint that carries a key must be `https://`
(`assertHttpsForKeyedOpenAiCompatibleUrl`). Ours is.

---

## What does not work, and why

Said plainly, because finding these out by hitting them is worse.

**Claude is not reachable from Rakazo.** `claude-sonnet-5` is in the
catalogue and works from our own app, but an OpenAI-compatible client
speaks one wire — Chat Completions — and nothing in the proxy translates a
Chat Completions request into an Anthropic one
(`server/polar/desktop/endpoints.py`, the `_WIRES` table and the note
above it). Ask for Claude over this connection and you get a 400 that says
so. That is why `/models` lists only the two GPTs: a menu offering a dish
the kitchen refuses is worse than a short menu.

Making Claude reachable is a real build — a translation layer between the
two request shapes and the two streams — not a setting. It is not started.

**`gpt-6-astra` is priced but not offered.** It has no role, so
`offered_models()` leaves it off every menu including this one
(`server/polar/desktop/pricing.py`, the comment on the Astra entry). An
old config naming it still meters correctly.

**Thinking is off.** Our Chat Completions wire sends
`reasoning_effort: "none"` whenever an OpenAI model carries tools, because
OpenAI refuses the two together on that endpoint. Turning on **Supports
thinking** in Rakazo would not change that. The wire that does carry both
is `/v1/responses`, which our proxy serves and Rakazo's OpenAI-compatible
provider does not speak.

**Nothing else of Claidor is connected.** Not memory sync, not the skill,
kit or MCP catalogues, not Pipedream connectors, not the maty job queue.
Rakazo has its own of each. This document is about the model proxy and
nothing more.

**Speech is reachable but unused.** `/api/proxy/v1/audio/speech` now takes
the same token, so a Rakazo deployment could point a speech provider at
it. Nothing does.

---

## What was run, and what was not

**Run, and passing:**

- `server`, the price module's own tests, 29 passed:
  `cd server && .venv/bin/python -m pytest --noconftest tests/desktop/test_pricing.py`
  Five of those are new and cover the model list. They were proved to bite
  by deleting the wire filter and watching three of them fail.
- The wire check, 8 checks, which drives **Rakazo's real adapter code**
  against a stand-in of our proxy whose model list is generated by our
  real `openai_models_list`:
  `rakazo/node_modules/.bin/tsx scripts/rakazo/wire-check.mts`
  It confirms the base URL survives their normaliser unchanged, their
  Connect step accepts it, their probe reads our list and sends the key as
  a Bearer, our 401 surfaces as a refusal, and both gates behave — public
  host blocked without the env var, `http://` with a key refused even with
  it.
- Live, unauthenticated, against `api.claidor.com` on 18 September:
  `POST /desktop/api/proxy/v1/chat/completions` → 401 (route is live),
  `GET /desktop/api/proxy/v1/models` → 404 **before this change**,
  `GET /desktop/api/models/pricing-catalog` → 200 listing
  `claude-sonnet-5`, `gpt-5.6-terra`, `gpt-5.6-luna`.

**Not run:**

- **The server's endpoint tests.** Nine new ones are written in
  `server/tests/desktop/test_endpoints.py` and they have never executed.
  They need Postgres, which needs Docker, which this container does not
  have; and they need a **final** Python 3.14, where this container can
  only get 3.14.0rc2 — on which pydantic 2.12 fails to import at all, the
  failure `server/CLAUDE.md` already warns about. Run them with
  `cd server && uv run task test tests/desktop/`.
- **A real request through the real proxy.** No model has been called
  through this connection by anybody. That needs a Claidor account, a
  minted token and a running Rakazo. Until somebody does it, this
  connection is designed and checked, not proven.

That last line is the honest state of it, and it is the rule from
`rakazo/docs/agent-verification.md`: missing live credentials mean **not
run**, not a pass.

---

## The first thing to do with a live deployment

In this order, because each step tells you which half failed:

1. `curl -H "Authorization: Bearer <token>" https://api.claidor.com/desktop/api/proxy/v1/models`
   — expect the two GPT ids. A 401 means the token lacks `model_proxy`.
2. Connect it in Rakazo and send one message.
3. Check the allowance moved: `/desktop/api/user/quota` in the app, or the
   `desktop_usages` row. A reply that costs nothing is not a discount, it
   is metering that has quietly stopped working.
4. If the model refuses, read the server log for
   `desktop.proxy.upstream_refused`. It carries the provider's own
   sentence. That one line has ended hours of guessing before.
