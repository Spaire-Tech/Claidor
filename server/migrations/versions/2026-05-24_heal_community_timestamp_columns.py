"""Heal community tables: add modified_at + deleted_at columns missing in prod

Revision ID: c9d4a8e1f273
Revises: b8f3c9a2e571
Create Date: 2026-05-24 14:00:00.000000

b8f3c9a2e571 originally shipped without modified_at / deleted_at on
three tables (community_settings, community_post_media,
community_reactions). That was patched in-place before the file was
final, but production had already run the pre-patch version — and
Alembic only runs a revision once, so the column-adds in the patched
file were skipped.

Result: SQLAlchemy SELECTs against any of those three models 500
because RecordModel → TimestampedModel declares all three timestamp
columns, and the WHERE clause `deleted_at IS NULL` (added by
RepositorySoftDeletionMixin.get_base_statement) hits an undefined
column.

This migration adds the missing columns idempotently — environments
that ran the patched migration get a clean no-op; environments that
ran the pre-patch version get the columns. All four columns are
nullable so the ALTER TABLEs are non-locking.
"""

import sqlalchemy as sa
from alembic import op

revision = "c9d4a8e1f273"
down_revision = "b8f3c9a2e571"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


# Idempotent column adds — environments where the patched
# b8f3c9a2e571 already created these columns get a no-op.
_ADDS = [
    ("community_settings", "deleted_at"),
    ("community_post_media", "deleted_at"),
    ("community_reactions", "modified_at"),
    ("community_reactions", "deleted_at"),
]


def upgrade() -> None:
    for table, column in _ADDS:
        op.execute(
            f'ALTER TABLE "{table}" '
            f'ADD COLUMN IF NOT EXISTS "{column}" TIMESTAMP WITH TIME ZONE'
        )

    # deleted_at is indexed on TimestampedModel — add the indexes too so
    # the soft-delete WHERE clause in RepositorySoftDeletionMixin doesn't
    # full-scan once tables get traffic.
    op.execute(
        'CREATE INDEX IF NOT EXISTS '
        '"ix_community_settings_deleted_at" '
        'ON "community_settings" ("deleted_at")'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS '
        '"ix_community_post_media_deleted_at" '
        'ON "community_post_media" ("deleted_at")'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS '
        '"ix_community_reactions_deleted_at" '
        'ON "community_reactions" ("deleted_at")'
    )


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "ix_community_reactions_deleted_at"')
    op.execute('DROP INDEX IF EXISTS "ix_community_post_media_deleted_at"')
    op.execute('DROP INDEX IF EXISTS "ix_community_settings_deleted_at"')

    op.execute(
        'ALTER TABLE "community_reactions" DROP COLUMN IF EXISTS "deleted_at"'
    )
    op.execute(
        'ALTER TABLE "community_reactions" DROP COLUMN IF EXISTS "modified_at"'
    )
    op.execute(
        'ALTER TABLE "community_post_media" DROP COLUMN IF EXISTS "deleted_at"'
    )
    op.execute(
        'ALTER TABLE "community_settings" DROP COLUMN IF EXISTS "deleted_at"'
    )


# Silence ruff's unused-import warning on sa (some migrations reference
# it; this one uses op.execute exclusively because ADD COLUMN IF NOT
# EXISTS isn't supported by op.add_column).
_ = sa
