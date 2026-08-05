"""Add custom email sender domain columns to organizations

Revision ID: 9a8c1d2e3f4b
Revises: 8bc4d3e9f0a2
Create Date: 2026-05-14 16:00:00.000000

Pro/Scale creators can configure a custom outbound email domain. Two
columns:
  email_sender_domain         — the domain string (e.g. "creator.com").
  email_sender_verified_at    — set once Resend confirms DKIM. When
                                non-null, marketing emails (broadcasts
                                and sequence steps) use this domain
                                in their From address.

Verification flow (initial implementation): the creator sets the
domain via the org update endpoint; operations confirms Resend DKIM
records out-of-band and stamps email_sender_verified_at. A follow-up
PR will automate the Resend API round-trip.

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "9a8c1d2e3f4b"
down_revision = "8bc4d3e9f0a2"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("email_sender_domain", sa.String(length=253), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column(
            "email_sender_verified_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("organizations", "email_sender_verified_at")
    op.drop_column("organizations", "email_sender_domain")
