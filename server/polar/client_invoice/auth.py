from typing import Annotated

from fastapi import Depends

from polar.auth.dependencies import Authenticator
from polar.auth.models import AuthSubject, Organization, User
from polar.auth.scope import Scope

_ClientInvoicesRead = Authenticator(
    required_scopes={
        Scope.web_read,
        Scope.web_write,
        Scope.client_invoices_read,
    },
    allowed_subjects={User, Organization},
)
ClientInvoicesRead = Annotated[
    AuthSubject[User | Organization], Depends(_ClientInvoicesRead)
]

_ClientInvoicesWrite = Authenticator(
    required_scopes={
        Scope.web_write,
        Scope.client_invoices_write,
    },
    allowed_subjects={User, Organization},
)
ClientInvoicesWrite = Annotated[
    AuthSubject[User | Organization], Depends(_ClientInvoicesWrite)
]
