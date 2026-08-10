"""Minting a token, and the two rules that make it safe to.

Until now there was no way to create one at all — the inherited codebase
carried `list`, `get` and `delete` and nothing that issued anything. So
these are the first tests of the thing, and they are mostly about what it
must refuse.

Both refusals live in the service rather than the endpoint, because they
are properties of what a token *is*, and a second caller added later should
inherit them without having to remember to.
"""

from datetime import timedelta

import pytest
from fastapi import Request
from httpx import AsyncClient

from polar.auth.middlewares import get_auth_subject
from polar.oauth2.exceptions import InvalidTokenError
from polar.auth.models import AuthSubject
from polar.auth.scope import Scope
from polar.kit.crypto import get_token_hash
from polar.config import settings
from polar.models import User
from polar.personal_access_token.service import (
    MAX_LIFETIME,
    TokenScopeError,
)
from polar.personal_access_token.service import (
    personal_access_token as personal_access_token_service,
)
from polar.postgres import AsyncSession
from tests.fixtures.auth import AuthSubjectFixture


def request_carrying(token: str) -> Request:
    """The smallest thing `get_auth_subject` will read a bearer out of."""
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/v1/redline/check",
            "headers": [(b"authorization", f"Bearer {token}".encode())],
        }
    )


@pytest.mark.asyncio
@pytest.mark.auth
class TestCreate:
    """The default `auth` marker is a web session: it carries web:read and
    web:write and nothing else, which is precisely the shape the "only a
    browser may mint" rule tests for."""

    async def test_the_token_is_returned_once_and_only_its_hash_is_kept(
        self,
        session: AsyncSession,
        auth_subject: AuthSubject[User],
    ) -> None:
        record, token = await personal_access_token_service.create(
            session,
            auth_subject,
            comment="Word add-in",
            scopes={Scope.redline_read},
        )

        assert token.startswith("claidor_pat_")
        # What is stored must be the hash, never the token. If these were
        # ever equal, a database read would be a credential.
        assert record.token != token
        assert record.token == get_token_hash(token, secret=settings.SECRET)

    async def test_it_can_be_used_to_authenticate(
        self,
        session: AsyncSession,
        auth_subject: AuthSubject[User],
    ) -> None:
        # The round trip is the point: a token that cannot be looked up
        # again is an expensive random string.
        _, token = await personal_access_token_service.create(
            session,
            auth_subject,
            comment="Word add-in",
            scopes={Scope.redline_read},
        )

        found = await personal_access_token_service.get_by_token(session, token)

        assert found is not None
        assert found.scopes == {Scope.redline_read}

    async def test_it_expires(
        self, session: AsyncSession, auth_subject: AuthSubject[User]
    ) -> None:
        # A token nobody remembers issuing is a token nobody revokes.
        record, _ = await personal_access_token_service.create(
            session,
            auth_subject,
            comment="Word add-in",
            scopes={Scope.redline_read},
        )

        assert record.expires_at is not None

    async def test_a_reserved_scope_is_refused(
        self, session: AsyncSession, auth_subject: AuthSubject[User]
    ) -> None:
        # web:read belongs to the dashboard's cookie session. A token
        # holding it would be a session that never expires, cannot be seen
        # in a browser's storage and survives every sign-out.
        with pytest.raises(TokenScopeError, match="web session"):
            await personal_access_token_service.create(
                session,
                auth_subject,
                comment="Sneaky",
                scopes={Scope.redline_read, Scope.web_read},
            )

    @pytest.mark.auth(AuthSubjectFixture(scopes={Scope.redline_read}))
    async def test_a_token_cannot_mint_another_token(
        self, session: AsyncSession, auth_subject: AuthSubject[User]
    ) -> None:
        # This subject holds redline:read and no reserved scope, which is
        # exactly what a bearer token looks like. If it could mint, a
        # narrowly-scoped token would be one request from a wide one, and
        # revoking the first would not revoke what it had issued.
        with pytest.raises(TokenScopeError, match="browser session"):
            await personal_access_token_service.create(
                session,
                auth_subject,
                comment="Escalation",
                scopes={Scope.organizations_write},
            )

    async def test_no_scopes_at_all_is_refused(
        self, session: AsyncSession, auth_subject: AuthSubject[User]
    ) -> None:
        with pytest.raises(TokenScopeError):
            await personal_access_token_service.create(
                session, auth_subject, comment="Empty", scopes=set()
            )

    async def test_a_lifetime_beyond_the_ceiling_is_refused(
        self, session: AsyncSession, auth_subject: AuthSubject[User]
    ) -> None:
        with pytest.raises(TokenScopeError, match="at most"):
            await personal_access_token_service.create(
                session,
                auth_subject,
                comment="Forever",
                scopes={Scope.redline_read},
                expires_in=MAX_LIFETIME + timedelta(days=1),
            )


