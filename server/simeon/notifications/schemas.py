from pydantic import UUID4

from simeon.kit.schemas import Schema
from simeon.notifications.notification import Notification


class NotificationsList(Schema):
    notifications: list[Notification]
    last_read_notification_id: UUID4 | None


class NotificationsMarkRead(Schema):
    notification_id: UUID4
