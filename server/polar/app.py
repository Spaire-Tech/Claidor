import asyncio
import contextlib
from collections.abc import AsyncIterator
from typing import TypedDict

import structlog
from fastapi import FastAPI
from fastapi.routing import APIRoute

from polar import worker  # noqa
from polar.api import router
from polar.auth.middlewares import AuthSubjectMiddleware
from polar.backoffice import app as backoffice_app
from polar.checkout import ip_geolocation
from polar.checkout_link.app import app as checkout_link_redirect_app
from polar.config import settings
from polar.exception_handlers import add_exception_handlers
from polar.health.endpoints import router as health_router
from polar.kit.cors import CORSConfig, CORSMatcherMiddleware, Scope
from polar.kit.db.postgres import (
    AsyncEngine,
    AsyncSessionMaker,
    Engine,
    SyncSessionMaker,
    create_async_sessionmaker,
    create_sync_sessionmaker,
)
from polar.logfire import (
    configure_logfire,
    instrument_fastapi,
    instrument_httpx,
    instrument_sqlalchemy,
)
from polar.logging import Logger
from polar.logging import configure as configure_logging
from polar.middlewares import (
    FlushEnqueuedWorkerJobsMiddleware,
    LogCorrelationIdMiddleware,
    PathRewriteMiddleware,
    SandboxResponseHeaderMiddleware,
)
from polar.oauth2.endpoints.well_known import router as well_known_router
from polar.oauth2.exception_handlers import OAuth2Error, oauth2_error_exception_handler
from polar.observability.http_middleware import HttpMetricsMiddleware
from polar.observability.remote_write import (
    start_remote_write_pusher,
    stop_remote_write_pusher,
)
from polar.observability.slo import start_slo_metrics, stop_slo_metrics
from polar.openapi import OPENAPI_PARAMETERS, APITag, set_openapi_generator
from polar.organization_custom_domain import cors as custom_domain_cors
from polar.platform.startup import verify_platform_setup
from polar.postgres import (
    AsyncSessionMiddleware,
    create_async_engine,
    create_async_read_engine,
    create_sync_engine,
)
from polar.posthog import configure_posthog
from polar.redis import Redis, create_redis
from polar.search.endpoints import router as search_router
from polar.sentry import configure_sentry
from polar.webhook.webhooks import document_webhooks

from . import rate_limit

log: Logger = structlog.get_logger()


