"""the shared memory: one row per person per memory file

Revision ID: desktop_memory_0911
Revises: desktop_sign_in_0909
Create Date: 2026-09-11 11:00:00.000000

One new table and nothing else touched. See polar/models/desktop.py and
docs/maties/cloud.md.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "desktop_memory_0911"
down_revision = "desktop_sign_in_0909"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "desktop_memory_files",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_memory_files_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_memory_files_pkey")),
        sa.UniqueConstraint(
            "user_id", "name", name=op.f("desktop_memory_files_user_id_name_key")
        ),
    )
    op.create_index(
        op.f("ix_desktop_memory_files_created_at"),
        "desktop_memory_files",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_desktop_memory_files_deleted_at"),
        "desktop_memory_files",
        ["deleted_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_desktop_memory_files_user_id"),
        "desktop_memory_files",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("desktop_memory_files")
