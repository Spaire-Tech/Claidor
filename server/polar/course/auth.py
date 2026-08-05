from typing import Annotated

from fastapi import Depends

from polar.auth.dependencies import Authenticator
from polar.auth.models import AuthSubject, Organization, User
from polar.auth.scope import Scope

_CoursesRead = Authenticator(
    required_scopes={
        Scope.web_read,
        Scope.web_write,
        Scope.products_read,
        Scope.products_write,
    },
    allowed_subjects={User, Organization},
)
CoursesRead = Annotated[
    AuthSubject[User | Organization], Depends(_CoursesRead)
]

_CoursesWrite = Authenticator(
    required_scopes={
        Scope.web_write,
        Scope.products_write,
    },
    allowed_subjects={User, Organization},
)
CoursesWrite = Annotated[
    AuthSubject[User | Organization], Depends(_CoursesWrite)
]
