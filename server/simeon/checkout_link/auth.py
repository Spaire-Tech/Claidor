from typing import Annotated

from fastapi import Depends

from simeon.auth.dependencies import Authenticator
from simeon.auth.models import AuthSubject, User
from simeon.auth.scope import Scope
from simeon.models.organization import Organization

_CheckoutLinkRead = Authenticator(
    required_scopes={
        Scope.web_read,
        Scope.web_write,
        Scope.checkout_links_read,
        Scope.checkout_links_write,
    },
    allowed_subjects={User, Organization},
)
CheckoutLinkRead = Annotated[
    AuthSubject[User | Organization], Depends(_CheckoutLinkRead)
]

_CheckoutLinkWrite = Authenticator(
    required_scopes={
        Scope.web_write,
        Scope.checkout_links_write,
    },
    allowed_subjects={User, Organization},
)
CheckoutLinkWrite = Annotated[
    AuthSubject[User | Organization], Depends(_CheckoutLinkWrite)
]
