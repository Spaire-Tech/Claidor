"""The admin/preview flow: instructors preview as THEMSELVES.

`get_preview_access` signs the requesting org member into the portal with a
customer record under their own real email — no `@course-preview.invalid`
sandbox — enrolls it without firing email automations, and the enrollments
listing excludes org members (and legacy sandbox customers) so the Customers
tab only ever shows actual students.
"""

import pytest
from fastapi import HTTPException

from polar.auth.models import AuthSubject
from polar.course.endpoints import get_preview_access
from polar.course.service import course_service
from polar.customer.repository import CustomerRepository
from polar.customer_portal.endpoints.courses import get_enrolled_course
from polar.models import Course, UserOrganization
from polar.models.email_sequence import (
    EmailSequence,
    EmailSequenceStatus,
    EmailSequenceTriggerType,
)
from polar.models.email_subscriber import EmailSubscriber, EmailSubscriberStatus
from tests.fixtures.random_objects import (
    create_customer,
    create_organization,
    create_product,
    create_user,
)


async def _course_with_admin(save_fixture):
    org = await create_organization(save_fixture)
    product = await create_product(
        save_fixture, organization=org, recurring_interval=None
    )
    course = Course(
        product_id=product.id, organization_id=org.id, title="Mock course"
    )
    await save_fixture(course)
    user = await create_user(save_fixture)
    await save_fixture(UserOrganization(user_id=user.id, organization_id=org.id))
    return org, course, user


@pytest.mark.asyncio
async def test_preview_access_uses_admins_own_email(save_fixture, session):
    org, course, user = await _course_with_admin(save_fixture)

    result = await get_preview_access(
        course.id, AuthSubject(user, set(), None), session
    )

    assert result["token"]
    assert f"/portal/courses/{course.id}" in result["portal_url"]

    customer_repo = CustomerRepository.from_session(session)
    # The instructor's portal identity is their real email…
    customer = await customer_repo.get_by_email_and_organization(
        user.email, org.id
    )
    assert customer is not None
    # …and no sandbox customer is minted anymore.
    sandbox = await customer_repo.get_by_email_and_organization(
        f"preview+{user.id}@course-preview.invalid", org.id
    )
    assert sandbox is None

    enrollment = await course_service.get_enrollment_for_customer(
        session, customer_id=customer.id, course_id=course.id
    )
    assert enrollment is not None


@pytest.mark.asyncio
async def test_preview_access_never_overwrites_existing_name(
    save_fixture, session
):
    org, course, user = await _course_with_admin(save_fixture)
    await create_customer(
        save_fixture,
        organization=org,
        email=user.email,
        name="Chosen Name",
        stripe_customer_id=None,
    )

    await get_preview_access(course.id, AuthSubject(user, set(), None), session)

    customer_repo = CustomerRepository.from_session(session)
    customer = await customer_repo.get_by_email_and_organization(
        user.email, org.id
    )
    assert customer is not None
    assert customer.name == "Chosen Name"


@pytest.mark.asyncio
async def test_preview_enrollment_does_not_fire_automations(
    save_fixture, session, mocker
):
    """Previewing your own course must not queue your own welcome email,
    even when the instructor happens to be an email subscriber of their
    own org (the exact setup where a normal enrollment would fire)."""
    org, course, user = await _course_with_admin(save_fixture)
    customer = await create_customer(
        save_fixture, organization=org, email=user.email, stripe_customer_id=None
    )
    await save_fixture(
        EmailSubscriber(
            organization_id=org.id,
            email=user.email,
            customer_id=customer.id,
            status=EmailSubscriberStatus.active,
        )
    )
    await save_fixture(
        EmailSequence(
            organization_id=org.id,
            name="Welcome",
            trigger_type=EmailSequenceTriggerType.on_purchase,
            status=EmailSequenceStatus.active,
            course_id=course.id,
            trigger_config={},
        )
    )
    enqueue = mocker.patch("polar.email_sequence.service.enqueue_job")

    await get_preview_access(course.id, AuthSubject(user, set(), None), session)

    enroll_calls = [
        c
        for c in enqueue.call_args_list
        if c.args and c.args[0] == "email_sequence.enroll_subscriber"
    ]
    assert enroll_calls == []


