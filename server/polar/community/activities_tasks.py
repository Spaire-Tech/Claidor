"""Dramatiq actors for community activity lifecycle.

  community.activity.published
    Fan-out the "new activity" notification to every enrolled customer.
    Skipped when notify_on_publish=False.

  community.activity.submission_received
    Notify the host (if a Customer row exists for their email) that a
    student just submitted. Bell only (no email — high volume)."""

from __future__ import annotations

from uuid import UUID

import structlog

from polar.course.repository import CourseEnrollmentRepository, CourseRepository
from polar.customer.repository import CustomerRepository
from polar.customer_notifications.notification_types import (
    ACTIVITY_PUBLISHED,
    ACTIVITY_SUBMISSION_RECEIVED,
    ActivityNotificationPayload,
)
from polar.customer_notifications.service import customer_notifications
from polar.exceptions import PolarTaskError
from polar.logging import Logger
from polar.models.course_lesson import CourseLesson
from polar.models.course_module import CourseModule
from polar.models.customer import Customer
from polar.models.user import User
from polar.worker import AsyncSessionMaker, TaskPriority, actor

from .activities_repository import (
    CommunityActivityRepository,
    CommunityActivitySubmissionRepository,
)

log: Logger = structlog.get_logger()


class CommunityActivityTaskError(PolarTaskError): ...


async def _build_payload(
    session, activity, *, submitter_name: str | None = None
) -> dict:
    course_repo = CourseRepository.from_session(session)
    course = await course_repo.get_by_id(activity.course_id)
    host = await session.get(User, activity.host_user_id)
    host_name = (
        (course.instructor_name if course else None)
        or (host.public_name if host and hasattr(host, "public_name") else None)
        or (host.email if host else "Instructor")
    )
    course_name = (course.title if course else "") or "your community"

    channel_label: str | None = None
    if activity.channel_kind == "module" and activity.module_id:
        m = await session.get(CourseModule, activity.module_id)
        channel_label = m.title if m else None
    elif activity.channel_kind == "lesson" and activity.lesson_id:
        lesson = await session.get(CourseLesson, activity.lesson_id)
        channel_label = lesson.title if lesson else None

    return ActivityNotificationPayload(
        activity_id=str(activity.id),
        course_id=str(activity.course_id),
        title=activity.title,
        host_name=host_name,
        course_name=course_name,
        submission_type=activity.submission_type,
        channel_label=channel_label,
        submitter_name=submitter_name,
    ).model_dump(mode="json")


async def _enrolled_customer_ids(session, course_id: UUID) -> list[UUID]:
    return await CourseEnrollmentRepository.from_session(
        session
    ).list_customer_ids_for_course(course_id)


@actor(actor_name="community.activity.published", priority=TaskPriority.LOW)
async def activity_published(activity_id: UUID) -> None:
    async with AsyncSessionMaker() as session:
        repo = CommunityActivityRepository.from_session(session)
        activity = await repo.get_by_id(activity_id)
        if activity is None or activity.deleted_at is not None:
            return
        if not activity.notify_on_publish:
            return

        payload = await _build_payload(session, activity)
        customer_ids = await _enrolled_customer_ids(session, activity.course_id)
        await customer_notifications.send_to_customers(
            session,
            customer_ids=customer_ids,
            notification_type=ACTIVITY_PUBLISHED,
            payload=payload,
        )


@actor(
    actor_name="community.activity.submission_received",
    priority=TaskPriority.LOW,
)
async def activity_submission_received(
    activity_id: UUID, submission_id: UUID
) -> None:
    async with AsyncSessionMaker() as session:
        repo = CommunityActivityRepository.from_session(session)
        activity = await repo.get_by_id(activity_id)
        if activity is None or activity.deleted_at is not None:
            return

        sub_repo = CommunityActivitySubmissionRepository.from_session(session)
        submission = await sub_repo.get_by_id(submission_id)
        if submission is None or submission.deleted_at is not None:
            return

        submitter = await session.get(Customer, submission.customer_id)
        submitter_name = (
            (getattr(submitter, "name", None) or "").strip()
            or (getattr(submitter, "email", None) or "Someone")
        )

        # Route to the host's customer-portal bell if they have a matching
        # Customer row. Otherwise this is a no-op for now — the org-side
        # dashboard bell isn't on this surface.
        host = await session.get(User, activity.host_user_id)
        if host is None or not getattr(host, "email", None):
            return
        host_customer_id = await CustomerRepository.from_session(
            session
        ).get_id_by_email(host.email)
        if host_customer_id is None:
            return

        payload = await _build_payload(
            session, activity, submitter_name=submitter_name
        )
        await customer_notifications.send_to_customer(
            session,
            customer_id=host_customer_id,
            notification_type=ACTIVITY_SUBMISSION_RECEIVED,
            payload=payload,
        )
