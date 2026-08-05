"""End-to-end proof that course automations actually deliver the authored email.

These tests cover the two bugs that made the course welcome/milestone emails
either never fire or arrive empty:

1. Enrolling a customer fires `course.enrolled`, which must enrol the subscriber
   into the course's "Student enrols" automation (persisted as the on_purchase
   trigger). Before the fix this event was never mapped to enroll_for_trigger,
   so the welcome email had no path to send.

2. The automation builder saves the authored email *inside* trigger_config's
   flow_doc. The worker, however, sends from a materialised EmailSequenceStep
   row. Without a bridge that row never existed, so the send fell back to an
   empty "(no subject)" email with only the wrapper chrome. sync_flow_steps
   now materialises the flow_doc email nodes so the real body + subject ship.
"""

from datetime import UTC, datetime

import pytest

from polar.course.service import course_service
from polar.email_sequence.repository import EmailSequenceRepository
from polar.email_sequence.service import email_sequence as sequence_service
from polar.email_sequence.tasks import _send_email_step
from polar.models import Course
from polar.models.email_sequence import (
    EmailSequence,
    EmailSequenceStatus,
    EmailSequenceTriggerType,
)
from polar.models.email_sequence_enrollment import (
    EmailSequenceEnrollment,
    EmailSequenceEnrollmentStatus,
)
from polar.models.email_subscriber import EmailSubscriber, EmailSubscriberStatus
from tests.fixtures.random_objects import (
    create_customer,
    create_organization,
    create_product,
)


async def _setup(save_fixture, *, trigger: EmailSequenceTriggerType, flow_doc=None):
    org = await create_organization(save_fixture)
    product = await create_product(
        save_fixture, organization=org, recurring_interval=None
    )
    course = Course(product_id=product.id, organization_id=org.id, title="Mock course")
    await save_fixture(course)
    customer = await create_customer(
        save_fixture, organization=org, email="learner@example.com"
    )
    subscriber = EmailSubscriber(
        organization_id=org.id,
        email="learner@example.com",
        customer_id=customer.id,
        status=EmailSubscriberStatus.active,
    )
    await save_fixture(subscriber)
    seq = EmailSequence(
        organization_id=org.id,
        name="Welcome",
        trigger_type=trigger,
        status=EmailSequenceStatus.active,
        course_id=course.id,
        trigger_config=flow_doc or {},
    )
    await save_fixture(seq)
    return org, course, customer, subscriber, seq


def _enroll_calls(enqueue_mock):
    return [
        c
        for c in enqueue_mock.call_args_list
        if c.args and c.args[0] == "email_sequence.enroll_subscriber"
    ]


@pytest.mark.asyncio
async def test_enrol_welcome_email_fires_on_enrollment(save_fixture, session, mocker):
    # The "Student enrols" automation is saved as trigger_type=on_purchase.
    _, course, customer, _, seq = await _setup(
        save_fixture, trigger=EmailSequenceTriggerType.on_purchase
    )
    enqueue = mocker.patch("polar.email_sequence.service.enqueue_job")

    # Do exactly what the creator did: enrol the customer in the course.
    await course_service.enroll_customer(
        session, course_id=course.id, customer=customer
    )

    calls = _enroll_calls(enqueue)
    assert len(calls) >= 1, (
        "ENROLLING A CUSTOMER DID NOT QUEUE THE WELCOME EMAIL: "
        "course.enrolled must enrol into the on_purchase course automation."
    )


@pytest.mark.asyncio
async def test_course_completed_milestone_fires(save_fixture, session, mocker):
    _, course, customer, _, seq = await _setup(
        save_fixture, trigger=EmailSequenceTriggerType.on_course_completed
    )
    enqueue = mocker.patch("polar.email_sequence.service.enqueue_job")

    await course_service._fire_course_event(
        session,
        course_id=course.id,
        customer_id=customer.id,
        event_name="course.completed",
    )

    calls = _enroll_calls(enqueue)
    assert len(calls) >= 1, "course.completed milestone did not enqueue enrollment"


@pytest.mark.asyncio
async def test_flow_doc_email_is_materialised_into_a_step(save_fixture, session):
    """The bridge that was missing: an email authored in the builder (stored
    inside flow_doc) must become a real EmailSequenceStep carrying the body."""
    body = "<h1>Welcome to Modern Japanese Cooking</h1><p>Let's begin.</p>"
    flow_doc = {
        "flow_doc": {
            "version": 1,
            "steps": [
                {
                    "id": "node-welcome",
                    "type": "email",
                    "name": "Welcome",
                    "subject": "Welcome aboard",
                    "content_html": body,
                }
            ],
        }
    }
    _, _, _, _, seq = await _setup(
        save_fixture,
        trigger=EmailSequenceTriggerType.on_purchase,
        flow_doc=flow_doc,
    )

    await sequence_service.sync_flow_steps(session, seq)

    steps = await EmailSequenceRepository.from_session(session).list_steps(seq.id)
    assert len(steps) == 1, "flow_doc email node was not materialised into a step"
    step = steps[0]
    assert step.flow_step_id == "node-welcome"
    assert step.content_html == body
    assert step.subject == "Welcome aboard"


@pytest.mark.asyncio
async def test_sent_email_contains_authored_body_not_empty(
    save_fixture, session, mocker
):
    """The screenshot bug: prove the *delivered* email carries the authored
    body and a real subject — not the empty "(no subject)" wrapper."""
    body = "<h1>Welcome to Modern Japanese Cooking</h1><p>Your first lesson.</p>"
    flow_doc = {
        "flow_doc": {
            "version": 1,
            "steps": [
                {
                    "id": "node-welcome",
                    "type": "email",
                    "name": "Welcome",
                    "subject": "Welcome aboard",
                    "content_html": body,
                }
            ],
        }
    }
    org, _, _, subscriber, seq = await _setup(
        save_fixture,
        trigger=EmailSequenceTriggerType.on_purchase,
        flow_doc=flow_doc,
    )
    await sequence_service.sync_flow_steps(session, seq)
    step = (await EmailSequenceRepository.from_session(session).list_steps(seq.id))[0]

    enrollment = EmailSequenceEnrollment(
        sequence_id=seq.id,
        subscriber_id=subscriber.id,
        status=EmailSequenceEnrollmentStatus.active,
        flow_next_step_id="node-welcome",
        enrolled_at=datetime.now(tz=UTC),
    )
    await save_fixture(enrollment)

    send_mock = mocker.patch(
        "polar.email_sequence.tasks.email_sender.send",
        return_value="resend-id-123",
    )
    # The MarketingEmail wrapper is rendered by a separate React-Email
    # subprocess binary (stubbed to /usr/bin/true in this env, so it returns
    # nothing). Make finalize_email_html a pass-through so we can assert the
    # authored body actually reaches the wrapper — the bug under test was the
    # body never getting that far, not the wrapping itself.
    mocker.patch(
        "polar.email_sequence.tasks.finalize_email_html",
        side_effect=lambda body_html, **kw: body_html,
    )

    sent_ok = await _send_email_step(
        session,
        sequence=seq,
        enrollment=enrollment,
        subscriber=subscriber,
        organization=None,  # skips quota enforcement
        step=step,
    )

    assert sent_ok is True
    send_mock.assert_called_once()
    kwargs = send_mock.call_args.kwargs
    assert kwargs["subject"] == "Welcome aboard"
    assert kwargs["subject"] != "(no subject)"
    assert "Modern Japanese Cooking" in kwargs["html_content"]
    assert "Your first lesson." in kwargs["html_content"]
