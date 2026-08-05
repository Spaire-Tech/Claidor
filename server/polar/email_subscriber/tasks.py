from uuid import UUID

from polar.worker import AsyncSessionMaker, TaskPriority, actor


@actor(actor_name="email_subscriber.subscribe_from_order", priority=TaskPriority.LOW)
async def subscribe_from_order(
    organization_id: UUID,
    email: str,
    name: str | None,
    customer_id: UUID | None,
    subscription_id: str | None = None,
    product_id: str | None = None,
    purchased_product_id: str | None = None,
) -> None:
    from .service import email_subscriber as email_subscriber_service

    async with AsyncSessionMaker() as session:
        # `purchased_product_id` is set only for one-time purchase orders;
        # passing it fires the "on purchase" automations for that product
        # (previously never fired for non-course orders because the product
        # was dropped here). Renewal cycles pass neither id, so they
        # re-trigger nothing.
        subscriber = await email_subscriber_service.subscribe_from_purchase(
            session,
            organization_id=organization_id,
            email=email,
            name=name,
            customer_id=customer_id,
            product_id=(UUID(purchased_product_id) if purchased_product_id else None),
        )

        # A new subscription / free trial just started — fire the
        # "Subscription started" (on_subscription_created) automations for
        # this subscriber. Gated on subscription_id so it only runs for the
        # first (subscription_create) order: one-time purchases and monthly
        # renewal cycles don't pass it, so they never re-trigger a welcome.
        if subscription_id is not None:
            from polar.email_sequence.service import (
                email_sequence as sequence_service,
            )
            from polar.models.email_sequence import EmailSequenceTriggerType

            await sequence_service.enroll_for_trigger(
                session,
                organization_id,
                EmailSequenceTriggerType.on_subscription_created,
                subscriber.id,
                trigger_filter=({"product_id": product_id} if product_id else None),
            )


@actor(actor_name="email_subscriber.subscription_ended", priority=TaskPriority.LOW)
async def subscription_ended(
    organization_id: UUID,
    email: str,
    product_id: str | None = None,
) -> None:
    """Fire the "on subscription cancelled" (win-back) automations when a
    customer's subscription actually ends. Previously a dead trigger: the
    template gallery offered it but nothing ever fired it.

    Only enrolls people who are ALREADY on the creator's email list —
    a win-back campaign must not become a consent bypass for customers
    who never opted into marketing.
    """
    from polar.email_sequence.service import email_sequence as sequence_service
    from polar.models.email_sequence import EmailSequenceTriggerType
    from polar.models.email_subscriber import EmailSubscriberStatus

    from .repository import EmailSubscriberRepository

    async with AsyncSessionMaker() as session:
        repository = EmailSubscriberRepository.from_session(session)
        subscriber = await repository.get_by_email_and_organization(
            email, organization_id
        )
        if subscriber is None or subscriber.status != EmailSubscriberStatus.active:
            return

        await sequence_service.enroll_for_trigger(
            session,
            organization_id,
            EmailSequenceTriggerType.on_subscription_cancelled,
            subscriber.id,
            trigger_filter={"product_id": product_id} if product_id else None,
        )
