"""the box's own credential, a child of the desktop session

Revision ID: desktop_box_credential_0925
Revises: maty_job_times_0912
Create Date: 2026-09-25 12:00:00.000000

One nullable column on `desktop_sessions`: `box_of_session_id`, the
signed-in desktop a row is the box credential of. The person's box keeps
running after Simeon quits so routines fire while the Mac is awake, and
with the app gone nothing rewrote its one-hour access token; a row with
this set is what the box renews with (`polar.desktop.service`,
`renew_box_access`). Null for every session a person signed in to and for
every job token.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "desktop_box_credential_0925"
down_revision = "maty_job_times_0912"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "desktop_sessions",
        sa.Column(
            "box_of_session_id",
            sa.Uuid(),
            sa.ForeignKey("desktop_sessions.id", ondelete="cascade"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_desktop_sessions_box_of_session_id",
        "desktop_sessions",
        ["box_of_session_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_desktop_sessions_box_of_session_id", table_name="desktop_sessions"
    )
    op.drop_column("desktop_sessions", "box_of_session_id")
