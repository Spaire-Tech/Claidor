"""the plans on Stripe Billing: the synced subscription, trial cards, usage watermarks

Revision ID: desktop_billing_1006
Revises: desktop_session_client_kind_1004
Create Date: 2026-10-06 09:00:00.000000

Stripe owns the subscription (6 October 2026). `desktop_subscriptions` is
its webhook-written copy, one row per person; `desktop_trial_redemptions`
is the one-trial-per-card rule. `desktop_usage.stripe_reported_at` and
`sand_boxes.usage_metered_at` are the watermarks of the reporter that
sends credits and cloud-computer seconds to Stripe's meters.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "desktop_billing_1006"
down_revision = "desktop_session_client_kind_1004"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "desktop_subscriptions",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("stripe_customer_id", sa.String(length=128), nullable=False),
        sa.Column("stripe_subscription_id", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("tier", sa.String(length=32), nullable=True),
        sa.Column("price_lookup_key", sa.String(length=128), nullable=True),
        sa.Column("billing_interval", sa.String(length=16), nullable=True),
        sa.Column("current_period_start", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("current_period_end", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("trial_start", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("trial_end", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False),
        sa.Column("canceled_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("trial_checked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("synced_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("raw", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_subscriptions_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_subscriptions_pkey")),
        sa.UniqueConstraint(
            "stripe_subscription_id",
            name=op.f("desktop_subscriptions_stripe_subscription_id_key"),
        ),
        sa.UniqueConstraint("user_id", name=op.f("desktop_subscriptions_user_id_key")),
    )
    op.create_index(
        op.f("ix_desktop_subscriptions_stripe_customer_id"),
        "desktop_subscriptions",
        ["stripe_customer_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_desktop_subscriptions_user_id"),
        "desktop_subscriptions",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "desktop_trial_redemptions",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("payment_method_fingerprint", sa.String(length=128), nullable=True),
        sa.Column("stripe_subscription_id", sa.String(length=128), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_trial_redemptions_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_trial_redemptions_pkey")),
    )
    op.create_index(
        op.f("ix_desktop_trial_redemptions_email"),
        "desktop_trial_redemptions",
        ["email"],
        unique=False,
    )
    op.create_index(
        op.f("ix_desktop_trial_redemptions_payment_method_fingerprint"),
        "desktop_trial_redemptions",
        ["payment_method_fingerprint"],
        unique=False,
    )
    op.create_index(
        op.f("ix_desktop_trial_redemptions_user_id"),
        "desktop_trial_redemptions",
        ["user_id"],
        unique=False,
    )

    op.add_column(
        "desktop_usage",
        sa.Column("stripe_reported_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index(
        op.f("ix_desktop_usage_stripe_reported_at"),
        "desktop_usage",
        ["stripe_reported_at"],
        unique=False,
    )
    op.add_column(
        "sand_boxes",
        sa.Column("usage_metered_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sand_boxes", "usage_metered_at")
    op.drop_index(
        op.f("ix_desktop_usage_stripe_reported_at"), table_name="desktop_usage"
    )
    op.drop_column("desktop_usage", "stripe_reported_at")
    op.drop_index(
        op.f("ix_desktop_trial_redemptions_user_id"),
        table_name="desktop_trial_redemptions",
    )
    op.drop_index(
        op.f("ix_desktop_trial_redemptions_payment_method_fingerprint"),
        table_name="desktop_trial_redemptions",
    )
    op.drop_index(
        op.f("ix_desktop_trial_redemptions_email"),
        table_name="desktop_trial_redemptions",
    )
    op.drop_table("desktop_trial_redemptions")
    op.drop_index(
        op.f("ix_desktop_subscriptions_user_id"), table_name="desktop_subscriptions"
    )
    op.drop_index(
        op.f("ix_desktop_subscriptions_stripe_customer_id"),
        table_name="desktop_subscriptions",
    )
    op.drop_table("desktop_subscriptions")
