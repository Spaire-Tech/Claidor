from typing import Annotated

from fastapi import Depends

from simeon.auth.dependencies import Authenticator
from simeon.auth.models import AuthSubject, User
from simeon.auth.scope import Scope

_NotificationRecipientRead = Authenticator(
    required_scopes={
        Scope.web_read,
        Scope.web_write,
        Scope.notification_recipients_read,
        Scope.notification_recipients_write,
    },
    allowed_subjects={User},
)
NotificationRecipientRead = Annotated[
    AuthSubject[User], Depends(_NotificationRecipientRead)
]

_NotificationRecipientWrite = Authenticator(
    required_scopes={
        Scope.web_write,
        Scope.notification_recipients_write,
    },
    allowed_subjects={User},
)
NotificationRecipientWrite = Annotated[
    AuthSubject[User], Depends(_NotificationRecipientWrite)
]
