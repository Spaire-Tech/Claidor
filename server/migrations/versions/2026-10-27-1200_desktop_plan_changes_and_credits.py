"""plan changes at renewal, and extra credits bought on the web

Revision ID: desktop_credit_packs_1027
Revises: desktop_channel_bots_1026
Create Date: 2026-10-27 12:00:00.000000

A move to a smaller plan waiting for the renewal (two columns on
desktop_subscriptions), the extra credits a person bought
(desktop_credit_packs), and the part of each call drawn from them
(desktop_usage.extra_credits). See simeon/models/desktop_billing.py and
simeon/plans/credits.py.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "desktop_credit_packs_1027"
down_revision = "desktop_channel_bots_1026"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "desktop_subscriptions",
        sa.Column("scheduled_tier", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "desktop_subscriptions",
        sa.Column("scheduled_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.add_column(
        "desktop_usage",
        sa.Column("extra_credits", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "desktop_credit_packs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("credits", sa.Integer(), nullable=False),
        sa.Column("remaining", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("stripe_checkout_session_id", sa.String(length=128), nullable=False),
        sa.Column("stripe_payment_intent_id", sa.String(length=128), nullable=True),
        sa.Column("refunded_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_credit_packs_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_credit_packs_pkey")),
        sa.UniqueConstraint(
            "stripe_checkout_session_id",
            name=op.f("desktop_credit_packs_stripe_checkout_session_id_key"),
        ),
    )
    for column in (
        "created_at",
        "deleted_at",
        "user_id",
        "expires_at",
        "stripe_payment_intent_id",
    ):
        op.create_index(
            op.f(f"ix_desktop_credit_packs_{column}"),
            "desktop_credit_packs",
            [column],
            unique=False,
        )


def downgrade() -> None:
    for column in (
        "stripe_payment_intent_id",
        "expires_at",
        "user_id",
        "deleted_at",
        "created_at",
    ):
        op.drop_index(
            op.f(f"ix_desktop_credit_packs_{column}"),
            table_name="desktop_credit_packs",
        )
    op.drop_table("desktop_credit_packs")
    op.drop_column("desktop_usage", "extra_credits")
    op.drop_column("desktop_subscriptions", "scheduled_at")
    op.drop_column("desktop_subscriptions", "scheduled_tier")
