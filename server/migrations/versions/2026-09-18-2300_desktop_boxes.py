"""the person's computer: one box row per account

Revision ID: desktop_boxes_0918
Revises: maty_job_times_0912
Create Date: 2026-09-18 23:00:00.000000

One new table and nothing else touched. See polar/models/desktop.py,
polar/desktop/boxes.py and docs/product/agent-computer-plan.md.

The unique constraint on user_id is the product decision, not a hint:
one person has one computer (`CLAUDE.md` — *Maties runs on the machine,
so there is no "which computer", only this computer*). Two laptops is a
v2 problem, and when it arrives this constraint is the thing that has to
be dropped deliberately rather than a second row appearing by accident.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "desktop_boxes_0918"
down_revision = "maty_job_times_0912"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "desktop_boxes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("sandbox_id", sa.String(length=128), nullable=True),
        sa.Column("template_id", sa.String(length=128), nullable=False),
        sa.Column("snapshot_id", sa.String(length=128), nullable=True),
        sa.Column("state", sa.String(length=16), nullable=False),
        sa.Column("running_since", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("billed_through", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_boxes_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_boxes_pkey")),
        sa.UniqueConstraint("user_id", name=op.f("desktop_boxes_user_id_key")),
    )
    op.create_index(
        op.f("ix_desktop_boxes_created_at"),
        "desktop_boxes",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_desktop_boxes_deleted_at"),
        "desktop_boxes",
        ["deleted_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_desktop_boxes_user_id"),
        "desktop_boxes",
        ["user_id"],
        unique=False,
    )
    # Looked up by sandbox id when E2B tells us about a box rather than
    # the other way round — a webhook, or a reconciliation sweep.
    op.create_index(
        op.f("ix_desktop_boxes_sandbox_id"),
        "desktop_boxes",
        ["sandbox_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("desktop_boxes")
