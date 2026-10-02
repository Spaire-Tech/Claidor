"""why each desktop model call was made

Revision ID: desktop_usage_reason_1002
Revises: desktop_voice_calls_0930
Create Date: 2026-10-02 12:00:00.000000

The app now says on every model call what it was for: a message the
person sent, a routine, one agent waking another, a helper, a safety
check, memory, a summary (`x-simeon-call-reason`, see
`simeon.desktop.endpoints.call_reason`). With it the usage table answers
"which feature costs the most", not only "which model".

Nullable: every row written before today, and every call from an app
built before the header, has no reason.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "desktop_usage_reason_1002"
down_revision = "desktop_voice_calls_0930"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "desktop_usage",
        sa.Column("reason", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("desktop_usage", "reason")
