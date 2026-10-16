"""what reaching a cloud computer needs beyond its address and ports

Revision ID: sand_box_host_meta_1016
Revises: desktop_free_trials_1012
Create Date: 2026-10-16 12:00:00.000000

A computer on E2B (`simeon/sand/box_e2b.py`) is reached at
`https://<port>-<sandbox>.<domain>` with a traffic token E2B gives only
when the computer is made; it is kept here. Every row made before is a
Docker container and gets `{}`, which changes nothing for it.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "sand_box_host_meta_1016"
down_revision = "desktop_free_trials_1012"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sand_boxes",
        sa.Column(
            "host_meta",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
    )


def downgrade() -> None:
    op.drop_column("sand_boxes", "host_meta")
