"""Code-defined sequence templates.

These ship with the product and are cloned into a draft sequence on demand.
They're not stored in the database; the registry is the source of truth.
Each template defines a name, description, recommended trigger, a category
for the UI, and a list of step definitions matching the EmailSequenceStep
model fields used by the editor.
"""

from typing import TypedDict

from polar.models.email_sequence import EmailSequenceTriggerType


class TemplateStep(TypedDict):
    delay_hours: int
    subject: str
    sender_name: str
    content_html: str
    content_json: dict


class SequenceTemplate(TypedDict):
    slug: str
    name: str
    description: str
    category: str
    trigger_type: EmailSequenceTriggerType
    trigger_config: dict
    steps: list[TemplateStep]
    # Rich authored flow doc — same shape the editor reads from
    # trigger_config.flow_doc. Includes email, wait, branch, action, goal
    # nodes so cloning a template yields the full authored experience,
    # not just a flat list of emails.
    flow_doc: dict


def _para(text: str) -> dict:
    return {"id": f"p-{abs(hash(text)) % 10**8}", "type": "paragraph", "text": text}


def _heading(text: str) -> dict:
    return {
        "id": f"h-{abs(hash(text)) % 10**8}",
        "type": "heading",
        "level": 2,
        "text": text,
    }


def _button(label: str, url: str = "https://example.com") -> dict:
    return {
        "id": f"b-{abs(hash(label)) % 10**8}",
        "type": "button",
        "label": label,
        "url": url,
    }


def _step(
    *,
    delay_hours: int,
    subject: str,
    sender_name: str,
    blocks: list[dict],
) -> TemplateStep:
    # Mirror block doc as plain HTML fallback so existing renderers can read it.
    html_parts: list[str] = []
    for block in blocks:
        t = block.get("type")
        if t == "heading":
            html_parts.append(f"<h2>{block['text']}</h2>")
        elif t == "paragraph":
            html_parts.append(f"<p>{block['text']}</p>")
        elif t == "button":
            html_parts.append(
                f'<p><a href="{block["url"]}" class="btn">{block["label"]}</a></p>'
            )
    return {
        "delay_hours": delay_hours,
        "subject": subject,
        "sender_name": sender_name,
        "content_html": "\n".join(html_parts),
        "content_json": {"blocks": blocks},
    }


