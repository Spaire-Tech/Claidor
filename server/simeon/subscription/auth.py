from typing import Annotated

from fastapi import Depends

from simeon.auth.dependencies import Authenticator
from simeon.auth.models import AuthSubject, Organization, User
from simeon.auth.scope import Scope

_SubscriptionsRead = Authenticator(
    required_scopes={
        Scope.web_read,
        Scope.web_write,
        Scope.subscriptions_read,
        Scope.subscriptions_write,
    },
    allowed_subjects={User, Organization},
)
SubscriptionsRead = Annotated[
    AuthSubject[User | Organization], Depends(_SubscriptionsRead)
]


_SubscriptionsWrite = Authenticator(
    required_scopes={
        Scope.web_write,
        Scope.subscriptions_write,
    },
    allowed_subjects={User, Organization},
)
SubscriptionsWrite = Annotated[
    AuthSubject[User | Organization], Depends(_SubscriptionsWrite)
]
