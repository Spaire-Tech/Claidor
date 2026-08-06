from typing import Annotated

from fastapi import Depends

from polar.auth.dependencies import Authenticator
from polar.auth.models import AuthSubject, User
from polar.auth.scope import Scope

# Dossiers are personal-capacity work: a matter is assigned to lawyers, not
# to machine tokens, so only user subjects are allowed here.
DossierRead = Annotated[
    AuthSubject[User],
    Depends(
        Authenticator(
            required_scopes={Scope.web_read, Scope.web_write},
            allowed_subjects={User},
        )
    ),
]

DossierWrite = Annotated[
    AuthSubject[User],
    Depends(
        Authenticator(
            required_scopes={Scope.web_write},
            allowed_subjects={User},
        )
    ),
]
