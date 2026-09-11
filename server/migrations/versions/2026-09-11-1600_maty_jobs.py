"""the cloud engine's queue, and the job-scoped desktop session

Revision ID: maty_jobs_0911
Revises: desktop_memory_0911
Create Date: 2026-09-11 16:00:00.000000

One new table, `maty_jobs`, and one new nullable column on
`desktop_sessions`. The column is what makes a job's credential a
narrowed desktop session rather than a second kind of token: see
polar/maty/service.py and docs/maties/cloud.md, section 4.

Nothing existing changes shape: `maty_jobs` is created first, then the
nullable column that points at it, so the foreign key has a table to
reference and no existing session row is touched.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "maty_jobs_0911"
down_revision = "desktop_memory_0911"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "maty_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.Unicode(length=32), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("deliver", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("allow", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.Unicode(length=16), nullable=False),
        sa.Column("result", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("usage", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("runner", sa.String(length=128), nullable=True),
        sa.Column("lease_expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("scheduled_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("maty_jobs_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("maty_jobs_pkey")),
    )
    op.create_index(
        op.f("ix_maty_jobs_created_at"), "maty_jobs", ["created_at"], unique=False
    )
    op.create_index(
        op.f("ix_maty_jobs_deleted_at"), "maty_jobs", ["deleted_at"], unique=False
    )
    op.create_index(
        op.f("ix_maty_jobs_user_id"), "maty_jobs", ["user_id"], unique=False
    )
    op.create_index(op.f("ix_maty_jobs_status"), "maty_jobs", ["status"], unique=False)
    op.create_index(
        op.f("ix_maty_jobs_lease_expires_at"),
        "maty_jobs",
        ["lease_expires_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_maty_jobs_scheduled_at"), "maty_jobs", ["scheduled_at"], unique=False
    )
    # « The next job that is due and not leased », which is the one query
    # the runner makes over and over.
    op.create_index(
        "ix_maty_jobs_status_scheduled_at_lease_expires_at",
        "maty_jobs",
        ["status", "scheduled_at", "lease_expires_at"],
        unique=False,
    )
    op.create_index(
        "ix_maty_jobs_user_id_created_at",
        "maty_jobs",
        ["user_id", "created_at"],
        unique=False,
    )

    op.add_column("desktop_sessions", sa.Column("job_id", sa.Uuid(), nullable=True))
    op.create_index(
        op.f("ix_desktop_sessions_job_id"),
        "desktop_sessions",
        ["job_id"],
        unique=False,
    )
    op.create_foreign_key(
        op.f("desktop_sessions_job_id_fkey"),
        "desktop_sessions",
        "maty_jobs",
        ["job_id"],
        ["id"],
        ondelete="cascade",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("desktop_sessions_job_id_fkey"), "desktop_sessions", type_="foreignkey"
    )
    op.drop_index(op.f("ix_desktop_sessions_job_id"), table_name="desktop_sessions")
    op.drop_column("desktop_sessions", "job_id")
    op.drop_table("maty_jobs")
