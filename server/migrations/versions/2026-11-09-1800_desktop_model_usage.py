"""how much of a person's AI plan is used, per connected account

Revision ID: desktop_model_usage_1109
Revises: desktop_model_accts_1108
Create Date: 2026-11-09 18:00:00.000000

One nullable column and nothing else touched. See
simeon/models/desktop_model_account.py (DesktopModelAccount.usage) and
simeon/desktop/model_accounts.py (`keep_usage`).
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "desktop_model_usage_1109"
down_revision = "desktop_model_accts_1108"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "desktop_model_accounts",
        sa.Column("usage", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("desktop_model_accounts", "usage")
