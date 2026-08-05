from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from polar.kit.schemas import Schema


class AuditLogEntry(Schema):
    id: UUID
    timestamp: datetime
    name: str = Field(description="Event name, e.g. 'subscription.created'.")
    label: str = Field(
        description="Human-readable label, e.g. 'Subscription Created'."
    )
    customer_id: UUID | None = Field(
        description="Linked customer id, when the action references a customer."
    )
    user_metadata: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "Event-specific structured data (subscription_id, amount, etc.)."
        ),
    )
