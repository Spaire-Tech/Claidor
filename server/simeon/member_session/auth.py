from typing import Annotated

from fastapi import Depends

from simeon.auth.dependencies import Authenticator
from simeon.auth.models import AuthSubject, User
from simeon.auth.scope import Scope
from simeon.models.organization import Organization

_MemberSessionWrite = Authenticator(
    required_scopes={
        Scope.web_write,
        Scope.member_sessions_write,
    },
    allowed_subjects={User, Organization},
)
MemberSessionWrite = Annotated[
    AuthSubject[User | Organization], Depends(_MemberSessionWrite)
]
