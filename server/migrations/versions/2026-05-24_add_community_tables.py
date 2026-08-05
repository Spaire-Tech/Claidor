"""Add community feed tables (settings, tags, posts, post_media, comments, reactions)

Revision ID: b8f3c9a2e571
Revises: 5b9f3e7a2c08
Create Date: 2026-05-24 12:00:00.000000

Introduces the per-course Community feed. Six new tables — no changes to
existing tables, no data migration. See
docs/plans/community-feed-decision-comments-table.md for the rationale on
why comments are a fork of lesson_comments rather than polymorphic.

Chains off 5b9f3e7a2c08 (the enrollments-from-subscriptions backfill),
which itself sits downstream of the 4d2b6c91e0a3 four-way head merge.
Before that merge landed, this migration pointed at one of the
pre-merge heads (1f3a55e2b610) and would have re-opened the multi-head
situation that merge fixed.

Tables:
  community_settings      one row per course (creator's editor state)
  community_tags          creator-customizable post-type labels
                          (Question / Win / Prompt / Milestone seeded)
  community_posts         top-level posts; pin/announcement state stored
                          inline (no separate pins table)
  community_post_media    1:N attachments per post (image via file_id,
                          video via mux fields — mirrors course_lessons)
  community_comments      replies on posts; supports timestamp_seconds for
                          video posts so replies cluster on the scrubber
  community_reactions     fixed-emoji toggle table; one row per
                          (target, actor, emoji), unique-constrained
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "b8f3c9a2e571"
down_revision = "5b9f3e7a2c08"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


# Fixed emoji set for v1. Stored as a CHECK constraint rather than an enum
# so adding/removing emojis later is a one-line migration instead of a
# Postgres enum rebuild.
ALLOWED_EMOJIS = ("clap", "heart", "fire", "idea", "pray")
EMOJI_CHECK = "emoji IN ('clap', 'heart', 'fire', 'idea', 'pray')"

# Reaction targets — extend later if we ever allow reacting to comments
# from a different surface.
REACTION_TARGET_CHECK = "target_type IN ('post', 'comment')"


def upgrade() -> None:
    # ============================================================
    # community_settings — per-course creator config
    # ============================================================
    # One row per course. Created lazily on first community-tab visit
    # in the course builder. The `*_overrides` JSONB columns mirror the
    # pattern used by `courses.landing_overrides` — they hold whatever
    # the creator typed into the inline-edit surface, falling back to
    # computed defaults when null.
    op.create_table(
        "community_settings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column(
            "enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        # When false, the Community tab is reachable by deep link but
        # not shown in the PortalShell tab bar. Lets a creator soft-launch
        # to a cohort before exposing it course-wide.
        sa.Column(
            "show_in_portal_tabs",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "comments_mode",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'visible'"),
        ),
        # Hero block on the feed home.
        sa.Column("hero_thumbnail_url", sa.String(500), nullable=True),
        sa.Column("hero_thumbnail_object_position", sa.String(32), nullable=True),
        sa.Column("feed_title_override", sa.String(120), nullable=True),
        sa.Column("feed_eyebrow_override", sa.String(120), nullable=True),
        # Inline-rename of CourseModule.title in the community context
        # only. Shape: { "<module_uuid>": "Hydration & Dough", ... }.
        # CourseModule.title remains the source of truth everywhere else.
        sa.Column(
            "module_label_overrides",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        # Persisted ordering of modules in the rail. Shape: ["<uuid>", ...].
        # Null = inherit CourseModule.position.
        sa.Column(
            "module_order",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        # Feature toggles surfaced in the course-builder Community tab.
        sa.Column(
            "reactions_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "milestones_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "watching_rail_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        # Don't render "1 student watching" — it feels sad. Default 3.
        sa.Column(
            "watching_rail_threshold",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("3"),
        ),
        # Manual override; null = auto-computed weekly from creator activity.
        sa.Column("presence_blurb", sa.Text(), nullable=True),
        # FK to the post currently pinned as the prompt-of-the-week.
        # Nullable; the post itself carries the pin metadata, this is
        # just a fast lookup. NOT a true FK to community_posts because
        # of circular create order — enforced in the service layer.
        sa.Column("prompt_of_week_post_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_id"],
            ["courses.id"],
            name="community_settings_course_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="community_settings_pkey"),
        sa.UniqueConstraint("course_id", name="community_settings_course_id_unique"),
        sa.CheckConstraint(
            "comments_mode IN ('visible', 'hidden', 'locked')",
            name="community_settings_comments_mode_check",
        ),
        sa.CheckConstraint(
            "watching_rail_threshold >= 1",
            name="community_settings_watching_rail_threshold_check",
        ),
    )

    # ============================================================
    # community_tags — creator-customizable post-type labels
    # ============================================================
    # Seeded with Question / Win / Prompt / Milestone via a separate
    # data step at the end of upgrade(). Creators can rename, add, or
    # delete (subject to "tag has 0 posts" in the service layer).
    op.create_table(
        "community_tags",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        # Slug is stable identifier; label is the display string the
        # creator can rename. The four seeded slugs (question/win/prompt/
        # milestone) are referenced by string in the milestone job and
        # in the default filter chip set.
        sa.Column("slug", sa.String(50), nullable=False),
        sa.Column("label", sa.String(50), nullable=False),
        sa.Column(
            "position",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.ForeignKeyConstraint(
            ["course_id"],
            ["courses.id"],
            name="community_tags_course_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="community_tags_pkey"),
        # Partial unique: same slug allowed across courses, unique within
        # a course among non-deleted rows.
        sa.Index(
            "ix_community_tags_course_slug_active",
            "course_id",
            "slug",
            unique=True,
            postgresql_where=sa.text("deleted_at IS NULL"),
        ),
    )
    op.create_index("ix_community_tags_course_id", "community_tags", ["course_id"])

    # ============================================================
    # community_posts — top-level posts
    # ============================================================
    # Pin state is stored inline (no separate pins table) — each post
    # has at most one active pin via `pinned_at` / `pin_type` / `pin_expires_at`.
    # The author is either an enrollment (student) OR a user (creator/admin),
    # never both, enforced by CHECK.
    op.create_table(
        "community_posts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        # Author union — exactly one must be set.
        sa.Column("author_enrollment_id", sa.Uuid(), nullable=True),
        sa.Column("author_user_id", sa.Uuid(), nullable=True),
        # 'text'  — body only (no media)
        # 'video' — has a community_post_media row of media_type='video';
        #           replies may carry timestamp_seconds for the scrubber.
        # Image posts are 'text' with one or more image media rows.
        sa.Column(
            "type",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'text'"),
        ),
        # Optional title — short posts go straight into body.
        sa.Column("title", sa.String(280), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        # Stored as markdown (Tiptap RichTextEditor round-trips it).
        sa.Column(
            "body_format",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'markdown'"),
        ),
        # "re: Module 2 — Hydration" chip. Soft-link; if the lesson is
        # deleted we keep the post but the chip stops resolving.
        sa.Column("lesson_id", sa.Uuid(), nullable=True),
        # One tag per post (Question/Win/Prompt/Milestone) — see decision
        # doc for why we don't M:N. Set to NULL on tag deletion.
        sa.Column("tag_id", sa.Uuid(), nullable=True),
        # Sort cursor. Lets the creator schedule publish via a future
        # `published_at` while leaving the row draft (deleted_at IS NULL,
        # published_at IS NULL).
        sa.Column(
            "published_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
        # Pin block — inline because each post has at most one pin and
        # the feed query needs `coalesce(pinned_at, published_at)` as a
        # sort key without a join.
        sa.Column("pinned_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("pin_type", sa.String(30), nullable=True),
        sa.Column("pin_expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
        # Per-post override of the course-wide comments_mode. Null =
        # inherit from community_settings.comments_mode.
        sa.Column("comments_mode", sa.String(20), nullable=True),
        # Materialized counters — cheaper than count(*) on every render
        # and updated by the service on react/comment/un-react.
        sa.Column(
            "reaction_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "comment_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.ForeignKeyConstraint(
            ["course_id"],
            ["courses.id"],
            name="community_posts_course_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["author_enrollment_id"],
            ["course_enrollments.id"],
            name="community_posts_author_enrollment_id_fkey",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["author_user_id"],
            ["users.id"],
            name="community_posts_author_user_id_fkey",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["lesson_id"],
            ["course_lessons.id"],
            name="community_posts_lesson_id_fkey",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"],
            ["community_tags.id"],
            name="community_posts_tag_id_fkey",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="community_posts_pkey"),
        sa.CheckConstraint(
            "(author_enrollment_id IS NOT NULL)::int "
            "+ (author_user_id IS NOT NULL)::int = 1",
            name="community_posts_author_exactly_one_check",
        ),
        sa.CheckConstraint(
            "type IN ('text', 'video')",
            name="community_posts_type_check",
        ),
        sa.CheckConstraint(
            "body_format IN ('markdown', 'plain')",
            name="community_posts_body_format_check",
        ),
        sa.CheckConstraint(
            "comments_mode IS NULL OR comments_mode IN ('visible', 'hidden', 'locked')",
            name="community_posts_comments_mode_check",
        ),
        sa.CheckConstraint(
            "pin_type IS NULL OR pin_type IN ('announcement', 'prompt_of_week')",
            name="community_posts_pin_type_check",
        ),
        # If pin_type is set, pinned_at must be set too — guards against
        # half-set pin state from a bad service write.
        sa.CheckConstraint(
            "(pin_type IS NULL) = (pinned_at IS NULL)",
            name="community_posts_pin_consistency_check",
        ),
    )
    # Hot path: feed by course, sorted by coalesce(pinned_at, published_at) desc.
    # Partial index on visible (non-deleted, published) rows — most feed
    # queries hit this.
    op.create_index(
        "ix_community_posts_course_published",
        "community_posts",
        ["course_id", sa.text("published_at DESC")],
        postgresql_where=sa.text("deleted_at IS NULL AND published_at IS NOT NULL"),
    )
    op.create_index(
        "ix_community_posts_course_pinned",
        "community_posts",
        ["course_id", sa.text("pinned_at DESC")],
        postgresql_where=sa.text("deleted_at IS NULL AND pinned_at IS NOT NULL"),
    )
    op.create_index(
        "ix_community_posts_lesson_id",
        "community_posts",
        ["lesson_id"],
        postgresql_where=sa.text("lesson_id IS NOT NULL"),
    )
    op.create_index(
        "ix_community_posts_tag_id",
        "community_posts",
        ["tag_id"],
        postgresql_where=sa.text("tag_id IS NOT NULL"),
    )
    op.create_index(
        "ix_community_posts_author_enrollment_id",
        "community_posts",
        ["author_enrollment_id"],
        postgresql_where=sa.text("author_enrollment_id IS NOT NULL"),
    )
    op.create_index(
        "ix_community_posts_author_user_id",
        "community_posts",
        ["author_user_id"],
        postgresql_where=sa.text("author_user_id IS NOT NULL"),
    )

    # ============================================================
    # community_post_media — attachments
    # ============================================================
    # Images go through polar.file (S3 presign), so we FK to files.id.
    # Videos go through Mux direct-upload (same as course_lessons), so
    # we duplicate the mux_* columns rather than threading lessons.
    op.create_table(
        "community_post_media",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("post_id", sa.Uuid(), nullable=False),
        sa.Column(
            "position",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("media_type", sa.String(20), nullable=False),
        # Image branch.
        sa.Column("file_id", sa.Uuid(), nullable=True),
        # Video branch — mirrors course_lessons.
        sa.Column("mux_upload_id", sa.String(255), nullable=True),
        sa.Column("mux_asset_id", sa.String(255), nullable=True),
        sa.Column("mux_playback_id", sa.String(255), nullable=True),
        sa.Column("mux_status", sa.String(30), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("thumbnail_url", sa.String(500), nullable=True),
        sa.ForeignKeyConstraint(
            ["post_id"],
            ["community_posts.id"],
            name="community_post_media_post_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["file_id"],
            ["files.id"],
            name="community_post_media_file_id_fkey",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="community_post_media_pkey"),
        sa.CheckConstraint(
            "media_type IN ('image', 'video')",
            name="community_post_media_type_check",
        ),
        # An image row must have file_id; a video row must have mux fields.
        sa.CheckConstraint(
            "(media_type = 'image' AND file_id IS NOT NULL) "
            "OR (media_type = 'video' "
            "    AND (mux_upload_id IS NOT NULL OR mux_asset_id IS NOT NULL))",
            name="community_post_media_branch_check",
        ),
    )
    op.create_index(
        "ix_community_post_media_post_id",
        "community_post_media",
        ["post_id"],
    )
    # Mux webhook lookups need an O(1) path back to the media row.
    op.create_index(
        "ix_community_post_media_mux_upload_id",
        "community_post_media",
        ["mux_upload_id"],
        unique=True,
        postgresql_where=sa.text("mux_upload_id IS NOT NULL"),
    )

    # ============================================================
    # community_comments — replies on posts
    # ============================================================
    # Forked from lesson_comments (see decision doc). Adds:
    #   - author union (enrollment | user) so creators can reply
    #   - timestamp_seconds for video-post replies
    op.create_table(
        "community_comments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("post_id", sa.Uuid(), nullable=False),
        sa.Column("parent_id", sa.Uuid(), nullable=True),
        sa.Column("author_enrollment_id", sa.Uuid(), nullable=True),
        sa.Column("author_user_id", sa.Uuid(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        # For replies pinned to a moment in a video post. Null on all
        # other replies. Clipped to the media duration in the service.
        sa.Column("timestamp_seconds", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["post_id"],
            ["community_posts.id"],
            name="community_comments_post_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["community_comments.id"],
            name="community_comments_parent_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["author_enrollment_id"],
            ["course_enrollments.id"],
            name="community_comments_author_enrollment_id_fkey",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["author_user_id"],
            ["users.id"],
            name="community_comments_author_user_id_fkey",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="community_comments_pkey"),
        sa.CheckConstraint(
            "(author_enrollment_id IS NOT NULL)::int "
            "+ (author_user_id IS NOT NULL)::int = 1",
            name="community_comments_author_exactly_one_check",
        ),
        sa.CheckConstraint(
            "timestamp_seconds IS NULL OR timestamp_seconds >= 0",
            name="community_comments_timestamp_seconds_check",
        ),
    )
    op.create_index("ix_community_comments_post_id", "community_comments", ["post_id"])
    op.create_index(
        "ix_community_comments_parent_id",
        "community_comments",
        ["parent_id"],
        postgresql_where=sa.text("parent_id IS NOT NULL"),
    )
    op.create_index(
        "ix_community_comments_author_enrollment_id",
        "community_comments",
        ["author_enrollment_id"],
        postgresql_where=sa.text("author_enrollment_id IS NOT NULL"),
    )
    op.create_index(
        "ix_community_comments_author_user_id",
        "community_comments",
        ["author_user_id"],
        postgresql_where=sa.text("author_user_id IS NOT NULL"),
    )

    # ============================================================
    # community_reactions — fixed-emoji toggle table
    # ============================================================
    # Targets both posts and comments (target_type discriminator) so the
    # same composer can react to either without a second table. The
    # composite UNIQUE (target_type, target_id, actor_enrollment_id,
    # actor_user_id, emoji) is the toggle key — POST upserts, DELETE
    # untoggles.
    op.create_table(
        "community_reactions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("target_type", sa.String(20), nullable=False),
        sa.Column("target_id", sa.Uuid(), nullable=False),
        # Actor union — same shape as the post/comment author union.
        sa.Column("actor_enrollment_id", sa.Uuid(), nullable=True),
        sa.Column("actor_user_id", sa.Uuid(), nullable=True),
        sa.Column("emoji", sa.String(20), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_enrollment_id"],
            ["course_enrollments.id"],
            name="community_reactions_actor_enrollment_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            name="community_reactions_actor_user_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="community_reactions_pkey"),
        sa.CheckConstraint(
            "(actor_enrollment_id IS NOT NULL)::int "
            "+ (actor_user_id IS NOT NULL)::int = 1",
            name="community_reactions_actor_exactly_one_check",
        ),
        sa.CheckConstraint(EMOJI_CHECK, name="community_reactions_emoji_check"),
        sa.CheckConstraint(
            REACTION_TARGET_CHECK,
            name="community_reactions_target_type_check",
        ),
    )
    # One reaction per (target, actor, emoji) — toggle-key. Because the
    # actor union splits across two columns we need two partial unique
    # indexes (Postgres treats NULLs as distinct in plain UNIQUE).
    op.create_index(
        "ix_community_reactions_unique_enrollment",
        "community_reactions",
        ["target_type", "target_id", "actor_enrollment_id", "emoji"],
        unique=True,
        postgresql_where=sa.text("actor_enrollment_id IS NOT NULL"),
    )
    op.create_index(
        "ix_community_reactions_unique_user",
        "community_reactions",
        ["target_type", "target_id", "actor_user_id", "emoji"],
        unique=True,
        postgresql_where=sa.text("actor_user_id IS NOT NULL"),
    )
    # Render-time lookup: "all reactions on these N posts".
    op.create_index(
        "ix_community_reactions_target",
        "community_reactions",
        ["target_type", "target_id"],
    )


def downgrade() -> None:
    # Drop in reverse FK order.
    op.drop_index("ix_community_reactions_target", "community_reactions")
    op.drop_index("ix_community_reactions_unique_user", "community_reactions")
    op.drop_index("ix_community_reactions_unique_enrollment", "community_reactions")
    op.drop_table("community_reactions")

    op.drop_index("ix_community_comments_author_user_id", "community_comments")
    op.drop_index("ix_community_comments_author_enrollment_id", "community_comments")
    op.drop_index("ix_community_comments_parent_id", "community_comments")
    op.drop_index("ix_community_comments_post_id", "community_comments")
    op.drop_table("community_comments")

    op.drop_index("ix_community_post_media_mux_upload_id", "community_post_media")
    op.drop_index("ix_community_post_media_post_id", "community_post_media")
    op.drop_table("community_post_media")

    op.drop_index("ix_community_posts_author_user_id", "community_posts")
    op.drop_index("ix_community_posts_author_enrollment_id", "community_posts")
    op.drop_index("ix_community_posts_tag_id", "community_posts")
    op.drop_index("ix_community_posts_lesson_id", "community_posts")
    op.drop_index("ix_community_posts_course_pinned", "community_posts")
    op.drop_index("ix_community_posts_course_published", "community_posts")
    op.drop_table("community_posts")

    op.drop_index("ix_community_tags_course_id", "community_tags")
    op.drop_index("ix_community_tags_course_slug_active", "community_tags")
    op.drop_table("community_tags")

    op.drop_table("community_settings")
