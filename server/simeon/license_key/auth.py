from typing import Annotated

from fastapi import Depends

from simeon.auth.dependencies import Authenticator
from simeon.auth.models import AuthSubject, Organization, User
from simeon.auth.scope import Scope

LicenseKeysRead = Annotated[
    AuthSubject[User | Organization],
    Depends(
        Authenticator(
            required_scopes={
                Scope.web_read,
                Scope.web_write,
                Scope.license_keys_read,
                Scope.license_keys_write,
            },
            allowed_subjects={User, Organization},
        )
    ),
]

LicenseKeysWrite = Annotated[
    AuthSubject[User | Organization],
    Depends(
        Authenticator(
            required_scopes={
                Scope.web_write,
                Scope.license_keys_write,
            },
            allowed_subjects={User, Organization},
        )
    ),
]
