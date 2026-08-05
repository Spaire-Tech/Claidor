"""Stub migration to reconcile orphan revision y4z5a6b7c8d9

This revision was applied to the production database by a parallel
coaching-programs branch (`2026-05-09_add_coaching.py`) whose migration
file isn't present on this branch. This stub re-registers the revision
as a no-op so the chain is intact for both production (already past it)
and fresh databases (which run the no-op and continue).

Revision ID: y4z5a6b7c8d9
Revises: x3y4z5a6b7c8
Create Date: 2026-05-08 12:30:00.000000

"""

from alembic import op  # noqa: F401

revision = "y4z5a6b7c8d9"
down_revision = "x3y4z5a6b7c8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
