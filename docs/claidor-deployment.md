# Claidor in production — the guide

Everything below assumes the accounts you already have: Render, Vercel, AWS,
Anthropic. Nothing here requires a new provider.

---

## Part 0 — The two decisions to make first

### Decision 1: what Claidor shares with Spaire, and what it must not

| Resource | Verdict | Why |
|---|---|---|
| **Postgres** | **Never shared.** Claidor gets its own database. | Both products run Alembic against a package named `polar`; pointed at one database they would fight over the same migration table and corrupt each other's schema. Independently: a dossier holds a client's confidential file, and it should not live in a database another product can read. |
| **S3 buckets** | **Never shared.** New buckets, new IAM user. | Same reason, sharper: case pieces are privileged material. The AWS *account* can be the same — the buckets and the credentials that reach them must not be. |
| **Redis** | Separate instance (free tier is fine). | Shareable in principle via a different DB index, but the queue and cache are cheap to isolate and a flush on one side should not touch the other. |
| **Anthropic key** | Share for now — as agreed. | Move to its own key when Claidor has customers, so usage and limits are attributable. |
| **Google OAuth client** | New client for Claidor. | Redirect URIs are per-client; a new one is free and keeps the consent screen honest about which product is asking. |
| **Resend / email domain** | New sending identity. | Login codes must arrive from Claidor, not from another brand. |

### Decision 2: domain, or proxy — this one is load-bearing

The session cookie is `SameSite=Lax`. A cookie set by the API is only sent
back when the browser considers the request same-site. So:

**`claidor.vercel.app` (frontend) + `claidor-api.onrender.com` (API) will not
hold a login.** Different registrable domains; the cookie is dropped, every
request looks logged out. `.vercel.app` is on the Public Suffix List, so a
shared cookie domain is not available either.

Two ways out:

**Option A — a domain (recommended, ~$10–15/year).**
Buy one (`claidor.app`, `claidorhq.com`, whatever is free), then:

- frontend → `app.claidor.xyz` (Vercel custom domain)
- API → `api.claidor.xyz` (Render custom domain)
- `CLAIDOR_USER_SESSION_COOKIE_DOMAIN=.claidor.xyz`

Same registrable domain, so `Lax` is satisfied and everything just works.
This is exactly how Spaire is set up with `api.spairehq.com`, and it is the
arrangement I would ship.

**Option B — no domain, proxy through Vercel (free).**
Keep `claidor.vercel.app` and make the API same-origin by rewriting
`/v1/*` to Render (config below). The browser sees one origin, the cookie is
first-party, `Lax` is satisfied.

- Cost: nothing.
- Caveat to know about: every API call takes an extra hop through Vercel's
  edge, and long requests (a dossier question can take 30–60 s) sit closer
  to platform timeouts. Fine for a demo, worth revisiting before real users.

Pick A if this is going in front of anyone who matters. Pick B to be live
today for nothing.

---

## Part 1 — What you do (about 45 minutes)

### 1. Secrets to generate

On your machine, in `server/`:

```bash
# JWKS (signing keys) — the whole JSON goes in CLAIDOR_JWKS
uv run python -m polar.kit.jwk claidor_prod

# Encryption key for stored credentials
uv run python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Keep the `kid` you passed (`claidor_prod`) — that is `CLAIDOR_CURRENT_JWK_KID`.

### 2. AWS — two buckets and a scoped user

In the AWS console (Spaire's account is fine):

1. Create buckets, in one region, e.g. `eu-west-3` (Paris — closest to your
   users and to where the data belongs):
   - `claidor-files` — **private**, block all public access. Dossier pieces
     live here.
   - `claidor-files-public` — public-read. Avatars and other non-sensitive
     assets.
2. Create an IAM user `claidor-app`, no console access, with an inline policy
   allowing `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`,
   `s3:ListBucket`, `s3:AbortMultipartUpload` **on those two buckets only**.
3. Add CORS to `claidor-files` so browser uploads work — allowed origins are
   your frontend URL, methods `GET, PUT, POST, HEAD`, allowed headers `*`.
4. Save the access key pair.

### 3. Google OAuth

Google Cloud console → Credentials → new OAuth client (Web application):

- Authorised redirect URI: `https://<API URL>/v1/integrations/google/callback`
- Authorised JavaScript origin: your frontend URL

