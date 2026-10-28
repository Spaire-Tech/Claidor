from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

SERVER = Path(__file__).resolve().parent.parent


def test_every_migration_name_fits_alembic_version() -> None:
    # `alembic_version.version_num` is 32 characters. A 33-character name
    # failed the upgrade on boot, which rolled back, and the deploy carrying
    # the sign-in fix never started (28 October 2026).
    config = Config(str(SERVER / "alembic.ini"))
    config.set_main_option("script_location", str(SERVER / "migrations"))
    names = [
        script.revision
        for script in ScriptDirectory.from_config(config).walk_revisions()
    ]
    too_long = [name for name in names if len(name) > 32]
    assert names
    assert too_long == []


def test_migrations_have_one_head() -> None:
    config = Config(str(SERVER / "alembic.ini"))
    config.set_main_option("script_location", str(SERVER / "migrations"))
    assert len(ScriptDirectory.from_config(config).get_heads()) == 1
