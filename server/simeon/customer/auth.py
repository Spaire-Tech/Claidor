from typing import Annotated

from fastapi import Depends

from simeon.auth.dependencies import Authenticator
from simeon.auth.models import AuthSubject, User
from simeon.auth.scope import Scope
from simeon.models.organization import Organization

_CustomerRead = Authenticator(
    required_scopes={
        Scope.web_read,
        Scope.web_write,
        Scope.customers_read,
        Scope.customers_write,
    },
    allowed_subjects={User, Organization},
)
CustomerRead = Annotated[AuthSubject[User | Organization], Depends(_CustomerRead)]

_CustomerWrite = Authenticator(
    required_scopes={
        Scope.web_write,
        Scope.customers_write,
    },
    allowed_subjects={User, Organization},
)
CustomerWrite = Annotated[AuthSubject[User | Organization], Depends(_CustomerWrite)]
