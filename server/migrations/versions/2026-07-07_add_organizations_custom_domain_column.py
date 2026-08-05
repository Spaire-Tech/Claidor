"""Add organizations.custom_domain (denormalized active domain)

Revision ID: org_domain_col_707
Revises: org_domain_707
Create Date: 2026-07-07 00:00:01.000000

Denormalizes the ACTIVE custom storefront domain onto the organizations
row so URL builders (emails, portal links, canonical URLs) can read it
without joining organization_custom_domains. Written only by the
organization_custom_domain service: set on verification, cleared on
demotion/removal/replacement.

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# Polar Custom Imports

# revision identifiers, used by Alembic.
revision = "org_domain_col_707"
down_revision = "org_domain_707"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("custom_domain", postgresql.CITEXT(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organizations", "custom_domain")
