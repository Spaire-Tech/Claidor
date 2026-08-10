"""a figure knows where it physically sits

Revision ID: b8d4e0f37a91
Revises: e5a2c971f4d8
Create Date: 2026-08-10 16:10:00.000000

`location` is prose — « slide 3, row « Adjusted EBITDA », column
« FY2026E » ». It is written for a person reading a finding and it is the
right thing to show them.

The panel inside PowerPoint needs the same fact in coordinates it can act
on, because its whole reason to exist is that clicking a finding selects
the shape on the slide. Parsing that sentence back into a selection works
on the deck it was written against and on no other, so the position is
stored twice on purpose: once in words, once in numbers.

Hand-written, for the reason the last four were: autogenerate wants to
drop pg_trgm and several unrelated indexes it did not create.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "b8d4e0f37a91"
down_revision = "e5a2c971f4d8"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    for table in ("tieout_figures", "tieout_findings"):
        op.add_column(
            table,
            sa.Column(
                "anchor",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default="{}",
            ),
        )


def downgrade() -> None:
    for table in ("tieout_figures", "tieout_findings"):
        op.drop_column(table, "anchor")
