from collections.abc import Sequence
from datetime import datetime, timedelta
from uuid import UUID

import structlog
from sqlalchemy import Select, or_, select, update
from sqlalchemy.orm import contains_eager

from polar.auth.models import AuthSubject
from polar.auth.scope import RESERVED_SCOPES, Scope
from polar.config import settings
from polar.email.react import render_email_template
from polar.email.schemas import (
    PersonalAccessTokenLeakedEmail,
    PersonalAccessTokenLeakedProps,
)
from polar.email.sender import enqueue_email
from polar.enums import TokenType
from polar.kit.crypto import generate_token_hash_pair, get_token_hash
from polar.kit.pagination import PaginationParams, paginate
from polar.kit.services import ResourceServiceReader
from polar.kit.utils import utc_now
from polar.logging import Logger
from polar.models import PersonalAccessToken, User
from polar.postgres import AsyncSession

log: Logger = structlog.get_logger()

TOKEN_PREFIX = "claidor_pat_"


#: A token nobody remembers issuing is a token nobody revokes, so every one
#: of these expires. A year is long enough that a lawyer is not re-pasting
#: it into Word every quarter, and short enough that a forgotten laptop
#: eventually stops being a way in.
DEFAULT_LIFETIME = timedelta(days=365)

#: The ceiling. Asking for longer is a mistake rather than a preference.
MAX_LIFETIME = timedelta(days=365 * 2)


class TokenScopeError(ValueError):
    """The scopes asked for are not ones this token may hold."""


