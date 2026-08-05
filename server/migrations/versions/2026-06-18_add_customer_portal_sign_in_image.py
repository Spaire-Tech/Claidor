"""Add customer_portal_sign_in_image_url to organizations

Stores the creator-uploaded image shown on the left panel of the customer
portal sign-in screen. Configured from the course builder's "Auth" tab; the
portal is org-scoped, so this applies to the whole organization's sign-in.
Nullable — when unset the portal falls back to the org's most recent course
thumbnail.

Revision ID: cpsi_signin_618
Revises: comm_post_extras_617
Create Date: 2026-06-18 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "cpsi_signin_618"
down_revision = "comm_post_extras_617"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column(
            "customer_portal_sign_in_image_url", sa.String(), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("organizations", "customer_portal_sign_in_image_url")
