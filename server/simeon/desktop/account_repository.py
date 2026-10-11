"""The queries that delete what Simeon keeps for one person, when they
delete their account (`account_deletion.py`, 11 October 2026).

What stays, as the Privacy Policy says: the usage rows and the
subscription row (billing records), and the trial redemption (one free
week per card and per person). The user row itself is anonymised by the
inherited `soft_delete_user`, not deleted, so those rows keep a target.
"""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import delete, select

from simeon.models import (
    DesktopAuthCode,
    DesktopMemoryFile,
    DesktopSession,
    DesktopShareEvent,
    DesktopShareJoinRequest,
    DesktopShareRoom,
    DesktopShareRoomMember,
    DesktopVoiceCall,
    MatyJob,
    SandAutomation,
    SandBox,
    SandCloudAgent,
    SandListenerConnection,
    SandListenerEvent,
    SandListenerSubscription,
    SandPlugin,
    SandPluginUserSetting,
    UserSession,
)
from simeon.postgres import AsyncSession


class AccountDeletionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def boxes(self, user_id: UUID) -> Sequence[SandBox]:
        """Every cloud computer the person ever had, retired ones too: a
        retired row's volumes are named after it and may still be on its
        server."""
        result = await self.session.execute(
            select(SandBox).where(SandBox.user_id == user_id)
        )
        # A box row eager-loads its collections, so rows repeat until made unique.
        return result.unique().scalars().all()

    async def voice_conversation_ids(self, user_id: UUID) -> list[str]:
        result = await self.session.execute(
            select(DesktopVoiceCall.conversation_id).where(
                DesktopVoiceCall.user_id == user_id
            )
        )
        return [one for one in result.scalars().all() if one]

    async def personal_skill_archives(self, user_id: UUID) -> list[str]:
        """Where the person's own skills' archives are in file storage."""
        result = await self.session.execute(
            select(SandPlugin.tar_gz_key).where(
                SandPlugin.owner_user_id == user_id,
                SandPlugin.organization_id.is_(None),
            )
        )
        return [one for one in result.scalars().all() if one]

    async def delete_content(self, user_id: UUID) -> dict[str, int]:
        """Delete the person's rows, the sessions last (every device is
        signed out), and say how many went from each table."""
        statements = {
            "memory_files": delete(DesktopMemoryFile).where(
                DesktopMemoryFile.user_id == user_id
            ),
            "voice_calls": delete(DesktopVoiceCall).where(
                DesktopVoiceCall.user_id == user_id
            ),
            "routines": delete(SandAutomation).where(SandAutomation.user_id == user_id),
            "listener_events": delete(SandListenerEvent).where(
                SandListenerEvent.user_id == user_id
            ),
            "listener_subscriptions": delete(SandListenerSubscription).where(
                SandListenerSubscription.user_id == user_id
            ),
            "listener_connections": delete(SandListenerConnection).where(
                SandListenerConnection.user_id == user_id
            ),
            "share_events": delete(DesktopShareEvent).where(
                DesktopShareEvent.user_id == user_id
            ),
            "share_join_requests": delete(DesktopShareJoinRequest).where(
                DesktopShareJoinRequest.requester_user_id == user_id
            ),
            "share_memberships": delete(DesktopShareRoomMember).where(
                DesktopShareRoomMember.user_id == user_id
            ),
            "share_rooms": delete(DesktopShareRoom).where(
                DesktopShareRoom.host_user_id == user_id
            ),
            "cloud_agents": delete(SandCloudAgent).where(
                SandCloudAgent.user_id == user_id
            ),
            "skill_settings": delete(SandPluginUserSetting).where(
                SandPluginUserSetting.user_id == user_id
            ),
            "skills": delete(SandPlugin).where(
                SandPlugin.owner_user_id == user_id,
                SandPlugin.organization_id.is_(None),
            ),
            "boxes": delete(SandBox).where(SandBox.user_id == user_id),
            "auth_codes": delete(DesktopAuthCode).where(
                DesktopAuthCode.user_id == user_id
            ),
            "jobs": delete(MatyJob).where(MatyJob.user_id == user_id),
            "desktop_sessions": delete(DesktopSession).where(
                DesktopSession.user_id == user_id
            ),
            "web_sessions": delete(UserSession).where(UserSession.user_id == user_id),
        }
        counts: dict[str, int] = {}
        for name, statement in statements.items():
            result = await self.session.execute(statement)
            counts[name] = int(getattr(result, "rowcount", 0) or 0)
        return counts
