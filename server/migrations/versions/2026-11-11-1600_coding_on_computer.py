"""maty_jobs.executor and sand_cloud_agents.work: a cloud agent's coding on the person's computer

Revision ID: coding_on_computer_1111
Revises: oauth2_token_redirect_1110
Create Date: 2026-11-11 16:00:00.000000

Two columns with defaults, so every row there is keeps its meaning: each
job until now is the cloud runner's (`maty-runner`), and no cloud agent has
reported any work. A cloud agent launched by a new engine is done on the
person's computer, in Claude Code (`simeon/sand/cloud_agents_computer.py`).
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "coding_on_computer_1111"
down_revision = "oauth2_token_redirect_1110"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "maty_jobs",
        sa.Column(
            "executor",
            sa.String(length=32),
            nullable=False,
            server_default="maty-runner",
        ),
    )
    op.add_column(
        "sand_cloud_agents",
        sa.Column(
            "work",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("sand_cloud_agents", "work")
    op.drop_column("maty_jobs", "executor")
