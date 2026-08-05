from uuid import UUID

from polar.auth.models import AuthSubject, Organization, User
from polar.entitlements.service import entitlements as entitlements_service
from polar.exceptions import PolarError
from polar.kit.utils import utc_now
from polar.models.email_segment import EmailSegment, EmailSegmentType
from polar.models.email_segment_subscriber import EmailSegmentSubscriber
from polar.postgres import AsyncReadSession, AsyncSession

from .repository import EmailSegmentRepository


class EmailSegmentSlugTaken(PolarError):
    """Raised when a segment create / rename would collide with an
    existing segment in the same organization on `slug`. The DB has a
    unique constraint on (organization_id, slug, deleted_at) that would
    otherwise surface as an opaque IntegrityError → 500; pre-checking
    here lets the endpoint return 409 with a friendly message instead
    (audit issue #24 / fix-list #24).
    """

    def __init__(self, slug: str) -> None:
        super().__init__(
            f"A segment with slug '{slug}' already exists in this organization."
        )
        self.slug = slug


class EmailSegmentService:
    async def ensure_system_segments(
        self,
        session: AsyncSession,
        organization_id: UUID,
    ) -> list[EmailSegment]:
        """Create default system segments for an organization if they don't exist."""
        repository = EmailSegmentRepository.from_session(session)
        existing = await repository.get_by_organization(organization_id)
        existing_types = {s.type for s in existing}

        system_segments = [
            (EmailSegmentType.all, "All Subscribers", "all-subscribers"),
            (EmailSegmentType.customers, "Customers", "customers"),
        ]

        created = []
        for seg_type, name, slug in system_segments:
            if seg_type not in existing_types:
                segment = EmailSegment(
                    organization_id=organization_id,
                    name=name,
                    slug=slug,
                    type=seg_type,
                    is_system=True,
                )
                segment = await repository.create(segment, flush=True)
                created.append(segment)

        return created

    async def list(
        self,
        session: AsyncReadSession,
        organization_id: UUID,
    ) -> list[dict]:
        """List segments with subscriber counts."""
        repository = EmailSegmentRepository.from_session(session)
        segments = await repository.get_by_organization(organization_id)

        results = []
        for segment in segments:
            count = await repository.count_subscribers(segment)
            results.append({
                "id": segment.id,
                "organization_id": segment.organization_id,
                "name": segment.name,
                "slug": segment.slug,
                "type": segment.type,
                "product_id": segment.product_id,
                "is_system": segment.is_system,
                "created_at": segment.created_at,
                "modified_at": segment.modified_at,
                "subscriber_count": count,
            })

        return results

    async def get_by_id(
        self,
        session: AsyncReadSession,
        auth_subject: AuthSubject[User | Organization],
        segment_id: UUID,
    ) -> EmailSegment | None:
        repository = EmailSegmentRepository.from_session(session)
        statement = repository.get_readable_statement(auth_subject).where(
            EmailSegment.id == segment_id
        )
        return await repository.get_one_or_none(statement)

    async def create(
        self,
        session: AsyncSession,
        *,
        organization_id: UUID,
        name: str,
        slug: str,
        type: str = EmailSegmentType.manual,
        product_id: UUID | None = None,
    ) -> EmailSegment:
        # Same gate as email sequences — segments are Pro+ only.
        await entitlements_service.require_feature(
            session, organization_id, "email_sequences_and_segments"
        )

        repository = EmailSegmentRepository.from_session(session)

        # Pre-check the (org, slug) uniqueness so we can raise a domain-
        # level exception the endpoint can map to 409, instead of letting
        # the DB constraint surface as a 500 IntegrityError.
        existing = await repository.get_by_slug_and_organization(
            slug, organization_id
        )
        if existing is not None:
            raise EmailSegmentSlugTaken(slug)

        segment = EmailSegment(
            organization_id=organization_id,
            name=name,
            slug=slug,
            type=type,
            product_id=product_id,
            is_system=False,
        )
        return await repository.create(segment, flush=True)

    async def update(
        self,
        session: AsyncSession,
        segment: EmailSegment,
        *,
        name: str | None = None,
    ) -> EmailSegment:
        repository = EmailSegmentRepository.from_session(session)
        if name is not None:
            segment.name = name
        return await repository.update(segment)

    async def delete(
        self,
        session: AsyncSession,
        segment: EmailSegment,
    ) -> None:
        """Soft-delete a segment. System segments cannot be deleted."""
        if segment.is_system:
            raise ValueError("System segments cannot be deleted")
        repository = EmailSegmentRepository.from_session(session)
        segment.deleted_at = utc_now()
        await repository.update(segment)

    async def add_subscribers(
        self,
        session: AsyncSession,
        segment: EmailSegment,
        subscriber_ids: list[UUID],
    ) -> int:
        """Add subscribers to a manual segment. Returns count added.

        Org scope: every subscriber must belong to the same organization
        as the segment. Without this, a caller with org-A scope could pass
        org-B's subscriber UUIDs and the segment would silently include
        them — when used by a broadcast, those subscribers would receive
        org-A's email. (Audit cross-org leak #49.)
        """
        if segment.type != EmailSegmentType.manual:
            raise ValueError("Can only add subscribers to manual segments")

        if not subscriber_ids:
            return 0

        from sqlalchemy import select

        from polar.models.email_subscriber import EmailSubscriber

        valid_ids = (
            await session.execute(
                select(EmailSubscriber.id).where(
                    EmailSubscriber.id.in_(subscriber_ids),
                    EmailSubscriber.organization_id == segment.organization_id,
                    EmailSubscriber.deleted_at.is_(None),
                )
            )
        ).scalars().all()
        valid_set = set(valid_ids)

        repository = EmailSegmentRepository.from_session(session)
        added = 0
        for subscriber_id in subscriber_ids:
            if subscriber_id not in valid_set:
                # Quietly skip cross-org or deleted ids; the caller learns
                # via the returned `added` count not matching what they
                # passed in.
                continue
            existing = await repository.get_segment_subscriber_entry(
                segment.id, subscriber_id
            )
            if existing is None:
                entry = EmailSegmentSubscriber(
                    segment_id=segment.id,
                    subscriber_id=subscriber_id,
                )
                session.add(entry)
                added += 1

        return added

    async def remove_subscribers(
        self,
        session: AsyncSession,
        segment: EmailSegment,
        subscriber_ids: list[UUID],
    ) -> int:
        """Remove subscribers from a manual segment. Returns count removed.

        Same org-scope guard as add_subscribers — refuses to look up
        membership rows that would require crossing organizations.
        """
        if segment.type != EmailSegmentType.manual:
            raise ValueError("Can only remove subscribers from manual segments")

        if not subscriber_ids:
            return 0

        from sqlalchemy import select

        from polar.models.email_subscriber import EmailSubscriber

        valid_ids = (
            await session.execute(
                select(EmailSubscriber.id).where(
                    EmailSubscriber.id.in_(subscriber_ids),
                    EmailSubscriber.organization_id == segment.organization_id,
                )
            )
        ).scalars().all()
        valid_set = set(valid_ids)

        repository = EmailSegmentRepository.from_session(session)
        removed = 0
        for subscriber_id in subscriber_ids:
            if subscriber_id not in valid_set:
                continue
            entry = await repository.get_segment_subscriber_entry(
                segment.id, subscriber_id
            )
            if entry is not None:
                entry.deleted_at = utc_now()
                removed += 1

        return removed

    async def get_subscriber_ids(
        self,
        session: AsyncReadSession,
        segment: EmailSegment,
    ) -> list[UUID]:
        """Get all active subscriber IDs matching a segment."""
        repository = EmailSegmentRepository.from_session(session)
        return await repository.get_subscriber_ids_for_segment(segment)


email_segment = EmailSegmentService()
