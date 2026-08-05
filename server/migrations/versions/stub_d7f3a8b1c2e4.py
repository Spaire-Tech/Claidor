"""Stub migration to reconcile missing revision d7f3a8b1c2e4

This revision was applied to the production database by a previous
deployment but the migration file was lost. This stub re-registers it
so the revision chain is intact. No schema changes are made.

Revision ID: d7f3a8b1c2e4
Revises: c5e9f3b2d4a6
Create Date: 2026-03-15 07:00:00.000000

"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "d7f3a8b1c2e4"
down_revision = "c5e9f3b2d4a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
