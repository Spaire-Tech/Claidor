from datetime import datetime
from uuid import UUID

from simeon.kit.schemas import Schema


class AccountCredit(Schema):
    id: UUID
    title: str
    amount: int
    used: int
    granted_at: datetime
    expires_at: datetime | None
    revoked_at: datetime | None
