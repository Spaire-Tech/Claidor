# Claidor's API, connected to Rakazo

**Written 18 September 2026. Every claim below is tied to a file or to a
command that was run. Where something was not run, it says so.**

Rakazo is bring-your-own-key. Claidor is not: it holds the Anthropic and
OpenAI keys, meters what a person spends, and stops them at their monthly
allowance. This document is how the two are joined, and what it costs.

---

## The short version

Rakazo already speaks to any OpenAI-compatible server. Claidor already is
one. So the connection is configuration on Rakazo's side and no fork of
their code at all — `rakazo/` stays byte-identical to the subtree merge.

| | |
|---|---|
| Base URL | `https://api.claidor.com/desktop/api/proxy/v1` |
| Model ids | `gpt-5.6-terra`, `gpt-5.6-luna` |
| API key | a Claidor personal access token carrying `model_proxy` |
| One deployment setting | `RAKAZO_OPENAI_COMPAT_ALLOW_PUBLIC=1` |

Two small things had to be added to **Claidor** to make that true. Both
are in `server/`, neither is in `rakazo/`:

1. **A credential a server can hold.** See "The one-hour problem" below.
2. **`GET /desktop/api/proxy/v1/models`.** Rakazo asks for the model list
   before anything else. Until now that GET fell through to the catch-all
   and answered 404, measured live on 18 September.

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

## How a person connects it

On the Rakazo deployment, once:

```env
RAKAZO_OPENAI_COMPAT_ALLOW_PUBLIC=1
```

`api.claidor.com` is a public hostname, and Rakazo blocks public model
endpoints unless that is set
(`rakazo/packages/adapters/src/openai-compatible-url.ts`,
`assertAllowedOpenAiCompatibleRequestUrl`). HTTPS is not optional either:
an endpoint that carries a key must be `https://`
(`assertHttpsForKeyedOpenAiCompatibleUrl`). Ours is.

Then, per person:

1. In Claidor, create a personal access token with the **model_proxy**
   scope. Copy it — it is shown once and stored only as a hash.
2. In Rakazo: **Connect a model** / **Settings → Models** →
   **OpenAI-compatible**.
3. Base URL: `https://api.claidor.com/desktop/api/proxy/v1`
4. Model: the list fills itself from `/models`. Pick `gpt-5.6-terra` for
   everyday work, `gpt-5.6-luna` for cheap and quick.
5. API key: the token from step 1.
6. Leave **Supports images** and **Supports thinking** off for now. See
   the next section for why.

The steps are Rakazo's own, from `rakazo/docs/self-host.md:215-234`.

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
