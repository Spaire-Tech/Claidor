"""the person's language, as the apps tell it

Revision ID: users_language_1020
Revises: users_password_hash_1019
Create Date: 2026-10-20 12:00:00.000000

The iPhone and Mac apps keep the person's language on the account
(`POST /desktop/api/user/profile`, `simeon.desktop.language`), so emails sent
without a request, like the sign-in code, can use it. Every account made
before has none, which reads as English and changes nothing for it.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "users_language_1020"
down_revision = "users_password_hash_1019"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("language", sa.String(length=35), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "language")
