"""Who may check a document.

The first version of this file listed only ``web_read`` and ``web_write``,
which was wrong in a way that took until the add-in tried to sign in to
notice.

Those two scopes are in :data:`polar.auth.scope.RESERVED_SCOPES`. They are
granted in exactly one place — ``auth.service.create_user_session`` — and
that sets a **cookie**. No personal access token can hold them and no
OAuth2 token can request them. So a route that requires only those two is
reachable only from a browser carrying a session cookie.

The Word add-in is not a browser. It runs in an iframe on its own origin,
so a ``SameSite=Lax`` cookie is never sent with its requests, and Safari
and Edge block third-party cookies outright. That is written down in
``docs/vesence-clone/decisions.md`` as the reason the add-in uses bearer
tokens — and then the routes it calls were built to refuse them.

Hence ``redline:read`` and ``redline:write``, following the convention
every other module here already uses: the dashboard's own scopes *plus* a
pair a token can carry.

``write`` covers the routes that hand back a changed document. Nothing is
stored either way — the text is read, checked and dropped — but a caller
that can only read should not be able to ask for a rewritten agreement,
and the distinction is free to make now and expensive to introduce later.
"""

from typing import Annotated

from fastapi import Depends

from polar.auth.dependencies import Authenticator
from polar.auth.models import AuthSubject, User
from polar.auth.scope import Scope

_RedlineRead = Authenticator(
    required_scopes={
        Scope.web_read,
        Scope.web_write,
        Scope.redline_read,
        Scope.redline_write,
    },
    allowed_subjects={User},
)
RedlineRead = Annotated[AuthSubject[User], Depends(_RedlineRead)]

_RedlineWrite = Authenticator(
    required_scopes={
        Scope.web_write,
        Scope.redline_write,
    },
    allowed_subjects={User},
)
RedlineWrite = Annotated[AuthSubject[User], Depends(_RedlineWrite)]
