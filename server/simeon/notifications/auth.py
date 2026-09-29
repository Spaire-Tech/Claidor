from typing import Annotated

from fastapi import Depends

from simeon.auth.dependencies import Authenticator
from simeon.auth.models import AuthSubject, User
from simeon.auth.scope import Scope

_NotificationsRead = Authenticator(
    required_scopes={
        Scope.web_read,
        Scope.web_write,
        Scope.notifications_read,
    },
    allowed_subjects={User},
)
NotificationsRead = Annotated[AuthSubject[User], Depends(_NotificationsRead)]

_NotificationsWrite = Authenticator(
    required_scopes={
        Scope.web_write,
        Scope.notifications_write,
    },
    allowed_subjects={User},
)
NotificationsWrite = Annotated[AuthSubject[User], Depends(_NotificationsWrite)]
