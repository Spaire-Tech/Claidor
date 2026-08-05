"""Stub migration to reconcile orphan revision c8d9e0f1g2h3

Parallel coaching-programs branch
(`2026-05-09_add_coaching_lifecycle.py`). No-op on this branch.

This is the revision the production DB is currently stamped at. Without
this stub, `alembic upgrade head` errors with
'Can't locate revision identified by c8d9e0f1g2h3' before it can run
any newer migrations.

Revision ID: c8d9e0f1g2h3
Revises: b7c8d9e0f1g2
Create Date: 2026-05-08 12:34:00.000000

"""

from alembic import op  # noqa: F401

revision = "c8d9e0f1g2h3"
down_revision = "b7c8d9e0f1g2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
