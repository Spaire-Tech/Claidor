"""Lesson comment moderation: pinned_at + instructor_hearted_at

Revision ID: lesson_cmt_mod_613
Revises: lesson_cmt_likes_613
Create Date: 2026-06-13 01:20:00.000000

YouTube-style instructor moderation on lesson comments:

- pinned_at             — at most one pinned comment per lesson (the
                          service unpins siblings when pinning); pinned
                          comments sort to the top of the discussion.
- instructor_hearted_at — the single "creator heart" the instructor can
                          give a comment, rendered as "loved by
                          {instructor}" next to the student hearts.

Both nullable timestamps; NULL means not pinned / not hearted. Idempotent
ADD COLUMN IF NOT EXISTS so re-runs are safe.
"""

from alembic import op

revision = "lesson_cmt_mod_613"
down_revision = "lesson_cmt_likes_613"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE lesson_comments "
        "ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP WITH TIME ZONE"
    )
    op.execute(
        "ALTER TABLE lesson_comments "
        "ADD COLUMN IF NOT EXISTS instructor_hearted_at TIMESTAMP WITH TIME ZONE"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE lesson_comments DROP COLUMN IF EXISTS instructor_hearted_at"
    )
    op.execute("ALTER TABLE lesson_comments DROP COLUMN IF EXISTS pinned_at")