def configure_cors(app: FastAPI) -> None:
    configs: list[CORSConfig] = []

    # Polar frontend CORS configuration
    # Always include FRONTEND_BASE_URL so the configured frontend origin is
    # allowed with credentials even when CORS_ORIGINS is not explicitly set
    # (e.g. sandbox environments where the origin would otherwise fall through
    # to the wildcard api_config which disallows credentials).
    frontend_origins = set(settings.CORS_ORIGINS) | {settings.FRONTEND_BASE_URL}
    if settings.STOREFRONT_BASE_URL:
        frontend_origins.add(settings.STOREFRONT_BASE_URL)

    def polar_frontend_matcher(origin: str, scope: Scope) -> bool:
        return origin in frontend_origins

    polar_frontend_config = CORSConfig(
        polar_frontend_matcher,
        allow_origins=list(frontend_origins),
        allow_credentials=True,  # Cookies are allowed, but only there!
        allow_methods=["*"],
        allow_headers=["*"],
    )
    configs.append(polar_frontend_config)

    # Creator custom storefront domains (learn.creator.com). The web app
    # sends credentials: 'include' on every request, and browsers reject
    # credentialed responses carrying the wildcard ACAO below — so active
    # custom domains need their own credentialed config. The matcher
    # consults an in-process set refreshed from the database (see
    # organization_custom_domain/cors.py); allow_origin_regex makes
    # starlette echo the matched origin back.
    custom_domain_config = CORSConfig(
        lambda origin, scope: custom_domain_cors.is_active_custom_domain_origin(origin),
        allow_origins=[],
        allow_origin_regex=".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    configs.append(custom_domain_config)

    # External API calls CORS configuration
    api_config = CORSConfig(
        lambda origin, scope: True,
        allow_origins=["*"],
        allow_credentials=False,  # No cookies allowed
        allow_methods=["*"],
        allow_headers=[
            "Authorization",
            "Content-Type",
        ],  # Allow Authorization and Content-Type headers for API calls
    )
    configs.append(api_config)

    app.add_middleware(CORSMatcherMiddleware, configs=configs)


def generate_unique_openapi_id(route: APIRoute) -> str:
    parts = [str(tag) for tag in route.tags if tag not in APITag] + [route.name]
    return ":".join(parts)


class State(TypedDict):
    async_engine: AsyncEngine
    async_sessionmaker: AsyncSessionMaker
    async_read_engine: AsyncEngine
    async_read_sessionmaker: AsyncSessionMaker
    sync_engine: Engine
    sync_sessionmaker: SyncSessionMaker

    redis: Redis
    ip_geolocation_client: ip_geolocation.IPGeolocationClient | None


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[State]:
    log.info("Starting Polar API")

    # Apply pending migrations before anything queries the database. This is
    # opt-in (MIGRATE_ON_STARTUP) for deploys that can only migrate after
    # shipping code — without it, new code would hit an un-migrated schema and
    # crash on boot. alembic is synchronous, so run it in a worker thread.
    if settings.MIGRATE_ON_STARTUP:
        from polar.migrate import upgrade_to_head

        await asyncio.to_thread(upgrade_to_head)

    # Start HTTP metrics pusher (if configured)
    # Use include_queue_metrics=False since queue metrics are worker-specific
    metrics_enabled = start_remote_write_pusher(include_queue_metrics=False)
    if metrics_enabled:
        log.info("prometheus_remote_write_enabled")

    # Initialize SLO target metrics for critical endpoints (refreshed every 5 minutes)
    start_slo_metrics()

    async_engine = async_read_engine = create_async_engine("app")
    async_sessionmaker = async_read_sessionmaker = create_async_sessionmaker(
        async_engine
    )
    instrument_engines = [async_engine.sync_engine]

    if settings.is_read_replica_configured():
        async_read_engine = create_async_read_engine("app")
        async_read_sessionmaker = create_async_sessionmaker(async_read_engine)
        instrument_engines.append(async_read_engine.sync_engine)

    sync_engine = create_sync_engine("app")
    sync_sessionmaker = create_sync_sessionmaker(sync_engine)
    instrument_engines.append(sync_engine)
    instrument_sqlalchemy(instrument_engines)

    redis = create_redis("app")

    # Prime the custom-domain CORS allow-list and keep it fresh (the CORS
    # matcher is synchronous, so it reads an in-process set).
    await custom_domain_cors.refresh_active_domains(async_read_sessionmaker)
    custom_domain_cors.start_refresher(async_read_sessionmaker)

    # Block boot if SPAIRE_PLATFORM_ORG_ID is set but the four tier
    # products haven't been seeded — without them new signups get
    # legacy entitlements and undercharged transaction fees.
    async with async_sessionmaker() as bootstrap_session:
        await verify_platform_setup(bootstrap_session)

    try:
        ip_geolocation_client = ip_geolocation.get_client()
    except FileNotFoundError:
        log.info(
            "IP geolocation database not found. "
            "Checkout won't automatically geolocate IPs."
        )
        ip_geolocation_client = None

    log.info("Polar API started")

    yield {
        "async_engine": async_engine,
        "async_sessionmaker": async_sessionmaker,
        "async_read_engine": async_read_engine,
        "async_read_sessionmaker": async_read_sessionmaker,
        "sync_engine": sync_engine,
        "sync_sessionmaker": sync_sessionmaker,
        "redis": redis,
        "ip_geolocation_client": ip_geolocation_client,
    }

    # Stop background threads
    await custom_domain_cors.stop_refresher()
    stop_slo_metrics()
    stop_remote_write_pusher()

    await redis.close(True)
    await async_engine.dispose()
    if async_read_engine is not async_engine:
        await async_read_engine.dispose()
    sync_engine.dispose()
    if ip_geolocation_client is not None:
        ip_geolocation_client.close()

    log.info("Polar API stopped")


def create_app() -> FastAPI:
    app = FastAPI(
        generate_unique_id_function=generate_unique_openapi_id,
        lifespan=lifespan,
        **OPENAPI_PARAMETERS,
    )

    if settings.is_sandbox():
        app.add_middleware(SandboxResponseHeaderMiddleware)
    if not settings.is_testing():
        app.add_middleware(rate_limit.get_middleware)
        app.add_middleware(AuthSubjectMiddleware)
        app.add_middleware(FlushEnqueuedWorkerJobsMiddleware)
        app.add_middleware(AsyncSessionMiddleware)
    app.add_middleware(PathRewriteMiddleware, pattern=r"^/api/v1", replacement="/v1")
    app.add_middleware(LogCorrelationIdMiddleware)
    if not settings.is_testing():
        app.add_middleware(HttpMetricsMiddleware)

    configure_cors(app)

    add_exception_handlers(app)
    app.add_exception_handler(OAuth2Error, oauth2_error_exception_handler)  # pyright: ignore

    # /.well-known
    app.include_router(well_known_router)

    # /healthz
    app.include_router(health_router)

    # /search
    app.include_router(search_router)

    if settings.BACKOFFICE_HOST is None:
        app.mount("/backoffice", backoffice_app)
    else:
        app.host(settings.BACKOFFICE_HOST, backoffice_app)

    if settings.CHECKOUT_LINK_HOST is not None:
        app.host(settings.CHECKOUT_LINK_HOST, checkout_link_redirect_app)

    app.include_router(router)
    document_webhooks(app)

    return app


configure_sentry()
configure_logfire("server")
configure_logging(logfire=True)
configure_posthog()

app = create_app()
set_openapi_generator(app)
instrument_fastapi(app)
instrument_httpx()
