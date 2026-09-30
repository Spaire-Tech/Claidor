from typing import Annotated

from fastapi import Depends

from simeon.auth.dependencies import Authenticator
from simeon.auth.models import AuthSubject, User
from simeon.auth.scope import Scope
from simeon.models.organization import Organization

_PaymentRead = Authenticator(
    required_scopes={
        Scope.web_read,
        Scope.web_write,
        Scope.payments_read,
    },
    allowed_subjects={User, Organization},
)
PaymentRead = Annotated[AuthSubject[User | Organization], Depends(_PaymentRead)]
