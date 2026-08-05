"""Drop tables and columns orphaned by the course/community/masterclass prune

Revision ID: drop_pruned_0805
Revises: merge_heads_0805
Create Date: 2026-08-05 12:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "drop_pruned_0805"
down_revision = "merge_heads_0805"
branch_labels = None
depends_on = None

# Children before parents so FK constraints never block a drop. CASCADE covers
# any cross-references inside the pruned set itself.
PRUNED_TABLES = [
    # community
    "community_activity_submission_comments",
    "community_activity_submissions",
    "community_activities",
    "community_event_announcements",
    "community_event_rsvps",
    "community_events",
    "community_post_media",
    "community_reactions",
    "community_comments",
    "community_posts",
    "community_tags",
    "community_settings",
    # course assistant
    "course_assistant_questions",
    "course_assistants",
    # course engagement
    "lesson_comment_likes",
    "lesson_comments",
    "course_lesson_watch_progress",
    "course_lesson_progress",
    "course_notes",
    "course_enrollments",
    # course structure
    "course_lessons",
    "course_modules",
    "courses",
    # masterclass architect
    "masterclass_architect_analyses",
]


def upgrade() -> None:
    op.drop_column("email_sequences", "course_id")
    op.drop_column("email_sequences", "lesson_id")
    for table in PRUNED_TABLES:
        op.execute(sa.text(f'DROP TABLE IF EXISTS "{table}" CASCADE'))


def downgrade() -> None:
    raise NotImplementedError(
        "The pruned course/community verticals cannot be restored by migration; "
        "restore from the pre-prune database backup instead."
    )
