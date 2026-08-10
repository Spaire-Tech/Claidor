"""Who may read a deal's figures and who may change what they mean.

The same reasoning as ``redline/auth.py``, which is written out in full
there: ``web:read`` and ``web:write`` are reserved to the dashboard's
cookie session, so a route that requires only those two is reachable only
from a browser. The panel is not a browser — it is an iframe inside
PowerPoint on its own origin — so it carries a bearer token and needs a
pair of scopes a token is allowed to hold.

The read/write split is not decoration here. Reading tells you what the
tool checked; writing *confirms a link*, and a confirmation is the fact
every later check rests on. Once a banker says « slide 2 means Model!D26 »
the engine stops guessing forever, which is why confirming has to be as
deliberate as uploading a new model.

Membership is checked separately, on every route, in the endpoints. A
scope says what kind of caller this is; it never says which deals they are
on.
"""

from typing import Annotated

from fastapi import Depends

from polar.auth.dependencies import Authenticator
from polar.auth.models import AuthSubject, User
from polar.auth.scope import Scope

_TieOutRead = Authenticator(
    required_scopes={
        Scope.web_read,
        Scope.web_write,
        Scope.tieout_read,
        Scope.tieout_write,
    },
    allowed_subjects={User},
)
TieOutRead = Annotated[AuthSubject[User], Depends(_TieOutRead)]

_TieOutWrite = Authenticator(
    required_scopes={
        Scope.web_write,
        Scope.tieout_write,
    },
    allowed_subjects={User},
)
TieOutWrite = Annotated[AuthSubject[User], Depends(_TieOutWrite)]
