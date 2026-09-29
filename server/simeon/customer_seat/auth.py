from typing import Annotated

from fastapi import Depends

from simeon.auth.dependencies import Authenticator
from simeon.auth.models import Anonymous, AuthSubject, Organization, User
from simeon.auth.scope import Scope

_SeatRead = Authenticator(
    required_scopes={
        Scope.web_read,
        Scope.web_write,
        Scope.customer_seats_read,
    },
    allowed_subjects={User, Organization},
)
SeatRead = Annotated[AuthSubject[User | Organization], Depends(_SeatRead)]

_SeatWrite = Authenticator(
    required_scopes={
        Scope.web_write,
        Scope.customer_seats_write,
    },
    allowed_subjects={User, Organization},
)
SeatWrite = Annotated[AuthSubject[User | Organization], Depends(_SeatWrite)]

_SeatWriteOrAnonymous = Authenticator(
    required_scopes={
        Scope.web_write,
        Scope.customer_seats_write,
    },
    allowed_subjects={User, Organization, Anonymous},
)
SeatWriteOrAnonymous = Annotated[
    AuthSubject[User | Organization | Anonymous], Depends(_SeatWriteOrAnonymous)
]
