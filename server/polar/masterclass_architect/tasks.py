"""Masterclass Architect — background actors.

Two actors, not one, on purpose: the worker session commits at the END of a
task, and the mirror must be visible to the polling wizard the moment the
fast pass finishes. So:

  POST /analyses  ──▶  masterclass_architect.fast_pass(analysis_id)
                           │  videos → outliers → floor check → mirror
                           │  (status: queued → mirror_ready, commits)
                           ▼
                       masterclass_architect.deep_pass(analysis_id)
                           │  re-fetch stats → comments → evidence pack
                           │  (re-reads faq_answer from the row) → brain
                           ▼
                       status: completed (proposals stored) | failed

Design rules enforced here:
* Floor check BEFORE the mirror — a too-small channel gets a typed failure
  for the fork, never confident noise.
* Every failure is caught and written to the row as a typed reason; actors
  never raise, so dramatiq never retry-storms a doomed analysis.
* Status guards make both actors idempotent under message re-delivery.
* Raw video/comment data lives only in task memory — the row stores derived
  conclusions (mirror, proposals). The deep pass re-fetches stats instead
  of persisting them between tasks; that costs a few quota units and keeps
  the storage stance clean.
"""

from typing import Any
from uuid import UUID

import structlog

from polar.config import settings
from polar.exceptions import PolarTaskError
from polar.kit.utils import utc_now
from polar.models import MasterclassArchitectAnalysis
from polar.worker import AsyncSessionMaker, TaskPriority, actor, enqueue_job

from . import architect_ai, signals
from .architect_ai import AnalysisFailure
from .orchestration import (
    DEEP_PASS_REQUIRES,
    FAST_PASS_REQUIRES,
    STATUS_COMPLETED,
    STATUS_FAILED,
    STATUS_MIRROR_READY,
    map_youtube_failure,
)
from .repository import MasterclassArchitectAnalysisRepository
from .youtube import (
    ChannelNotFound,
    CommentThreadResult,
    YouTubeAPIError,
    YouTubeNotConfigured,
    YouTubeReader,
)

log: "structlog.stdlib.BoundLogger" = structlog.get_logger()


class MasterclassArchitectTaskError(PolarTaskError): ...


async def _fail(
    repository: MasterclassArchitectAnalysisRepository,
    analysis: MasterclassArchitectAnalysis,
    reason: AnalysisFailure,
) -> None:
    await repository.update(
        analysis,
        update_dict={
            "status": STATUS_FAILED,
            "failure_reason": reason.value,
            "completed_at": utc_now(),
        },
    )
    log.info(
        "masterclass_architect.failed",
        analysis_id=str(analysis.id),
        failure_reason=reason.value,
    )


async def _fetch_rated_videos(
    reader: YouTubeReader, uploads_playlist_id: str
) -> list[signals.VideoSignal]:
    video_ids = await reader.list_upload_ids(uploads_playlist_id)
    videos = await reader.fetch_videos(video_ids)
    signals.compute_outlier_ratios(videos)
    return videos


@actor(actor_name="masterclass_architect.fast_pass", priority=TaskPriority.HIGH)
async def fast_pass(analysis_id: UUID) -> None:
    async with AsyncSessionMaker() as session:
        repository = MasterclassArchitectAnalysisRepository.from_session(session)
        analysis = await repository.get_by_id(analysis_id)
        if analysis is None:
            log.warning(
                "masterclass_architect.fast_pass.missing",
                analysis_id=str(analysis_id),
            )
            return
        if analysis.status != FAST_PASS_REQUIRES:
            return  # re-delivered message; already progressed or failed
        channel = analysis.channel or {}
        uploads = channel.get("uploads_playlist_id")
        if not uploads:
            await _fail(repository, analysis, AnalysisFailure.CHANNEL_NOT_FOUND)
            return

        try:
            async with YouTubeReader() as reader:
                videos = await _fetch_rated_videos(reader, uploads)
        except YouTubeNotConfigured:
            await _fail(repository, analysis, AnalysisFailure.UPSTREAM_UNAVAILABLE)
            return
        except ChannelNotFound:
            await _fail(repository, analysis, AnalysisFailure.CHANNEL_NOT_FOUND)
            return
        except YouTubeAPIError as e:
            await _fail(repository, analysis, map_youtube_failure(e))
            return

        rated = [v for v in videos if v.outlier_ratio is not None]
        floor_failure = architect_ai.channel_floor_failure(len(rated))
        if floor_failure is not None:
            await _fail(repository, analysis, floor_failure)
            return

        # Mirror is pure stats — demand quotes join in the deep pass, so the
        # fast mirror ships counts/ratios only, exactly like the wizard's
        # 20-second beat.
        pack = architect_ai.build_evidence_pack(
            channel=channel, videos=videos, demands={}, owner_replies=[]
        )
        mirror = architect_ai.build_mirror(pack)
        await repository.update(
            analysis,
            update_dict={
                "mirror": mirror,
                "status": STATUS_MIRROR_READY,
                "mirror_ready_at": utc_now(),
            },
        )
        log.info(
            "masterclass_architect.mirror_ready",
            analysis_id=str(analysis.id),
            rated_longform=len(rated),
        )
        enqueue_job("masterclass_architect.deep_pass", analysis_id=analysis.id)


