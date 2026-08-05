"""Add forms, form_custom_fields and form_submissions

Revision ID: forms_lead_magnet_608
Revises: ce_announce_527
Create Date: 2026-06-08 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# Polar Custom Imports

# revision identifiers, used by Alembic.
revision = "forms_lead_magnet_608"
down_revision = "ce_announce_527"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    # forms
    op.create_table(
        "forms",
        sa.Column(
            "id",
            sa.Uuid(),
            nullable=False,
            default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("subtitle", sa.String(255), nullable=True),
        sa.Column(
            "button_label",
            sa.String(50),
            nullable=False,
            server_default="Submit",
        ),
        sa.Column("success_message", sa.String(500), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("file_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["file_id"], ["files.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id", "slug", name="forms_organization_id_slug_key"
        ),
    )
    op.create_index("ix_forms_organization_id", "forms", ["organization_id"])
    op.create_index("ix_forms_created_at", "forms", ["created_at"])
    op.create_index("ix_forms_deleted_at", "forms", ["deleted_at"])

    # form_custom_fields (association table; composite PK mirrors
    # product_custom_fields)
    op.create_table(
        "form_custom_fields",
        sa.Column("form_id", sa.Uuid(), nullable=False),
        sa.Column("custom_field_id", sa.Uuid(), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column(
            "required",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "id",
            sa.Uuid(),
            nullable=False,
            default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["custom_field_id"], ["custom_fields.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["form_id"], ["forms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("form_id", "custom_field_id", "id"),
        sa.UniqueConstraint(
            "form_id", "order", name="form_custom_fields_form_id_order_key"
        ),
    )
    op.create_index("ix_form_custom_fields_order", "form_custom_fields", ["order"])
    op.create_index(
        "ix_form_custom_fields_created_at", "form_custom_fields", ["created_at"]
    )
    op.create_index(
        "ix_form_custom_fields_deleted_at", "form_custom_fields", ["deleted_at"]
    )

    # form_submissions
    op.create_table(
        "form_submissions",
        sa.Column(
            "id",
            sa.Uuid(),
            nullable=False,
            default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("form_id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("name", sa.String(256), nullable=True),
        sa.Column("email_subscriber_id", sa.Uuid(), nullable=True),
        sa.Column(
            "custom_field_data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.ForeignKeyConstraint(["form_id"], ["forms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["email_subscriber_id"],
            ["email_subscribers.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_form_submissions_form_id", "form_submissions", ["form_id"])
    op.create_index(
        "ix_form_submissions_organization_id",
        "form_submissions",
        ["organization_id"],
    )
    op.create_index(
        "ix_form_submissions_created_at", "form_submissions", ["created_at"]
    )
    op.create_index(
        "ix_form_submissions_deleted_at", "form_submissions", ["deleted_at"]
    )


def downgrade() -> None:
    op.drop_table("form_submissions")
    op.drop_table("form_custom_fields")
    op.drop_table("forms")
