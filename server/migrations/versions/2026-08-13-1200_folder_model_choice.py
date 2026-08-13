"""which workbook is the model, chosen when the deal is made

Revision ID: f2b6d4a89c31
Revises: e9a3f5c27b18
Create Date: 2026-08-13 12:00:00.000000

One column: `connected_folders.model_item_id`, the store's item id of
the workbook the deal calls *the* model. A deal room usually carries
the operating model beside working copies, sensitivities and comps;
reconciling the deck against all of them reports the working copy's
every difference as a finding. Null means nobody chose and every
workbook is read — exactly the behaviour every existing folder has, so
the backfill is null and means it.

Hand-written, as every migration here is: autogenerate wants to drop
pg_trgm and cannot be trusted with this schema.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "f2b6d4a89c31"
down_revision = "e9a3f5c27b18"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "connected_folders",
        sa.Column("model_item_id", sa.String(length=512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("connected_folders", "model_item_id")
