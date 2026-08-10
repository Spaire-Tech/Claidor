from datetime import timedelta

from fastapi import Depends
from pydantic import UUID4

from polar.auth.dependencies import WebUserRead, WebUserWrite
from polar.exceptions import BadRequest, ResourceNotFound
from polar.kit.pagination import ListResource, PaginationParamsQuery
from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter

from .schemas import (
    PersonalAccessToken,
    PersonalAccessTokenCreate,
    PersonalAccessTokenCreateResponse,
)
from .service import TokenScopeError
from .service import personal_access_token as personal_access_token_service

router = APIRouter(
    prefix="/personal_access_tokens", tags=["personal_access_token", APITag.private]
)


@router.get("/", response_model=ListResource[PersonalAccessToken])
async def list_personal_access_tokens(
    auth_subject: WebUserRead,
    pagination: PaginationParamsQuery,
    session: AsyncSession = Depends(get_db_session),
) -> ListResource[PersonalAccessToken]:
    """List personal access tokens."""
    results, count = await personal_access_token_service.list(
        session, auth_subject, pagination=pagination
    )

    return ListResource.from_paginated_results(
        [PersonalAccessToken.model_validate(result) for result in results],
        count,
        pagination,
    )


@router.post("/", response_model=PersonalAccessTokenCreateResponse, status_code=201)
async def create_personal_access_token(
    create: PersonalAccessTokenCreate,
    auth_subject: WebUserWrite,
    session: AsyncSession = Depends(get_db_session),
) -> PersonalAccessTokenCreateResponse:
    """Create a personal access token.

    The token is in the response and nowhere else: only an HMAC of it is
    stored, so this is the one and only time it can be read.

    Deliberately a web-session route. Minting a credential is not something
    a credential should be able to do — otherwise a token with a narrow
    scope is one request away from a token with a wide one, and revoking
    the first would not revoke what it had already issued.
    """
    try:
        personal_access_token, token = await personal_access_token_service.create(
            session,
            auth_subject,
            comment=create.comment,
            scopes=set(create.scopes),
            expires_in=(
                timedelta(days=create.expires_in_days)
                if create.expires_in_days is not None
                else None
            ),
        )
    except TokenScopeError as error:
        # The message names the offending scopes, which is the whole value
        # of the error: "you cannot create a token with scopes you do not
        # have" is unactionable without the list.
        raise BadRequest(str(error)) from error

    return PersonalAccessTokenCreateResponse(
        personal_access_token=PersonalAccessToken.model_validate(personal_access_token),
        token=token,
    )


@router.delete("/{id}", status_code=204)
async def delete_personal_access_token(
    id: UUID4,
    auth_subject: WebUserWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    personal_access_token = await personal_access_token_service.get_by_id(
        session, auth_subject, id
    )
    if personal_access_token is None:
        raise ResourceNotFound()

    await personal_access_token_service.delete(session, personal_access_token)
