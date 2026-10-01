from typing import Annotated

from fastapi import Depends

from simeon.auth.dependencies import Authenticator
from simeon.auth.models import AuthSubject, Organization, User
from simeon.auth.scope import Scope

_MetricsRead = Authenticator(
    required_scopes={Scope.web_read, Scope.web_write, Scope.metrics_read},
    allowed_subjects={User, Organization},
)
MetricsRead = Annotated[AuthSubject[User | Organization], Depends(_MetricsRead)]
