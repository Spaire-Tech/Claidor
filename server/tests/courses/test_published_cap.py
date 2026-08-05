"""The published_courses cap meters *published* courses, not created ones.

A course occupies a slot only once it has a published lesson; draft courses
(no published lesson) are free and unlimited. Enforcement happens at the
publish transition — creating a course with a live lesson, adding/publishing
a lesson — never at draft creation. Counting drafts as "products" was the
documented Kajabi surprise this avoids.
"""

import dataclasses
from uuid import UUID

import pytest
from pytest_mock import MockerFixture

from polar.course.repository import (
    CourseLessonRepository,
    CourseRepository,
)
from polar.course.schemas import (
    CourseCreate,
    CourseLessonCreate,
    CourseLessonUpdate,
    CourseModuleCreate,
)
from polar.course.service import course_service
from polar.entitlements.exceptions import TierLimitReachedError
from polar.entitlements.tiers import TierKey, get_definition
from polar.enums import SubscriptionRecurringInterval
from polar.models import Organization, Product
from polar.models.course_lesson import CourseLesson
from polar.models.subscription import SubscriptionStatus
from polar.postgres import AsyncSession
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import (
    PriceFixtureType,
    create_customer,
    create_organization,
    create_product,
    create_subscription,
)


def _patch_platform_org_id(mocker: MockerFixture, org_id: UUID | None) -> None:
    mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", org_id)


def _patch_starter_limits(mocker: MockerFixture, **limit_overrides: int | None) -> None:
    base = get_definition(TierKey.starter)
    overridden = dataclasses.replace(
        base, limits=dataclasses.replace(base.limits, **limit_overrides)
    )

    def _resolve(tier: TierKey) -> "object":
        if tier == TierKey.starter:
            return overridden
        return get_definition(tier)

    mocker.patch(
        "polar.entitlements.service.get_definition", side_effect=_resolve
    )


async def _subscribe_to_starter(
    save_fixture: SaveFixture,
    *,
    platform_org: Organization,
    creator: Organization,
) -> None:
    prices: list[PriceFixtureType] = [(4900, "usd")]
    product = await create_product(
        save_fixture,
        organization=platform_org,
        recurring_interval=SubscriptionRecurringInterval.month,
        prices=prices,
    )
    product.user_metadata = {"tier": "starter"}
    await save_fixture(product)
    customer = await create_customer(
        save_fixture,
        organization=platform_org,
        email=f"creator-{creator.id}@billing.spaire",
        user_metadata={"creator_org_id": str(creator.id)},
    )
    await create_subscription(
        save_fixture,
        product=product,
        customer=customer,
        status=SubscriptionStatus.active,
    )


async def _course_product(
    save_fixture: SaveFixture, *, organization: Organization, name: str
) -> Product:
    return await create_product(
        save_fixture,
        organization=organization,
        recurring_interval=None,
        name=name,
        prices=[(2000, "usd")],
    )


async def _make_course(
    session: AsyncSession,
    save_fixture: SaveFixture,
    *,
    organization: Organization,
    name: str,
    published: bool,
):
    product = await _course_product(
        save_fixture, organization=organization, name=name
    )
    return await course_service.create(
        session,
        CourseCreate(
            product_id=product.id,
            organization_id=organization.id,
            title=name,
            modules=[
                CourseModuleCreate(
                    title="Module 1",
                    lessons=[
                        CourseLessonCreate(title="Lesson 1", published=published)
                    ],
                )
            ],
        ),
    )


async def _first_lesson(session: AsyncSession, course_id: UUID) -> CourseLesson:
    lesson_repo = CourseLessonRepository.from_session(session)
    lessons = await lesson_repo.get_all(
        lesson_repo.get_by_course_statement(course_id)
    )
    return lessons[0]


@pytest.mark.asyncio
class TestPublishedCoursesCap:
    async def _starter_creator(
        self,
        mocker: MockerFixture,
        save_fixture: SaveFixture,
        *,
        limit: int,
    ) -> Organization:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        _patch_starter_limits(mocker, published_courses=limit)
        creator = await create_organization(save_fixture)
        await _subscribe_to_starter(
            save_fixture, platform_org=platform_org, creator=creator
        )
        return creator

    async def test_draft_courses_are_free(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # Cap of 1, but drafts never consume a slot — three draft courses
        # all create successfully.
        creator = await self._starter_creator(mocker, save_fixture, limit=1)
        for i in range(3):
            course = await _make_course(
                session,
                save_fixture,
                organization=creator,
                name=f"Draft {i}",
                published=False,
            )
            assert course.id is not None

        repo = CourseRepository.from_session(session)
        assert await repo.count_published_by_organization(creator.id) == 0

    async def test_creating_a_published_course_past_cap_blocks(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        creator = await self._starter_creator(mocker, save_fixture, limit=1)

        # First published course fills the cap.
        await _make_course(
            session, save_fixture, organization=creator, name="Live A", published=True
        )
        repo = CourseRepository.from_session(session)
        assert await repo.count_published_by_organization(creator.id) == 1

        # A second course created already-published is refused.
        with pytest.raises(TierLimitReachedError) as excinfo:
            await _make_course(
                session,
                save_fixture,
                organization=creator,
                name="Live B",
                published=True,
            )
        assert excinfo.value.key == "published_courses"

    async def test_publishing_a_draft_past_cap_blocks(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        creator = await self._starter_creator(mocker, save_fixture, limit=1)

        # One published course (fills cap) and one draft (free).
        await _make_course(
            session, save_fixture, organization=creator, name="Live A", published=True
        )
        draft = await _make_course(
            session, save_fixture, organization=creator, name="Draft B", published=False
        )

        # Publishing the draft's only lesson would make it the 2nd published
        # course — blocked.
        lesson = await _first_lesson(session, draft.id)
        with pytest.raises(TierLimitReachedError) as excinfo:
            await course_service.update_lesson(
                session, lesson, CourseLessonUpdate(published=True)
            )
        assert excinfo.value.key == "published_courses"

    async def test_publishing_after_freeing_a_slot_succeeds(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        creator = await self._starter_creator(mocker, save_fixture, limit=1)

        live = await _make_course(
            session, save_fixture, organization=creator, name="Live A", published=True
        )
        draft = await _make_course(
            session, save_fixture, organization=creator, name="Draft B", published=False
        )

        # Unpublish the live course's lesson — frees the single slot.
        live_lesson = await _first_lesson(session, live.id)
        await course_service.update_lesson(
            session, live_lesson, CourseLessonUpdate(published=False)
        )

        # Now publishing the draft fits within the cap.
        draft_lesson = await _first_lesson(session, draft.id)
        updated = await course_service.update_lesson(
            session, draft_lesson, CourseLessonUpdate(published=True)
        )
        assert updated.published is True

        repo = CourseRepository.from_session(session)
        assert await repo.count_published_by_organization(creator.id) == 1
