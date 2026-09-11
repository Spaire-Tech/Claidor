"""the provider on every desktop usage row

Revision ID: desktop_usage_provider_0911
Revises: maty_jobs_0911
Create Date: 2026-09-11 20:00:00.000000

The desktop app now offers models from two suppliers, and a GPT token is
not priced like a Claude token (`polar/desktop/pricing.py`). A usage row
that does not say who served the call cannot be traced back to the price
list its credit figure was read off, so the figures of the two suppliers
stop being comparable the first time either list moves.

One nullable-free column with a server default, so every row written
before today reads as what it in fact was: Anthropic, the only supplier
there was.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "desktop_usage_provider_0911"
down_revision = "maty_jobs_0911"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "desktop_usage",
        sa.Column(
            "provider",
            sa.String(length=32),
            nullable=False,
            server_default="anthropic",
        ),
    )


def downgrade() -> None:
    op.drop_column("desktop_usage", "provider")
