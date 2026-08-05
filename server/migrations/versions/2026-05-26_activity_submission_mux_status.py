"""Add mux_status + mux_asset_id to community_activity_submissions

Video submissions are uploaded directly to Mux. Before this migration
the submission row only stored mux_upload_id, so we had no way to tell
whether the asset had finished transcoding — players would try to
render a null mux_playback_id and fail silently.

mux_status mirrors community_post_media.mux_status:
  waiting | processing | ready | errored | deleted
mux_asset_id is captured at the same time so cleanup tasks can call
Mux's DELETE /video/v1/assets/{id} when a submission is removed.

Revision ID: actsub_mux_526
Revises: cover_pos_526
Create Date: 2026-05-26 18:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "actsub_mux_526"
down_revision = "cover_pos_526"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "community_activity_submissions",
        sa.Column("mux_asset_id", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "community_activity_submissions",
        sa.Column("mux_status", sa.String(length=20), nullable=True),
    )
    # Seed existing video rows so the webhook handler's "is this a video
    # submission?" lookup by mux_upload_id finds them in a consistent
    # state. Photo / text / link rows stay NULL.
    op.execute(
        """
        UPDATE community_activity_submissions
        SET mux_status = 'waiting'
        WHERE submission_type = 'video'
          AND mux_upload_id IS NOT NULL
          AND mux_playback_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE community_activity_submissions
        SET mux_status = 'ready'
        WHERE submission_type = 'video'
          AND mux_playback_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column("community_activity_submissions", "mux_status")
    op.drop_column("community_activity_submissions", "mux_asset_id")
