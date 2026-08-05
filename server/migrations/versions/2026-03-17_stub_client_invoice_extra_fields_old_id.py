"""Stub: re-register old extra_fields revision ID

The extra_fields migration was previously recorded in the database as
revision '4c7f9b2d5e8a'. After renaming to cdaa3d0a2471 the DB's current
position became unreachable. This no-op stub re-registers the old ID so
the revision chain is intact for existing deployments.

Revision ID: 4c7f9b2d5e8a
Revises: cdaa3d0a2471
Create Date: 2026-03-17 02:00:00.000000

"""

from alembic import op  # noqa: F401

# revision identifiers, used by Alembic.
revision = "4c7f9b2d5e8a"
down_revision = "cdaa3d0a2471"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
