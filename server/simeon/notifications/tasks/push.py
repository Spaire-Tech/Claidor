import re
from collections.abc import Sequence
from typing import Any, TypedDict
from uuid import UUID

import structlog
from exponent_server_sdk import (
    DeviceNotRegisteredError,
    PushClient,
    PushMessage,
    PushServerError,
    PushTicket,
)

from simeon.config import settings
from simeon.notification_recipient.service import (
    notification_recipient as notification_recipient_service,
)
from simeon.notifications.service import notifications
from simeon.worker import AsyncSessionMaker, TaskPriority, actor

log = structlog.get_logger()


class PushMessageExtra(TypedDict, total=False):
    notification_id: str


#: What Expo hands a phone (`getExpoPushTokenAsync`): `ExponentPushToken[…]`,
#: or the newer spelling `ExpoPushToken[…]`, which Expo's own server
#: libraries accept too.
EXPO_PUSH_TOKEN = re.compile(
    r"^(?:ExponentPushToken|ExpoPushToken)\[[^\[\]\s]{1,200}\]$"
)

#: A request to Expo that has not answered in this long is given up on; with
#: no timeout at all `requests` would hold the worker forever.
PUSH_TIMEOUT_SECONDS = 15


def is_expo_push_token(token: str) -> bool:
    return EXPO_PUSH_TOKEN.match(token) is not None


class ExpoPushMessage(PushMessage):
    """`PushMessage` for either spelling of the token. The SDK's own check
    (`PushClient.is_exponent_push_token`) knows only `ExponentPushToken`
    and raises `ValueError` for `ExpoPushToken[…]`, so the payload is built
    for a stand-in token and the real one put back."""

    def get_payload(self) -> dict[str, Any]:
        if not is_expo_push_token(self.to):
            raise ValueError("Invalid push token")
        payload: dict[str, Any] = PushMessage.get_payload(
            self._replace(to="ExponentPushToken[x]")
        )
        payload["to"] = self.to
        return payload


def _create_push_client() -> PushClient:
    """Expo's client, with Simeon's access token when the project asks for
    one (`EXPO_ACCESS_TOKEN`, Enhanced Security for Push Notifications)."""
    client = PushClient(timeout=PUSH_TIMEOUT_SECONDS)
    if settings.EXPO_ACCESS_TOKEN:
        client.session.headers["Authorization"] = f"Bearer {settings.EXPO_ACCESS_TOKEN}"
    return client


_push_client = _create_push_client()


def publish_push_messages(messages: Sequence[PushMessage]) -> list[PushTicket]:
    """Several messages in one request to Expo, one ticket back for each,
    in the same order. Blocking (`requests`): an async caller runs it in a
    thread. A ticket's own error (`DeviceNotRegisteredError` and the rest)
    is the caller's to read with `ticket.validate_response()`."""
    try:
        return list(_push_client.publish_multiple(list(messages)))
    except PushServerError as exc:
        log.error("notifications.push.server_error", error=str(exc))
        raise


def send_push_message(
    token: str, message: str, extra: PushMessageExtra | None = None
) -> None:
    """Send a push message to a specific device token."""
    try:
        response = _push_client.publish(
            PushMessage(
                to=token,
                body=message,
                data=extra,
                title="Simeon",
                sound="default",
                ttl=60 * 60 * 24,
                expiration=None,
                priority="high",
                badge=1,
                category="default",
                display_in_foreground=True,
                channel_id="default",
                subtitle="",
                mutable_content=False,
            )
        )
    except PushServerError as exc:
        log.error("notifications.push.server_error", error=str(exc))
        raise
    except DeviceNotRegisteredError:
        log.warning("notifications.push.device_not_registered", token=token)
        raise
    except Exception as exc:
        log.error("notifications.push.unknown_error", error=str(exc))
        raise

    try:
        response.validate_response()
    except Exception as exc:
        log.error("notifications.push.validation_error", error=str(exc))
        raise


@actor(actor_name="notifications.push", priority=TaskPriority.LOW)
async def notifications_push(notification_id: UUID) -> None:
    async with AsyncSessionMaker() as session:
        notif = await notifications.get(session, notification_id)
        if not notif:
            log.warning("notifications.push.not_found")
            return

        notification_recipients = await notification_recipient_service.list_by_user(
            session=session,
            user_id=notif.user_id,
            expo_push_token=None,
            platform=None,
        )

        if not notification_recipients:
            log.warning("notifications.push.devices_not_found", user_id=notif.user_id)
            return

        for notification_recipient in notification_recipients:
            if not notification_recipient.expo_push_token:
                log.warning(
                    "notifications.push.no_push_token",
                    user_id=notification_recipient.user_id,
                )
                continue

            notification_type = notifications.parse_payload(notif)
            [subject, _] = notification_type.render()

            try:
                send_push_message(
                    token=notification_recipient.expo_push_token,
                    message=subject,
                    extra={"notification_id": str(notification_id)},
                )
            except Exception as e:
                log.error(
                    "notifications.push.send_failed",
                    error=str(e),
                    user_id=notification_recipient.user_id,
                    notification_id=notification_id,
                )
                return
