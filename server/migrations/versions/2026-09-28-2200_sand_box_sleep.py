"""cloud boxes sleep when idle: when each was last active and last put to sleep

Revision ID: sand_box_sleep_0928
Revises: sand_plugins_0925
Create Date: 2026-09-28 22:00:00.000000

`last_active_at` is Grok Bot's `last_active_at_ms` (`TeamMemberSandBoxPod`):
the last time the box was busy, asked for or woken. `hibernated_at` is
when the sleeper (`polar.sand.box_tasks`) last stopped it.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "sand_box_sleep_0928"
down_revision = "sand_plugins_0925"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sand_boxes",
        sa.Column("last_active_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.add_column(
        "sand_boxes",
        sa.Column("hibernated_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sand_boxes", "hibernated_at")
    op.drop_column("sand_boxes", "last_active_at")
