from typing import Annotated

from fastapi import Depends

from simeon.auth.dependencies import Authenticator
from simeon.auth.models import AuthSubject, User
from simeon.auth.scope import Scope
from simeon.models.organization import Organization

_EmailSequencesRead = Authenticator(
    required_scopes={
        Scope.web_read,
        Scope.web_write,
        Scope.email_subscribers_read,
        Scope.email_subscribers_write,
    },
    allowed_subjects={User, Organization},
)
EmailSequencesRead = Annotated[
    AuthSubject[User | Organization], Depends(_EmailSequencesRead)
]

_EmailSequencesWrite = Authenticator(
    required_scopes={
        Scope.web_write,
        Scope.email_subscribers_write,
    },
    allowed_subjects={User, Organization},
)
EmailSequencesWrite = Annotated[
    AuthSubject[User | Organization], Depends(_EmailSequencesWrite)
]
