"""Merge four open heads onto a single tip

Revision ID: 4d2b6c91e0a3
Revises: 1f3a55e2b610, 4f1cb78a2d6e, 6f4a9d2c1b08, e51c8d7a4b9c
Create Date: 2026-05-24 06:00:00.000000

The course / email / staff branches all diverged from cb9a8b32e09c (and
e51c8d7a4b9c diverged even earlier from f4d5e9b2c1a7) without ever being
merged back. `alembic upgrade head` errors out with "multiple heads",
and any environment that deployed before the merge sat on whichever
head was applied first — silently missing everything on the other
three branches.

In particular the customers-tab index from 1f3a55e2b610 and the staff
permissions backfill from 4f1cb78a2d6e were never reaching staging /
production. This empty merge fuses all four heads so the downstream
fixes (course_access benefit wiring + enrollment backfill) can run.

"""

revision = "4d2b6c91e0a3"
down_revision = (
    "1f3a55e2b610",
    "4f1cb78a2d6e",
    "6f4a9d2c1b08",
    "e51c8d7a4b9c",
)
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
