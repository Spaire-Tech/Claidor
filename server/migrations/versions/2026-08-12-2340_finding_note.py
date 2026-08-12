"""The reason a person gives when they rule on a finding.

One column: `tieout_findings.note`, the user's own words — « pre-IFRS 16
EBITDA, agreed with the client ». Required when dismissing and only then,
enforced at the endpoint rather than here: a dismissal says the check is
wrong about this one, and that is the decision somebody questions three
weeks later with the author on holiday.

The backfill is the empty string, which means nothing was recorded —
every dismissal that predates this column genuinely carried no reason,
so the empty string is the truth about it rather than a placeholder.

Hand-written, as every migration here is: autogenerate wants to drop
pg_trgm and cannot be trusted with this schema.

Revision ID: c4d8e2f16a53
Revises: a7e1c3d95b40
"""

import sqlalchemy as sa
from alembic import op

revision = "c4d8e2f16a53"
down_revision = "a7e1c3d95b40"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tieout_findings",
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("tieout_findings", "note")
