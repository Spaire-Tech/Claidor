"""Masterclass Architect — service layer.

create() owns the synchronous beat of the experience: resolve the pasted
link inside the request so the instant confirmation ("Test Golf, 214 videos
since 2019") returns in a couple of seconds, then hand everything slower to
the background actors. Unresolvable pastes still produce a (failed) row —
failures are funnel data, and the wizard needs a typed reason to land the
fork warmly.
"""

from uuid import UUID

import structlog

from polar.auth.models import AuthSubject, Organization, User
from polar.config import settings
from polar.exceptions import PolarError
from polar.kit.utils import utc_now
from polar.models import MasterclassArchitectAnalysis
from polar.postgres import AsyncSession
from polar.worker import enqueue_job

from .architect_ai import AnalysisFailure
from .orchestration import (
    REUSE_WINDOW,
    STATUS_FAILED,
    STATUS_QUEUED,
    TERMINAL_STATUSES,
    can_reuse,
    map_youtube_failure,
)
from .repository import MasterclassArchitectAnalysisRepository
from .youtube import ChannelNotFound, YouTubeAPIError, YouTubeReader

log: "structlog.stdlib.BoundLogger" = structlog.get_logger()


class ArchitectNotConfigured(PolarError):
    def __init__(self) -> None:
        super().__init__(
            "Masterclass Architect is not configured on this instance.", 503
        )


class MasterclassArchitectService:
    async def create(
        self,
        session: AsyncSession,
        auth_subject: AuthSubject[User | Organization],
        *,
        organization_id: UUID,
        ref: str,
        faq_answer: str | None = None,
    ) -> MasterclassArchitectAnalysis:
        if not settings.YOUTUBE_API_KEY or not settings.ANTHROPIC_API_KEY:
            raise ArchitectNotConfigured()

        repository = MasterclassArchitectAnalysisRepository.from_session(session)

        # Synchronous resolve — the instant-confirmation promise. Failures
        # become failed rows with typed reasons, not exceptions: the wizard
        # lands them in the fork, and the funnel sees them.
        failure: AnalysisFailure | None = None
        channel_payload: dict | None = None
        external_channel_id: str | None = None
        try:
            async with YouTubeReader() as reader:
                info = await reader.resolve_channel(ref)
            external_channel_id = info.channel_id
            channel_payload = {
                "title": info.title,
                "handle": info.handle,
                "about": info.about,
                "avatar_url": info.avatar_url,
                "created_at": info.created_at,
                "subscriber_count": info.subscriber_count,
                "video_count": info.video_count,
                "uploads_playlist_id": info.uploads_playlist_id,
            }
        except ChannelNotFound:
            is_link = ref.strip().startswith(("http://", "https://"))
            is_youtubeish = "youtu" in ref or not is_link
            failure = (
                AnalysisFailure.CHANNEL_NOT_FOUND
                if is_youtubeish
                else AnalysisFailure.NOT_YOUTUBE
            )
        except YouTubeAPIError as e:
            failure = map_youtube_failure(e)

        if failure is None and external_channel_id is not None:
            existing = await repository.get_latest_for_channel(
                organization_id,
                external_channel_id,
                since=utc_now() - REUSE_WINDOW,
            )
            if existing is not None and can_reuse(
                existing_status=existing.status,
                existing_created_at=existing.created_at,
                now=utc_now(),
            ):
                log.info(
                    "masterclass_architect.reused",
                    analysis_id=str(existing.id),
                    organization_id=str(organization_id),
                )
                return existing

        analysis = MasterclassArchitectAnalysis(
            organization_id=organization_id,
            input_ref=ref[:500],
            status=STATUS_FAILED if failure else STATUS_QUEUED,
            failure_reason=failure.value if failure else None,
            external_channel_id=external_channel_id,
            channel=channel_payload,
            faq_answer=faq_answer,
            completed_at=utc_now() if failure else None,
        )
        await repository.create(analysis, flush=True)

        log.info(
            "masterclass_architect.created",
            analysis_id=str(analysis.id),
            organization_id=str(organization_id),
            status=analysis.status,
            failure_reason=analysis.failure_reason,
        )
        if failure is None:
            enqueue_job("masterclass_architect.fast_pass", analysis_id=analysis.id)
        return analysis

    async def set_faq_answer(
        self,
        session: AsyncSession,
        analysis: MasterclassArchitectAnalysis,
        *,
        faq_answer: str,
    ) -> MasterclassArchitectAnalysis:
        """Store the answer whenever it arrives. If the deep pass hasn't
        built its evidence yet it will pick this up (it re-reads the row);
        if it has, the stored answer is harmless context for reruns."""
        repository = MasterclassArchitectAnalysisRepository.from_session(session)
        updated = await repository.update(
            analysis, update_dict={"faq_answer": faq_answer[:2000]}
        )
        if analysis.status in TERMINAL_STATUSES:
            log.info(
                "masterclass_architect.faq_after_terminal",
                analysis_id=str(analysis.id),
                status=analysis.status,
            )
        return updated


masterclass_architect_service = MasterclassArchitectService()
