"""Background tasks for the course module: Mux asset lifecycle.

- `course.mux_delete_asset` removes a finished asset when its lesson is
  deleted or its video replaced — Mux keeps (and bills for) assets until
  we explicitly delete them.
- `course.mux_release_upload` resolves a direct upload no lesson points
  at anymore (replaced mid-transcode, cancelled, abandoned): it deletes
  the asset the upload produced, or cancels the upload if none exists yet.
- `course.reconcile_stalled_uploads` is the safety net for lessons stuck
  in `waiting`/`processing` when the webhook never arrives: it attaches
  the asset if Mux actually finished, and marks the lesson `errored`
  otherwise so the editor stops showing "Processing…" (and polling)
  forever.
"""

from datetime import timedelta

from polar.exceptions import PolarTaskError
from polar.kit.utils import utc_now
from polar.worker import AsyncSessionMaker, CronTrigger, TaskPriority, actor

from . import mux as mux_client
from .repository import CourseLessonRepository
from .service import course_service

# A video stuck in waiting/processing longer than this is presumed dead:
# Mux direct uploads themselves time out after an hour, and transcodes
# complete in minutes. The reconcile cron then resolves the lesson one
# way or the other.
STALLED_UPLOAD_TIMEOUT = timedelta(hours=2)


class CourseTaskError(PolarTaskError): ...


@actor(actor_name="course.mux_delete_asset", priority=TaskPriority.LOW)
async def mux_delete_asset(asset_id: str) -> None:
    """Best-effort delete of a Mux asset. Idempotent: a 404 from Mux is
    treated as success (the asset is already gone). Transient failures
    raise so Dramatiq retries with backoff.
    """
    ok = await mux_client.delete_asset(asset_id)
    if not ok:
        raise CourseTaskError(f"Failed to delete Mux asset {asset_id}")


@actor(actor_name="course.mux_release_upload", priority=TaskPriority.LOW)
async def mux_release_upload(upload_id: str) -> None:
    """Release a direct upload that no lesson references anymore.

    If the upload already produced an asset, delete it (it would attach to
    nothing and bill forever). If it hasn't, cancel the upload so a file
    still in flight can't turn into an orphaned asset later. The race
    between the two (upload just finished, asset still being created) is
    covered by raising: Dramatiq retries with backoff, and a later attempt
    finds and deletes the asset.
    """
    asset = await mux_client.get_asset_by_upload(upload_id)
    if asset is not None:
        asset_id = asset.get("id")
        if asset_id and not await mux_client.delete_asset(asset_id):
            raise CourseTaskError(
                f"Failed to delete Mux asset {asset_id} for upload {upload_id}"
            )
        return
    if not await mux_client.cancel_upload(upload_id):
        raise CourseTaskError(f"Failed to release Mux upload {upload_id}")


@actor(
    actor_name="course.reconcile_stalled_uploads",
    cron_trigger=CronTrigger(minute="*/15"),
    priority=TaskPriority.LOW,
)
async def reconcile_stalled_uploads() -> None:
    """Resolve lessons stuck in `waiting`/`processing`.

    Webhooks are the normal exit from those states; this cron catches the
    ones that never fired (abandoned browser tab mid-upload, dropped
    webhook delivery). For each stalled lesson we ask Mux directly:
      - asset is ready → attach it exactly like the webhook would have;
      - asset errored → mark the lesson errored so the editor surfaces it;
      - no asset and the upload is past its own timeout → cancel the
        upload and mark the lesson errored.
    Anything still legitimately in flight is left for the next tick.
    """
    async with AsyncSessionMaker() as session:
        lesson_repo = CourseLessonRepository.from_session(session)
        cutoff = utc_now() - STALLED_UPLOAD_TIMEOUT
        for lesson in await lesson_repo.list_stalled_mux_uploads(cutoff):
            upload_id = lesson.mux_upload_id
            if not upload_id:
                # No upload to wait on — the status can never resolve.
                await lesson_repo.update(
                    lesson, update_dict={"mux_status": "errored"}
                )
                continue
            try:
                asset = await mux_client.get_asset_by_upload(upload_id)
            except Exception:
                # Transient Mux/API failure — leave it for the next tick.
                continue
            if asset is None:
                # Upload never completed. Mux expires direct uploads after
                # an hour, so past our 2h cutoff this one is dead.
                await mux_client.cancel_upload(upload_id)
                await lesson_repo.update(
                    lesson, update_dict={"mux_status": "errored"}
                )
                continue
            status = asset.get("status")
            asset_id = asset.get("id")
            playback_ids = asset.get("playback_ids") or []
            playback_id = playback_ids[0].get("id") if playback_ids else None
            if status == "ready" and asset_id and playback_id:
                await course_service.attach_ready_asset(
                    session,
                    lesson,
                    asset_id=asset_id,
                    playback_id=playback_id,
                    duration=asset.get("duration"),
                )
            elif status == "errored":
                await lesson_repo.update(
                    lesson, update_dict={"mux_status": "errored"}
                )
            # else: still preparing — re-check on the next tick.