@pytest.mark.asyncio
async def test_enrollments_listing_shows_only_students(save_fixture, session):
    org, course, user = await _course_with_admin(save_fixture)

    student = await create_customer(
        save_fixture,
        organization=org,
        email="student@example.com",
        stripe_customer_id=None,
    )
    # Instructor's own account — email case differs to prove the match is
    # case-insensitive.
    instructor = await create_customer(
        save_fixture,
        organization=org,
        email=user.email.upper(),
        stripe_customer_id=None,
    )
    legacy_sandbox = await create_customer(
        save_fixture,
        organization=org,
        email=f"preview+{user.id}@course-preview.invalid",
        stripe_customer_id=None,
    )
    for c in (student, instructor, legacy_sandbox):
        await course_service.enroll_customer(
            session, course_id=course.id, customer=c, fire_events=False
        )

    enrollments, total = await course_service.paginate_enrollments_for_course(
        session, course.id, organization_id=org.id, limit=50, page=1
    )

    assert total == 1
    assert [e.customer_id for e in enrollments] == [student.id]


@pytest.mark.asyncio
async def test_preview_access_copies_admin_avatar(save_fixture, session):
    org, course, user = await _course_with_admin(save_fixture)
    user.avatar_url = "https://example.com/avatar.png"
    await save_fixture(user)

    await get_preview_access(course.id, AuthSubject(user, set(), None), session)

    customer_repo = CustomerRepository.from_session(session)
    customer = await customer_repo.get_by_email_and_organization(
        user.email, org.id
    )
    assert customer is not None
    assert customer.avatar_url == "https://example.com/avatar.png"


@pytest.mark.asyncio
async def test_portal_course_self_heals_for_org_members(save_fixture, session):
    """An org member signing into the portal with their own email can open
    their org's course even when nothing ever enrolled them (e.g. normal
    email-code sign-in instead of the dashboard Preview button)."""
    org, course, user = await _course_with_admin(save_fixture)
    user.avatar_url = "https://example.com/admin.png"
    await save_fixture(user)
    customer = await create_customer(
        save_fixture, organization=org, email=user.email, stripe_customer_id=None
    )

    payload = await get_enrolled_course(
        course.id, AuthSubject(customer, set(), None), session
    )

    assert payload["course"]["id"] == str(course.id)
    enrollment = await course_service.get_enrollment_for_customer(
        session, customer_id=customer.id, course_id=course.id
    )
    assert enrollment is not None
    # The dashboard avatar is mirrored onto the portal account.
    assert customer.avatar_url == "https://example.com/admin.png"


@pytest.mark.asyncio
async def test_preview_access_retires_legacy_sandbox(save_fixture, session):
    """Old sandbox accounts must stop appearing as a second member: the
    preview flow revokes the sandbox's enrollment for the course."""
    org, course, user = await _course_with_admin(save_fixture)
    sandbox = await create_customer(
        save_fixture,
        organization=org,
        email=f"preview+{user.id}@course-preview.invalid",
        stripe_customer_id=None,
    )
    await course_service.enroll_customer(
        session, course_id=course.id, customer=sandbox, fire_events=False
    )

    await get_preview_access(course.id, AuthSubject(user, set(), None), session)

    assert (
        await course_service.get_enrollment_for_customer(
            session, customer_id=sandbox.id, course_id=course.id
        )
        is None
    )


@pytest.mark.asyncio
async def test_portal_course_still_404s_for_strangers(save_fixture, session):
    org, course, _user = await _course_with_admin(save_fixture)
    stranger = await create_customer(
        save_fixture,
        organization=org,
        email="stranger@example.com",
        stripe_customer_id=None,
    )

    with pytest.raises(HTTPException) as exc:
        await get_enrolled_course(
            course.id, AuthSubject(stranger, set(), None), session
        )
    assert exc.value.status_code == 404