### 4. Render — create the blueprint

`render.yaml` is committed at the repo root. Render dashboard → **New →
Blueprint** → pick `Spaire-Tech/Claidor` → apply. It creates:

- `claidor-api` (web, Docker, health check `/healthz`)
- `claidor-worker` (background jobs)
- `claidor-redis`
- `claidor-postgres`

Then fill the values marked `sync: false` (Render will prompt):

| Variable | Value (Option A / Option B) |
|---|---|
| `CLAIDOR_BASE_URL` | `https://api.claidor.xyz` / `https://claidor.vercel.app` |
| `CLAIDOR_FRONTEND_BASE_URL` | `https://app.claidor.xyz` / `https://claidor.vercel.app` |
| `CLAIDOR_ALLOWED_HOSTS` | `["api.claidor.xyz","app.claidor.xyz"]` / `["claidor.vercel.app","claidor-api.onrender.com"]` |
| `CLAIDOR_CORS_ORIGINS` | `["https://app.claidor.xyz"]` / `["https://claidor.vercel.app"]` |

> Both of these are **JSON arrays**, verified against the real config loader.
> A comma-separated list does not merely misbehave — the app refuses to
> start. Same for any other list-valued setting.
| `CLAIDOR_USER_SESSION_COOKIE_DOMAIN` | `.claidor.xyz` / `claidor.vercel.app` |
| `CLAIDOR_JWKS` | the JSON from step 1 |
| `CLAIDOR_CURRENT_JWK_KID` | `claidor_prod` |
| `CLAIDOR_ENCRYPTION_KEY` | from step 1 |
| `CLAIDOR_ANTHROPIC_API_KEY` | the key already in use |
| `CLAIDOR_GOOGLE_CLIENT_ID` / `_SECRET` | from step 3 |
| `CLAIDOR_AWS_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` / `_REGION` | from step 2 |
| `CLAIDOR_S3_FILES_BUCKET_NAME` | `claidor-files` |
| `CLAIDOR_S3_FILES_PUBLIC_BUCKET_NAME` | `claidor-files-public` |
| `CLAIDOR_EMAIL_SENDER` | `resend` (or `logger` to defer email) |
| `CLAIDOR_RESEND_API_KEY` | from Resend |
| `CLAIDOR_EMAIL_FROM_DOMAIN` | your verified sending domain |

Create an env group named `claidor-shared` holding everything except
`CLAIDOR_MIGRATE_ON_STARTUP`, so the worker inherits the same configuration
without a second copy to drift.

> A safety net you already have: in `production` the app **refuses to boot**
> if `CLAIDOR_SECRET` or `CLAIDOR_S3_FILES_DOWNLOAD_SECRET` are still their
> development defaults. If a deploy dies at startup with "Insecure default
> secret(s) detected", that is the guard doing its job, not a bug.

### 5. Vercel — the frontend

New project from the same repo:

- **Root directory**: `clients`
- **Framework**: Next.js
- **Build command**: `pnpm build --filter @polar-sh/web`
- **Output directory**: `apps/web/.next`

Environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.claidor.xyz` (A) or `https://claidor.vercel.app` (B) |
| `NEXT_PUBLIC_FRONTEND_BASE_URL` | your frontend URL |
| `S3_UPLOAD_ORIGINS` | `https://claidor-files.s3.<region>.amazonaws.com` |

**Option B only** — add to `clients/apps/web/next.config.mjs`:

```js
async rewrites() {
  return [
    {
      source: '/v1/:path*',
      destination: 'https://claidor-api.onrender.com/v1/:path*',
    },
  ]
}
```

### 6. Load the corpus — the one-off that makes it Claidor

