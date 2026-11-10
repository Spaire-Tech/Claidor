"""oauth2_tokens.redirect_uri: where the sign-in that made a token returned

Revision ID: oauth2_token_redirect_1110
Revises: desktop_network_1110
Create Date: 2026-11-10 20:00:00.000000

One nullable column. A bot's registration can be shared by several products
(Grok Bot signs in with Cursor's), so the network reads which one it is from
where its sign-in returned (simeon/desktop/network.py, `kind_of`).
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "oauth2_token_redirect_1110"
down_revision = "desktop_network_1110"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "oauth2_tokens", sa.Column("redirect_uri", sa.String(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("oauth2_tokens", "redirect_uri")
