"""Keep the sources an answer was grounded in

Historique stored the answer and not what it stood on, so a question
reopened a week later showed a legal conclusion with no citations under
it — the one thing Claidor never shows live. The sources are what makes
the answer checkable; without them the record is a claim.

Revision ID: question_sources_0808
Revises: veilles_0808
Create Date: 2026-08-08 23:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "question_sources_0808"
down_revision = "veilles_0808"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "librarian_questions",
        sa.Column("sources", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("librarian_questions", "sources")
