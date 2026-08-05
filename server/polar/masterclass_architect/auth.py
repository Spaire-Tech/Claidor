from typing import Annotated

from fastapi import Depends

from polar.auth.dependencies import Authenticator
from polar.auth.models import AuthSubject, Organization, User
from polar.auth.scope import Scope

# Same posture as the course wizard (course/auth.py): the Architect is a
# creator-side product-creation surface, so it rides the products scopes.

_ArchitectRead = Authenticator(
    required_scopes={
        Scope.web_read,
        Scope.web_write,
        Scope.products_read,
        Scope.products_write,
    },
    allowed_subjects={User, Organization},
)
ArchitectRead = Annotated[AuthSubject[User | Organization], Depends(_ArchitectRead)]

_ArchitectWrite = Authenticator(
    required_scopes={
        Scope.web_write,
        Scope.products_write,
    },
    allowed_subjects={User, Organization},
)
ArchitectWrite = Annotated[AuthSubject[User | Organization], Depends(_ArchitectWrite)]