@actor(actor_name="masterclass_architect.deep_pass", priority=TaskPriority.LOW)
async def deep_pass(analysis_id: UUID) -> None:
    async with AsyncSessionMaker() as session:
        repository = MasterclassArchitectAnalysisRepository.from_session(session)
        analysis = await repository.get_by_id(analysis_id)
        if analysis is None:
            log.warning(
                "masterclass_architect.deep_pass.missing",
                analysis_id=str(analysis_id),
            )
            return
        if analysis.status != DEEP_PASS_REQUIRES:
            return
        channel = analysis.channel or {}
        uploads = channel.get("uploads_playlist_id")
        external_channel_id = analysis.external_channel_id
        if not uploads or not external_channel_id:
            await _fail(repository, analysis, AnalysisFailure.CHANNEL_NOT_FOUND)
            return

        try:
            async with YouTubeReader() as reader:
                videos = await _fetch_rated_videos(reader, uploads)
                candidates = signals.pick_comment_candidates(videos)
                threads: list[CommentThreadResult] = []
                for candidate in candidates:
                    threads.append(
                        await reader.fetch_comment_threads(
                            candidate.video_id, external_channel_id
                        )
                    )
        except YouTubeNotConfigured:
            await _fail(repository, analysis, AnalysisFailure.UPSTREAM_UNAVAILABLE)
            return
        except ChannelNotFound:
            await _fail(repository, analysis, AnalysisFailure.CHANNEL_NOT_FOUND)
            return
        except YouTubeAPIError as e:
            await _fail(repository, analysis, map_youtube_failure(e))
            return

        demands: dict[str, signals.VideoDemand] = {}
        owner_replies: list[str] = []
        for thread in threads:
            if thread.comments_disabled:
                continue  # per-video condition; the analysis carries on
            demands[thread.video_id] = signals.mine_demand(
                thread.video_id, thread.comments
            )
            owner_replies += thread.owner_replies

        # Re-read the FAQ answer now — the creator may have typed it while
        # the fast pass ran; this is the moment it joins the evidence.
        await session.refresh(analysis)
        if analysis.status != DEEP_PASS_REQUIRES:
            return
        pack = architect_ai.build_evidence_pack(
            channel=channel,
            videos=videos,
            demands=demands,
            owner_replies=owner_replies,
            faq_answer=analysis.faq_answer,
        )
        # Refresh the mirror too: it can now carry verbatim demand quotes.
        mirror = architect_ai.build_mirror(pack)

        gated: dict[str, Any] | None = None
        violations: list[str] = []
        try:
            # One retry on unparseable output before giving up: a second
            # sample usually lands, and the retry is cheaper than a lost
            # onboarding.
            for attempt in (1, 2):
                try:
                    gated, violations = await architect_ai.generate_proposals(
                        pack,
                        api_key=settings.ANTHROPIC_API_KEY,
                        model=settings.MASTERCLASS_ARCHITECT_MODEL,
                    )
                    break
                except ValueError:
                    if attempt == 2:
                        await _fail(
                            repository,
                            analysis,
                            AnalysisFailure.AI_OUTPUT_INVALID,
                        )
                        return
        except Exception:
            log.warning(
                "masterclass_architect.ai_unavailable",
                analysis_id=str(analysis.id),
                exc_info=True,
            )
            await _fail(repository, analysis, AnalysisFailure.AI_UNAVAILABLE)
            return
        assert gated is not None

        await repository.update(
            analysis,
            update_dict={
                "mirror": mirror,
                "proposals": gated,
                "recipe_version": gated.get("recipe_version"),
                "receipt_violation_count": len(violations),
                "status": STATUS_COMPLETED,
                "completed_at": utc_now(),
            },
        )
        log.info(
            "masterclass_architect.completed",
            analysis_id=str(analysis.id),
            proposal_count=len(gated.get("proposals", [])),
            flagship=gated.get("flagship", False),
            banked_count=len(gated.get("banked_themes", [])),
            receipt_violations=len(violations),
            recipe_version=gated.get("recipe_version"),
        )
