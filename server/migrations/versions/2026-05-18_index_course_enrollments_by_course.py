"""Add partial index on course_enrollments (course_id, enrolled_at DESC)

Revision ID: 1f3a55e2b610
Revises: e76d1c4a82b9
Create Date: 2026-05-18 22:47:00.000000

The course editor's Customers tab lists every active enrollment for a
course, ordered by enrolled_at desc. Without a partial index excluding
soft-deleted rows the query falls back to a sequential scan as soon as
a course has more than a few thousand enrollments.

Built CONCURRENTLY so production tables aren't locked while the index
is created. Uses `IF NOT EXISTS` because an environment may already
have the index from a previous out-of-band run (e.g. a CONCURRENTLY
build that finished but whose migration revision wasn't recorded in
alembic_version because of a parallel multi-head deploy).

"""

from alembic import op

revision = "1f3a55e2b610"
down_revision = "7c8d3e2f9a01"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        # Raw SQL so we get IF NOT EXISTS. op.create_index in older
        # Alembic doesn't support the `if_not_exists` kwarg, and we
        # want this migration to be re-runnable on every environment
        # regardless of whether the index already exists from a prior
        # deploy attempt. If an earlier CONCURRENTLY build was killed
        # mid-flight it can leave an INVALID index behind — drop that
        # first so the re-create lands a usable index.
        op.execute(
            """
            DO $$
            DECLARE
                idx_oid oid;
                is_valid boolean;
            BEGIN
                SELECT c.oid, i.indisvalid
                  INTO idx_oid, is_valid
                  FROM pg_class c
                  JOIN pg_index i ON i.indexrelid = c.oid
                 WHERE c.relname = 'ix_course_enrollments_course_active';
                IF FOUND AND NOT is_valid THEN
                    EXECUTE 'DROP INDEX ix_course_enrollments_course_active';
                END IF;
            END
            $$;
            """
        )
        op.execute(
            """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS
                ix_course_enrollments_course_active
            ON course_enrollments (course_id, enrolled_at DESC)
            WHERE deleted_at IS NULL;
            """
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(
            "DROP INDEX CONCURRENTLY IF EXISTS "
            "ix_course_enrollments_course_active;"
        )