TEMPLATES: list[SequenceTemplate] = [
    {
        "slug": "digital_product_launch",
        "name": "Masterclass launch",
        "description": "6-email pre-launch + launch + post-launch flow for a new product. Build anticipation, launch, follow up.",
        "category": "Launch",
        "trigger_type": EmailSequenceTriggerType.manual,
        "trigger_config": {},
        "steps": [
            _step(
                delay_hours=0,
                subject="Something's coming",
                sender_name="Team",
                blocks=[
                    _heading("We've been working on something"),
                    _para("Quick teaser. More details next week."),
                ],
            ),
            _step(
                delay_hours=72,
                subject="Here's what we've been building",
                sender_name="Team",
                blocks=[
                    _heading("The story"),
                    _para("Why we built it, what it does, who it's for."),
                ],
            ),
            _step(
                delay_hours=168,
                subject="Launching tomorrow at 9am",
                sender_name="Team",
                blocks=[
                    _heading("Tomorrow"),
                    _para(
                        "We open at 9am ET. Early-bird pricing for the first 48 hours."
                    ),
                ],
            ),
            _step(
                delay_hours=192,
                subject="It's live",
                sender_name="Team",
                blocks=[
                    _heading("Doors are open"),
                    _para("Early-bird pricing ends in 48 hours."),
                    _button("See it now", "https://example.com/product"),
                ],
            ),
            _step(
                delay_hours=240,
                subject="24 hours left at this price",
                sender_name="Team",
                blocks=[
                    _heading("Last day for early-bird"),
                    _para("Tomorrow it goes back to full price."),
                    _button("Get it before it changes", "https://example.com/product"),
                ],
            ),
            _step(
                delay_hours=336,
                subject="Thanks — and a quick favour",
                sender_name="Team",
                blocks=[
                    _heading("Thanks for the launch"),
                    _para(
                        "If you bought, hit reply and tell us how you're using it. "
                        "If you didn't — we'd love to know what stopped you."
                    ),
                ],
            ),
        ],
    },
    {
        "slug": "podcast_nurture",
        "name": "Podcast listener nurture",
        "description": "4-email welcome flow for new podcast subscribers. Greatest-hits picks and what to listen to next.",
        "category": "Audience",
        "trigger_type": EmailSequenceTriggerType.on_subscribe,
        "trigger_config": {},
        "steps": [
            _step(
                delay_hours=0,
                subject="Welcome — start here",
                sender_name="The Show",
                blocks=[
                    _heading("Glad you're here"),
                    _para(
                        "Three episodes that'll tell you whether you'll like the show."
                    ),
                    _button(
                        "Episode 12 — the one everyone shares",
                        "https://example.com/ep12",
                    ),
                ],
            ),
            _step(
                delay_hours=72,
                subject="If you liked that, try this",
                sender_name="The Show",
                blocks=[
                    _heading("Episode 24"),
                    _para("Our most-shared interview, in case you missed it."),
                    _button("Listen", "https://example.com/ep24"),
                ],
            ),
            _step(
                delay_hours=168,
                subject="Behind the scenes",
                sender_name="The Show",
                blocks=[
                    _heading("How the show gets made"),
                    _para("A short note on the format, the gear, and the editing."),
                ],
            ),
            _step(
                delay_hours=336,
                subject="What do you want to hear?",
                sender_name="The Show",
                blocks=[
                    _heading("Reply with a topic"),
                    _para(
                        "We pull listener questions for our Q&A episodes — hit reply with anything you'd like us to cover."
                    ),
                ],
            ),
        ],
    },
    {
        "slug": "cart_recovery",
        "name": "Abandoned cart recovery",
        "description": "3-email flow for shoppers who left without buying. Reminder → social proof → small incentive.",
        "category": "Commerce",
        "trigger_type": EmailSequenceTriggerType.manual,
        "trigger_config": {},
        "steps": [
            _step(
                delay_hours=1,
                subject="You left something behind",
                sender_name="Store",
                blocks=[
                    _heading("Still thinking it over?"),
                    _para(
                        "Your cart is saved. Pick up where you left off whenever you're ready."
                    ),
                    _button("Return to your cart", "https://example.com/cart"),
                ],
            ),
            _step(
                delay_hours=24,
                subject="Other people are loving this",
                sender_name="Store",
                blocks=[
                    _heading("What customers are saying"),
                    _para(
                        "Three short reviews. If you've been on the fence, this is what you'd be getting."
                    ),
                    _button("Read reviews", "https://example.com/product#reviews"),
                ],
            ),
            _step(
                delay_hours=72,
                subject="10% off, today only",
                sender_name="Store",
                blocks=[
                    _heading("A small nudge"),
                    _para("Use code COMEBACK for 10% off. Expires in 24 hours."),
                    _button(
                        "Apply discount", "https://example.com/cart?promo=COMEBACK"
                    ),
                ],
            ),
        ],
    },
    {
        "slug": "post_purchase_onboarding",
        "name": "Post-purchase onboarding",
        "description": "4-email walkthrough for new customers. Thanks → setup → tips → ask for review.",
        "category": "Customer",
        "trigger_type": EmailSequenceTriggerType.on_purchase,
        "trigger_config": {},
        "steps": [
            _step(
                delay_hours=0,
                subject="Thanks for your order",
                sender_name="Team",
                blocks=[
                    _heading("Your order is in"),
                    _para("Here's what happens next and how to get started."),
                    _button("Set up your account", "https://example.com/setup"),
                ],
            ),
            _step(
                delay_hours=24,
                subject="A quick how-to",
                sender_name="Team",
                blocks=[
                    _heading("Getting going"),
                    _para("Three things most new customers wish they knew on day one."),
                ],
            ),
            _step(
                delay_hours=72,
                subject="Tips you might've missed",
                sender_name="Team",
                blocks=[
                    _heading("Less obvious features"),
                    _para(
                        "A few power-user tips that get the most out of the product."
                    ),
                ],
            ),
            _step(
                delay_hours=168,
                subject="How are we doing?",
                sender_name="Team",
                blocks=[
                    _heading("A quick favour"),
                    _para(
                        "If you've had a good experience, a short review really helps."
                    ),
                    _button("Leave a review", "https://example.com/review"),
                ],
            ),
        ],
    },
    {
        "slug": "win_back",
        "name": "Win-back campaign",
        "description": "3-email re-engagement flow for inactive subscribers. We miss you → here's what's new → final goodbye.",
        "category": "Retention",
        "trigger_type": EmailSequenceTriggerType.manual,
        "trigger_config": {},
        "steps": [
            _step(
                delay_hours=0,
                subject="It's been a while",
                sender_name="Team",
                blocks=[
                    _heading("We miss you"),
                    _para("Quick check-in — anything we can help with?"),
                ],
            ),
            _step(
                delay_hours=168,
                subject="Here's what you've missed",
                sender_name="Team",
                blocks=[
                    _heading("New since you've been gone"),
                    _para("Three things shipped that you might find useful."),
                ],
            ),
            _step(
                delay_hours=336,
                subject="Last email, promise",
                sender_name="Team",
                blocks=[
                    _heading("Should we keep emailing?"),
                    _para(
                        "If you're not interested anymore, no hard feelings — just hit unsubscribe at the bottom and we'll stop."
                    ),
                ],
            ),
        ],
    },
    {
        "slug": "cancellation_save",
        "name": "Cancellation save",
        "description": "2-email retention attempt after a subscriber cancels. Acknowledge → offer to talk.",
        "category": "Retention",
        "trigger_type": EmailSequenceTriggerType.on_subscription_cancelled,
        "trigger_config": {},
        "steps": [
            _step(
                delay_hours=0,
                subject="Sorry to see you go",
                sender_name="Team",
                blocks=[
                    _heading("Confirmed — your cancellation is in"),
                    _para(
                        "If something specific went wrong, we'd love to know. Hit reply and a real person will read it."
                    ),
                ],
            ),
            _step(
                delay_hours=48,
                subject="Want to talk?",
                sender_name="Team",
                blocks=[
                    _heading("One last offer"),
                    _para(
                        "If price was the issue, we have a smaller plan. If something didn't work, we'd love to hear about it."
                    ),
                    _button("Book a 15-min call", "https://example.com/call"),
                ],
            ),
        ],
    },
    {
        "slug": "trial_to_paid",
        "name": "Trial → paid conversion",
        "description": "5-email trial-to-paid funnel. Day 1 setup → day 3 wins → day 7 case study → day 11 reminder → day 14 last chance.",
        "category": "Conversion",
        "trigger_type": EmailSequenceTriggerType.manual,
        "trigger_config": {},
        "steps": [
            _step(
                delay_hours=0,
                subject="Your trial starts now",
                sender_name="Team",
                blocks=[
                    _heading("14 days, no credit card"),
                    _para("Here's the fastest way to get value in the first hour."),
                    _button("Set up in 5 minutes", "https://example.com/setup"),
                ],
            ),
            _step(
                delay_hours=72,
                subject="Quick wins others have had",
                sender_name="Team",
                blocks=[
                    _heading("What customers do in week 1"),
                    _para(
                        "Three patterns we see from people who get the most out of the product."
                    ),
                ],
            ),
            _step(
                delay_hours=168,
                subject="A short customer story",
                sender_name="Team",
                blocks=[
                    _heading("How [Customer] uses it"),
                    _para("A 3-minute read on a real workflow that might match yours."),
                ],
            ),
            _step(
                delay_hours=264,
                subject="Trial ends in 3 days",
                sender_name="Team",
                blocks=[
                    _heading("3 days left"),
                    _para("Pick a plan now to keep your data and settings."),
                    _button("Choose a plan", "https://example.com/billing"),
                ],
            ),
            _step(
                delay_hours=336,
                subject="Trial ends today",
                sender_name="Team",
                blocks=[
                    _heading("Last call"),
                    _para(
                        "If you upgrade today everything keeps working — no setup again."
                    ),
                    _button("Upgrade now", "https://example.com/billing"),
                ],
            ),
        ],
    },
]


