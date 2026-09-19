# `app.claidor.com` — everything attached to it

A factual inventory, written to be handed to someone outside this repository.
Every line is either read from a file in this repository (cited) or measured
live from this container on 18 September 2026 (marked *measured*). Nothing here
is from memory, and the few things that could not be verified from here are
listed at the end as exactly that.

**Why it exists:** the founder was taking this hostname over for a different
application (the Rakazo build) and wanted an outside opinion on the consequences.

> **Outcome, re-measured 18 September 2026.** That did not happen, or was
> reverted. `app.claidor.com` resolves to `cname.vercel-dns.com` → `76.76.21.164`
> and answers `307 → /signup` with `server: Vercel` and Claidor's own
> `x-claidor-*` headers. The dashboard is on it. Nothing in §6 came to pass, and
> §7 — the reversal — is not needed. Other documents claimed the hostname had
> moved to a Hetzner server; they were wrong and have been corrected.
> The consequence analysis below is kept because it is the record of a decision
> that was weighed, and because §4 remains an accurate inventory of everything
> that names this hostname.

---

## 1. What the name is today

*Measured.*

```
app.claidor.com   →  64.29.17.1
api.claidor.com   →  216.24.57.16
claidor.com       →  does not resolve
www.claidor.com   →  does not resolve
```

Response headers from `https://app.claidor.com/`:

```
HTTP/2 307
location: /signup
server: Vercel
x-matched-path: /
x-vercel-id: iad1::iad1::…
```

So: a Next.js app on **Vercel**, redirecting anonymous visitors to `/signup`.
`api.claidor.com` answers `200` on `/healthz` and is on **Render**.

## 2. What it is

A Next.js 15 App Router application, source at `clients/apps/web`, inherited
from the Polar payments platform and carrying that heritage in its route tree.

Vercel project settings, from `docs/claidor-deployment.md` §6:

| Setting | Value |
|---|---|
| Root directory | `clients` |
| Framework | Next.js |
| Build command | `pnpm build --filter @polar-sh/web` |
| Output directory | `apps/web/.next` |

`clients/apps/web/vercel.json` overrides the build command to
`cd ../.. && turbo run build --filter=web` and sets `trailingSlash: false`.

Its three environment variables, same source:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.claidor.com` |
| `NEXT_PUBLIC_FRONTEND_BASE_URL` | `https://app.claidor.com` |
| `S3_UPLOAD_ORIGINS` | `https://claidor-files.s3.eu-west-3.amazonaws.com` |

## 3. Why this hostname and not another

`docs/claidor-deployment.md` §"Decision 2: the domain — this one is
load-bearing" records the reasoning, and it is the single most important thing
for an outside reader to understand:

> The session cookie is `SameSite=Lax`. A cookie set by the API is only sent
> back when the browser considers the request same-site. So:
> **`claidor.vercel.app` (frontend) + `claidor-api.onrender.com` (API) will not
> hold a login.** Different registrable domains; the cookie is dropped, every
> request looks logged out. `.vercel.app` is on the Public Suffix List, so a
> shared cookie domain is not available either.

The resolution was to put both halves under one registrable domain:

- frontend → `app.claidor.com`
- API → `api.claidor.com`
- `CLAIDOR_USER_SESSION_COOKIE_DOMAIN=.claidor.com`

The **leading dot** is what makes one session cookie valid on both subdomains.

## 4. Everything that names this hostname

Each of these is a configuration value somewhere outside this repository that
has `app.claidor.com` written into it.

### 4.1 Render — the API's environment (`render.yaml`, env var group `claidor-shared`)

Three values, verbatim:

```yaml
- key: CLAIDOR_FRONTEND_BASE_URL
  value: https://app.claidor.com
- key: CLAIDOR_ALLOWED_HOSTS
  value: '["api.claidor.com","app.claidor.com"]'
- key: CLAIDOR_CORS_ORIGINS
  value: '["https://app.claidor.com"]'
- key: CLAIDOR_USER_SESSION_COOKIE_DOMAIN
  value: .claidor.com
```

`CLAIDOR_ALLOWED_HOSTS` and `CLAIDOR_CORS_ORIGINS` must be **JSON arrays**; the
file's own comment says a comma-separated value makes the app refuse to start.

Both the API service and the worker read this group, so they cannot drift.

### 4.2 AWS S3 (`docs/claidor-deployment.md` §2)

Two buckets in `eu-west-3` (Paris):

- `claidor-files` — private, block all public access
- `claidor-files-public` — public-read

An IAM user `claidor-app`, no console access, with an inline policy allowing
`s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket`,
`s3:AbortMultipartUpload` **on those two buckets only**.

The relevant line for this question:

> Add CORS to `claidor-files` so browser uploads work — allowed origin
> `https://app.claidor.com`, methods `GET, PUT, POST, HEAD`, allowed headers
> `*`.

So the bucket's CORS policy names this exact origin. Browser uploads from any
other origin are refused by S3.

### 4.3 Google OAuth (`docs/claidor-deployment.md` §3)

A Google Cloud OAuth client (Web application) with:

- **Authorised redirect URIs** — both, on the *API* host, not this one:
  - `https://api.claidor.com/v1/integrations/google/login/callback`
  - `https://api.claidor.com/v1/integrations/google/link/callback`
- **Authorised JavaScript origin:** `https://app.claidor.com`

Only the JavaScript origin names this hostname. The redirect URIs are on
`api.claidor.com` and are unaffected by anything done to `app`.

