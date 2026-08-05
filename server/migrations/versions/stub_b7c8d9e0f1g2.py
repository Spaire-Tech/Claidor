"""Stub migration to reconcile orphan revision b7c8d9e0f1g2

Parallel coaching-programs branch
(`2026-05-09_add_coaching_community.py`). No-op on this branch.

Revision ID: b7c8d9e0f1g2
Revises: a6b7c8d9e0f1
Create Date: 2026-05-08 12:33:00.000000

"""

from alembic import op  # noqa: F401

revision = "b7c8d9e0f1g2"
down_revision = "a6b7c8d9e0f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
