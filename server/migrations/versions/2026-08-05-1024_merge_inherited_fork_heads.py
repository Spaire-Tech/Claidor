"""merge inherited fork heads

Revision ID: merge_heads_0805
Revises: mc_architect_728, module_is_bonus_805
Create Date: 2026-08-05 10:24:07.530050

"""

import sqlalchemy as sa
from alembic import op

# Polar Custom Imports

# revision identifiers, used by Alembic.
revision = "merge_heads_0805"
down_revision = ("mc_architect_728", "module_is_bonus_805")
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
