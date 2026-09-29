from typing import Annotated

from fastapi import Depends

from simeon.auth.dependencies import Authenticator
from simeon.auth.models import AuthSubject, User
from simeon.auth.scope import Scope
from simeon.models.organization import Organization

_EmailSubscribersRead = Authenticator(
    required_scopes={
        Scope.web_read,
        Scope.web_write,
        Scope.email_subscribers_read,
        Scope.email_subscribers_write,
    },
    allowed_subjects={User, Organization},
)
EmailSubscribersRead = Annotated[
    AuthSubject[User | Organization], Depends(_EmailSubscribersRead)
]

_EmailSubscribersWrite = Authenticator(
    required_scopes={
        Scope.web_write,
        Scope.email_subscribers_write,
    },
    allowed_subjects={User, Organization},
)
EmailSubscribersWrite = Annotated[
    AuthSubject[User | Organization], Depends(_EmailSubscribersWrite)
]
