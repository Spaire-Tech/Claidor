"""Widen OAuth2 client_id/client_secret columns

The Claidor token prefixes (e.g. ``claidor_ci_``) are longer than the
original ones, so generated client IDs/secrets (prefix + 37 random chars
+ 6 checksum chars = 54) no longer fit in the historical VARCHAR(52)
columns. Widen them to 64.

Revision ID: widen_oauth2_0805
Revises: drop_pruned_0805
Create Date: 2026-08-05 13:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "widen_oauth2_0805"
down_revision = "drop_pruned_0805"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "oauth2_clients",
        "client_id",
        existing_type=sa.String(52),
        type_=sa.String(64),
        existing_nullable=False,
    )
    op.alter_column(
        "oauth2_clients",
        "client_secret",
        existing_type=sa.String(52),
        type_=sa.String(64),
        existing_nullable=False,
    )
    op.alter_column(
        "oauth2_authorization_codes",
        "client_id",
        existing_type=sa.String(52),
        type_=sa.String(64),
        existing_nullable=False,
    )
    op.alter_column(
        "oauth2_grants",
        "client_id",
        existing_type=sa.String(52),
        type_=sa.String(64),
        existing_nullable=False,
    )
    op.alter_column(
        "oauth2_tokens",
        "client_id",
        existing_type=sa.String(52),
        type_=sa.String(64),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "oauth2_tokens",
        "client_id",
        existing_type=sa.String(64),
        type_=sa.String(52),
        existing_nullable=False,
    )
    op.alter_column(
        "oauth2_grants",
        "client_id",
        existing_type=sa.String(64),
        type_=sa.String(52),
        existing_nullable=False,
    )
    op.alter_column(
        "oauth2_authorization_codes",
        "client_id",
        existing_type=sa.String(64),
        type_=sa.String(52),
        existing_nullable=False,
    )
    op.alter_column(
        "oauth2_clients",
        "client_secret",
        existing_type=sa.String(64),
        type_=sa.String(52),
        existing_nullable=False,
    )
    op.alter_column(
        "oauth2_clients",
        "client_id",
        existing_type=sa.String(64),
        type_=sa.String(52),
        existing_nullable=False,
    )
