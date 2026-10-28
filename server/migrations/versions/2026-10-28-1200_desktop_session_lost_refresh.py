"""a refresh whose answer was lost no longer signs the person out

Revision ID: desktop_session_lost_refresh_1028
Revises: desktop_credit_packs_1027
Create Date: 2026-10-28 12:00:00.000000

A refresh trades the refresh token for a new pair and the old token dies.
When the answer never reached the app (the Mac asleep, the phone leaving
the app, the network dropping), the app kept the spent token and the next
refresh signed the person out (28 October 2026: "I keep getting logged
out after a while"). `replaced_by_id` names the session a refresh traded a
row for, and `first_used_at` says whether that session was ever used: a
spent token whose successor never was may be traded again.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "desktop_session_lost_refresh_1028"
down_revision = "desktop_credit_packs_1027"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "desktop_sessions",
        sa.Column("replaced_by_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        op.f("desktop_sessions_replaced_by_id_fkey"),
        "desktop_sessions",
        "desktop_sessions",
        ["replaced_by_id"],
        ["id"],
        ondelete="set null",
    )
    op.add_column(
        "desktop_sessions",
        sa.Column("first_used_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("desktop_sessions", "first_used_at")
    op.drop_constraint(
        op.f("desktop_sessions_replaced_by_id_fkey"),
        "desktop_sessions",
        type_="foreignkey",
    )
    op.drop_column("desktop_sessions", "replaced_by_id")
