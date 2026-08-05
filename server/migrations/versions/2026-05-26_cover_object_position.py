"""Add cover_object_position to community_events + community_activities

Also merges thumbsup_rxn525 (added on main while this branch was open) so
`alembic upgrade head` resolves to a single tip again.

cover_object_position stores the focal-point CSS object-position string
('43.5% 62.0%' etc.) the host picked from the ThumbnailPositioner. The
card uses it to render `object-position: <value>` on the cover image
so the chosen focal point survives across thumbnails / hero / preview.

Revision ID: cover_pos_526
Revises: comm_activities_526, thumbsup_rxn525
Create Date: 2026-05-26 12:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "cover_pos_526"
down_revision = ("comm_activities_526", "thumbsup_rxn525")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "community_events",
        sa.Column("cover_object_position", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "community_activities",
        sa.Column("cover_object_position", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("community_activities", "cover_object_position")
    op.drop_column("community_events", "cover_object_position")
