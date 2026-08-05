"""Resolve a real, deliverable human for a creator organization.

Platform-billing Customers are provisioned with a synthetic address
(``creator-{slug}@billing.spairehq.internal``) that can never receive
mail. Any code path that is about to email a creator about money —
receipts, trial reminders, dunning notices — must resolve an actual
inbox instead of trusting ``customer.email`` blindly. This module is
the single place that knows how to do that.
"""

from uuid import UUID

import structlog

from polar.models import Organization
from polar.organization.repository import OrganizationRepository
from polar.postgres import AsyncSession
from polar.user_organization.service import (
    user_organization as user_organization_service,
)

log: structlog.stdlib.BoundLogger = structlog.get_logger()

PLACEHOLDER_EMAIL_DOMAIN = "billing.spairehq.internal"


def is_placeholder_email(email: str | None) -> bool:
    """True when `email` is the synthetic, undeliverable platform-billing
    placeholder (or missing entirely)."""
    if not email:
        return True
    return email.strip().lower().endswith(f"@{PLACEHOLDER_EMAIL_DOMAIN}")


async def resolve_billing_contact_email(
    session: AsyncSession, organization: Organization
) -> str | None:
    """Best deliverable email for billing communication with a creator org.

    Priority:
      1. The payout Account's admin user (when the org has one).
      2. The earliest still-active member of the organization.

    Returns None only when the org has no members at all — in which case
    there is genuinely nobody to write to.
    """
    organization_repository = OrganizationRepository.from_session(session)
    admin_user = await organization_repository.get_admin_user(session, organization)
    if admin_user is not None and admin_user.email:
        return admin_user.email

    members = await user_organization_service.list_by_org(session, organization.id)
    for member in sorted(members, key=lambda m: m.created_at):
        if member.user is not None and member.user.email:
            return member.user.email
    return None


async def resolve_billing_contact_email_by_org_id(
    session: AsyncSession, organization_id: UUID
) -> str | None:
    organization_repository = OrganizationRepository.from_session(session)
    organization = await organization_repository.get_by_id(organization_id)
    if organization is None:
        return None
    return await resolve_billing_contact_email(session, organization)
