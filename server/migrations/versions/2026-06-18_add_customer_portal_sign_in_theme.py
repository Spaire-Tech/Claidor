"""Add customer_portal_sign_in_theme to organizations

Creator-chosen appearance (light/dark) for the customer portal sign-in screen.
The customer doesn't toggle this — it's part of the creator's design. Nullable;
NULL is treated as "light".

Revision ID: cpsi_signin_theme_618
Revises: cpsi_signin_pos_618
Create Date: 2026-06-18 02:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "cpsi_signin_theme_618"
down_revision = "cpsi_signin_pos_618"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("customer_portal_sign_in_theme", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organizations", "customer_portal_sign_in_theme")
