"""Reattach orphan revision 7c8d3e2f9a01 to the migration graph (no-op)

Revision ID: 7c8d3e2f9a01
Revises: cb9a8b32e09c
Create Date: 2026-05-18 22:55:00.000000

Production's alembic_version table is pinned to 7c8d3e2f9a01: an
earlier version of the email-tracking-pipeline migration that was
later force-pushed out of git history and reintroduced under a new
revision id (cb9a8b32e09c). The schema work — creating
resend_webhook_events and its index — already ran in production
under the orphan revision, so we cannot run cb9a8b32e09c there
without colliding ("relation already exists").

This stub re-attaches the orphan as a no-op AFTER cb9a8b32e09c in
the graph:

    e76d1c4a82b9 → cb9a8b32e09c → 7c8d3e2f9a01 (stub) → 1f3a55e2b610

Prod, already at 7c8d3e2f9a01, skips cb9a8b32e09c (treated as past
state) and walks forward from here. Fresh dev DBs run
cb9a8b32e09c (creates the table), then this stub (no-op), then the
rest of the chain — arriving at the same end state.

If a follow-up audit shows cb9a8b32e09c diverges from what
7c8d3e2f9a01 actually applied (extra columns, indexes, etc.), a
proper repair migration will be needed; this stub only re-attaches
the graph so deploys can proceed.
"""

revision = "7c8d3e2f9a01"
down_revision = "cb9a8b32e09c"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
