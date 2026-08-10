from datetime import datetime

from pydantic import UUID4, Field

from polar.auth.scope import Scope
from polar.kit.schemas import Schema, TimestampedSchema


class PersonalAccessToken(TimestampedSchema):
    id: UUID4
    scopes: list[Scope]
    expires_at: datetime | None
    comment: str
    last_used_at: datetime | None


class PersonalAccessTokenCreate(Schema):
    """What the caller asks for.

    ``comment`` is required and is not decoration. A list of tokens all
    called « Untitled » is a list nobody can safely revoke from, and the
    moment somebody has to guess which one Word is using, none of them get
    revoked at all.
    """

    comment: str = Field(
        min_length=1,
        max_length=120,
        description="What this token is for. Shown in the token list.",
        examples=["Word add-in on my laptop"],
    )
    scopes: list[Scope] = Field(
        min_length=1,
        description=(
            "What the token may do. Reserved scopes (web:read, web:write) are "
            "refused, and so is any scope the caller does not hold."
        ),
        examples=[["redline:read"]],
    )
    expires_in_days: int | None = Field(
        default=None,
        gt=0,
        le=730,
        description="Lifetime in days. Defaults to 365; two years is the ceiling.",
    )


class PersonalAccessTokenCreateResponse(Schema):
    personal_access_token: PersonalAccessToken
    #: The plaintext, returned once. Only an HMAC of it is stored, so
    #: nothing can recover it afterwards — a lost token is replaced.
    token: str
