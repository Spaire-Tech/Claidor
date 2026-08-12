"""what a cell reads that could not be followed

Revision ID: a7e1c3d95b40
Revises: f2a6b9c04d13
Create Date: 2026-08-12 02:00:00.000000

`tieout_cells.precedents` has always held what a formula reads. It
has never held what a formula reads that could not be resolved to a cell —
a reference into another workbook, a defined name left pointing at
`#REF!`, a range longer than the chain will follow — and those were simply
dropped.

Measured on two financial models published by Ofgem: 2,602 formulas of
59,705 came back with a chain short by one input and no indication of it.
On the 2015 transmission model that was 11.7% of every formula in the
file, and the dropped input was the defined name selecting which company
the entire model was calculating for, referenced 3,542 times.

A chain missing an input while presenting itself as complete is the one
failure a product about provenance cannot afford. So the other half is
stored beside the first, and the screen can say it.

Backfilled as an empty list, not null. Every existing row was read before
the parser could see any of this, so an empty list is not a claim that
nothing was unresolved — it is a claim that nothing was recorded, which is
what re-ingesting the model fixes.

Hand-written, for the reason the last seven were: autogenerate wants to
drop pg_trgm and several unrelated indexes it did not create.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "a7e1c3d95b40"
down_revision = "f2a6b9c04d13"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column(
        "tieout_cells",
        sa.Column(
            "unresolved",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )


def downgrade() -> None:
    op.drop_column("tieout_cells", "unresolved")
