"""which kind of client a desktop session was signed in from

Revision ID: desktop_session_client_kind_1004
Revises: desktop_usage_reason_1002
Create Date: 2026-10-04 12:00:00.000000

Simeon on the web (4 October 2026): the window at app.simeonlabs.com
signs in with the same tokens as the Mac app, on a session row marked
`web`. Rows from before today are the Mac's, so the column fills with
`desktop`.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "desktop_session_client_kind_1004"
down_revision = "desktop_usage_reason_1002"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "desktop_sessions",
        sa.Column(
            "client_kind",
            sa.String(length=16),
            nullable=False,
            server_default="desktop",
        ),
    )


def downgrade() -> None:
    op.drop_column("desktop_sessions", "client_kind")
