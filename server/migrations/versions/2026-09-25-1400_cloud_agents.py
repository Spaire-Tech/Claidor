"""cloud agents over the maty queue

Revision ID: sand_cloud_agents_0925
Revises: desktop_box_credential_0925
Create Date: 2026-09-25 14:00:00.000000

The app's cloud agents (`aiserver.v1.BackgroundComposerService`) are
served as a projection over the maty queue (`polar.sand.cloud_agents`).
Four columns on `maty_jobs` — the conversation a turn continues, the job
it continues, a cancel flag the runner reads off its heartbeat, and the
artifacts the executor reported — and one side table, `sand_cloud_agents`,
holding what spans the turns: the app's `bc_id`, the name, the archived
flag, the repository named at launch and the pointer to the latest job.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "sand_cloud_agents_0925"
down_revision = "desktop_box_credential_0925"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "maty_jobs",
        sa.Column(
            "conversation", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
    )
    op.add_column(
        "maty_jobs",
        sa.Column(
            "parent_job_id",
            sa.Uuid(),
            sa.ForeignKey("maty_jobs.id", ondelete="set null"),
            nullable=True,
        ),
    )
    op.add_column(
        "maty_jobs",
        sa.Column(
            "cancel_requested",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "maty_jobs",
        sa.Column("artifacts", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    op.create_table(
        "sand_cloud_agents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("bc_id", sa.String(length=128), nullable=False),
        sa.Column("job_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column(
            "is_archived", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("repo_url", sa.Text(), nullable=False),
        sa.Column("base_branch", sa.Text(), nullable=False),
        sa.Column("model_id", sa.String(length=128), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("sand_cloud_agents_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["job_id"],
            ["maty_jobs.id"],
            name=op.f("sand_cloud_agents_job_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("sand_cloud_agents_pkey")),
    )
    op.create_index(
        op.f("ix_sand_cloud_agents_user_id"), "sand_cloud_agents", ["user_id"]
    )
    op.create_index(
        "ix_sand_cloud_agents_user_id_bc_id",
        "sand_cloud_agents",
        ["user_id", "bc_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_sand_cloud_agents_user_id_bc_id", table_name="sand_cloud_agents")
    op.drop_index(op.f("ix_sand_cloud_agents_user_id"), table_name="sand_cloud_agents")
    op.drop_table("sand_cloud_agents")
    op.drop_column("maty_jobs", "artifacts")
    op.drop_column("maty_jobs", "cancel_requested")
    op.drop_column("maty_jobs", "parent_job_id")
    op.drop_column("maty_jobs", "conversation")
