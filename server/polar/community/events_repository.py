"""Database queries for community events + RSVPs.

Two repositories, kept in a separate file from the existing community
repository.py so the events surface is easy to review in isolation."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import Select, func, select

from polar.kit.repository import (
    RepositoryBase,
    RepositorySoftDeletionIDMixin,
    RepositorySoftDeletionMixin,
)
from polar.models.community_event import CommunityEvent
from polar.models.community_event_announcement import CommunityEventAnnouncement
from polar.models.community_event_rsvp import CommunityEventRsvp
from polar.models.customer import Customer
from polar.models.user import User


class CommunityEventRepository(
    RepositorySoftDeletionIDMixin[CommunityEvent, UUID],
    RepositorySoftDeletionMixin[CommunityEvent],
    RepositoryBase[CommunityEvent],
):
    model = CommunityEvent

    def get_base_statement(
        self, *, include_deleted: bool = False
    ) -> Select[tuple[CommunityEvent]]:
        # Mirror the parent signature exactly. The previous override
        # dropped the `include_deleted` kwarg, which broke every call
        # site that goes through the mixin (e.g. `get_by_id`) because
        # the base class always passes `include_deleted=False` through.
        return super().get_base_statement(include_deleted=include_deleted)

    async def list_for_course(self, course_id: UUID) -> Sequence[CommunityEvent]:
        statement = (
            self.get_base_statement()
            .where(CommunityEvent.course_id == course_id)
            .order_by(CommunityEvent.start_at.asc())
        )
        return await self.get_all(statement)

    async def get_by_id_for_course(
        self, event_id: UUID, course_id: UUID
    ) -> CommunityEvent | None:
        statement = self.get_base_statement().where(
            CommunityEvent.id == event_id,
            CommunityEvent.course_id == course_id,
        )
        return await self.get_one_or_none(statement)

    async def bulk_load_hosts(self, user_ids: set[UUID]) -> dict[UUID, User]:
        """Resolve {user_id: User} for every host on a feed page in one
        round-trip. Replaces N session.get(User, ...) calls inside the
        per-row serializer."""
        if not user_ids:
            return {}
        statement = select(User).where(User.id.in_(user_ids))
        result = await self.session.execute(statement)
        # `.unique()` is required because User has eagerly-joined
        # collections (organizations etc.); without it SQLAlchemy
        # raises InvalidRequestError on `.all()`.
        return {u.id: u for u in result.scalars().unique().all()}


class CommunityEventRsvpRepository(
    RepositorySoftDeletionIDMixin[CommunityEventRsvp, UUID],
    RepositorySoftDeletionMixin[CommunityEventRsvp],
    RepositoryBase[CommunityEventRsvp],
):
    model = CommunityEventRsvp

    async def get_for_event_customer(
        self, event_id: UUID, customer_id: UUID
    ) -> CommunityEventRsvp | None:
        statement = self.get_base_statement().where(
            CommunityEventRsvp.event_id == event_id,
            CommunityEventRsvp.customer_id == customer_id,
        )
        return await self.get_one_or_none(statement)

    async def list_customer_ids_for_event(self, event_id: UUID) -> Sequence[UUID]:
        statement = select(CommunityEventRsvp.customer_id).where(
            CommunityEventRsvp.event_id == event_id,
            CommunityEventRsvp.deleted_at.is_(None),
        )
        rows = await self.session.execute(statement)
        return [r[0] for r in rows.all()]

    async def list_attendees_for_event(
        self, event_id: UUID
    ) -> Sequence[tuple[Customer, datetime]]:
        """Returns (customer, rsvp_created_at) tuples for everyone with a
        live RSVP, newest first. Single JOIN — used by the host-facing
        roster endpoint so we don't N+1 over customer rows."""
        statement = (
            select(Customer, CommunityEventRsvp.created_at)
            .join(
                CommunityEventRsvp,
                CommunityEventRsvp.customer_id == Customer.id,
            )
            .where(
                CommunityEventRsvp.event_id == event_id,
                CommunityEventRsvp.deleted_at.is_(None),
            )
            .order_by(CommunityEventRsvp.created_at.desc())
        )
        result = await self.session.execute(statement)
        return [(row[0], row[1]) for row in result.all()]

    async def list_event_ids_for_customer(
        self, event_ids: Sequence[UUID], customer_id: UUID
    ) -> set[UUID]:
        """Which of the given event_ids does this customer have a live
        (non-soft-deleted) RSVP for? Used to populate `going` in bulk."""
        if not event_ids:
            return set()
        statement = select(CommunityEventRsvp.event_id).where(
            CommunityEventRsvp.event_id.in_(event_ids),
            CommunityEventRsvp.customer_id == customer_id,
            CommunityEventRsvp.deleted_at.is_(None),
        )
        rows = await self.session.execute(statement)
        return {r[0] for r in rows.all()}

    async def count_for_event(self, event_id: UUID) -> int:
        statement = (
            select(func.count())
            .select_from(CommunityEventRsvp)
            .where(
                CommunityEventRsvp.event_id == event_id,
                CommunityEventRsvp.deleted_at.is_(None),
            )
        )
        result = await self.session.execute(statement)
        return int(result.scalar_one())


class CommunityEventAnnouncementRepository(
    RepositorySoftDeletionIDMixin[CommunityEventAnnouncement, UUID],
    RepositorySoftDeletionMixin[CommunityEventAnnouncement],
    RepositoryBase[CommunityEventAnnouncement],
):
    """Persistence for host-composed event announcements.

    Reads scope by `event_id` (host pulling history for a single
    event) or `course_id` (future: feed of recent announcements on
    the dashboard). All writes happen via the service so the bell +
    email fan-out kicks in alongside the row update."""

    model = CommunityEventAnnouncement

    def get_base_statement(
        self, *, include_deleted: bool = False
    ) -> Select[tuple[CommunityEventAnnouncement]]:
        # Mirror the parent signature so the inherited get_by_id +
        # mixin helpers pass include_deleted through cleanly. Same
        # fix we applied to CommunityEventRepository after the last
        # batch crashed on this exact mismatch.
        return super().get_base_statement(include_deleted=include_deleted)

    async def list_for_event(
        self, event_id: UUID
    ) -> Sequence[CommunityEventAnnouncement]:
        statement = (
            self.get_base_statement()
            .where(CommunityEventAnnouncement.event_id == event_id)
            .order_by(CommunityEventAnnouncement.created_at.desc())
        )
        return await self.get_all(statement)
