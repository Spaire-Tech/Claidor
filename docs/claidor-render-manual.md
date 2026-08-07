# Setting Claidor up by hand on Render

An alternative to the blueprint, for when you would rather click through the
dashboard the way Spaire was set up. Same result; you just create the four
pieces yourself.

**The one mistake that ruins a copy-paste from Spaire:** every variable is
read with a `CLAIDOR_` prefix, not `SPAIRE_`. A wholesale copy leaves the app
reading *none* of them and booting on development defaults — at which point
the production guard refuses to start, which is the good outcome. Rename
every key.

---

## What to create

| Piece | Type | Notes |
|---|---|---|
| `claidor-postgres` | PostgreSQL 16 | plan `basic-256mb`; the free tier expires after 30 days |
| `claidor-redis` | Key Value | free plan, maxmemory policy `noeviction` |
| `claidor-api` | Web Service, Python 3 | **Root Directory `server`**, health check `/healthz` |
| `claidor-worker` | Background Worker, Python 3 | **Root Directory `server`**, same build, different start command |

Both services: repo `Spaire-Tech/Claidor`, branch `main`, auto-deploy on.

### Root Directory is the setting that breaks everything

Set it to `server` on **both** services. This is not cosmetic. The Python
project lives in `server/`, so a service left at the repository root fails
its very first build with:

```
error: No `pyproject.toml` found in current directory or any parent directory
```

The message reads like a missing file. It is a missing *directory setting* —
the file is there, one level down, and Render never looked.

### Build and start commands

Build, both services:

```
pip install uv && uv sync
```

Start — the API:

```
uv run uvicorn polar.app:app --host 0.0.0.0 --port $PORT
```

Use `$PORT`, not a hard-coded number: Render assigns it, and a service
listening anywhere else fails its health check while looking perfectly
healthy in the logs.

Start — the worker:

```
uv run dramatiq -p 2 -t 4 -f polar.worker.scheduler:start polar.worker.run
```

### About `task emails` in the build command

Render's suggested build command for this repo includes `uv run task emails`.
Leave it out for now, on both services.

That task builds the react-email renderer — `cd emails && pnpm i && pnpm run
build` — which needs Node and pnpm that the Python runtime does not provide
on its own, and produces a 108 MB binary that is git-ignored (so it is never
in the checkout; it has to be built or it does not exist). Adding minutes and
two more failure modes to every deploy buys nothing while
`CLAIDOR_EMAIL_SENDER=logger`.

What you give up by omitting it, precisely — because "emails are broken" is
too vague to plan around:

- **Google sign-in: unaffected.** No email is rendered anywhere in that flow.
- **Email login codes: will fail** at the moment of sending, with a clear
  `RuntimeError` naming the missing binary. `render_email_template` checks
  for the renderer at use rather than at boot, deliberately — a missing
  renderer must break sending an email, not starting the application.
- **Worker-side email** (organization invites, broadcasts, sequences) fails
  the same way. Claidor does not use these yet.

When email does matter, the build becomes `pip install uv && uv sync &&
corepack enable pnpm && uv run task emails` and the service needs Node —
`server/.nvmrc` pins 24 so Render provisions it under the `server` root.

---

## The environment, in three groups

### Group A — copy from Spaire, renaming the prefix

Only these carry over. Everything else is either new or irrelevant.

| Claidor key | Source |
|---|---|
| `CLAIDOR_ANTHROPIC_API_KEY` | Spaire's `ANTHROPIC_API_KEY` (note: no prefix on that one) |

That is genuinely the whole list. Everything else that looks copyable —
database, Redis, buckets, secrets, URLs — must be Claidor's own, or it is
not a separate product.

### Group B — new values

Paste these into Render's **Add from .env** box on each service (the API and
the worker need the same set, minus `CLAIDOR_MIGRATE_ON_STARTUP`, which is
`true` on the API and `false` on the worker — two processes running
migrations at once is how a schema ends up half-applied).

