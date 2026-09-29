from typing import Annotated

from fastapi import Depends

from simeon.auth.dependencies import Authenticator
from simeon.auth.models import AuthSubject, User
from simeon.auth.scope import Scope

_SearchRead = Authenticator(
    required_scopes={
        Scope.web_read,
        Scope.web_write,
        Scope.products_read,
        Scope.products_write,
        Scope.customers_read,
        Scope.customers_write,
        Scope.orders_read,
        Scope.subscriptions_read,
        Scope.subscriptions_write,
    },
    allowed_subjects={User},
)
SearchRead = Annotated[AuthSubject[User], Depends(_SearchRead)]
