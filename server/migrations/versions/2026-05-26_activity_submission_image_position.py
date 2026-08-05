"""Add image_object_position to community_activity_submissions

The SubmitActivityModal now surfaces the same ThumbnailPositioner used
by activity / event covers so the submitter can pick the focal point
for their uploaded photo. This column stores that choice as a CSS
object-position string ("43.5% 62.0%"). Null = center.

Revision ID: actsub_ipos_526
Revises: actsub_cmt_526
Create Date: 2026-05-26 22:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "actsub_ipos_526"
down_revision = "actsub_cmt_526"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "community_activity_submissions",
        sa.Column(
            "image_object_position", sa.String(length=32), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column(
        "community_activity_submissions", "image_object_position"
    )