```dotenv
CLAIDOR_ENV=production
CLAIDOR_LOG_LEVEL=INFO
CLAIDOR_MIGRATE_ON_STARTUP=true

CLAIDOR_BASE_URL=https://api.claidor.com
CLAIDOR_FRONTEND_BASE_URL=https://app.claidor.com
CLAIDOR_ALLOWED_HOSTS=["api.claidor.com","app.claidor.com"]
CLAIDOR_CORS_ORIGINS=["https://app.claidor.com"]
CLAIDOR_USER_SESSION_COOKIE_DOMAIN=.claidor.com

CLAIDOR_SECRET=<generated>
CLAIDOR_S3_FILES_DOWNLOAD_SECRET=<generated>
CLAIDOR_JWKS=<generated, one long line>
CLAIDOR_CURRENT_JWK_KID=claidor_prod

CLAIDOR_GOOGLE_CLIENT_ID=<new OAuth client>
CLAIDOR_GOOGLE_CLIENT_SECRET=<new OAuth client>

CLAIDOR_AWS_ACCESS_KEY_ID=<claidor-app IAM user>
CLAIDOR_AWS_SECRET_ACCESS_KEY=<claidor-app IAM user>
CLAIDOR_AWS_REGION=eu-west-3
CLAIDOR_S3_FILES_BUCKET_NAME=claidor-files
CLAIDOR_S3_FILES_PUBLIC_BUCKET_NAME=claidor-files-public

CLAIDOR_EMAIL_SENDER=logger
CLAIDOR_EMAIL_FROM_NAME=Claidor
CLAIDOR_EMAIL_FROM_DOMAIN=claidor.com

CLAIDOR_ANTHROPIC_API_KEY=<from Spaire>

CLAIDOR_REDIS_DB=0
```

The database and Redis connection details are added separately — in the
dashboard, use **Add Environment Variable → From Database / From Service**
so Render fills and maintains them:

```
CLAIDOR_POSTGRES_HOST          claidor-postgres → host
CLAIDOR_POSTGRES_PORT          claidor-postgres → port
CLAIDOR_POSTGRES_USER          claidor-postgres → user
CLAIDOR_POSTGRES_PWD           claidor-postgres → password
CLAIDOR_POSTGRES_DATABASE      claidor-postgres → database
CLAIDOR_POSTGRES_READ_HOST     claidor-postgres → host
CLAIDOR_POSTGRES_READ_PORT     claidor-postgres → port
CLAIDOR_POSTGRES_READ_USER     claidor-postgres → user
CLAIDOR_POSTGRES_READ_PWD      claidor-postgres → password
CLAIDOR_POSTGRES_READ_DATABASE claidor-postgres → database
CLAIDOR_REDIS_HOST             claidor-redis → host
CLAIDOR_REDIS_PORT             claidor-redis → port
```

The read variables point at the same instance until there is a replica —
the app opens a separate read pool either way.

### Group C — do not copy; these do nothing here

Verified against the actual settings class, so this is not guesswork.

**Settings that do not exist in Claidor at all** — copying them is harmless
but misleading, and one of them sent us down a wrong path already:

`SPAIRE_ENCRYPTION_KEY`, `SPAIRE_HOST`, `SPAIRE_PORT`, `PORT`,
`SPAIRE_MUX_TOKEN_ID`, `SPAIRE_MUX_TOKEN_SECRET`,
`SPAIRE_MUX_WEBHOOK_SECRET`, `SPAIRE_YOUTUBE_API_KEY`,
`SPAIRE_COURSE_PREVIEW_SESSION_TTL`, `SPAIRE_DEMO_PORTAL_ORG_SLUG`,
`GOOGLE_GENERATIVE_AI_API_KEY`

**Settings that exist but Claidor does not use yet** — leave them unset;
they default safely:

- Billing: `STRIPE_*`, `S3_CUSTOMER_INVOICES_BUCKET_NAME`,
  `S3_PAYOUT_INVOICES_BUCKET_NAME`, `CHECKOUT_BASE_URL`,
  `STOREFRONT_BASE_URL`
- Other sign-in methods: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- Other providers: `OPENAI_API_KEY`, `OPENAI_MODEL`
- Support tooling: `PLAIN_TOKEN`, `PLAIN_REQUEST_SIGNING_SECRET`
- Storefront domains: `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`,
  `VERCEL_TEAM_ID`
- `TESTING` — never set this outside tests
- `PLATFORM_ORG_ID` — only meaningful once there is a platform org

---

## After the services are up

1. `claidor-api` → Settings → Custom Domains → add `api.claidor.com`, note
   the target Render shows.
2. DNS: `api` CNAME → that target; `app` CNAME → Vercel's target.
3. Vercel project: root directory `clients`, build
   `pnpm build --filter @polar-sh/web`, env `NEXT_PUBLIC_API_URL` and
   `NEXT_PUBLIC_FRONTEND_BASE_URL`.
4. Load the corpus (see `claidor-deployment.md`, step 7) — until then the
   librarian answers `corpus_empty`, because a fresh database has the
   schema but no law in it.

## Sanity checks, in order

```
curl https://api.claidor.com/healthz          # {"status":"ok"}
curl https://api.claidor.com/v1/corpus/acts   # 401 unauthenticated — correct
```

Then in the browser: sign in with Google, open the library (11 acts, 17
versions), search `article 170 AUPSRVE`, ask the librarian a dated
question — and **reload the page**. Still signed in is the real test; that
is the cookie arrangement working.
