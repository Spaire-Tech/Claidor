"""the models a person's own API key reaches, kept with the key

Revision ID: desktop_key_models_1110
Revises: desktop_model_usage_1109
Create Date: 2026-11-10 12:00:00.000000

One nullable column and nothing else touched. See
simeon/models/desktop_model_account.py (DesktopModelAccount.models) and
simeon/desktop/key_providers.py.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "desktop_key_models_1110"
down_revision = "desktop_model_usage_1109"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "desktop_model_accounts",
        sa.Column("models", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("desktop_model_accounts", "models")