A fresh database has the schema but no law in it. The corpus lives in the
repo (`corpus/raw/`), so load it from your machine against the production
database:

```bash
cd server
export CLAIDOR_ENV=production
export CLAIDOR_POSTGRES_HOST=<render external host>
export CLAIDOR_POSTGRES_PORT=5432
export CLAIDOR_POSTGRES_USER=<user>
export CLAIDOR_POSTGRES_PWD=<password>
export CLAIDOR_POSTGRES_DATABASE=claidor
# the read pool points at the same instance
export CLAIDOR_POSTGRES_READ_HOST=$CLAIDOR_POSTGRES_HOST
export CLAIDOR_POSTGRES_READ_PORT=$CLAIDOR_POSTGRES_PORT
export CLAIDOR_POSTGRES_READ_USER=$CLAIDOR_POSTGRES_USER
export CLAIDOR_POSTGRES_READ_PWD=$CLAIDOR_POSTGRES_PWD
export CLAIDOR_POSTGRES_READ_DATABASE=$CLAIDOR_POSTGRES_DATABASE

uv run python -m scripts.corpus_extract_pdfs   # normalize the PDF acts
uv run python -m scripts.corpus_load           # acts, decisions, citation graph
uv run python -m scripts.corpus_equivalences   # old ↔ new concordance
```

Expect roughly: 5,094 articles, 1,268 decisions, ~4,200 verified links. The
script is idempotent — safe to re-run after each new acquisition.

(Alternative for repeatability: extend the Docker build to include
`corpus/` and run these as Render Jobs. Loading from a laptop is fine while
the corpus changes by hand.)

### 7. First login

Visit the frontend, sign in with Google. The first user needs an
organization; create one through the dashboard, or seed one directly if the
onboarding screens are still the inherited ones.

---

## Part 2 — Verifying it actually works

Run these in order. Each one fails loudly if the step before it was wrong.

```bash
curl -s https://<API>/healthz                       # {"status":"ok"}
curl -s "https://<API>/v1/corpus/acts" | head -c 200   # 401 without a session — correct
```

Then, signed in through the browser:

1. **Library** loads and lists 11 acts across 17 versions.
2. **Search** — type `article 170 AUPSRVE`; both versions come back marked as
   exact hits. Type `CCJA 90/2018`; the decision comes back.
3. **Librarian** — ask a dated question; the answer streams with citations and
   an authority line.
4. **Dossiers** — create a matter, register a piece, ask a question; the
   answer opens with the fact and the pièce it came from.
5. **Reload the page.** Still signed in — this is the cookie check from
   Decision 2, and it is the one most likely to fail.

## Costs, honestly

| Item | Option A | Option B |
|---|---|---|
| Render web + worker | ~$14/mo (2 × starter) | same |
| Render Postgres | ~$6/mo (basic-256mb) | same |
| Render Redis | free | free |
| Vercel | free (Hobby) | free |
| S3 | pennies at this size | same |
| Domain | ~$12/year | — |
| Anthropic | usage; a few dollars a week at demo volume | same |

The free Render Postgres tier expires after 30 days, which is why the
blueprint asks for the smallest paid one — losing the corpus a month in
would be an avoidable annoyance.

## Things that will bite, in the order they usually do

1. **Login does not persist** → the cookie decision. Check
   `CLAIDOR_USER_SESSION_COOKIE_DOMAIN` matches the site the browser is on.
2. **CORS errors in the console** → `CLAIDOR_CORS_ORIGINS` must be a JSON
   array, and must be the frontend origin exactly, no trailing slash.
3. **`Invalid host header`** → add both hosts to `CLAIDOR_ALLOWED_HOSTS`.
4. **Uploads fail from the browser** → bucket CORS, not app config.
5. **The librarian answers "corpus_empty"** → step 6 was not run against this
   database.
6. **Migrations ran twice** → only the web service may have
   `CLAIDOR_MIGRATE_ON_STARTUP=true`.
