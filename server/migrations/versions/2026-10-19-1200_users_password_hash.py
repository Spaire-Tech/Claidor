"""a password for the apps' sign-in

Revision ID: users_password_hash_1019
Revises: desktop_link_wallets_1017
Create Date: 2026-10-19 12:00:00.000000

The iPhone signs in with an email and a password as well as a code sent to
the email (`simeon.desktop.email_sign_in`, 19 October 2026). The column holds
scrypt's salt and digest (`simeon.desktop.passwords`), never the password.
Every account made before has none, which changes nothing for it.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "users_password_hash_1019"
down_revision = "desktop_link_wallets_1017"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("password_hash", sa.String(length=256), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("users", "password_hash")
