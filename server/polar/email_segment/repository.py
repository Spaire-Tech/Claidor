from uuid import UUID

from sqlalchemy import Select, func, select

from polar.auth.models import AuthSubject, Organization, User, is_organization, is_user
from polar.kit.repository import RepositoryBase, RepositorySoftDeletionMixin
from polar.models import UserOrganization
from polar.models.email_segment import EmailSegment, EmailSegmentType
from polar.models.email_segment_subscriber import EmailSegmentSubscriber
from polar.models.email_subscriber import EmailSubscriber, EmailSubscriberStatus


class EmailSegmentRepository(
    RepositorySoftDeletionMixin[EmailSegment],
    RepositoryBase[EmailSegment],
):
    model = EmailSegment

    def get_readable_statement(
        self, auth_subject: AuthSubject[User | Organization]
    ) -> Select[tuple[EmailSegment]]:
        statement = self.get_base_statement()
        if is_user(auth_subject):
            user = auth_subject.subject
            statement = statement.where(
                EmailSegment.organization_id.in_(
                    select(UserOrganization.organization_id).where(
                        UserOrganization.user_id == user.id,
                        UserOrganization.deleted_at.is_(None),
                    )
                )
            )
        elif is_organization(auth_subject):
            statement = statement.where(
                EmailSegment.organization_id == auth_subject.subject.id,
            )
        return statement

    async def get_by_organization(
        self, organization_id: UUID
    ) -> list[EmailSegment]:
        statement = self.get_base_statement().where(
            EmailSegment.organization_id == organization_id,
            EmailSegment.deleted_at.is_(None),
        )
        result = await self.get_all(statement)
        return list(result)

    async def get_by_slug_and_organization(
        self, slug: str, organization_id: UUID
    ) -> EmailSegment | None:
        statement = self.get_base_statement().where(
            EmailSegment.slug == slug,
            EmailSegment.organization_id == organization_id,
            EmailSegment.deleted_at.is_(None),
        )
        return await self.get_one_or_none(statement)

    async def count_subscribers(
        self, segment: EmailSegment
    ) -> int:
        """Dynamically count subscribers in a segment."""
        if segment.type == EmailSegmentType.all:
            statement = select(func.count(EmailSubscriber.id)).where(
                EmailSubscriber.organization_id == segment.organization_id,
                EmailSubscriber.status == EmailSubscriberStatus.active,
                EmailSubscriber.deleted_at.is_(None),
            )
        elif segment.type == EmailSegmentType.customers:
            statement = select(func.count(EmailSubscriber.id)).where(
                EmailSubscriber.organization_id == segment.organization_id,
                EmailSubscriber.status == EmailSubscriberStatus.active,
                EmailSubscriber.customer_id.isnot(None),
                EmailSubscriber.deleted_at.is_(None),
            )
        elif segment.type == EmailSegmentType.product:
            # Subscribers who purchased a specific product
            from polar.models.order import Order

            statement = select(func.count(EmailSubscriber.id)).where(
                EmailSubscriber.organization_id == segment.organization_id,
                EmailSubscriber.status == EmailSubscriberStatus.active,
                EmailSubscriber.customer_id.isnot(None),
                EmailSubscriber.deleted_at.is_(None),
                EmailSubscriber.customer_id.in_(
                    select(Order.customer_id).where(
                        Order.product_id == segment.product_id,
                        Order.deleted_at.is_(None),
                    )
                ),
            )
        elif segment.type == EmailSegmentType.manual:
            # Count only members that still belong to the segment's org —
            # matches the filter applied in get_subscriber_ids_for_segment.
            statement = (
                select(func.count(EmailSegmentSubscriber.id))
                .join(
                    EmailSubscriber,
                    EmailSubscriber.id == EmailSegmentSubscriber.subscriber_id,
                )
                .where(
                    EmailSegmentSubscriber.segment_id == segment.id,
                    EmailSegmentSubscriber.deleted_at.is_(None),
                    EmailSubscriber.organization_id == segment.organization_id,
                    EmailSubscriber.deleted_at.is_(None),
                )
            )
        elif segment.type == EmailSegmentType.archived:
            statement = select(func.count(EmailSubscriber.id)).where(
                EmailSubscriber.organization_id == segment.organization_id,
                EmailSubscriber.status == EmailSubscriberStatus.archived,
                EmailSubscriber.deleted_at.is_(None),
            )
        else:
            return 0

        result = await self.session.execute(statement)
        return result.scalar_one()

    async def get_subscriber_ids_for_segment(
        self, segment: EmailSegment
    ) -> list[UUID]:
        """Get subscriber IDs matching a segment."""
        if segment.type == EmailSegmentType.all:
            statement = select(EmailSubscriber.id).where(
                EmailSubscriber.organization_id == segment.organization_id,
                EmailSubscriber.status == EmailSubscriberStatus.active,
                EmailSubscriber.deleted_at.is_(None),
            )
        elif segment.type == EmailSegmentType.customers:
            statement = select(EmailSubscriber.id).where(
                EmailSubscriber.organization_id == segment.organization_id,
                EmailSubscriber.status == EmailSubscriberStatus.active,
                EmailSubscriber.customer_id.isnot(None),
                EmailSubscriber.deleted_at.is_(None),
            )
        elif segment.type == EmailSegmentType.product:
            from polar.models.order import Order

            statement = select(EmailSubscriber.id).where(
                EmailSubscriber.organization_id == segment.organization_id,
                EmailSubscriber.status == EmailSubscriberStatus.active,
                EmailSubscriber.customer_id.isnot(None),
                EmailSubscriber.deleted_at.is_(None),
                EmailSubscriber.customer_id.in_(
                    select(Order.customer_id).where(
                        Order.product_id == segment.product_id,
                        Order.deleted_at.is_(None),
                    )
                ),
            )
        elif segment.type == EmailSegmentType.manual:
            # Defence in depth: even if a stale row exists from a pre-fix
            # cross-org insert, the org constraint here drops it from the
            # results. The service-side guard in add_subscribers prevents
            # new rows from being created.
            statement = (
                select(EmailSegmentSubscriber.subscriber_id)
                .join(
                    EmailSubscriber,
                    EmailSubscriber.id == EmailSegmentSubscriber.subscriber_id,
                )
                .where(
                    EmailSegmentSubscriber.segment_id == segment.id,
                    EmailSegmentSubscriber.deleted_at.is_(None),
                    EmailSubscriber.organization_id == segment.organization_id,
                    EmailSubscriber.status == EmailSubscriberStatus.active,
                    EmailSubscriber.deleted_at.is_(None),
                )
            )
        elif segment.type == EmailSegmentType.archived:
            statement = select(EmailSubscriber.id).where(
                EmailSubscriber.organization_id == segment.organization_id,
                EmailSubscriber.status == EmailSubscriberStatus.archived,
                EmailSubscriber.deleted_at.is_(None),
            )
        else:
            return []

        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_manual_segment_subscriber_ids(
        self, segment_id: UUID
    ) -> list[UUID]:
        """Get subscriber IDs in a manual segment."""
        statement = select(EmailSegmentSubscriber.subscriber_id).where(
            EmailSegmentSubscriber.segment_id == segment_id,
            EmailSegmentSubscriber.deleted_at.is_(None),
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_segment_subscriber_entry(
        self, segment_id: UUID, subscriber_id: UUID
    ) -> EmailSegmentSubscriber | None:
        """Check if a subscriber is in a manual segment."""
        statement = select(EmailSegmentSubscriber).where(
            EmailSegmentSubscriber.segment_id == segment_id,
            EmailSegmentSubscriber.subscriber_id == subscriber_id,
            EmailSegmentSubscriber.deleted_at.is_(None),
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()
