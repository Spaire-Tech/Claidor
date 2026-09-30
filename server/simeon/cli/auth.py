from typing import Annotated

from fastapi import Depends

from simeon.auth.dependencies import Authenticator
from simeon.auth.models import AuthSubject, Organization, User
from simeon.auth.scope import Scope

_CLIRead = Authenticator(
    required_scopes={
        Scope.web_read,
        Scope.web_write,
        Scope.webhooks_read,
        Scope.webhooks_write,
    },
    allowed_subjects={User, Organization},
)
CLIRead = Annotated[AuthSubject[User | Organization], Depends(_CLIRead)]
