"""Add Course presentation variants (hero_variant, lesson_card_variant, trial_mode)

Revision ID: course_variants_610
Revises: forms_image_style_609
Create Date: 2026-06-10 00:00:00.000000

Adds the three onboarding presentation choices to the courses table:

- hero_variant       ("cover" | "marquee")        — how the portal hero renders
- lesson_card_variant ("catalog" | "spotlight")   — how lesson tiles render
- trial_mode         ("free_preview" | "lesson_sample") — how prospects sample

Existing rows are backfilled to the legacy presentation ("cover", "catalog",
"free_preview") so nothing changes look for courses created before the
portal-first onboarding. Idempotent ADD COLUMN IF NOT EXISTS so re-runs and
out-of-band column adds are safe.
"""

from alembic import op

revision = "course_variants_610"
down_revision = "forms_image_style_609"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE courses "
        "ADD COLUMN IF NOT EXISTS hero_variant VARCHAR(20) "
        "DEFAULT 'cover' NOT NULL"
    )
    op.execute(
        "ALTER TABLE courses "
        "ADD COLUMN IF NOT EXISTS lesson_card_variant VARCHAR(20) "
        "DEFAULT 'catalog' NOT NULL"
    )
    op.execute(
        "ALTER TABLE courses "
        "ADD COLUMN IF NOT EXISTS trial_mode VARCHAR(20) "
        "DEFAULT 'free_preview' NOT NULL"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS trial_mode")
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS lesson_card_variant")
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS hero_variant")
