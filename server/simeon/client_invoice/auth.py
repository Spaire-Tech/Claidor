from typing import Annotated

from fastapi import Depends

from simeon.auth.dependencies import Authenticator
from simeon.auth.models import AuthSubject, Organization, User
from simeon.auth.scope import Scope

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
