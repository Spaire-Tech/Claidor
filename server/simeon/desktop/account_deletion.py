"""Deleting an account from the app (11 October 2026).

The founder: "build the delete account button". Apple asks every app
that makes accounts to let people delete theirs from inside it, and the
Privacy Policy (simeonlabs.com/privacy, "How long we keep it") promises
what goes. `DELETE /desktop/api/account`, from a signed-in app, does it
in this order:

1. The subscription ends now, at Stripe, so nothing is charged after.
2. The cloud computers go: each container and both of its volumes
   (`/workspace` and the data folder: the agents' chats, memory, files,
   the apps' credentials the computer held, the browser's sign-ins).
3. The apps signed in through our apps provider are disconnected there,
   and each voice call's transcript is deleted at the voice provider.
4. The rows: memory, call records, routines, listeners, sharing, cloud
   agents, the person's own skills (and their archives in file storage),
   the computers' rows, and every session, so every device is signed out.
5. The user is anonymised by the inherited `soft_delete_user` (email,
   picture, name gone; sign-in accounts and push devices deleted).

Steps 1 and 2 must succeed: if Stripe or a computer's server cannot be
reached, nothing else is done and the app says to try again (both steps
are safe to repeat). Step 3 is done as far as the providers allow; what
fails is logged (`desktop.account.delete_incomplete`) to finish by hand.
Kept, as the policy says: usage and subscription rows (billing records)
and the trial redemption (one free week per card and per person).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import structlog
from fastapi import Depends
from fastapi.responses import JSONResponse

from simeon.config import settings
from simeon.kit.utils import utc_now
from simeon.models import DesktopSession, User
from simeon.plans.service import plans as plans_service
from simeon.plans.stripe_billing import stripe_billing
from simeon.postgres import AsyncSession, get_db_session
from simeon.routing import APIRouter
from simeon.sand.box_hosts import BoxHostError, find_box_host
from simeon.sand.box_service import BoxBrokerService
from simeon.sand.skill_registry_service import delete_tarball
from simeon.user.service import user as user_service

from . import apps as apps_module
from . import voice as voice_module
from .account_repository import AccountDeletionRepository
from .auth import get_desktop_session
from .composio import composio_user_id, configured

log = structlog.get_logger()

router = APIRouter(include_in_schema=False)

#: Stripe's words for a subscription that will never charge again.
_ENDED = frozenset({"canceled", "incomplete_expired"})


class AccountDeletionBlocked(Exception):
    """A step that must succeed did not; nothing after it was done."""


@dataclass
class DeletionReport:
    subscription: str = "none"
    computers: int = 0
    apps_disconnected: int = 0
    transcripts_deleted: int = 0
    rows: dict[str, int] = field(default_factory=dict)
    incomplete: list[str] = field(default_factory=list)

    def as_json(self) -> dict[str, Any]:
        return {
            "deleted": True,
            "subscription": self.subscription,
            "computers": self.computers,
            "appsDisconnected": self.apps_disconnected,
            "transcriptsDeleted": self.transcripts_deleted,
            "incomplete": self.incomplete,
        }


async def _end_subscription(session: AsyncSession, user: User) -> str:
    row = await plans_service.subscription_of(session, user)
    if row is None or row.status in _ENDED:
        return "none"
    if not settings.STRIPE_SECRET_KEY:
        raise AccountDeletionBlocked("Billing can't be reached right now.")
    try:
        await stripe_billing.cancel_subscription(row.stripe_subscription_id)
    except Exception as error:
        log.warning(
            "desktop.account.delete_blocked",
            step="subscription",
            user_id=str(user.id),
            error=str(error),
        )
        raise AccountDeletionBlocked(
            "Your subscription couldn't be ended right now."
        ) from error
    row.status = "canceled"
    row.cancel_at_period_end = False
    row.canceled_at = utc_now()
    row.synced_at = utc_now()
    session.add(row)
    return "ended"


async def _remove_computers(repository: AccountDeletionRepository, user: User) -> int:
    removed = 0
    for box in await repository.boxes(user.id):
        try:
            host = await find_box_host(box.provider)
        except BoxHostError as error:
            raise AccountDeletionBlocked(
                "Your agents' computer couldn't be reached right now."
            ) from error
        if host is None:
            # The server it was made on is no longer configured: nothing of
            # it can be reached from here, so there is nothing left to remove.
            log.info(
                "desktop.account.box_host_gone", box=str(box.id), host=box.provider
            )
            continue
        try:
            await host.remove(
                box.provider_box_id, volumes=list(BoxBrokerService.volumes(box.id))
            )
        except BoxHostError as error:
            log.warning(
                "desktop.account.delete_blocked",
                step="computer",
                user_id=str(user.id),
                box=str(box.id),
                error=str(error),
            )
            raise AccountDeletionBlocked(
                "Your agents' computer couldn't be deleted right now."
            ) from error
        removed += 1
    return removed


async def _disconnect_apps(user: User, report: DeletionReport) -> None:
    if not configured():
        return
    try:
        status, payload = await apps_module._call(
            "GET",
            "api/v3.1/connected_accounts",
            params={"user_ids": [composio_user_id(user)], "limit": 100},
        )
        if status >= 400 or not isinstance(payload, dict):
            raise apps_module.AppsUpstreamError(
                apps_module._upstream_message(payload), status
            )
        ids = [
            str(item["id"])
            for item in payload.get("items") or []
            if isinstance(item, dict) and item.get("id")
        ]
        for account in ids:
            deleted, _ = await apps_module._call(
                "DELETE", f"api/v3.1/connected_accounts/{account}"
            )
            if deleted < 400 or deleted == 404:
                report.apps_disconnected += 1
            else:
                report.incomplete.append(f"app sign-in {account}")
    except Exception as error:
        report.incomplete.append(f"app sign-ins ({error})")
    apps_module.forget_user(user)


async def _delete_transcripts(
    repository: AccountDeletionRepository, user: User, report: DeletionReport
) -> None:
    conversations = await repository.voice_conversation_ids(user.id)
    if not conversations:
        return
    try:
        api = voice_module.client()
    except Exception as error:
        report.incomplete.append(f"call transcripts ({error})")
        return
    for conversation in conversations:
        try:
            await api.delete_conversation(conversation)
            report.transcripts_deleted += 1
        except voice_module.ElevenLabsError as error:
            if error.status == 404:
                report.transcripts_deleted += 1
            else:
                report.incomplete.append(f"call transcript {conversation}")


async def delete_account(session: AsyncSession, user: User) -> DeletionReport:
    repository = AccountDeletionRepository(session)
    report = DeletionReport()
    report.subscription = await _end_subscription(session, user)
    report.computers = await _remove_computers(repository, user)
    await _disconnect_apps(user, report)
    await _delete_transcripts(repository, user, report)
    for key in await repository.personal_skill_archives(user.id):
        if not delete_tarball(key):
            report.incomplete.append(f"skill archive {key}")
    report.rows = await repository.delete_content(user.id)
    await user_service.soft_delete_user(session, user)
    if report.incomplete:
        log.warning(
            "desktop.account.delete_incomplete",
            user_id=str(user.id),
            incomplete=report.incomplete,
        )
    log.info(
        "desktop.account.deleted",
        user_id=str(user.id),
        subscription=report.subscription,
        computers=report.computers,
        apps=report.apps_disconnected,
        transcripts=report.transcripts_deleted,
        rows=report.rows,
    )
    return report


@router.delete("/api/account", name="desktop:delete_account")
async def delete_account_route(
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Delete the signed-in person's account and what Simeon keeps for
    them. 200 with what was done; 503 when a step that must succeed could
    not, with the sentence to show (nothing after that step was done)."""
    user = desktop_session.user
    try:
        report = await delete_account(session, user)
    except AccountDeletionBlocked as blocked:
        return JSONResponse(
            {
                "error": {
                    "type": "account_deletion_blocked",
                    "message": f"{blocked} Try again in a few minutes.",
                }
            },
            status_code=503,
        )
    return JSONResponse(report.as_json())
