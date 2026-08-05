"""Community settings: moderation, events, and notification controls

Revision ID: comm_settings_mod_617
Revises: lesson_cmt_mod_613
Create Date: 2026-06-17 09:00:00.000000

Adds the creator-facing controls surfaced by the Community Hub Settings tab
that the existing community_settings row didn't yet store:

- who_can_post            'everyone' | 'approved'
- moderate_new_members    review the first post from new members
- profanity_filter        auto-hide flagged language
- default_meeting_provider 'zoom' | 'meet' | 'teams' | 'webex' | 'other'
- member_rsvp             let members RSVP to events
- notify_new_submissions  email the host on new submissions
- notify_new_comments     email the host on new comments
- weekly_digest           Monday recap email to members
- archived                community archived (hidden + paused, restorable)

All NOT NULL with server defaults matching the design's defaults, so existing
rows backfill cleanly. Idempotent ADD COLUMN IF NOT EXISTS so re-runs are safe.
"""

from alembic import op

revision = "comm_settings_mod_617"
down_revision = "lesson_cmt_mod_613"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


_BOOL_COLUMNS = [
    ("moderate_new_members", "true"),
    ("profanity_filter", "true"),
    ("member_rsvp", "true"),
    ("notify_new_submissions", "true"),
    ("notify_new_comments", "false"),
    ("weekly_digest", "true"),
    ("archived", "false"),
]


def upgrade() -> None:
    op.execute(
        "ALTER TABLE community_settings "
        "ADD COLUMN IF NOT EXISTS who_can_post VARCHAR(20) "
        "NOT NULL DEFAULT 'everyone'"
    )
    op.execute(
        "ALTER TABLE community_settings "
        "ADD COLUMN IF NOT EXISTS default_meeting_provider VARCHAR(20) "
        "NOT NULL DEFAULT 'zoom'"
    )
    for name, default in _BOOL_COLUMNS:
        op.execute(
            f"ALTER TABLE community_settings "
            f"ADD COLUMN IF NOT EXISTS {name} BOOLEAN "
            f"NOT NULL DEFAULT {default}"
        )

    # Value guards (dropped first so a re-run can recreate them cleanly).
    op.execute(
        "ALTER TABLE community_settings "
        "DROP CONSTRAINT IF EXISTS community_settings_who_can_post_check"
    )
    op.execute(
        "ALTER TABLE community_settings "
        "ADD CONSTRAINT community_settings_who_can_post_check "
        "CHECK (who_can_post IN ('everyone', 'approved'))"
    )
    op.execute(
        "ALTER TABLE community_settings "
        "DROP CONSTRAINT IF EXISTS community_settings_default_provider_check"
    )
    op.execute(
        "ALTER TABLE community_settings "
        "ADD CONSTRAINT community_settings_default_provider_check "
        "CHECK (default_meeting_provider IN "
        "('zoom', 'meet', 'teams', 'webex', 'other'))"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE community_settings "
        "DROP CONSTRAINT IF EXISTS community_settings_who_can_post_check"
    )
    op.execute(
        "ALTER TABLE community_settings "
        "DROP CONSTRAINT IF EXISTS community_settings_default_provider_check"
    )
    for name, _ in _BOOL_COLUMNS:
        op.execute(f"ALTER TABLE community_settings DROP COLUMN IF EXISTS {name}")
    op.execute(
        "ALTER TABLE community_settings DROP COLUMN IF EXISTS who_can_post"
    )
    op.execute(
        "ALTER TABLE community_settings "
        "DROP COLUMN IF EXISTS default_meeting_provider"
    )
