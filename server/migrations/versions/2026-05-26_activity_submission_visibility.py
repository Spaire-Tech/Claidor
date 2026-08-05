"""Add visibility to community_activity_submissions

The SubmitActivityModal exposes a (cohort | all | instr) selector but
the backend was ignoring the choice. This adds a `visibility` column
and a CHECK constraint so the customer-side list endpoint can filter
'instr' submissions out for everyone except the host and the submitter.

Revision ID: actsub_vis_526
Revises: cnp_bell_526
Create Date: 2026-05-26 20:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "actsub_vis_526"
down_revision = "cnp_bell_526"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "community_activity_submissions",
        sa.Column(
            "visibility",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'cohort'"),
        ),
    )
    op.create_check_constraint(
        "community_activity_submissions_visibility_check",
        "community_activity_submissions",
        "visibility IN ('cohort', 'all', 'instr')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "community_activity_submissions_visibility_check",
        "community_activity_submissions",
        type_="check",
    )
    op.drop_column("community_activity_submissions", "visibility")
