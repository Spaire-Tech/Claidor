"""the free month started from the iPhone app, no card

Revision ID: desktop_free_trials_1012
Revises: desktop_app_store_1012
Create Date: 2026-10-12 20:00:00.000000

The free month (12 October 2026): the iPhone app starts it at a person's
first sign-in, 30 days with the trial's credits, no card and no checkout
(`simeon.plans.free_month`). One row per person, ever; the row keeps only
a hash of the e-mail once its account is deleted.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "desktop_free_trials_1012"
down_revision = "desktop_app_store_1012"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "desktop_free_trials",
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("email_hash", sa.String(length=64), nullable=False),
        sa.Column("starts_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("ends_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("credits", sa.Integer(), nullable=False),
        sa.Column("device_checked", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_free_trials_user_id_fkey"),
            ondelete="set null",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_free_trials_pkey")),
        sa.UniqueConstraint("user_id", name=op.f("desktop_free_trials_user_id_key")),
    )
    for column in ("user_id", "email_hash", "created_at", "deleted_at"):
        op.create_index(
            op.f(f"ix_desktop_free_trials_{column}"),
            "desktop_free_trials",
            [column],
            unique=False,
        )


def downgrade() -> None:
    for column in ("user_id", "email_hash", "created_at", "deleted_at"):
        op.drop_index(
            op.f(f"ix_desktop_free_trials_{column}"),
            table_name="desktop_free_trials",
        )
    op.drop_table("desktop_free_trials")
