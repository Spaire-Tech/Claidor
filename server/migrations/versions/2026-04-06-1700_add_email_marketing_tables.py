"""Add email marketing tables

Revision ID: 92760713e9ff
Revises: c7d5e8f1a2b3
Create Date: 2026-04-06 17:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# Polar Custom Imports

# revision identifiers, used by Alembic.
revision = "92760713e9ff"
down_revision = "c7d5e8f1a2b3"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    # email_subscribers
    op.create_table(
        "email_subscribers",
        sa.Column("id", sa.Uuid(), nullable=False, default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("name", sa.String(256), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("source", sa.String(20), nullable=False, server_default="space_signup"),
        sa.Column("import_source", sa.String(50), nullable=True),
        sa.Column("customer_id", sa.Uuid(), nullable=True),
        sa.Column("email_verified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("unsubscribed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "email", "deleted_at", name="email_subscribers_org_email_key"),
    )
    op.create_index("ix_email_subscribers_organization_id", "email_subscribers", ["organization_id"])
    op.create_index("ix_email_subscribers_organization_id_status", "email_subscribers", ["organization_id", "status"])
    op.create_index("ix_email_subscribers_created_at", "email_subscribers", ["created_at"])
    op.create_index("ix_email_subscribers_deleted_at", "email_subscribers", ["deleted_at"])

    # email_segments
    op.create_table(
        "email_segments",
        sa.Column("id", sa.Uuid(), nullable=False, default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("type", sa.String(30), nullable=False, server_default="all"),
        sa.Column("product_id", sa.Uuid(), nullable=True),
        sa.Column("filter_rules", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "slug", "deleted_at", name="email_segments_org_slug_key"),
    )
    op.create_index("ix_email_segments_organization_id", "email_segments", ["organization_id"])
    op.create_index("ix_email_segments_created_at", "email_segments", ["created_at"])
    op.create_index("ix_email_segments_deleted_at", "email_segments", ["deleted_at"])

    # email_segment_subscribers
    op.create_table(
        "email_segment_subscribers",
        sa.Column("id", sa.Uuid(), nullable=False, default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("segment_id", sa.Uuid(), nullable=False),
        sa.Column("subscriber_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["segment_id"], ["email_segments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subscriber_id"], ["email_subscribers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("segment_id", "subscriber_id", "deleted_at", name="email_segment_subscribers_seg_sub_key"),
    )
    op.create_index("ix_email_segment_subscribers_segment_id", "email_segment_subscribers", ["segment_id"])
    op.create_index("ix_email_segment_subscribers_subscriber_id", "email_segment_subscribers", ["subscriber_id"])
    op.create_index("ix_email_segment_subscribers_created_at", "email_segment_subscribers", ["created_at"])
    op.create_index("ix_email_segment_subscribers_deleted_at", "email_segment_subscribers", ["deleted_at"])

    # email_broadcasts
    op.create_table(
        "email_broadcasts",
        sa.Column("id", sa.Uuid(), nullable=False, default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("sender_name", sa.String(100), nullable=False),
        sa.Column("sender_email", sa.String(255), nullable=False, server_default="noreply@notifications.spairehq.com"),
        sa.Column("reply_to_email", sa.String(255), nullable=True),
        sa.Column("content_json", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("content_html", sa.Text(), nullable=True),
        sa.Column("segment_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("scheduled_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("sent_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("total_recipients", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["segment_id"], ["email_segments.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_email_broadcasts_organization_id", "email_broadcasts", ["organization_id"])
    op.create_index("ix_email_broadcasts_created_at", "email_broadcasts", ["created_at"])
    op.create_index("ix_email_broadcasts_deleted_at", "email_broadcasts", ["deleted_at"])

    # email_broadcast_sends
    op.create_table(
        "email_broadcast_sends",
        sa.Column("id", sa.Uuid(), nullable=False, default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("broadcast_id", sa.Uuid(), nullable=False),
        sa.Column("subscriber_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("resend_email_id", sa.String(255), nullable=True),
        sa.Column("sent_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("opened_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("open_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("clicked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("click_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("bounced_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("unsubscribed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["broadcast_id"], ["email_broadcasts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subscriber_id"], ["email_subscribers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("broadcast_id", "subscriber_id", name="email_broadcast_sends_broadcast_sub_key"),
    )
    op.create_index("ix_email_broadcast_sends_broadcast_id", "email_broadcast_sends", ["broadcast_id"])
    op.create_index("ix_email_broadcast_sends_subscriber_id", "email_broadcast_sends", ["subscriber_id"])
    op.create_index("ix_email_broadcast_sends_broadcast_id_status", "email_broadcast_sends", ["broadcast_id", "status"])
    op.create_index("ix_email_broadcast_sends_created_at", "email_broadcast_sends", ["created_at"])
    op.create_index("ix_email_broadcast_sends_deleted_at", "email_broadcast_sends", ["deleted_at"])


def downgrade() -> None:
    op.drop_table("email_broadcast_sends")
    op.drop_table("email_broadcasts")
    op.drop_table("email_segment_subscribers")
    op.drop_table("email_segments")
    op.drop_table("email_subscribers")
