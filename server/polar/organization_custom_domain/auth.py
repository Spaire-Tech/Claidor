from typing import Annotated

from fastapi import Depends

from polar.auth.dependencies import Authenticator
from polar.auth.models import AuthSubject, Organization, User
from polar.auth.scope import Scope

CustomDomainRead = Annotated[
    AuthSubject[User | Organization],
    Depends(
        Authenticator(
            required_scopes={
                Scope.web_read,
                Scope.web_write,
                Scope.organizations_read,
                Scope.organizations_write,
            },
            allowed_subjects={User, Organization},
        )
    ),
]

CustomDomainWrite = Annotated[
    AuthSubject[User | Organization],
    Depends(
        Authenticator(
            required_scopes={
                Scope.web_write,
                Scope.organizations_write,
            },
            allowed_subjects={User, Organization},
        )
    ),
]
