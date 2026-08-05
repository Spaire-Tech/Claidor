"""The 'Subscription started' automation (on_subscription_created) fires.

Before, this trigger was defined and offered in the dashboard but nothing
ever invoked it, so a welcome-on-trial sequence never enrolled anyone. The
order-paid path now calls into the same orchestration these tests exercise:
create the buyer's subscriber, then enroll them into active
on_subscription_created sequences. A draft sequence is left alone.
"""

from uuid import uuid4

import pytest
from pytest_mock import MockerFixture

from polar.email_sequence.service import email_sequence as sequence_service
from polar.email_subscriber.service import (
    email_subscriber as email_subscriber_service,
)
from polar.models.email_sequence import (
    EmailSequence,
    EmailSequenceStatus,
    EmailSequenceTriggerType,
)
from polar.postgres import AsyncSession
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import create_organization


async def _sequence(
    save_fixture: SaveFixture,
    *,
    organization_id,
    trigger: EmailSequenceTriggerType,
    status: EmailSequenceStatus,
    trigger_config: dict | None = None,
) -> EmailSequence:
    sequence = EmailSequence(
        organization_id=organization_id,
        name="Welcome",
        trigger_type=trigger,
        trigger_config=trigger_config or {},
        status=status,
    )
    await save_fixture(sequence)
    return sequence


@pytest.mark.asyncio
class TestSubscriptionStartedTrigger:
    async def test_active_sequence_enrolls_on_subscription_started(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        org = await create_organization(save_fixture)
        welcome = await _sequence(
            save_fixture,
            organization_id=org.id,
            trigger=EmailSequenceTriggerType.on_subscription_created,
            status=EmailSequenceStatus.active,
        )
        # A draft sequence on the same trigger must NOT enroll — sequences
        # only fire once Active (a common "it never worked" cause).
        await _sequence(
            save_fixture,
            organization_id=org.id,
            trigger=EmailSequenceTriggerType.on_subscription_created,
            status=EmailSequenceStatus.draft,
        )

        enqueue = mocker.patch("polar.email_sequence.service.enqueue_job")

        # Mirror what the order-paid task now does at a trial/sub start:
        # create the buyer's subscriber, then fire on_subscription_created.
        subscriber = await email_subscriber_service.subscribe_from_purchase(
            session,
            organization_id=org.id,
            email="buyer@example.com",
            name="Buyer",
        )
        await sequence_service.enroll_for_trigger(
            session,
            org.id,
            EmailSequenceTriggerType.on_subscription_created,
            subscriber.id,
            trigger_filter={"product_id": str(uuid4())},
        )

        enroll_calls = [
            call
            for call in enqueue.call_args_list
            if call.args and call.args[0] == "email_sequence.enroll_subscriber"
        ]
        # Exactly one enrollment — the ACTIVE welcome sequence; the draft is
        # skipped. (No on_subscribe sequence exists here, so this is the only
        # enrollment fired.)
        assert len(enroll_calls) == 1
        assert enroll_calls[0].kwargs["sequence_id"] == welcome.id
        assert enroll_calls[0].kwargs["subscriber_id"] == subscriber.id

    async def test_no_active_sequence_means_no_enrollment(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        org = await create_organization(save_fixture)
        # A sequence on a DIFFERENT trigger must not catch subscription starts.
        await _sequence(
            save_fixture,
            organization_id=org.id,
            trigger=EmailSequenceTriggerType.on_purchase,
            status=EmailSequenceStatus.active,
        )

        enqueue = mocker.patch("polar.email_sequence.service.enqueue_job")

        subscriber = await email_subscriber_service.subscribe_from_purchase(
            session,
            organization_id=org.id,
            email="buyer2@example.com",
            name="Buyer Two",
        )
        await sequence_service.enroll_for_trigger(
            session,
            org.id,
            EmailSequenceTriggerType.on_subscription_created,
            subscriber.id,
        )

        enroll_calls = [
            call
            for call in enqueue.call_args_list
            if call.args and call.args[0] == "email_sequence.enroll_subscriber"
        ]
        assert enroll_calls == []
