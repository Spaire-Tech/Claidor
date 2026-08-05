from typing import Annotated

from fastapi import Depends

from polar.auth.dependencies import Authenticator
from polar.auth.models import AuthSubject, User
from polar.auth.scope import Scope
from polar.models.organization import Organization

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
