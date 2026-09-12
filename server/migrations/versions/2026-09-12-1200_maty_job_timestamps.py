"""when a job started and when it finished

Revision ID: maty_job_times_0912
Revises: desktop_usage_provider_0911
Create Date: 2026-09-12 12:00:00.000000

Two nullable columns on `maty_jobs`, for the app's own view of the queue
(`docs/maties/cloud.md`, « The person's four routes »). Neither could be
derived from what was already there: `modified_at` moves on every
heartbeat, and `lease_expires_at` is a deadline in the future that is
cleared the moment a job finishes.

Nullable with no default and no backfill on purpose. A job that already
exists was claimed and finished before these columns did, and inventing
a moment for it would be worse than saying nothing: null here means « we
were not keeping this yet », which is true.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "maty_job_times_0912"
down_revision = "desktop_usage_provider_0911"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "maty_jobs",
        sa.Column("started_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.add_column(
        "maty_jobs",
        sa.Column("finished_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("maty_jobs", "finished_at")
    op.drop_column("maty_jobs", "started_at")
