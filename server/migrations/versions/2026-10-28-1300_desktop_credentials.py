"""the person's Secure Credentials Store: logins and contact info, sealed

Revision ID: desktop_credentials_1028
Revises: desktop_session_lost_1028
Create Date: 2026-10-28 13:00:00.000000

One new table and nothing else touched. See simeon/models/desktop.py
(DesktopCredential) and simeon/desktop/credentials.py.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "desktop_credentials_1028"
down_revision = "desktop_session_lost_1028"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "desktop_credentials",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("sealed", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_credentials_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_credentials_pkey")),
    )
    for column in ("created_at", "deleted_at", "user_id"):
        op.create_index(
            op.f(f"ix_desktop_credentials_{column}"),
            "desktop_credentials",
            [column],
            unique=False,
        )


def downgrade() -> None:
    op.drop_table("desktop_credentials")
