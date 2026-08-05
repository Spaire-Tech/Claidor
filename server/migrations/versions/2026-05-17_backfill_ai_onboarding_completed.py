"""Backfill ai_onboarding_completed_at for pre-existing orgs

Revision ID: 9c4dbe7f1a02
Revises: 7abe8ca7e3c9
Create Date: 2026-05-17 13:00:00.000000

The dashboard plan-gate redirects creators whose
`ai_onboarding_completed_at` is NULL back to /onboarding/plan. Pre-
existing organizations were created before that flag existed, so they
all start NULL — and a deploy without a backfill would bounce every
established creator into the onboarding flow on their next dashboard
hit.

Backfill rules:

  - Any org that has `onboarded_at` set (i.e. was edited at least
    once after creation, which is what `OrganizationService.update`
    stamps) is considered finished with onboarding for gating
    purposes — copy `onboarded_at` over.

  - Any older org without an `onboarded_at` but with `created_at` more
    than 24 hours before this migration runs is also considered done
    — those are long-tenured creators who never tripped the flag.
    Use `created_at` as the timestamp.

  - Orgs created within the last 24 hours and without an
    `onboarded_at` are left NULL on purpose: they're plausibly
    mid-onboarding and the gate should run for them.

"""

from alembic import op

revision = "9c4dbe7f1a02"
down_revision = "7abe8ca7e3c9"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE organizations
           SET ai_onboarding_completed_at = onboarded_at
         WHERE ai_onboarding_completed_at IS NULL
           AND onboarded_at IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE organizations
           SET ai_onboarding_completed_at = created_at
         WHERE ai_onboarding_completed_at IS NULL
           AND created_at < NOW() - INTERVAL '24 hours'
        """
    )


def downgrade() -> None:
    # Intentionally a no-op: we can't tell the backfilled rows apart
    # from rows that legitimately set the flag via the API. A blanket
    # `SET NULL` here would re-bounce real creators into onboarding.
    pass
