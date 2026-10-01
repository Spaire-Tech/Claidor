from typing import TypedDict

import httpx
import structlog
from httpx_oauth.clients.google import GoogleOAuth2
from httpx_oauth.oauth2 import OAuth2Token

from simeon.config import settings
from simeon.exceptions import PolarError
from simeon.logging import Logger
from simeon.models import OAuthAccount, User
from simeon.models.user import OAuthPlatform
from simeon.postgres import AsyncSession
from simeon.user.oauth_service import oauth_account_service
from simeon.user.repository import UserRepository
from simeon.user.schemas import UserSignupAttribution
from simeon.worker import enqueue_job

log: Logger = structlog.get_logger()

google_oauth_client = GoogleOAuth2(
    settings.GOOGLE_CLIENT_ID, settings.GOOGLE_CLIENT_SECRET
)


class GoogleUserProfile(TypedDict):
    id: str
    email: str
    email_verified: bool
    picture: str | None
    name: str | None
    given_name: str | None


def remember_google_name(user: User, profile: GoogleUserProfile) -> None:
    """The person's name as Google gives it, kept in `meta` (the user row has
    no name column). The desktop's profile route hands it to the agent, which
    greets the person by it, as the upstream app does (28 September 2026)."""
    name = (profile.get("name") or "").strip()
    given = (profile.get("given_name") or "").strip()
    if not name and not given:
        return
    meta = dict(user.meta or {})
    if meta.get("name") == name and meta.get("given_name") == given:
        return
    meta["name"] = name
    meta["given_name"] = given
    user.meta = meta


class GoogleServiceError(PolarError): ...


class CannotLinkUnverifiedEmailError(GoogleServiceError):
    def __init__(self, email: str) -> None:
        message = (
            f"An account already exists on Simeon under the email {email}. "
            "We cannot automatically link it to your Google account since "
            "this email address is not verified on Google. "
            "Either verify your email address on Google and try again "
            "or sign in using your email."
        )
        super().__init__(message, 403)


class AccountLinkedToAnotherUserError(GoogleServiceError):
    def __init__(self) -> None:
        message = (
            "This Google account is already linked to another user on Simeon. "
            "You may have already created another account "
            "with a different email address."
        )
        super().__init__(message, 403)


class GoogleService:
    async def get_updated_or_create(
        self,
        session: AsyncSession,
        *,
        token: OAuth2Token,
        signup_attribution: UserSignupAttribution | None = None,
    ) -> tuple[User, bool]:
        google_profile = await self._get_profile(token["access_token"])
        user_repository = UserRepository.from_session(session)
        user = await user_repository.get_by_oauth_account(
            OAuthPlatform.google, google_profile["id"]
        )

        if user is not None:
            oauth_account = user.get_oauth_account(OAuthPlatform.google)
            assert oauth_account is not None
            oauth_account.access_token = token["access_token"]
            oauth_account.expires_at = token["expires_at"]
            oauth_account.account_username = google_profile["email"]
            session.add(oauth_account)
            remember_google_name(user, google_profile)
            session.add(user)
            return (user, False)

        oauth_account = OAuthAccount(
            platform=OAuthPlatform.google,
            account_id=google_profile["id"],
            account_email=google_profile["email"],
            account_username=google_profile["email"],
            access_token=token["access_token"],
            expires_at=token["expires_at"],
        )

        user = await user_repository.get_by_email(google_profile["email"])
        if user is not None:
            if google_profile["email_verified"]:
                user.oauth_accounts.append(oauth_account)
                remember_google_name(user, google_profile)
                session.add(user)
                return (user, False)
            else:
                raise CannotLinkUnverifiedEmailError(google_profile["email"])

        user = User(
            email=google_profile["email"],
            email_verified=google_profile["email_verified"],
            avatar_url=google_profile["picture"],
            oauth_accounts=[oauth_account],
            signup_attribution=signup_attribution,
        )
        remember_google_name(user, google_profile)

        session.add(user)
        await session.flush()

        enqueue_job("user.on_after_signup", user_id=user.id)

        return (user, True)

    async def link_user(
        self,
        session: AsyncSession,
        *,
        user: User,
        token: OAuth2Token,
    ) -> User:
        google_profile = await self._get_profile(token["access_token"])

        oauth_account = await oauth_account_service.get_by_platform_and_account_id(
            session, OAuthPlatform.google, google_profile["id"]
        )
        if oauth_account is not None:
            if oauth_account.user_id != user.id:
                raise AccountLinkedToAnotherUserError()
        else:
            oauth_account = OAuthAccount(
                platform=OAuthPlatform.google,
                account_id=google_profile["id"],
                account_email=google_profile["email"],
            )
            user.oauth_accounts.append(oauth_account)
            log.info(
                "oauth_account.connect",
                user_id=user.id,
                platform="google",
                account_email=google_profile["email"],
            )

        oauth_account.access_token = token["access_token"]
        oauth_account.expires_at = token["expires_at"]
        oauth_account.account_username = google_profile["email"]
        session.add(user)

        await session.flush()

        return user

    async def _get_profile(self, token: str) -> GoogleUserProfile:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {token}"},
            )
            response.raise_for_status()

            data = response.json()
            return {
                "id": data["sub"],
                "email": data["email"],
                "email_verified": data["email_verified"],
                "picture": data.get("picture"),
                "name": data.get("name"),
                "given_name": data.get("given_name"),
            }


google = GoogleService()
