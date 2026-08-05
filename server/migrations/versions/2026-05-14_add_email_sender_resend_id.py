"""Add email_sender_resend_id and email_sender_dns_records to organizations

Revision ID: e76d1c4a82b9
Revises: 9a8c1d2e3f4b
Create Date: 2026-05-14 17:30:00.000000

Stores the Resend-side domain id returned when we register a creator's
custom sender domain via POST /domains, plus the cached DNS records the
creator needs to install (TXT/MX/CNAME) before DKIM can verify. Caching
the records avoids re-fetching from Resend every time the dashboard
loads the domain settings page.

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "e76d1c4a82b9"
down_revision = "9a8c1d2e3f4b"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("email_sender_resend_id", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column(
            "email_sender_dns_records",
            sa.dialects.postgresql.JSONB(),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("organizations", "email_sender_dns_records")
    op.drop_column("organizations", "email_sender_resend_id")
