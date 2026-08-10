"""cell number format

Revision ID: c1f7a9d24e63
Revises: b8d4e0f37a91
Create Date: 2026-08-10 18:30:00.000000

The workbook's own format code, per cell. Presentation rather than data:
the value stays exactly as Excel computed it and this says how the model
draws it, which is the only thing that can tell a screen `0.1222587719` is
meant to read `12.2%`.

Nullable, and left null on every row already ingested — the code is in the
file and cannot be reconstructed from a stored value, so existing models
carry no format until they are read again. A screen that finds none falls
back to the plain number, which is what it did before this column existed.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "c1f7a9d24e63"
down_revision = "b8d4e0f37a91"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column(
        "tieout_cells",
        sa.Column("number_format", sa.String(length=128), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tieout_cells", "number_format")
