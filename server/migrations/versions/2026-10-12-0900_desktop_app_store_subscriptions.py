"""plans bought in the iPhone app with Apple's in-app purchase

Revision ID: desktop_app_store_1012
Revises: desktop_billing_1006
Create Date: 2026-10-12 09:00:00.000000

A plan bought through Apple (12 October 2026) is Apple's; the server keeps
a copy per original transaction, written from Apple's signed transactions
and server notifications (`simeon.plans.app_store`). Stripe's rows are
unchanged.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "desktop_app_store_1012"
down_revision = "desktop_billing_1006"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "desktop_app_store_subscriptions",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("original_transaction_id", sa.String(length=64), nullable=False),
        sa.Column("transaction_id", sa.String(length=64), nullable=False),
        sa.Column("product_id", sa.String(length=128), nullable=False),
        sa.Column("environment", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("tier", sa.String(length=32), nullable=True),
        sa.Column("billing_interval", sa.String(length=16), nullable=True),
        sa.Column("current_period_start", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("current_period_end", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("grace_period_end", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("trial_start", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("trial_end", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False),
        sa.Column("canceled_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("signed_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("synced_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("raw", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_app_store_subscriptions_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint(
            "id", name=op.f("desktop_app_store_subscriptions_pkey")
        ),
        sa.UniqueConstraint(
            "original_transaction_id",
            name=op.f("desktop_app_store_subscriptions_original_transaction_id_key"),
        ),
    )
    for column in ("user_id", "created_at", "deleted_at"):
        op.create_index(
            op.f(f"ix_desktop_app_store_subscriptions_{column}"),
            "desktop_app_store_subscriptions",
            [column],
            unique=False,
        )


def downgrade() -> None:
    for column in ("user_id", "created_at", "deleted_at"):
        op.drop_index(
            op.f(f"ix_desktop_app_store_subscriptions_{column}"),
            table_name="desktop_app_store_subscriptions",
        )
    op.drop_table("desktop_app_store_subscriptions")
