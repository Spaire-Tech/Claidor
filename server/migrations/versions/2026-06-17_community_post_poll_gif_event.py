"""Community posts: polls, GIF attachments, and event-link

Revision ID: comm_post_extras_617
Revises: comm_settings_mod_617
Create Date: 2026-06-17 10:00:00.000000

Backs the remaining composer tools in the Community Hub:

- community_posts.poll      JSONB — { options:[{id,text}], votes:{id:n},
                            voters:{actor_key:id} }; null when the post has
                            no poll. One vote per user enforced in the service.
- community_posts.event_id  FK → community_events (SET NULL) — a post can embed
                            a scheduled event card.
- community_post_media.external_url  TEXT — the GIF URL for media_type='gif'
                            (GIPHY). image/video branches are unchanged.

The media type + branch CHECK constraints are widened to allow 'gif'. Idempotent
ADD COLUMN IF NOT EXISTS + DROP/ADD CONSTRAINT so re-runs are safe.
"""

from alembic import op

revision = "comm_post_extras_617"
down_revision = "comm_settings_mod_617"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    # community_posts: poll + event_id
    op.execute(
        "ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS poll JSONB"
    )
    op.execute(
        "ALTER TABLE community_posts "
        "ADD COLUMN IF NOT EXISTS event_id UUID"
    )
    op.execute(
        "ALTER TABLE community_posts "
        "DROP CONSTRAINT IF EXISTS community_posts_event_id_fkey"
    )
    op.execute(
        "ALTER TABLE community_posts "
        "ADD CONSTRAINT community_posts_event_id_fkey "
        "FOREIGN KEY (event_id) REFERENCES community_events(id) "
        "ON DELETE SET NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_community_posts_event_id "
        "ON community_posts (event_id) WHERE event_id IS NOT NULL"
    )

    # community_post_media: external_url + widen the type/branch CHECKs
    op.execute(
        "ALTER TABLE community_post_media "
        "ADD COLUMN IF NOT EXISTS external_url TEXT"
    )
    op.execute(
        "ALTER TABLE community_post_media "
        "DROP CONSTRAINT IF EXISTS community_post_media_type_check"
    )
    op.execute(
        "ALTER TABLE community_post_media "
        "ADD CONSTRAINT community_post_media_type_check "
        "CHECK (media_type IN ('image', 'video', 'gif'))"
    )
    op.execute(
        "ALTER TABLE community_post_media "
        "DROP CONSTRAINT IF EXISTS community_post_media_branch_check"
    )
    op.execute(
        "ALTER TABLE community_post_media "
        "ADD CONSTRAINT community_post_media_branch_check CHECK ("
        "(media_type = 'image' AND file_id IS NOT NULL) "
        "OR (media_type = 'video' "
        "    AND (mux_upload_id IS NOT NULL OR mux_asset_id IS NOT NULL)) "
        "OR (media_type = 'gif' AND external_url IS NOT NULL))"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE community_post_media "
        "DROP CONSTRAINT IF EXISTS community_post_media_branch_check"
    )
    op.execute(
        "ALTER TABLE community_post_media "
        "ADD CONSTRAINT community_post_media_branch_check CHECK ("
        "(media_type = 'image' AND file_id IS NOT NULL) "
        "OR (media_type = 'video' "
        "    AND (mux_upload_id IS NOT NULL OR mux_asset_id IS NOT NULL)))"
    )
    op.execute(
        "ALTER TABLE community_post_media "
        "DROP CONSTRAINT IF EXISTS community_post_media_type_check"
    )
    op.execute(
        "ALTER TABLE community_post_media "
        "ADD CONSTRAINT community_post_media_type_check "
        "CHECK (media_type IN ('image', 'video'))"
    )
    op.execute(
        "ALTER TABLE community_post_media DROP COLUMN IF EXISTS external_url"
    )
    op.execute("DROP INDEX IF EXISTS ix_community_posts_event_id")
    op.execute(
        "ALTER TABLE community_posts "
        "DROP CONSTRAINT IF EXISTS community_posts_event_id_fkey"
    )
    op.execute("ALTER TABLE community_posts DROP COLUMN IF EXISTS event_id")
    op.execute("ALTER TABLE community_posts DROP COLUMN IF EXISTS poll")
