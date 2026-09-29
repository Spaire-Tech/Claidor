from typing import Annotated

from fastapi import Depends

from simeon.auth.dependencies import Authenticator
from simeon.auth.models import AuthSubject, User
from simeon.auth.scope import Scope

_UserWrite = Authenticator(
    required_scopes={
        Scope.web_write,
        Scope.user_write,
    },
    allowed_subjects={User},
)
UserWrite = Annotated[AuthSubject[User], Depends(_UserWrite)]
