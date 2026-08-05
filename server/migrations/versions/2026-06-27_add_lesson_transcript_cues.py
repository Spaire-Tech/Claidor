"""Add timestamped caption cues to course lessons

Revision ID: ca_cues_627
Revises: ca_settings_626
Create Date: 2026-06-27 00:00:00.000000

Adds ``course_lessons.transcript_cues`` (JSONB): the timestamped caption cues
``[{"t": int_seconds, "text": str}, ...]`` aligned with the plain-text
``transcript``. Lets the Course Assistant map an answer citation back to the
moment in the video, so a citation can open the lesson at that second. Nullable
and backfilled lazily as transcripts are (re)fetched.

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# Polar Custom Imports

# revision identifiers, used by Alembic.
revision = "ca_cues_627"
down_revision = "ca_settings_626"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "course_lessons",
        sa.Column(
            "transcript_cues",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("course_lessons", "transcript_cues")
