from typing import Annotated

from fastapi import Depends

from simeon.auth.dependencies import Authenticator
from simeon.auth.models import AuthSubject, User
from simeon.auth.scope import Scope
from simeon.models.organization import Organization

_FormsRead = Authenticator(
    required_scopes={
        Scope.web_read,
        Scope.web_write,
        Scope.forms_read,
        Scope.forms_write,
    },
    allowed_subjects={User, Organization},
)
FormsRead = Annotated[AuthSubject[User | Organization], Depends(_FormsRead)]

_FormsWrite = Authenticator(
    required_scopes={
        Scope.web_write,
        Scope.forms_write,
    },
    allowed_subjects={User, Organization},
)
FormsWrite = Annotated[AuthSubject[User | Organization], Depends(_FormsWrite)]