The doc also gives a way to read the truth off the running system instead of
trusting the page:

```bash
curl -s -o /dev/null -w '%{redirect_url}\n' \
  'https://api.claidor.com/v1/integrations/google/login/authorize?return_to=/'
```

That prints the exact `redirect_uri` the API sends to Google, and its
`client_id`.

### 4.4 The Word add-in (`docs/pierce/worklog.md`)

The Office add-in's panel and its two manifests are served from this origin at
`/panel/manifest.xml` and `/panel/manifest.outlook.xml`.
`scripts/stamp-manifests.mjs` writes the deployment's origin into them:
`AppDomain` gets the bare origin, because **Office matches on domain, not
path**. The manifests validate against Microsoft's acceptance service at
version 1.0.0.0.

Anyone who has sideloaded that add-in has this origin baked into their
installed manifest.

### 4.5 DNS

One `CNAME` record for host `app`, pointing at Vercel's target
(`cname.vercel-dns.com`, per `docs/claidor-deployment.md` §5; Vercel confirms
the exact value). Vercel issues the TLS certificate automatically once the
record resolves.

## 5. What is actually served there

Routes under `clients/apps/web/src/app`, abbreviated to the ones that matter:

| Path | What it is |
|---|---|
| `/signup`, `/login`, `/login/code/verify` | Authentication |
| `/dashboard` | Entry point after sign-in |
| `/dashboard/[organization]` | **Archived.** Renders a static notice: *"The model review workspace is archived. Its code and record remain in this repository."* (Until 18 September that notice named a git tag `swens-final`, which does not exist — the repository has no tags. The tag name was removed from the page.) |
| `/dashboard/account/developer` | Personal access tokens — list, delete, and two create buttons |
| `/dashboard/account/preferences` | Account preferences |
| `/oauth2/authorize` | OAuth consent |
| `/checkout/*`, `/purchases/*`, `/[organization]/portal/*` | Inherited from the upstream payments platform; not part of this product |

**The consequential page is `/dashboard/account/developer`.** It holds:

- `ConnectWordSettings.tsx` — one button minting a token scoped `redline:read`,
  for the Word add-in.
- `ConnectAppSettings.tsx` — one button minting a token scoped `model_proxy`,
  which is the credential the new application needs in order to reach the model
  proxy at all.
- `AccessTokenSettings.tsx` — lists and deletes tokens; does not create them.

Tokens can only be minted from a signed-in browser session:
`server/polar/personal_access_token/service.py` refuses any caller that is not
one, so a token cannot mint another token. There is no CLI or API path that
avoids the browser.

## 6. Consequences of repointing this hostname

Stated as facts, not recommendations.

| # | What breaks | Severity, as judged by the founder |
|---|---|---|
| 1 | The token-minting page becomes unreachable, including the button for the credential the replacement application requires | **The only one that can strand you.** Mitigated entirely by minting the token before repointing; it is valid one year |
| 2 | Google sign-in for the dashboard — the authorised JavaScript origin no longer matches | Irrelevant while the dashboard has no users |
| 3 | Browser uploads to `claidor-files` — the bucket's CORS origin no longer matches | Irrelevant, same reason |
| 4 | The Word add-in's panel and manifests stop being served | Irrelevant, same reason |
| 5 | `CLAIDOR_ALLOWED_HOSTS` and `CLAIDOR_CORS_ORIGINS` name a host that is no longer the frontend | Stale config, not an outage |
| 6 | The `claidor_session` cookie is scoped to `.claidor.com`, so the browser sends it to whatever now answers on `app.claidor.com` | Not a break. It is a session credential being transmitted to an unrelated application, which reads and ignores it |

On (6), the specific mechanic worth an outside opinion: the cookie is named
`claidor_session`, set with domain `.claidor.com`, and a leading-dot cookie is
sent to the apex and **every** subdomain. Moving the replacement application to
a different subdomain does not avoid this. Only a different registrable domain
does, or narrowing `CLAIDOR_USER_SESSION_COOKIE_DOMAIN` to the single host that
needs it.

## 7. The reversal, if it is ever wanted

The Vercel project is not deleted by any of this — only the hostname is taken
off it. To bring the dashboard back under a different name:

1. Add e.g. `dash.claidor.com` to the same Vercel project.
2. Change `CLAIDOR_ALLOWED_HOSTS` and `CLAIDOR_CORS_ORIGINS` on Render to name
   that host.
3. Update the Google OAuth client's authorised JavaScript origin.
4. Update the S3 CORS rule on `claidor-files` if browser uploads are wanted.

## 8. Not verified from here

Listed so an outside reader knows the edges of this document.

- **The live Vercel project's settings.** Everything in §2 is from the
  repository's deployment guide, not read back from Vercel's dashboard. The
  guide is detailed and was written against the real setup, but it could have
  drifted.
- **The live S3 CORS rule and IAM policy.** From the same guide. Not read from
  AWS.
- **The live Google OAuth client.** Same. The guide provides the `curl` command
  in §4.3 to read the real value off the running API; it has not been run.
- **Whether anyone has the Word add-in installed.** The founder says there are
  no clients.
- **The actual Render environment.** `render.yaml` is the committed blueprint;
  values could have been edited in the dashboard afterwards.

Anyone advising on this should treat §1 (measured) as certain and §2–§5 as
"the repository's own record of how it was set up", which is the strongest
evidence available without the dashboard credentials.
