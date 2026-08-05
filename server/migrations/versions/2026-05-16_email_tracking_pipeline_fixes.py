"""Email tracking pipeline: resend_email_id index + webhook idempotency

Revision ID: cb9a8b32e09c
Revises: e76d1c4a82b9
Create Date: 2026-05-16 12:00:00.000000

Fixes the open/click rate "always zero" bug:

  * Adds a B-tree index on ``email_broadcast_sends.resend_email_id`` so
    every webhook lookup isn't a table scan. The sibling index on
    ``email_sequence_step_sends`` already exists.
  * Creates ``resend_webhook_events`` to dedupe Svix retries. Without it,
    a single retried ``email.opened`` event would inflate
    ``open_count`` on every retry.

Both indexes are created with ``CONCURRENTLY`` so we don't lock the
table on a hot send path. The ``resend_webhook_events`` table is new
so its index is created inline.

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "cb9a8b32e09c"
down_revision = "e76d1c4a82b9"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    # ── resend_email_id index on email_broadcast_sends ────────────────
    # CONCURRENTLY requires running outside a txn; alembic wraps each
    # migration in one by default, so we drop out via autocommit.
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
            "ix_email_broadcast_sends_resend_email_id "
            "ON email_broadcast_sends (resend_email_id) "
            "WHERE resend_email_id IS NOT NULL"
        )

    # ── webhook idempotency table ─────────────────────────────────────
    op.create_table(
        "resend_webhook_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("(now() AT TIME ZONE 'utc'::text)"),
            nullable=False,
        ),
        sa.Column(
            "modified_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "deleted_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
        sa.Column("webhook_event_id", sa.String(length=255), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("email_id", sa.String(length=255), nullable=True),
        sa.Column(
            "processed_at", sa.TIMESTAMP(timezone=True), nullable=True
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "webhook_event_id",
            name="resend_webhook_events_webhook_event_id_key",
        ),
    )
    op.create_index(
        "ix_resend_webhook_events_webhook_event_id",
        "resend_webhook_events",
        ["webhook_event_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_resend_webhook_events_webhook_event_id",
        table_name="resend_webhook_events",
    )
    op.drop_table("resend_webhook_events")

    with op.get_context().autocommit_block():
        op.execute(
            "DROP INDEX CONCURRENTLY IF EXISTS "
            "ix_email_broadcast_sends_resend_email_id"
        )
