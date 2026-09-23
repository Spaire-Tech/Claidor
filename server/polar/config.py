import os
import tempfile
from datetime import timedelta
from enum import StrEnum
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID

from annotated_types import Ge
from pydantic import (
    AfterValidator,
    AliasChoices,
    BeforeValidator,
    DirectoryPath,
    Field,
    PostgresDsn,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict

from polar.enums import TaxProcessor
from polar.kit.address import Address, CountryAlpha2
from polar.kit.jwk import JWKSFile


class Environment(StrEnum):
    development = "development"
    testing = "testing"  # Used for running tests
    sandbox = "sandbox"
    production = "production"
    test = "test"  # Used for the test environment in Render


class EmailSender(StrEnum):
    logger = "logger"
    resend = "resend"


EMAIL_RENDERER_MISSING_MESSAGE = """The email renderer binary was not found at {path}.
Emails cannot be rendered until it is built:
    uv run task emails
(The Docker image builds it automatically.)"""


def _validate_email_renderer_binary_path(value: Path) -> Path:
    """Warn about a missing renderer; do not refuse to start.

    The renderer is a Node artifact used only when an email is actually
    rendered. Refusing to load settings without it meant the whole
    application — the librarian, the corpus, every dossier — could not boot
    on a deployment that has no email configured at all. The check now
    happens where the binary is used, so a missing renderer breaks sending
    email and nothing else.
    """
    if not value.is_file():
        import structlog

        structlog.get_logger().warning(
            "config.email_renderer_missing",
            path=str(value),
            impact="email sending will fail until this binary exists",
        )
    return value


def _seconds_or_timedelta(value: object) -> object:
    """Accept a bare number of seconds for a ``timedelta`` setting.

    Env vars arrive as strings, and pydantic's ``timedelta`` parser only
    accepts ISO-8601 durations (e.g. ``P90D``) — not a plain seconds string
    like ``"7776000"``. This coerces an int/float (or numeric string) to
    ``timedelta(seconds=...)`` while passing anything else through unchanged,
    so ISO-8601 and native ``timedelta`` values still work.
    """
    if isinstance(value, bool):
        return value
    if isinstance(value, int | float):
        return timedelta(seconds=value)
    if isinstance(value, str):
        try:
            return timedelta(seconds=float(value.strip()))
        except ValueError:
            return value
    return value


# A timedelta setting that also accepts a plain seconds value from the env.
SecondsTimedelta = Annotated[timedelta, BeforeValidator(_seconds_or_timedelta)]


env = Environment(os.getenv("CLAIDOR_ENV", Environment.development))
if env == Environment.testing:
    env_file = ".env.testing"
elif env == Environment.test:
    env_file = ".env.test"
else:
    env_file = ".env"
file_extension = ".exe" if os.name == "nt" else ""


class Settings(BaseSettings):
    ENV: Environment = Environment.development
    SQLALCHEMY_DEBUG: bool = False
    POSTHOG_DEBUG: bool = False
    LOG_LEVEL: str = "DEBUG"
    TESTING: bool = False

    # When true, the API runs `alembic upgrade head` at startup, before it
    # serves traffic or runs any query. Lets deploys that can only migrate
    # *after* shipping code (no pre-deploy hook) avoid the window where new
    # code hits an un-migrated schema. Opt-in so tests, CI and other
    # processes don't migrate implicitly. Set MIGRATE_ON_STARTUP=true on the
    # web service.
    MIGRATE_ON_STARTUP: bool = False

    WORKER_HEALTH_CHECK_INTERVAL: timedelta = timedelta(seconds=30)
    WORKER_MAX_RETRIES: int = 20
    WORKER_MIN_BACKOFF_MILLISECONDS: int = 2_000
    WORKER_PROMETHEUS_DIR: Path = Path(tempfile.gettempdir()) / "prometheus_multiproc"

    # Prometheus Remote Write (for pushing metrics to Prometheus or Grafana Cloud)
    PROMETHEUS_REMOTE_WRITE_URL: str | None = None
    PROMETHEUS_REMOTE_WRITE_USERNAME: str | None = None
    PROMETHEUS_REMOTE_WRITE_PASSWORD: str | None = None
    PROMETHEUS_REMOTE_WRITE_INTERVAL: Annotated[int, Ge(1)] = 15  # seconds

    WEBHOOK_MAX_RETRIES: int = 10
    WEBHOOK_EVENT_RETENTION_PERIOD: timedelta = timedelta(days=30)
    WEBHOOK_FAILURE_THRESHOLD: int = 10

    WORKER_DEFAULT_DEBOUNCE_MIN_THRESHOLD: timedelta = timedelta(seconds=15)
    WORKER_DEFAULT_DEBOUNCE_MAX_THRESHOLD: timedelta = timedelta(minutes=15)

    CUSTOMER_METER_UPDATE_DEBOUNCE_MIN_THRESHOLD: timedelta = timedelta(seconds=15)
    CUSTOMER_METER_UPDATE_DEBOUNCE_MAX_THRESHOLD: timedelta = timedelta(minutes=180)

    SECRET: str = "super secret jwt secret"
    JWKS: JWKSFile = Field(default="./.jwks.json")
    CURRENT_JWK_KID: str = "claidor_dev"
    WWW_AUTHENTICATE_REALM: str = "claidor"

    # JSON list of accepted CORS origins
    CORS_ORIGINS: list[str] = []

    ALLOWED_HOSTS: set[str] = {"127.0.0.1:3000", "localhost:3000"}

    # Base URL for the backend. Used by generate_external_url to
    # generate URLs to the backend accessible from the outside.
    BASE_URL: str = "http://127.0.0.1:8000"
    BACKOFFICE_HOST: str | None = None
    CHECKOUT_LINK_HOST: str | None = None  # e.g., "buy.claidorhq.com" in production

    # URL to the storefront app (space.claidorhq.com in production).
    # Added to CORS allowed origins with credentials.
    STOREFRONT_BASE_URL: str = ""

    # Creator custom storefront domains (learn.creator.com).
    # CNAME target creators must point their subdomain at.
    CUSTOM_DOMAIN_CNAME_TARGET: str = "domains.claidorhq.com"
    # DNS-over-HTTPS resolver used for domain verification (RFC 8484 JSON API).
    CUSTOM_DOMAIN_DOH_URL: str = "https://cloudflare-dns.com/dns-query"
    # Consecutive failed re-checks before an active domain is demoted to failed.
    CUSTOM_DOMAIN_FAILURE_THRESHOLD: int = 3
    # Vercel project-domains API, used to attach verified custom domains to
    # the web project so Vercel issues TLS certificates. Left empty, domain
    # provisioning is a logged no-op (local dev / other hosting).
    VERCEL_API_BASE_URL: str = "https://api.vercel.com"
    VERCEL_API_TOKEN: str = ""
    VERCEL_PROJECT_ID: str = ""
    VERCEL_TEAM_ID: str | None = None

    # URL to frontend app.
    # Update to ngrok domain or similar in case you want
    # working Github badges in development.
    FRONTEND_BASE_URL: str = "http://127.0.0.1:3000"
    FRONTEND_DEFAULT_RETURN_PATH: str = "/"
    CHECKOUT_BASE_URL: str = (
        "http://127.0.0.1:8000/v1/checkout-links/{client_secret}/redirect"
    )

    # User session
    USER_SESSION_TTL: timedelta = timedelta(days=31)

    # The desktop app (desktop/, the vendored LobsterAI app) signing in to
    # Claidor: the browser hands it a code, the code becomes a session,
    # the session meters model calls against a monthly allowance.
    DESKTOP_AUTH_CODE_TTL: timedelta = timedelta(minutes=5)
    DESKTOP_ACCESS_TOKEN_TTL: timedelta = timedelta(hours=1)
    DESKTOP_REFRESH_TOKEN_TTL: timedelta = timedelta(days=30)
    # Credits per calendar month per person; see polar.desktop.service.
    DESKTOP_MONTHLY_CREDITS: int = 3_000_000
    # Credits per sliding hour per person: the brake on a runaway turn.
    # 200,000 credits is about sixty cents at the price table. Measured
    # 22 September 2026: one unattended first-run loop spent 1.9M credits
    # in fifty minutes with nothing on screen (docs/product/spend-guards.md).
    DESKTOP_HOURLY_CREDITS: int = 200_000
    # One address per provider the catalogue names. The key that goes
    # with each is ANTHROPIC_API_KEY / OPENAI_API_KEY below; a provider
    # with no key is simply not offered in the app's model list, never an
    # error at the moment somebody sends a message.
    DESKTOP_ANTHROPIC_BASE_URL: str = "https://api.anthropic.com"
    DESKTOP_OPENAI_BASE_URL: str = "https://api.openai.com"

    # Apps through Composio (polar/desktop/composio.py). One key for the
    # whole of Claidor, held here and nowhere else: the desktop app never
    # sees it and never asks a person for one. Each account is a Composio
    # user of its own, named from the Claidor user id, so one person's
    # sign-ins are never another's. Left empty, the route answers 503
    # and the app says apps are not switched on yet.
    COMPOSIO_API_KEY: str = ""
    COMPOSIO_BASE_URL: str = "https://backend.composio.dev"

    # Connections (polar/connectors/, docs/maties/connectors.md). The
    # middleman that holds the sign-in plumbing for the forty services a
    # person connects an account to. Its developer token is project-wide
    # — it can reach every customer's accounts — so it is minted on the
    # server from these four values and never leaves it. Left empty, every
    # connector route answers 503 and says so: a missing secret must read
    # as « not configured here », never as a stack trace.
    PIPEDREAM_CLIENT_ID: str = ""
    PIPEDREAM_CLIENT_SECRET: str = ""
    PIPEDREAM_PROJECT_ID: str = ""
    # "development" (free, ten people) or "production". Their own word for
    # which set of a project's accounts a call is about; it is not
    # Claidor's CLAIDOR_ENV and the two move independently.
    PIPEDREAM_ENVIRONMENT: str = "development"
    # Who may use connections before there is a plan to buy (section 5 of
    # the note): the founder's account, and staff. The plan does the real
    # work once step 9 lands and this stays for staff. A JSON array of
    # email addresses, like every other list setting here — addresses and
    # not user ids, because whoever sets this is reading a Render dashboard
    # and knows their own address, while a user id means a database query
    # to find and one wrong character means a silent 402.
    CONNECTORS_ENTITLED_EMAILS: set[str] = set()

    # The cloud engine's queue (polar/maty/, docs/maties/cloud.md). The
    # runner service is the only thing that speaks /maty/runner, and it
    # does so with a shared secret of its own that belongs to no person:
    # CLAIDOR_MATY_RUNNER_TOKEN in the environment. Left empty, the runner
    # routes refuse everyone — a missing secret must never mean that
    # everybody is a runner.
    MATY_RUNNER_TOKEN: str = ""
    # How long a claim holds a job before the queue takes it back, and
    # therefore how long the job's token lives. Long enough for a
    # briefing, short enough that a dead runner is not missed for long;
    # the runner extends it with a heartbeat while it works.
    MATY_JOB_LEASE_TTL: timedelta = timedelta(minutes=10)
    # How many times one job is handed out before it stops and says so.
    MATY_JOB_MAX_ATTEMPTS: int = 3
    # The wait before a failed job is due again, doubling with each try.
    MATY_JOB_RETRY_BACKOFF: timedelta = timedelta(minutes=1)
    USER_SESSION_COOKIE_KEY: str = "claidor_session"
    USER_SESSION_COOKIE_DOMAIN: str = "127.0.0.1"

    # Customer session
    CUSTOMER_SESSION_TTL: timedelta = timedelta(hours=1)
    CUSTOMER_SESSION_CODE_TTL: timedelta = timedelta(minutes=30)
    CUSTOMER_SESSION_CODE_LENGTH: int = 6

    # Impersonation session
    IMPERSONATION_COOKIE_KEY: str = "claidor_original_session"
    IMPERSONATION_INDICATOR_COOKIE_KEY: str = "claidor_is_impersonating"

    # Login code
    LOGIN_CODE_TTL_SECONDS: int = 60 * 30  # 30 minutes
    LOGIN_CODE_LENGTH: int = 6

    # OAuth state
    OAUTH_STATE_TTL: timedelta = timedelta(minutes=10)
    OAUTH_STATE_COOKIE_KEY: str = "claidor_oauth_state"

    # App Review bypass (for testing login flow during Apple/Google app reviews)
    APP_REVIEW_EMAIL: str | None = None
    APP_REVIEW_OTP_CODE: str | None = None

    # Email verification
    EMAIL_VERIFICATION_TTL_SECONDS: int = 60 * 30  # 30 minutes

    # Checkout
    CHECKOUT_TTL_SECONDS: int = 60 * 60  # 1 hour
    IP_GEOLOCATION_DATABASE_DIRECTORY_PATH: DirectoryPath = Path(__file__).parent.parent
    IP_GEOLOCATION_DATABASE_NAME: str = "ip-geolocation.mmdb"

    # Database
    POSTGRES_USER: str = "claidor"
    POSTGRES_PWD: str = "claidor"
    POSTGRES_HOST: str = "127.0.0.1"
    POSTGRES_PORT: int = 5432
    POSTGRES_DATABASE: str = "claidor"
    DATABASE_POOL_SIZE: int = 5
    DATABASE_SYNC_POOL_SIZE: int = 1  # Specific pool size for sync connection: since we only use it in OAuth2 router, don't waste resources.
    DATABASE_POOL_RECYCLE_SECONDS: int = 600  # 10 minutes
    DATABASE_COMMAND_TIMEOUT_SECONDS: float = 30.0
    DATABASE_STREAM_YIELD_PER: int = 100

    POSTGRES_READ_USER: str | None = None
    POSTGRES_READ_PWD: str | None = None
    POSTGRES_READ_HOST: str | None = None
    POSTGRES_READ_PORT: int | None = None
    POSTGRES_READ_DATABASE: str | None = None

    # Redis
    REDIS_HOST: str = "127.0.0.1"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0

    # Emails
    EMAIL_RENDERER_BINARY_PATH: Annotated[
        Path, AfterValidator(_validate_email_renderer_binary_path)
    ] = (
        Path(__file__).parent.parent
        / "emails"
        / "bin"
        / f"react-email-pkg{file_extension}"
    )
    EMAIL_SENDER: EmailSender = EmailSender.logger
    RESEND_API_KEY: str = ""
    RESEND_API_BASE_URL: str = "https://api.resend.com"
    RESEND_WEBHOOK_SECRET: str = ""
    EMAIL_FROM_NAME: str = "Claidor"
    EMAIL_FROM_DOMAIN: str = "notifications.claidorhq.com"
    EMAIL_FROM_LOCAL: str = "mail"
    EMAIL_DEFAULT_REPLY_TO_NAME: str = "Claidor Support"
    EMAIL_DEFAULT_REPLY_TO_EMAIL_ADDRESS: str = "support@claidorhq.com"

    # Github App
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""

    # GitHub App for repository benefits
    GITHUB_REPOSITORY_BENEFITS_APP_NAMESPACE: str = ""
    GITHUB_REPOSITORY_BENEFITS_APP_IDENTIFIER: str = ""
    GITHUB_REPOSITORY_BENEFITS_APP_PRIVATE_KEY: str = ""
    GITHUB_REPOSITORY_BENEFITS_CLIENT_ID: str = ""
    GITHUB_REPOSITORY_BENEFITS_CLIENT_SECRET: str = ""

    # Discord
    DISCORD_CLIENT_ID: str = ""
    DISCORD_CLIENT_SECRET: str = ""
    DISCORD_BOT_TOKEN: str = ""
    DISCORD_BOT_PERMISSIONS: str = (
        "268435459"  # Manage Roles, Kick Members, Create Instant Invite
    )
    DISCORD_PROXY_URL: str = ""

    # Google
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # Microsoft — SharePoint and OneDrive as sources for a deal, through
    # Graph. Empty means the connector is not configured on this server,
    # which every screen and route says in those words rather than
    # offering a button that cannot work.
    #
    # `common` lets any work or school account connect; a single-tenant
    # deployment sets its own tenant id and nobody else's users can even
    # begin the flow.
    MICROSOFT_CLIENT_ID: str = ""
    MICROSOFT_CLIENT_SECRET: str = ""
    MICROSOFT_TENANT: str = "common"
    # Where Graph and the sign-in service are. Worth being settings rather
    # than constants for two reasons that are the same reason: a sovereign
    # cloud is a different hostname speaking the identical API (Graph for
    # US Government is `graph.microsoft.us`), and so is the stub in
    # `scripts/graph_stub.py`, which is how this connector gets exercised
    # end to end on a machine with no Microsoft tenant behind it.
    MICROSOFT_GRAPH_BASE: str = "https://graph.microsoft.com/v1.0"
    MICROSOFT_LOGIN_BASE: str = "https://login.microsoftonline.com"

    # Apple
    APPLE_CLIENT_ID: str = ""
    APPLE_TEAM_ID: str = ""
    APPLE_KEY_ID: str = ""
    APPLE_KEY_VALUE: str = ""

    # OpenAI — the organization-details validator (polar/organization/
    # ai_validation.py) and the desktop app's GPT models, which the model
    # proxy serves on this one key exactly as it serves Claude on the
    # Anthropic key below. Empty means the GPT entries are not offered.
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "o4-mini-2025-04-16"

    # Anthropic / Claude — powers AI features (email copy today; the legal
    # research assistant in Phase 1). When the key is empty, AI features are
    # treated as not configured and their endpoints return 503.
    #
    # Read from the unprefixed `ANTHROPIC_API_KEY` (the name the Anthropic SDK
    # itself uses, and what's set in the deployment env), falling back to the
    # `claidor_`-prefixed `CLAIDOR_ANTHROPIC_API_KEY` for consistency with the
    # rest of the settings. An explicit validation_alias overrides env_prefix.
    ANTHROPIC_API_KEY: str = Field(
        default="",
        validation_alias=AliasChoices("ANTHROPIC_API_KEY", "CLAIDOR_ANTHROPIC_API_KEY"),
    )
    # CourtListener (Free Law Project) — the clause failure registry's
    # source of court opinions. Search is open; fetching an opinion's text
    # needs this token. Empty means the registry can harvest candidates but
    # not read them, which the fetcher says out loud rather than storing
    # nothing and looking successful.
    COURTLISTENER_API_TOKEN: str = Field(
        default="",
        validation_alias=AliasChoices(
            "COURTLISTENER_API_TOKEN", "CLAIDOR_COURTLISTENER_API_TOKEN"
        ),
    )

    # Lifecycle email copy generation — short, creative generation that
    # benefits from the strongest model.
    EMAIL_COPY_MODEL: str = "claude-opus-4-8"

    # YouTube Data API v3 (public reads only, plain API key — no OAuth) —
    # powers the Masterclass Architect channel analysis. Empty key = the
    # Architect is not configured and its flows are disabled.
    # Proposal synthesis is the heart of the feature — strongest model.

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    # Stripe webhook secrets
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_CONNECT_WEBHOOK_SECRET: str = ""
    STRIPE_V2_WEBHOOK_SECRET: str = ""
    STRIPE_STATEMENT_DESCRIPTOR: str = "CLAIDOR"

    # Mux video
    # Signing key used to mint short-lived JWTs for signed playback URLs
    # (https://docs.mux.com/guides/secure-video-playback). When set, new
    # uploads use playback_policy=signed; legacy public assets keep working.

    # Numeral
    NUMERAL_API_KEY: str | None = None

    # Sentry
    SENTRY_DSN: str | None = None

    # Discord
    FAVICON_URL: str = "https://raw.githubusercontent.com/polarsource/polar/2648cf7472b5128704a097cd1eb3ae5f1dd847e5/docs/docs/assets/favicon.png"
    THUMBNAIL_URL: str = "https://raw.githubusercontent.com/polarsource/polar/4fd899222e200ca70982f437039f549b7a822ecc/clients/apps/web/public/email-logo-dark.png"

    # Posthog
    POSTHOG_PROJECT_API_KEY: str = ""

    # Loops
    LOOPS_API_KEY: str | None = None

    # Tinybird
    TINYBIRD_API_URL: str = "http://localhost:7181"
    TINYBIRD_API_TOKEN: str | None = None
    TINYBIRD_CLICKHOUSE_URL: str = "http://localhost:7182"
    TINYBIRD_CLICKHOUSE_USERNAME: str = "default"
    TINYBIRD_CLICKHOUSE_TOKEN: str | None = None
    TINYBIRD_WORKSPACE: str | None = None
    TINYBIRD_EVENTS_WRITE: bool = False
    TINYBIRD_EVENTS_READ: bool = False

    # Logo.dev (for company logo avatars)
    LOGO_DEV_PUBLISHABLE_KEY: str | None = None
    PERSONAL_EMAIL_DOMAINS: set[str] = {
        "gmail.com",
        "yahoo.com",
        "hotmail.com",
        "outlook.com",
        "aol.com",
        "icloud.com",
        "mail.com",
        "protonmail.com",
        "zoho.com",
        "gmx.com",
        "yandex.com",
        "msn.com",
        "live.com",
        "qq.com",
    }

    # Logfire
    LOGFIRE_TOKEN: str | None = None
    LOGFIRE_IGNORED_ACTORS: set[str] = {
        "organization_access_token.record_usage",
        "personal_access_token.record_usage",
    }

    # Plain
    PLAIN_REQUEST_SIGNING_SECRET: str | None = None
    PLAIN_TOKEN: str | None = None
    PLAIN_CHAT_SECRET: str | None = None

    # AWS (File Downloads)
    AWS_ACCESS_KEY_ID: str = "claidor-development"
    AWS_SECRET_ACCESS_KEY: str = "claidor123456789"
    AWS_REGION: str = "us-east-2"
    AWS_SIGNATURE_VERSION: str = "v4"

    # Downloadable files
    S3_FILES_BUCKET_NAME: str = "claidor-s3"
    S3_FILES_PUBLIC_BUCKET_NAME: str = "claidor-s3-public"
    S3_FILES_PRESIGN_TTL: int = 3600  # 60 minutes
    S3_FILES_DOWNLOAD_SECRET: str = "supersecret"
    S3_FILES_DOWNLOAD_SALT: str = "saltysalty"
    # Override to http://127.0.0.1:9000 in .env during development
    S3_ENDPOINT_URL: str | None = None

    MINIO_USER: str = "claidor"
    MINIO_PWD: str = "claidorclaidor"

    # Chargeback Stop
    CHARGEBACK_STOP_WEBHOOK_SECRET: str = ""

    # Invoices
    S3_CUSTOMER_INVOICES_BUCKET_NAME: str = "claidor-customer-invoices"
    S3_PAYOUT_INVOICES_BUCKET_NAME: str = "claidor-payout-invoices"
    INVOICES_NAME: str = "Claidor, Inc."
    INVOICES_ADDRESS: Address = Address(
        line1="1111B S Governors Ave",
        line2="# 47283",
        postal_code="19904",
        city="Dover",
        state="US-DE",
        country=CountryAlpha2("US"),
    )
    INVOICES_ADDITIONAL_INFO: str | None = (
        "[support@claidorhq.com](mailto:support@claidorhq.com)"
    )
    PAYOUT_INVOICES_PREFIX: str = "CLAIDOR-"

    # Bank transfer details shown on invoices (all optional; section hidden if INVOICES_BANK_NAME is unset)
    INVOICES_BANK_NAME: str | None = None
    INVOICES_BANK_ROUTING_NUMBER: str | None = None
    INVOICES_BANK_ACCOUNT_NUMBER: str | None = None
    INVOICES_BANK_SWIFT_CODE: str | None = None

    # Application behaviours
    API_PAGINATION_MAX_LIMIT: int = 100

    ACCOUNT_PAYOUT_DELAY: timedelta = timedelta(seconds=1)
    ACCOUNT_PAYOUT_MINIMUM_BALANCE: int = 1000

    _DEFAULT_ACCOUNT_PAYOUT_MINIMUM_BALANCE: int = 1000
    ACCOUNT_PAYOUT_MINIMUM_BALANCE_PER_PAYOUT_CURRENCY: dict[str, int] = {
        "all": 4000,
        "amd": 4000,
        "aoa": 3000,
        "azn": 4000,
        "bam": 4000,
        "bob": 4000,
        "btn": 4000,
        "chf": 1500,
        "clp": 4000,
        "cop": 5000,
        "eur": 1300,
        "gbp": 1500,
        "gmd": 4000,
        "gyd": 4000,
        "khr": 4000,
        "krw": 4000,
        "lak": 4000,
        "mdl": 4000,
        "mga": 4000,
        "mkd": 4000,
        "mnt": 4000,
        "myr": 4000,
        "mzn": 4000,
        "nad": 4000,
        "pyg": 4000,
        "rsd": 4000,
        "thb": 4000,
        "twd": 4000,
        "uzs": 4000,
        # USD, default
        "usd": _DEFAULT_ACCOUNT_PAYOUT_MINIMUM_BALANCE,
    }
    # Global default transaction fee. This is the rate applied to any
    # Account whose per-account fee columns are unset — i.e. the Legacy /
    # un-converted / churned state — so it is deliberately the *worst*
    # rate we charge (5% + 50¢). Paid tiers write their own lower rates
    # onto the Account via polar.platform.fee_sync; Starter is 4% + 40¢,
    # Studio 3.8% + 35¢, Scale 3.5% + 30¢.
    PLATFORM_FEE_BASIS_POINTS: int = 500
    PLATFORM_FEE_FIXED: int = 50

    # The Organization that represents Claidor itself. This org sells the
    # Starter/Studio/Scale subscriptions to every other creator org, and
    # every creator org is a Customer of it. Unset = no tier billing is
    # wired up (single-tenant / development).
    PLATFORM_ORG_ID: UUID | None = None

    ORGANIZATION_SLUG_RESERVED_KEYWORDS: list[str] = [
        # Landing pages
        "benefits",
        "donations",
        "issue-funding",
        "newsletters",
        "products",
        "careers",
        "legal",
        # App
        "docs",
        "login",
        "signup",
        "oauth2",
        "checkout",
        "embed",
        "maintainer",
        "dashboard",
        "feed",
        "for-you",
        "posts",
        "purchases",
        "funding",
        "rewards",
        "settings",
        "backoffice",
        "maintainer",
        "finance",
        # Misc
        ".well-known",
    ]

    # Dunning Configuration
    DUNNING_RETRY_INTERVALS: list[timedelta] = [
        timedelta(days=2),  # First retry after 2 days
        timedelta(days=5),  # Second retry after 7 days (2 + 5)
        timedelta(days=7),  # Third retry after 14 days (2 + 5 + 7)
        timedelta(days=7),  # Fourth retry after 21 days (2 + 5 + 7 + 7)
    ]

    DEFAULT_TAX_PROCESSOR: TaxProcessor = TaxProcessor.stripe

    model_config = SettingsConfigDict(
        env_prefix="claidor_",
        env_file_encoding="utf-8",
        case_sensitive=False,
        env_file=env_file,
        extra="allow",
    )

    @property
    def redis_url(self) -> str:
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    def get_postgres_dsn(self, driver: Literal["asyncpg", "psycopg2"]) -> str:
        return str(
            PostgresDsn.build(
                scheme=f"postgresql+{driver}",
                username=self.POSTGRES_USER,
                password=self.POSTGRES_PWD,
                host=self.POSTGRES_HOST,
                port=self.POSTGRES_PORT,
                path=self.POSTGRES_DATABASE,
            )
        )

    def is_read_replica_configured(self) -> bool:
        return all(
            [
                self.POSTGRES_READ_USER,
                self.POSTGRES_READ_PWD,
                self.POSTGRES_READ_HOST,
                self.POSTGRES_READ_PORT,
                self.POSTGRES_READ_DATABASE,
            ]
        )

    def get_postgres_read_dsn(
        self, driver: Literal["asyncpg", "psycopg2"]
    ) -> str | None:
        if not self.is_read_replica_configured():
            return None

        return str(
            PostgresDsn.build(
                scheme=f"postgresql+{driver}",
                username=self.POSTGRES_READ_USER,
                password=self.POSTGRES_READ_PWD,
                host=self.POSTGRES_READ_HOST,
                port=self.POSTGRES_READ_PORT,
                path=self.POSTGRES_READ_DATABASE,
            )
        )

    @model_validator(mode="after")
    def _forbid_default_secrets_in_production(self) -> "Settings":
        """Refuse to boot in production with the built-in default secrets.

        These defaults are convenient for local/dev/test but are public
        knowledge. If one ever reached production, an attacker could forge
        customer session-code hashes, OAuth ``state`` JWTs, and signed
        downloadable URLs. Failing fast at startup is far safer than running
        with a forgeable secret.
        """
        if self.ENV == Environment.production:
            # Report the exact environment-variable names (with the configured
            # prefix, e.g. CLAIDOR_SECRET) so the fix is unambiguous.
            prefix = str(self.model_config.get("env_prefix", "")).upper()
            insecure: list[str] = []
            if self.SECRET == "super secret jwt secret":
                insecure.append(f"{prefix}SECRET")
            if self.S3_FILES_DOWNLOAD_SECRET == "supersecret":
                insecure.append(f"{prefix}S3_FILES_DOWNLOAD_SECRET")
            if insecure:
                raise ValueError(
                    "Insecure default secret(s) detected in production. Set "
                    f"{', '.join(insecure)} to strong, unique values in the "
                    "environment."
                )
        return self

    def is_environment(self, environments: set[Environment]) -> bool:
        return self.ENV in environments

    def is_development(self) -> bool:
        return self.is_environment({Environment.development})

    def is_testing(self) -> bool:
        return self.is_environment({Environment.testing})

    def is_sandbox(self) -> bool:
        return self.is_environment({Environment.sandbox})

    def is_production(self) -> bool:
        return self.is_environment({Environment.production})

    def is_test(self) -> bool:
        return self.is_environment({Environment.test})

    def generate_external_url(self, path: str) -> str:
        return f"{self.BASE_URL}{path}"

    def generate_frontend_url(self, path: str) -> str:
        return f"{self.FRONTEND_BASE_URL}{path}"

    def generate_backoffice_url(self, path: str) -> str:
        if self.BACKOFFICE_HOST is None:
            return self.generate_external_url(f"/backoffice{path}")
        return f"https://{self.BACKOFFICE_HOST}{path}"

    @property
    def stripe_descriptor_suffix_max_length(self) -> int:
        return 22 - len("* ") - len(self.STRIPE_STATEMENT_DESCRIPTOR)

    def get_minimum_payout_for_currency(self, currency: str) -> int:
        return self.ACCOUNT_PAYOUT_MINIMUM_BALANCE_PER_PAYOUT_CURRENCY.get(
            currency.lower(), self._DEFAULT_ACCOUNT_PAYOUT_MINIMUM_BALANCE
        )


settings = Settings()
