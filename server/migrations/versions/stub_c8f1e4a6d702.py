"""Stub migration to reconcile missing revision c8f1e4a6d702

This revision was applied to the production database by a previous
deployment but the migration file was lost. This stub re-registers it
so the revision chain is intact. No schema changes are made.

Revision ID: c8f1e4a6d702
Revises: b4c8d2e3f601
Create Date: 2026-04-20 12:00:00.000000

"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "c8f1e4a6d702"
down_revision = "b4c8d2e3f601"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