class PersonalAccessTokenService(ResourceServiceReader[PersonalAccessToken]):
    async def create(
        self,
        session: AsyncSession,
        auth_subject: AuthSubject[User],
        *,
        comment: str,
        scopes: set[Scope],
        expires_in: timedelta | None = None,
    ) -> tuple[PersonalAccessToken, str]:
        """Mint a token, and hand back the plaintext exactly once.

        Only an HMAC of the token is stored, so there is no route, no query
        and no support process that can recover it afterwards. A lost token
        is replaced, never looked up.

        Two rules live here rather than in the endpoint, because they are
        properties of what a token *is* and every future caller should
        inherit them without having to remember to.

        **Only a browser session may mint one.** Enforced by requiring the
        caller to hold a reserved scope — which, since no token can hold one
        and none can request one, means exactly « you are a human freshly
        signed in through a browser ». That is the property that matters: a
        token must never be able to mint a token, or a narrowly-scoped one
        is a single request away from a wide one and revoking the first
        would not revoke what it had already issued.

        The first attempt at this rule was « no scope the caller does not
        already hold », which sounds equivalent and is not. A web session
        carries the two reserved scopes and nothing else, so under that rule
        nobody could ever mint anything at all. Session scopes say how you
        authenticated, not what you are entitled to.

        **No reserved scope in the token, ever.** ``web:read`` and
        ``web:write`` belong to the cookie session. A token carrying them
        would be a session that never expires, cannot be seen in a browser's
        storage, and survives every sign-out.
        """
        if not auth_subject.scopes & RESERVED_SCOPES:
            raise TokenScopeError(
                "Only a signed-in browser session can create a token. A token "
                "cannot be used to create another one."
            )

        requested = set(scopes)
        if not requested:
            raise TokenScopeError("A token with no scopes can do nothing.")

        reserved = requested & RESERVED_SCOPES
        if reserved:
            raise TokenScopeError(
                "These scopes belong to the web session and cannot be held by a "
                f"token: {', '.join(sorted(reserved))}."
            )

        lifetime = expires_in if expires_in is not None else DEFAULT_LIFETIME
        if lifetime <= timedelta(0):
            raise TokenScopeError("A token must expire in the future.")
        if lifetime > MAX_LIFETIME:
            raise TokenScopeError(
                f"A token may last at most {MAX_LIFETIME.days} days."
            )

        token, token_hash = generate_token_hash_pair(
            secret=settings.SECRET, prefix=TOKEN_PREFIX
        )
        record = PersonalAccessToken(
            token=token_hash,
            scope=" ".join(sorted(requested)),
            expires_at=utc_now() + lifetime,
            comment=comment.strip() or "Untitled token",
            user_id=auth_subject.subject.id,
        )
        session.add(record)
        await session.flush()

        log.info(
            "personal_access_token.created",
            id=record.id,
            scopes=sorted(requested),
            expires_at=record.expires_at,
        )
        return record, token

    async def list(
        self,
        session: AsyncSession,
        auth_subject: AuthSubject[User],
        *,
        pagination: PaginationParams,
    ) -> tuple[Sequence[PersonalAccessToken], int]:
        statement = self._get_readable_order_statement(auth_subject)
        return await paginate(session, statement, pagination=pagination)

    async def get_by_id(
        self, session: AsyncSession, auth_subject: AuthSubject[User], id: UUID
    ) -> PersonalAccessToken | None:
        statement = self._get_readable_order_statement(auth_subject).where(
            PersonalAccessToken.id == id,
            PersonalAccessToken.deleted_at.is_(None),
        )
        result = await session.execute(statement)
        return result.scalar_one_or_none()

    async def get_by_token(
        self, session: AsyncSession, token: str, *, expired: bool = False
    ) -> PersonalAccessToken | None:
        token_hash = get_token_hash(token, secret=settings.SECRET)
        statement = (
            select(PersonalAccessToken)
            .join(PersonalAccessToken.user)
            .where(
                PersonalAccessToken.token == token_hash,
                PersonalAccessToken.deleted_at.is_(None),
                User.can_authenticate.is_(True),
            )
            .options(contains_eager(PersonalAccessToken.user))
        )
        if not expired:
            statement = statement.where(
                or_(
                    PersonalAccessToken.expires_at.is_(None),
                    PersonalAccessToken.expires_at > utc_now(),
                )
            )

        result = await session.execute(statement)
        return result.unique().scalar_one_or_none()

    async def delete(
        self, session: AsyncSession, personal_access_token: PersonalAccessToken
    ) -> None:
        personal_access_token.set_deleted_at()
        session.add(personal_access_token)

    async def record_usage(
        self, session: AsyncSession, id: UUID, last_used_at: datetime
    ) -> None:
        statement = (
            update(PersonalAccessToken)
            .where(PersonalAccessToken.id == id)
            .values(last_used_at=last_used_at)
        )
        await session.execute(statement)

    async def revoke_leaked(
        self,
        session: AsyncSession,
        token: str,
        token_type: TokenType,
        *,
        notifier: str,
        url: str | None = None,
    ) -> bool:
        personal_access_token = await self.get_by_token(session, token)

        if personal_access_token is None:
            return False

        personal_access_token.set_deleted_at()
        session.add(personal_access_token)

        email = personal_access_token.user.email

        body = render_email_template(
            PersonalAccessTokenLeakedEmail(
                props=PersonalAccessTokenLeakedProps(
                    email=email,
                    personal_access_token=personal_access_token.comment,
                    notifier=notifier,
                    url=url or "",
                )
            )
        )

        enqueue_email(
            to_email_addr=email,
            subject="Security Notice - Your Claidor Personal Access Token has been leaked",
            html_content=body,
        )

        log.info(
            "Revoke leaked personal access token",
            id=personal_access_token.id,
            notifier=notifier,
            url=url,
        )

        return True

    def _get_readable_order_statement(
        self, auth_subject: AuthSubject[User]
    ) -> Select[tuple[PersonalAccessToken]]:
        return select(PersonalAccessToken).where(
            PersonalAccessToken.user_id == auth_subject.subject.id,
            PersonalAccessToken.deleted_at.is_(None),
        )


personal_access_token = PersonalAccessTokenService(PersonalAccessToken)
