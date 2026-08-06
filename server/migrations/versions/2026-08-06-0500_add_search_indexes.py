"""Full-text search over the corpus

Generated tsvector columns (French configuration) with GIN indexes over
articles and decisions, plus trigram indexes on the identifiers people type
from memory — a decision number recalled as "22/2010" should still find
"022/2010".

Generated columns keep the index honest: there is no application code that
can forget to refresh it, so a newly loaded act is searchable the moment it
is committed.

Revision ID: search_0806
Revises: dossiers_0806
Create Date: 2026-08-06 05:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "search_0806"
down_revision = "dossiers_0806"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # Articles: the number is part of the document so "170" ranks the article
    # itself, and the text carries the substance.
    op.execute(
        """
        ALTER TABLE legal_articles
        ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
            setweight(to_tsvector('french', coalesce(number, '')), 'A') ||
            setweight(to_tsvector('french', coalesce(heading, '')), 'B') ||
            setweight(to_tsvector('french', coalesce(text, '')), 'C')
        ) STORED
        """
    )
    op.execute(
        "CREATE INDEX ix_legal_articles_search_vector "
        "ON legal_articles USING GIN (search_vector)"
    )
    op.execute(
        "CREATE INDEX ix_legal_articles_number_trgm "
        "ON legal_articles USING GIN (number gin_trgm_ops)"
    )

    # Decisions: the Juricaf keyword header names the provisions applied, so
    # it earns more weight than the body.
    op.execute(
        """
        ALTER TABLE court_decisions
        ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
            setweight(to_tsvector('french', coalesce(number, '')), 'A') ||
            setweight(to_tsvector('french', coalesce(keyword_header, '')), 'B') ||
            setweight(to_tsvector('french', coalesce(summary, '')), 'B') ||
            setweight(to_tsvector('french', coalesce(full_text, '')), 'C')
        ) STORED
        """
    )
    op.execute(
        "CREATE INDEX ix_court_decisions_search_vector "
        "ON court_decisions USING GIN (search_vector)"
    )
    op.execute(
        "CREATE INDEX ix_court_decisions_number_trgm "
        "ON court_decisions USING GIN (number gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_court_decisions_number_trgm")
    op.execute("DROP INDEX IF EXISTS ix_court_decisions_search_vector")
    op.drop_column("court_decisions", "search_vector")
    op.execute("DROP INDEX IF EXISTS ix_legal_articles_number_trgm")
    op.execute("DROP INDEX IF EXISTS ix_legal_articles_search_vector")
    op.drop_column("legal_articles", "search_vector")