def _node(type_: str, value: dict) -> dict:
    return {
        "id": f"n-{abs(hash(repr(value)) ^ hash(type_)) % 10**8}",
        "type": type_,
        "value": value,
    }


def _email_node(step: TemplateStep) -> dict:
    return _node(
        "email",
        {
            "subject": step["subject"],
            "preview": "",
            "fromName": step["sender_name"],
            "fromEmail": "hello@yoursite.com",
            "template": "plain",
            "abTest": False,
            "trackClicks": True,
            "content_html": step["content_html"],
            "content_json": step["content_json"],
        },
    )


def _wait_node(hours: int) -> dict:
    if hours <= 0:
        return _node("wait", {"mode": "duration", "amount": 0, "unit": "hour"})
    if hours % 24 == 0:
        return _node(
            "wait",
            {"mode": "duration", "amount": hours // 24, "unit": "day"},
        )
    return _node("wait", {"mode": "duration", "amount": hours, "unit": "hour"})


def _branch_node(field: str, **rest: object) -> dict:
    return _node("branch", {"field": field, **rest})


def _action_node(action: str, **rest: object) -> dict:
    return _node("action", {"action": action, **rest})


def _goal_node(event: str) -> dict:
    return _node("goal", {"event": event})


# Custom flow docs for templates whose value is more than a flat email list:
# trial→paid benefits from an engagement branch part-way through; cart
# recovery uses a goal node to stop on purchase.
def _flow_for(template: SequenceTemplate) -> dict:
    steps_iter = template["steps"]
    nodes: list[dict] = []
    slug = template["slug"]

    # Default: alternating wait + email, with a final action/goal where useful.
    for i, step in enumerate(steps_iter):
        if i > 0:
            nodes.append(_wait_node(step["delay_hours"]))
        nodes.append(_email_node(step))

    if slug == "trial_to_paid" and len(nodes) >= 4:
        branch = _branch_node("clicked-prev")
        nodes.insert(4, branch)
        nodes.append(_goal_node("product-purchased"))
    elif slug == "cart_recovery":
        nodes.append(_goal_node("product-purchased"))
    elif slug == "post_purchase_onboarding":
        nodes.append(_action_node("add-tag", tag="onboarded"))
    elif slug == "win_back":
        branch = _branch_node("opened-prev")
        if len(nodes) >= 4:
            nodes.insert(2, branch)
    elif slug == "cancellation_save":
        nodes.append(_goal_node("subscription-resumed"))

    return {
        "version": 1,
        "category": _categoryToFlowKey(template["category"]),
        "audience": {
            "mode": "all",
            "filters": [],
            "excludeTags": [],
        },
        "goal": {"event": "none", "window": "14"},
        "send": {
            "window": "weekdays",
            "start": "09:00",
            "end": "17:00",
            "respectTimezone": True,
            "pauseOnUnsub": True,
            "skipIfInOther": True,
            "frequencyCap": True,
        },
        "steps": nodes,
    }


def _categoryToFlowKey(category: str) -> str:
    return {
        "Launch": "sales",
        "Audience": "nurture",
        "Commerce": "sales",
        "Customer": "onboarding",
        "Retention": "retention",
        "Conversion": "sales",
    }.get(category, "onboarding")


# Attach a flow_doc to every template so cloning yields the rich authored
# experience in the editor.
for _t in TEMPLATES:
    _t["flow_doc"] = _flow_for(_t)


_BY_SLUG = {t["slug"]: t for t in TEMPLATES}


def get_template(slug: str) -> SequenceTemplate | None:
    return _BY_SLUG.get(slug)
