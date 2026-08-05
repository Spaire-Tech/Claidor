from datetime import datetime
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy import update as sa_update

from polar.auth.models import AuthSubject, Organization, User, is_organization, is_user
from polar.kit.repository import RepositoryBase, RepositorySoftDeletionMixin
from polar.models import UserOrganization
from polar.models.email_sequence import (
    EmailSequence,
    EmailSequenceStatus,
    EmailSequenceTriggerType,
)
from polar.models.email_sequence_enrollment import (
    EmailSequenceEnrollment,
    EmailSequenceEnrollmentStatus,
)
from polar.models.email_sequence_step import EmailSequenceStep
from polar.models.email_sequence_step_send import EmailSequenceStepSend


class EmailSequenceRepository(
    RepositorySoftDeletionMixin[EmailSequence],
    RepositoryBase[EmailSequence],
):
    model = EmailSequence

    def get_readable_statement(
        self, auth_subject: AuthSubject[User | Organization]
    ) -> Select[tuple[EmailSequence]]:
        statement = self.get_base_statement()
        if is_user(auth_subject):
            statement = statement.where(
                EmailSequence.organization_id.in_(
                    select(UserOrganization.organization_id).where(
                        UserOrganization.user_id == auth_subject.subject.id,
                        UserOrganization.deleted_at.is_(None),
                    )
                )
            )
        elif is_organization(auth_subject):
            statement = statement.where(
                EmailSequence.organization_id == auth_subject.subject.id
            )
        return statement

    async def count_active_for_org(
        self,
        organization_id: UUID,
        *,
        exclude_sequence_id: UUID | None = None,
    ) -> int:
        """Count active (non-draft, non-paused) sequences for an org.

        Used by the tier-limit gate when a creator tries to activate a
        sequence. `exclude_sequence_id` lets callers skip the sequence
        currently being transitioned so the gate compares the *target*
        count, not the current one.
        """
        statement = select(func.count(EmailSequence.id)).where(
            EmailSequence.organization_id == organization_id,
            EmailSequence.status == EmailSequenceStatus.active,
            EmailSequence.deleted_at.is_(None),
        )
        if exclude_sequence_id is not None:
            statement = statement.where(EmailSequence.id != exclude_sequence_id)
        result = await self.session.execute(statement)
        return int(result.scalar_one())

    async def get_active_for_org_by_trigger(
        self,
        organization_id: UUID,
        trigger_type: EmailSequenceTriggerType,
        *,
        lesson_id: UUID | None = None,
        course_id: UUID | None = None,
    ) -> list[EmailSequence]:
        statement = self.get_base_statement().where(
            EmailSequence.organization_id == organization_id,
            EmailSequence.status == EmailSequenceStatus.active,
            EmailSequence.trigger_type == trigger_type,
        )
        # Lesson-completion triggers only fan out to sequences scoped to the
        # lesson that was just completed.
        if lesson_id is not None:
            statement = statement.where(EmailSequence.lesson_id == lesson_id)
        # Course-lifecycle triggers only fan out to sequences for that course,
        # so a milestone in one course never enters another course's sequence.
        if course_id is not None:
            statement = statement.where(EmailSequence.course_id == course_id)
        return list(await self.get_all(statement))

    async def list_active_by_trigger(
        self, trigger_type: EmailSequenceTriggerType
    ) -> list[EmailSequence]:
        """All active sequences with this trigger, across every org — used by
        the daily inactivity scan to find which courses to check."""
        statement = self.get_base_statement().where(
            EmailSequence.status == EmailSequenceStatus.active,
            EmailSequence.trigger_type == trigger_type,
        )
        return list(await self.get_all(statement))

    async def get_enrollment(
        self,
        sequence_id: UUID,
        subscriber_id: UUID,
    ) -> EmailSequenceEnrollment | None:
        statement = (
            select(EmailSequenceEnrollment)
            .where(
                EmailSequenceEnrollment.sequence_id == sequence_id,
                EmailSequenceEnrollment.subscriber_id == subscriber_id,
                EmailSequenceEnrollment.deleted_at.is_(None),
            )
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_enrollments(
        self,
        sequence_id: UUID,
    ) -> list[EmailSequenceEnrollment]:
        statement = (
            select(EmailSequenceEnrollment)
            .where(
                EmailSequenceEnrollment.sequence_id == sequence_id,
                EmailSequenceEnrollment.deleted_at.is_(None),
            )
            .order_by(EmailSequenceEnrollment.enrolled_at.desc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def list_active_enrolments_for_subscriber(
        self,
        organization_id: UUID,
        subscriber_id: UUID,
    ) -> list[tuple[EmailSequenceEnrollment, EmailSequence]]:
        """All active enrolments for a subscriber within an organization,
        with their parent sequence eagerly joined so callers can read the
        sequence's `trigger_config` without another round-trip."""
        statement = (
            select(EmailSequenceEnrollment, EmailSequence)
            .join(
                EmailSequence,
                EmailSequenceEnrollment.sequence_id == EmailSequence.id,
            )
            .where(
                EmailSequence.organization_id == organization_id,
                EmailSequenceEnrollment.subscriber_id == subscriber_id,
                EmailSequenceEnrollment.status
                == EmailSequenceEnrollmentStatus.active,
                EmailSequenceEnrollment.deleted_at.is_(None),
            )
        )
        result = await self.session.execute(statement)
        return [(row[0], row[1]) for row in result.all()]

    async def list_parked_enrolments_for_subscriber(
        self,
        organization_id: UUID,
        subscriber_id: UUID,
    ) -> list[tuple[EmailSequenceEnrollment, EmailSequence]]:
        """Active enrolments parked indefinitely (next_step_at IS NULL).

        Today the only path that produces this state is a wait node with
        mode=until-event — goal-completed/cancelled enrolments leave
        `status=active` only transiently and are then flipped. Caller
        inspects each enrolment's previous flow step to confirm the
        match.
        """
        statement = (
            select(EmailSequenceEnrollment, EmailSequence)
            .join(
                EmailSequence,
                EmailSequenceEnrollment.sequence_id == EmailSequence.id,
            )
            .where(
                EmailSequence.organization_id == organization_id,
                EmailSequenceEnrollment.subscriber_id == subscriber_id,
                EmailSequenceEnrollment.status
                == EmailSequenceEnrollmentStatus.active,
                EmailSequenceEnrollment.next_step_at.is_(None),
                EmailSequenceEnrollment.deleted_at.is_(None),
            )
        )
        result = await self.session.execute(statement)
        return [(row[0], row[1]) for row in result.all()]

    async def list_due_enrollments(self, now: datetime) -> list[EmailSequenceEnrollment]:
        """All active enrollments where next_step_at has passed."""
        statement = (
            select(EmailSequenceEnrollment)
            .where(
                EmailSequenceEnrollment.status == EmailSequenceEnrollmentStatus.active,
                EmailSequenceEnrollment.next_step_at <= now,
                EmailSequenceEnrollment.next_step_at.isnot(None),
                EmailSequenceEnrollment.deleted_at.is_(None),
            )
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def list_steps(self, sequence_id: UUID) -> list[EmailSequenceStep]:
        statement = (
            select(EmailSequenceStep)
            .where(
                EmailSequenceStep.sequence_id == sequence_id,
                EmailSequenceStep.deleted_at.is_(None),
            )
            .order_by(EmailSequenceStep.position.asc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_step(self, step_id: UUID) -> EmailSequenceStep | None:
        statement = select(EmailSequenceStep).where(
            EmailSequenceStep.id == step_id,
            EmailSequenceStep.deleted_at.is_(None),
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_step_by_position(
        self, sequence_id: UUID, position: int
    ) -> EmailSequenceStep | None:
        statement = (
            select(EmailSequenceStep)
            .where(
                EmailSequenceStep.sequence_id == sequence_id,
                EmailSequenceStep.position == position,
                EmailSequenceStep.deleted_at.is_(None),
            )
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_step_by_flow_id(
        self, sequence_id: UUID, flow_step_id: str
    ) -> EmailSequenceStep | None:
        """Resolve the materialised step row for a flow_doc email node by its
        stable client-authored id. Preferred over position lookup for flow
        sequences — position arithmetic drifts once a flow has waits/branches,
        but the node id is stable across edits."""
        statement = select(EmailSequenceStep).where(
            EmailSequenceStep.sequence_id == sequence_id,
            EmailSequenceStep.flow_step_id == flow_step_id,
            EmailSequenceStep.deleted_at.is_(None),
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def max_position(self, sequence_id: UUID) -> int:
        statement = select(
            func.coalesce(func.max(EmailSequenceStep.position), -1)
        ).where(
            EmailSequenceStep.sequence_id == sequence_id,
            EmailSequenceStep.deleted_at.is_(None),
        )
        result = await self.session.execute(statement)
        return result.scalar_one()

    async def reorder_steps(self, items: list[dict]) -> None:
        """Bulk update step positions. items: [{ "id": UUID, "position": int }]"""
        for item in items:
            await self.session.execute(
                sa_update(EmailSequenceStep)
                .where(EmailSequenceStep.id == item["id"])
                .values(position=item["position"])
            )
        await self.session.flush()

    async def get_analytics_counts(self, sequence_id: UUID) -> dict:
        statement = (
            select(
                EmailSequenceStepSend.status,
                func.count(EmailSequenceStepSend.id),
            )
            .join(
                EmailSequenceEnrollment,
                EmailSequenceStepSend.enrollment_id == EmailSequenceEnrollment.id,
            )
            .where(
                EmailSequenceEnrollment.sequence_id == sequence_id,
                EmailSequenceStepSend.deleted_at.is_(None),
            )
            .group_by(EmailSequenceStepSend.status)
        )
        result = await self.session.execute(statement)
        return {row[0]: row[1] for row in result.all()}

    async def get_engagement_counts(self, sequence_id: UUID) -> dict[str, int]:
        """Count opens/clicks across a sequence by timestamp columns.

        Status enum buckets miss opens whose webhook arrived out of order
        (e.g. `email.opened` before `email.delivered` left the row in
        `sent`, or a late bounce clobbered an `opened` row). The
        `opened_at` / `clicked_at` columns are the source of truth.
        """
        statement = (
            select(
                func.count(EmailSequenceStepSend.id)
                .filter(EmailSequenceStepSend.opened_at.is_not(None))
                .label("opened"),
                func.count(EmailSequenceStepSend.id)
                .filter(EmailSequenceStepSend.clicked_at.is_not(None))
                .label("clicked"),
            )
            .join(
                EmailSequenceEnrollment,
                EmailSequenceStepSend.enrollment_id == EmailSequenceEnrollment.id,
            )
            .where(
                EmailSequenceEnrollment.sequence_id == sequence_id,
                EmailSequenceStepSend.deleted_at.is_(None),
            )
        )
        row = (await self.session.execute(statement)).one()
        return {"opened": int(row[0] or 0), "clicked": int(row[1] or 0)}

    async def get_step_engagement_counts(
        self, sequence_id: UUID
    ) -> dict[UUID, dict[str, int]]:
        """Per-step opens/clicks counted by timestamp columns."""
        statement = (
            select(
                EmailSequenceStepSend.step_id,
                func.count(EmailSequenceStepSend.id)
                .filter(EmailSequenceStepSend.opened_at.is_not(None))
                .label("opened"),
                func.count(EmailSequenceStepSend.id)
                .filter(EmailSequenceStepSend.clicked_at.is_not(None))
                .label("clicked"),
            )
            .join(
                EmailSequenceEnrollment,
                EmailSequenceStepSend.enrollment_id == EmailSequenceEnrollment.id,
            )
            .where(
                EmailSequenceEnrollment.sequence_id == sequence_id,
                EmailSequenceStepSend.deleted_at.is_(None),
            )
            .group_by(EmailSequenceStepSend.step_id)
        )
        result = await self.session.execute(statement)
        return {
            row[0]: {"opened": int(row[1] or 0), "clicked": int(row[2] or 0)}
            for row in result.all()
        }

    async def count_recent_sends_for_subscriber(
        self,
        subscriber_id: UUID,
        *,
        cutoff: datetime,
    ) -> int:
        """Count non-failed sequence sends to a subscriber since `cutoff`.

        Used by the workspace-wide frequency cap. We exclude the failed
        bucket so a transient send error doesn't count against the
        subscriber's quota.
        """
        statement = select(func.count(EmailSequenceStepSend.id)).where(
            EmailSequenceStepSend.subscriber_id == subscriber_id,
            EmailSequenceStepSend.status != "failed",
            EmailSequenceStepSend.deleted_at.is_(None),
            EmailSequenceStepSend.created_at >= cutoff,
        )
        result = await self.session.execute(statement)
        return int(result.scalar_one() or 0)

    async def get_step_analytics_counts(
        self, sequence_id: UUID
    ) -> dict[UUID, dict[str, int]]:
        """Per-step send counts grouped by status. Returned as
        {step_id: {status: count}} so callers can derive open/click rate."""
        statement = (
            select(
                EmailSequenceStepSend.step_id,
                EmailSequenceStepSend.status,
                func.count(EmailSequenceStepSend.id),
            )
            .join(
                EmailSequenceEnrollment,
                EmailSequenceStepSend.enrollment_id == EmailSequenceEnrollment.id,
            )
            .where(
                EmailSequenceEnrollment.sequence_id == sequence_id,
                EmailSequenceStepSend.deleted_at.is_(None),
            )
            .group_by(
                EmailSequenceStepSend.step_id,
                EmailSequenceStepSend.status,
            )
        )
        result = await self.session.execute(statement)
        bucket: dict[UUID, dict[str, int]] = {}
        for step_id, status, count in result.all():
            bucket.setdefault(step_id, {})[status] = count
        return bucket

    async def get_enrollment_counts(self, sequence_id: UUID) -> dict:
        statement = (
            select(
                EmailSequenceEnrollment.status,
                func.count(EmailSequenceEnrollment.id),
            )
            .where(
                EmailSequenceEnrollment.sequence_id == sequence_id,
                EmailSequenceEnrollment.deleted_at.is_(None),
            )
            .group_by(EmailSequenceEnrollment.status)
        )
        result = await self.session.execute(statement)
        return {row[0]: row[1] for row in result.all()}

    async def cancel_active_enrollments_for_subscriber(
        self, subscriber_id: UUID, *, now: datetime
    ) -> int:
        """Cancel every active enrollment owned by a subscriber.

        Used when a subscriber bounces, complains, or unsubscribes — the
        worker refuses to advance non-active enrollments, so flipping
        status here stops further sends immediately. Returns the number
        of enrollments flipped.
        """
        result = await self.session.execute(
            sa_update(EmailSequenceEnrollment)
            .where(
                EmailSequenceEnrollment.subscriber_id == subscriber_id,
                EmailSequenceEnrollment.status
                == EmailSequenceEnrollmentStatus.active,
                EmailSequenceEnrollment.deleted_at.is_(None),
            )
            .values(
                status=EmailSequenceEnrollmentStatus.cancelled,
                completed_at=now,
            )
        )
        return int(result.rowcount or 0)
