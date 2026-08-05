from typing import Annotated

from fastapi import Depends

from polar.auth.dependencies import Authenticator
from polar.auth.models import AuthSubject, User
from polar.auth.scope import Scope
from polar.models.organization import Organization

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
