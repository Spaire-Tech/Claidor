"""Stub migration to reconcile orphan revision z5a6b7c8d9e0

Parallel coaching-programs branch
(`2026-05-09_add_coaching_cohorts.py`). No-op on this branch.

Revision ID: z5a6b7c8d9e0
Revises: y4z5a6b7c8d9
Create Date: 2026-05-08 12:31:00.000000

"""

from alembic import op  # noqa: F401

revision = "z5a6b7c8d9e0"
down_revision = "y4z5a6b7c8d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
