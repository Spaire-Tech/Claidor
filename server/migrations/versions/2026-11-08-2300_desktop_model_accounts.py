"""the AI accounts a person connects for their agents, tokens sealed

Revision ID: desktop_model_accts_1108
Revises: desktop_credentials_1028
Create Date: 2026-11-08 23:00:00.000000

One new table and nothing else touched. See
simeon/models/desktop_model_account.py (DesktopModelAccount) and
simeon/desktop/model_accounts.py.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "desktop_model_accts_1108"
down_revision = "desktop_credentials_1028"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "desktop_model_accounts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("account_key", sa.String(length=200), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=False),
        sa.Column("plan", sa.String(length=40), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("limited_until", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_model_accounts_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_model_accounts_pkey")),
        sa.UniqueConstraint(
            "user_id",
            "provider",
            "account_key",
            name=op.f("desktop_model_accounts_user_id_provider_account_key_key"),
        ),
    )
    for column in ("created_at", "deleted_at", "user_id"):
        op.create_index(
            op.f(f"ix_desktop_model_accounts_{column}"),
            "desktop_model_accounts",
            [column],
            unique=False,
        )


def downgrade() -> None:
    op.drop_table("desktop_model_accounts")
