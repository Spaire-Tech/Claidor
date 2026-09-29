from typing import Annotated

from fastapi import Depends

from simeon.auth.dependencies import Authenticator
from simeon.auth.models import AuthSubject, Organization, User
from simeon.auth.scope import Scope

_OrganizationAccessTokensRead = Authenticator(
    required_scopes={
        Scope.web_read,
        Scope.web_write,
        Scope.organization_access_tokens_read,
        Scope.organization_access_tokens_write,
    },
    allowed_subjects={User, Organization},
)
OrganizationAccessTokensRead = Annotated[
    AuthSubject[User | Organization], Depends(_OrganizationAccessTokensRead)
]

_OrganizationAccessTokensWrite = Authenticator(
    required_scopes={
        Scope.web_write,
        Scope.organization_access_tokens_write,
    },
    allowed_subjects={User, Organization},
)
OrganizationAccessTokensWrite = Annotated[
    AuthSubject[User | Organization], Depends(_OrganizationAccessTokensWrite)
]
