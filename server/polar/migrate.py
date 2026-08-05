"""Run database migrations from within the API process.

Used when MIGRATE_ON_STARTUP is set: the app applies `alembic upgrade head`
before it serves traffic. This suits deploys that can only migrate *after*
shipping code (no pre-deploy hook) — the new code never queries an
un-migrated schema because the upgrade runs first, in-process, at boot.
"""

import os

import structlog
from alembic.command import upgrade as alembic_upgrade
from alembic.config import Config

from polar.config import settings
from polar.logging import Logger

log: Logger = structlog.get_logger()

# server/ — alembic.ini and the migrations/ directory live here.
_SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _get_alembic_config() -> Config:
    config = Config(os.path.join(_SERVER_DIR, "alembic.ini"))
    # Absolute paths so it works regardless of the process's working directory.
    config.set_main_option(
        "script_location", os.path.join(_SERVER_DIR, "migrations")
    )
    # Escape %-signs so Alembic doesn't treat them as interpolation markers.
    dsn = settings.get_postgres_dsn("psycopg2").replace("%", "%%")
    config.set_main_option("sqlalchemy.url", dsn)
    return config


def upgrade_to_head() -> None:
    """Apply all pending migrations. Synchronous — call via a worker thread."""
    log.info("migrate_on_startup.begin")
    alembic_upgrade(_get_alembic_config(), "head")
    log.info("migrate_on_startup.done")
