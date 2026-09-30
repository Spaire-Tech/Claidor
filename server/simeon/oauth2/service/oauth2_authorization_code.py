import structlog
from sqlalchemy import select

from simeon.config import settings
from simeon.enums import TokenType
from simeon.kit.crypto import get_token_hash
from simeon.kit.services import ResourceServiceReader
from simeon.logging import Logger
from simeon.models import OAuth2AuthorizationCode
from simeon.postgres import AsyncSession

log: Logger = structlog.get_logger()


class OAuth2AuthorizationCodeService(ResourceServiceReader[OAuth2AuthorizationCode]):
    async def revoke_leaked(
        self,
        session: AsyncSession,
        token: str,
        token_type: TokenType,
        *,
        notifier: str,
        url: str | None = None,
    ) -> bool:
        statement = select(OAuth2AuthorizationCode).where(
            OAuth2AuthorizationCode.code
            == get_token_hash(token, secret=settings.SECRET)
        )

        result = await session.execute(statement)
        authorization_code = result.unique().scalar_one_or_none()

        if authorization_code is None:
            return False

        authorization_code.set_deleted_at()
        session.add(authorization_code)

        log.info(
            "Revoke leaked authorization code",
            id=authorization_code.id,
            notifier=notifier,
            url=url,
        )

        return True


oauth2_authorization_code = OAuth2AuthorizationCodeService(OAuth2AuthorizationCode)
