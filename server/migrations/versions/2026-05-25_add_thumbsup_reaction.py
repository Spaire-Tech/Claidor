"""Add thumbsup to the allowed community reaction emojis

Revision ID: thumbsup_rxn525
Revises: cust_avatar_525
Create Date: 2026-05-25 19:00:00.000000

The community reactions CHECK constraint pinned the emoji set to
('clap', 'heart', 'fire', 'idea', 'pray'). The customer portal now
defaults reactions to a thumbs-up (LinkedIn-style), so widen the
constraint to admit it.

The change is a drop + recreate of the named CHECK — Postgres has no
ALTER CHECK CONSTRAINT, and existing rows trivially satisfy the
widened predicate so the rewrite is non-locking in practice.
"""

from alembic import op

revision = "thumbsup_rxn525"
down_revision = "cust_avatar_525"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "community_reactions_emoji_check",
        "community_reactions",
        type_="check",
    )
    op.create_check_constraint(
        "community_reactions_emoji_check",
        "community_reactions",
        "emoji IN ('thumbsup', 'clap', 'heart', 'fire', 'idea', 'pray')",
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM community_reactions WHERE emoji = 'thumbsup'"
    )
    op.drop_constraint(
        "community_reactions_emoji_check",
        "community_reactions",
        type_="check",
    )
    op.create_check_constraint(
        "community_reactions_emoji_check",
        "community_reactions",
        "emoji IN ('clap', 'heart', 'fire', 'idea', 'pray')",
    )
