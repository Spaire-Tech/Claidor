"""Community reactions: one row per (target, actor) — switch, not stack

Revision ID: comm_rxn_1per_527
Revises: actsub_ipos_526
Create Date: 2026-05-27 00:00:00.000000

Reactions were originally modeled as a per-emoji toggle: the unique key
was (target, actor, emoji), so the same user could end up with multiple
reaction rows on one post (one per emoji). The UI was always
LinkedIn-style — a single picker that "switches" the user's reaction —
so the data model never matched the UX. Symptoms reported by users:
the counter doubled/tripled on click, picking a different emoji left
the previous one in place, and a hard refresh would surface the actual
(different) server-side count.

This migration tightens the data model so it can't be wrong:

  1. Deduplicate any existing (target, actor) pairs with >1 row by
     keeping the newest reaction and deleting the rest.
  2. Replace the two partial unique indexes on
     (target_type, target_id, actor_*, emoji) with partial unique
     indexes on (target_type, target_id, actor_*). One reaction per
     user per target, period.
  3. Re-materialize community_posts.reaction_count from the deduped
     rows so the counter matches reality going forward.
"""

from alembic import op

revision = "comm_rxn_1per_527"
down_revision = "actsub_ipos_526"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Deduplicate: keep the newest row per (target, actor). The
    #    "newest" choice is arbitrary but deterministic — created_at
    #    DESC, id DESC as tiebreaker — and matches what the user
    #    most recently clicked, which is the least surprising state
    #    to land on.
    op.execute(
        """
        DELETE FROM community_reactions r
        USING (
            SELECT id
            FROM (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY
                            target_type,
                            target_id,
                            COALESCE(actor_enrollment_id, actor_user_id)
                        ORDER BY created_at DESC, id DESC
                    ) AS rn
                FROM community_reactions
            ) ranked
            WHERE ranked.rn > 1
        ) dupes
        WHERE r.id = dupes.id
        """
    )

    # 2. Swap the unique indexes. The old ones admitted multiple rows
    #    per actor as long as the emoji differed; the new ones cap it
    #    at one row per actor per target.
    op.drop_index(
        "ix_community_reactions_unique_enrollment",
        table_name="community_reactions",
    )
    op.drop_index(
        "ix_community_reactions_unique_user",
        table_name="community_reactions",
    )
    op.execute(
        """
        CREATE UNIQUE INDEX ix_community_reactions_unique_enrollment
        ON community_reactions (target_type, target_id, actor_enrollment_id)
        WHERE actor_enrollment_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX ix_community_reactions_unique_user
        ON community_reactions (target_type, target_id, actor_user_id)
        WHERE actor_user_id IS NOT NULL
        """
    )

    # 3. Re-sync the materialized post-level counter against the
    #    deduplicated row count. Posts with no reactions get 0.
    op.execute(
        """
        UPDATE community_posts p
        SET reaction_count = COALESCE(c.cnt, 0)
        FROM (
            SELECT p2.id, COUNT(r.id) AS cnt
            FROM community_posts p2
            LEFT JOIN community_reactions r
                ON r.target_type = 'post' AND r.target_id = p2.id
            GROUP BY p2.id
        ) c
        WHERE p.id = c.id
          AND p.reaction_count IS DISTINCT FROM COALESCE(c.cnt, 0)
        """
    )


def downgrade() -> None:
    op.drop_index(
        "ix_community_reactions_unique_user",
        table_name="community_reactions",
    )
    op.drop_index(
        "ix_community_reactions_unique_enrollment",
        table_name="community_reactions",
    )
    op.execute(
        """
        CREATE UNIQUE INDEX ix_community_reactions_unique_enrollment
        ON community_reactions
            (target_type, target_id, actor_enrollment_id, emoji)
        WHERE actor_enrollment_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX ix_community_reactions_unique_user
        ON community_reactions
            (target_type, target_id, actor_user_id, emoji)
        WHERE actor_user_id IS NOT NULL
        """
    )
