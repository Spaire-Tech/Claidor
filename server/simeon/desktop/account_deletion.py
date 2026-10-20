"""Deleting an account from the app (11 October 2026).

The founder: "build the delete account button". Apple asks every app
that makes accounts to let people delete theirs from inside it, and the
Privacy Policy (simeonlabs.com/privacy, "How long we keep it") promises
what goes. `DELETE /desktop/api/account`, from a signed-in app, does it
in this order:

1. The subscription ends now, at Stripe, so nothing is charged after.
2. The cloud computers go: each container and both of its volumes
   (`/workspace` and the data folder: the agents' chats, memory, files,
   the apps' credentials the computer held, the browser's sign-ins), and
   their backups in the backup bucket (`simeon/sand/box_store.py`).
3. The apps signed in through our apps provider are disconnected there,
   Link's grant is revoked at Link (`link_wallet.disconnect`), each voice call's transcript is deleted at the voice provider, and a
   Sign in with Apple is revoked at Apple (Apple asks this of every app
   that offers it, 12 October 2026).
4. The rows: memory, call records, routines, listeners, sharing, cloud
   agents, the person's own skills (and their archives in file storage),
   the computers' rows, and every session, so every device is signed out.
5. The user is anonymised by the inherited `soft_delete_user` (email,
   picture, name gone; sign-in accounts and push devices deleted).

First the person's computer is held (the lock `EnsureSandBox` takes), so
the app's reconnect, which follows the container's removal within
seconds, cannot rebuild it while the delete runs (`_hold_the_computer`).

Steps 1 and 2 must succeed: if Stripe or a computer's server cannot be
reached, nothing else is done and the app says to try again (both steps
are safe to repeat). A plan bought in the iPhone app is Apple's: only the
person can cancel it, in their iPhone's Settings, so the answer says it is
still running (`appleSubscription`) and the app tells them where. Step 3 is done as far as the providers allow; what
fails is logged (`desktop.account.delete_incomplete`) to finish by hand.
Kept, as the policy says: usage and subscription rows (billing records),
the trial redemption and the free month (one trial per card and per
person; the free month keeps only a hash of the e-mail).
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

import structlog
from fastapi import Depends
from fastapi.responses import JSONResponse

from simeon.config import settings
from simeon.integrations.apple import native as apple_native
from simeon.kit.utils import utc_now
from simeon.models import DesktopSession, User
from simeon.plans.effective import billed_by_apple, plan_of
from simeon.plans.service import plans as plans_service
from simeon.plans.stripe_billing import stripe_billing
from simeon.postgres import AsyncSession, get_db_session
from simeon.routing import APIRouter
from simeon.sand import box_store
from simeon.sand.box_hosts import BoxHostError, find_box_host
from simeon.sand.box_service import BoxBrokerService, BoxEnsureInProgress
from simeon.sand.skill_registry_service import delete_tarball
from simeon.user.service import user as user_service

from . import apps as apps_module
from . import link_wallet
from . import voice as voice_module
from .account_repository import AccountDeletionRepository
from .auth import get_desktop_session
from .composio import composio_user_id, configured
from .words import say

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
    #: Objects removed from the backup bucket (`box_store.delete_user`).
    backups_deleted: int = 0
    apps_disconnected: int = 0
    transcripts_deleted: int = 0
    #: A plan Apple bills is still live: the person cancels it with Apple.
    apple_subscription: bool = False
    rows: dict[str, int] = field(default_factory=dict)
    incomplete: list[str] = field(default_factory=list)

    def as_json(self) -> dict[str, Any]:
        return {
            "deleted": True,
            "subscription": self.subscription,
            "computers": self.computers,
            "appsDisconnected": self.apps_disconnected,
            "transcriptsDeleted": self.transcripts_deleted,
            "appleSubscription": self.apple_subscription,
            "incomplete": self.incomplete,
        }


async def _end_subscription(session: AsyncSession, user: User) -> str:
    row = await plans_service.subscription_of(session, user)
    if row is None or row.status in _ENDED:
        return "none"
    if not settings.STRIPE_SECRET_KEY:
        raise AccountDeletionBlocked(say("account.delete.billing_unreachable"))
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
            say("account.delete.subscription_not_ended")
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
                say("account.delete.computer_unreachable")
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
                say("account.delete.computer_not_deleted")
            ) from error
        removed += 1
    return removed


async def _delete_backups(user: User, report: DeletionReport) -> None:
    """The computers' backups (`box_store.py`): every object under the
    person's prefix in the backup bucket."""
    if not box_store.enabled():
        return
    try:
        report.backups_deleted = await asyncio.to_thread(box_store.delete_user, user.id)
    except Exception as error:
        report.incomplete.append(f"computer backups ({error})")


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


async def _disconnect_link(
    session: AsyncSession, user: User, report: DeletionReport
) -> None:
    """Link's grant revoked at Link and the person's tokens forgotten
    (`link_wallet.disconnect`)."""
    try:
        result = await link_wallet.disconnect(session, user.id)
    except Exception as error:
        report.incomplete.append(f"Link ({error})")
        return
    if result["disconnected"] and not result["revoked"]:
        report.incomplete.append("Link (not revoked at Link)")


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


async def _revoke_apple(
    repository: AccountDeletionRepository, user: User, report: DeletionReport
) -> None:
    for account in await repository.apple_sign_ins(user.id):
        try:
            if not await apple_native.revoke(account):
                report.incomplete.append("Sign in with Apple")
        except Exception as error:
            report.incomplete.append(f"Sign in with Apple ({error})")


#: How long the delete waits for a computer being started to finish
#: (`EnsureSandBox` holds the same lock while it waits for the box).
ENSURE_LOCK_WAIT = timedelta(seconds=30)
ENSURE_LOCK_POLL = 1.0


async def _hold_the_computer(session: AsyncSession, user: User) -> None:
    """Take the person's ensure lock for the rest of the delete (14 October
    2026). Removing the container drops the app's connection, and the app
    asks for its computer again within seconds: without the lock that ask
    rebuilt the container the delete had just removed, held locks on the
    person's sessions, and stalled the delete past the app's patience, so
    the app said it failed and the account was deleted anyway. With it, the
    ask is told the computer is still starting and tries again; by then the
    sessions are gone and it is signed out."""
    deadline = utc_now() + ENSURE_LOCK_WAIT
    while True:
        try:
            await BoxBrokerService._take_ensure_lock(session, user.id)
            return
        except BoxEnsureInProgress:
            if utc_now() >= deadline:
                log.warning(
                    "desktop.account.delete_blocked",
                    step="computer_starting",
                    user_id=str(user.id),
                )
                raise AccountDeletionBlocked(
                    say("account.delete.computer_starting")
                ) from None
            await asyncio.sleep(ENSURE_LOCK_POLL)


async def delete_account(session: AsyncSession, user: User) -> DeletionReport:
    repository = AccountDeletionRepository(session)
    report = DeletionReport()
    await _hold_the_computer(session, user)
    report.subscription = await _end_subscription(session, user)
    report.apple_subscription = billed_by_apple(await plan_of(session, user.id))
    report.computers = await _remove_computers(repository, user)
    await _delete_backups(user, report)
    await _disconnect_apps(user, report)
    await _disconnect_link(session, user, report)
    await _delete_transcripts(repository, user, report)
    await _revoke_apple(repository, user, report)
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
        backups=report.backups_deleted,
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
                    "message": say("account.delete.try_again", why=blocked),
                }
            },
            status_code=503,
        )
    return JSONResponse(report.as_json())