@pytest.mark.asyncio
class TestCreateRoute:
    async def test_anonymous_is_refused(self, client: AsyncClient) -> None:
        response = await client.post(
            "/v1/personal_access_tokens/",
            json={"comment": "Word", "scopes": ["redline:read"]},
        )

        assert response.status_code == 401

    @pytest.mark.auth
    async def test_it_returns_the_token_once(self, client: AsyncClient) -> None:
        response = await client.post(
            "/v1/personal_access_tokens/",
            json={"comment": "Word add-in on my laptop", "scopes": ["redline:read"]},
        )

        assert response.status_code == 201
        body = response.json()
        assert body["token"].startswith("claidor_pat_")
        assert body["personal_access_token"]["scopes"] == ["redline:read"]
        assert body["personal_access_token"]["comment"] == "Word add-in on my laptop"

        # And never again: the list route knows the token exists and cannot
        # say what it is.
        listed = await client.get("/v1/personal_access_tokens/")
        assert listed.status_code == 200
        assert "token" not in listed.json()["items"][0]

    @pytest.mark.auth
    async def test_a_reserved_scope_is_a_bad_request(self, client: AsyncClient) -> None:
        response = await client.post(
            "/v1/personal_access_tokens/",
            json={"comment": "Sneaky", "scopes": ["web:read"]},
        )

        assert response.status_code == 400
        # The message has to name the scope, or it is unactionable.
        assert "web:read" in response.json()["detail"]

    @pytest.mark.auth
    async def test_a_nameless_token_is_refused(self, client: AsyncClient) -> None:
        # A list of tokens all called "Untitled" is a list nobody can safely
        # revoke from.
        response = await client.post(
            "/v1/personal_access_tokens/",
            json={"comment": "", "scopes": ["redline:read"]},
        )

        assert response.status_code == 422

    @pytest.mark.auth
    async def test_the_minted_token_resolves_to_its_owner_and_scopes(
        self, client: AsyncClient, session: AsyncSession
    ) -> None:
        """Mint it through a browser session, then resolve it as a bearer.

        Not through HTTP, and the reason matters. `polar/app.py` skips
        AuthSubjectMiddleware entirely when `settings.is_testing()`, and the
        `client` fixture replaces the auth-subject dependency with a fixed
        value — so an Authorization header sent to `client` is decoration
        and a test written on it would pass without a bearer being involved.
        That is precisely the failure that let the check routes ship
        unreachable, so it is not one to repeat while fixing it.

        `get_auth_subject` is the real resolver the middleware calls. This
        gives it a real request carrying a real token and checks what comes
        back. What remains untested is the one line in app.py that installs
        the middleware.
        """
        minted = await client.post(
            "/v1/personal_access_tokens/",
            json={"comment": "Word add-in", "scopes": ["redline:read"]},
        )
        token = minted.json()["token"]

        subject = await get_auth_subject(request_carrying(token), session)

        assert isinstance(subject.subject, User)
        assert subject.scopes == {Scope.redline_read}
        # And the scopes it resolved to are ones the check route accepts.
        assert subject.scopes & {Scope.redline_read, Scope.redline_write}

    async def test_a_made_up_token_resolves_to_nobody(
        self, session: AsyncSession
    ) -> None:
        # The control. Without it, a resolver that accepted anything would
        # make the test above pass for the wrong reason.
        with pytest.raises(InvalidTokenError):
            await get_auth_subject(
                request_carrying("claidor_pat_notarealtokenatall"), session
            )
