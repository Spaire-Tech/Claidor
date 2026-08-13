"""when each person last looked at each deal

Revision ID: b7d2f4a81c53
Revises: a1c5e7b93d42
Create Date: 2026-08-13 19:00:00.000000

One table: `tieout_deal_visits` — a row per person per deal, moved
forward every time the deal page loads. « What changed since you
looked » derives from artifact and finding timestamps against it, so
nothing is stored that could disagree with the records it describes.
No backfill: a person with no row has never looked, which is the truth.

Hand-written, as every migration here is: autogenerate wants to drop
pg_trgm and cannot be trusted with this schema.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "b7d2f4a81c53"
down_revision = "a1c5e7b93d42"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tieout_deal_visits",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("dossier_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("visited_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["dossier_id"],
            ["dossiers.id"],
            name=op.f("tieout_deal_visits_dossier_id_fkey"),
            ondelete="cascade",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("tieout_deal_visits_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("tieout_deal_visits_pkey")),
        sa.UniqueConstraint("dossier_id", "user_id", name="uq_tieout_deal_visit"),
    )


def downgrade() -> None:
    op.drop_table("tieout_deal_visits")
