from typing import Annotated

from fastapi import Depends

from simeon.auth.dependencies import Authenticator
from simeon.auth.models import AuthSubject, Organization, User
from simeon.auth.scope import Scope

_CreatorProductsRead = Authenticator(
    required_scopes={
        Scope.web_read,
        Scope.web_write,
        Scope.products_read,
        Scope.products_write,
    },
    allowed_subjects={User, Organization},
)
CreatorProductsRead = Annotated[
    AuthSubject[User | Organization], Depends(_CreatorProductsRead)
]

_CreatorProductsWrite = Authenticator(
    required_scopes={
        Scope.web_write,
        Scope.products_write,
    },
    allowed_subjects={User, Organization},
)
CreatorProductsWrite = Annotated[
    AuthSubject[User | Organization], Depends(_CreatorProductsWrite)
]
