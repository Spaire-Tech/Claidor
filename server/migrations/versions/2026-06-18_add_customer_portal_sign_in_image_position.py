"""Add customer_portal_sign_in_image_position to organizations

Stores the CSS object-position for the customer portal sign-in image, set by
dragging to reposition in the course builder's "Auth" tab. Nullable; defaults
to centered when unset.

Revision ID: cpsi_signin_pos_618
Revises: cpsi_signin_618
Create Date: 2026-06-18 01:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "cpsi_signin_pos_618"
down_revision = "cpsi_signin_618"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column(
            "customer_portal_sign_in_image_position", sa.String(), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("organizations", "customer_portal_sign_in_image_position")
