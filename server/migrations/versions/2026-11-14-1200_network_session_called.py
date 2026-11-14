"""desktop_network_sessions.called: what the person calls an agent outside Simeon

Revision ID: net_session_called_1114
Revises: coding_on_computer_1111
Create Date: 2026-11-14 12:00:00.000000

One column that may be empty, so every row there is keeps its meaning: an
agent that never said what its person calls it is shown by what it is (Dots,
Claude Code), as `simeon/desktop/network.py` (`shown_name`) says.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "net_session_called_1114"
down_revision = "coding_on_computer_1111"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "desktop_network_sessions",
        sa.Column("called", sa.String(length=40), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("desktop_network_sessions", "called")
