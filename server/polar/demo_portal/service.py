from polar.config import settings
from polar.course.repository import CourseRepository
from polar.course.service import course_service
from polar.customer.repository import CustomerRepository
from polar.customer_session.service import (
    customer_session as customer_session_service,
)
from polar.models import Customer, Organization
from polar.organization.repository import OrganizationRepository
from polar.postgres import AsyncSession

# Stable handle for the single, shared demo student every visitor is logged in
# as. Keyed by external_id so re-visits reuse the same customer (and its
# enrollments, progress and community identity) rather than piling up rows.
DEMO_CUSTOMER_EXTERNAL_ID = "__demo_portal__"
DEMO_CUSTOMER_NAME = "Demo Student"


class DemoPortalService:
    def _enabled_slug(self) -> str | None:
        slug = settings.DEMO_PORTAL_ORG_SLUG
        return slug.strip().lower() if slug else None

    async def create_session(
        self, session: AsyncSession, slug: str
    ) -> tuple[str, Organization] | None:
        """Mint a fresh demo session for the configured demo org.

        Returns ``None`` — rather than raising — when the demo portal is
        disabled or ``slug`` is not the configured demo org, so the endpoint
        can answer a plain 404. That makes the door indistinguishable from
        "no such page" for every other organization: it can only ever open
        the one org named in ``DEMO_PORTAL_ORG_SLUG``.
        """
        enabled = self._enabled_slug()
        if enabled is None or slug.strip().lower() != enabled:
            return None

        organization = await OrganizationRepository.from_session(
            session
        ).get_by_slug(slug)
        if organization is None:
            return None

        customer = await self._get_or_create_demo_customer(session, organization)
        await self._enroll_in_published_courses(session, organization, customer)

        token, _ = await customer_session_service.create_customer_session(
            session, customer
        )
        return token, organization

    async def _get_or_create_demo_customer(
        self, session: AsyncSession, organization: Organization
    ) -> Customer:
        repository = CustomerRepository.from_session(session)
        existing = await repository.get_by_external_id_and_organization(
            DEMO_CUSTOMER_EXTERNAL_ID, organization.id
        )
        if existing is not None:
            return existing

        customer = Customer(
            organization=organization,
            external_id=DEMO_CUSTOMER_EXTERNAL_ID,
            # .invalid TLD (RFC 2606) guarantees this address can never route
            # to a real inbox; the demo student never receives email anyway.
            email=f"demo+{organization.slug}@portal.invalid",
            email_verified=True,
            name=DEMO_CUSTOMER_NAME,
        )
        return await repository.create(customer, flush=True)

    async def _enroll_in_published_courses(
        self,
        session: AsyncSession,
        organization: Organization,
        customer: Customer,
    ) -> None:
        course_repository = CourseRepository.from_session(session)
        course_ids = await course_repository.get_published_ids_by_organization(
            organization.id
        )
        for course_id in course_ids:
            # Idempotent + fire_events=False: re-visits never duplicate an
            # enrollment nor trigger the org's onboarding email automations.
            await course_service.enroll_customer(
                session,
                course_id=course_id,
                customer=customer,
                fire_events=False,
            )


demo_portal = DemoPortalService()
