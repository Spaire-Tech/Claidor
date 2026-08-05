"""Stub migration to reconcile orphan revision a6b7c8d9e0f1

Parallel coaching-programs branch
(`2026-05-09_add_coaching_intake.py`). No-op on this branch.

Revision ID: a6b7c8d9e0f1
Revises: z5a6b7c8d9e0
Create Date: 2026-05-08 12:32:00.000000

"""

from alembic import op  # noqa: F401

revision = "a6b7c8d9e0f1"
down_revision = "z5a6b7c8d9e0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
