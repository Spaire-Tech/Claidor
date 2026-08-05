"""Grant Spaire staff (Robin Kaye) full access to the Spaire platform org

Revision ID: 4f1cb78a2d6e
Revises: 9c4dbe7f1a02
Create Date: 2026-05-18 09:00:00.000000

The Spaire platform org is the Organization that sells the Pro / Studio /
Scale subscriptions to creator orgs. Spaire staff need to be members of
that org so the dashboard renders subscription, payout, and customer
management views for it.

Idempotent. No-op on environments where:
  - the named user doesn't exist (dev / staging seed didn't include them),
  - no organization with slug 'spaire' exists (single-tenant deploys),
  - or the membership already exists.

If the platform org's slug differs from 'spaire' on this environment,
this migration won't grant access — re-run scripts/grant_user_org_access
manually with the correct slug.

"""

from alembic import op

revision = "4f1cb78a2d6e"
down_revision = "9c4dbe7f1a02"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


_ROBIN_KAYE_USER_ID = "ab463766-c434-44aa-b1fe-cc5615e314bb"
_PLATFORM_ORG_SLUG = "spaire"


def upgrade() -> None:
    op.execute(
        f"""
        INSERT INTO user_organizations (user_id, organization_id, created_at, modified_at)
        SELECT
            u.id,
            o.id,
            NOW(),
            NOW()
        FROM users u
        CROSS JOIN organizations o
        WHERE u.id = '{_ROBIN_KAYE_USER_ID}'
          AND u.deleted_at IS NULL
          AND o.slug = '{_PLATFORM_ORG_SLUG}'
          AND o.deleted_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM user_organizations uo
              WHERE uo.user_id = u.id AND uo.organization_id = o.id
          )
        """
    )


def downgrade() -> None:
    # Intentional no-op: we don't want a `downgrade` to lock Spaire staff
    # out of the platform org. Use `scripts/grant_user_org_access` or
    # direct SQL to revoke if needed.
    pass
