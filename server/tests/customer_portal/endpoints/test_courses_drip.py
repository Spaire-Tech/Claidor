"""Unit tests for per-lesson drip enforcement in the customer portal course
module/lesson list builder.

Regression: ``_build_module_list`` previously honored only module-level drip,
so a lesson dripped individually (``release_at`` / ``drip_days``) inside an
otherwise-unlocked module was serialized in full and added to the
``accessible_ids`` set. Because ``_verify_lesson_in_enrolled_course`` gates the
playback / complete / comment / note endpoints on that very set, the lesson's
content (and a freshly signed Mux playback URL) was reachable before its release
date. These tests pin the corrected behavior using lightweight stand-in objects
so they run without the database.
"""

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from polar.customer_portal.endpoints.courses import _build_module_list

NOW = datetime(2026, 1, 1, tzinfo=UTC)
ENROLLED_AT = NOW - timedelta(days=10)


def _lesson(
    *,
    position: int,
    is_free_preview: bool = False,
    published: bool = True,
    release_at: datetime | None = None,
    drip_days: int | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        module_id=uuid.uuid4(),
        title=f"Lesson {position}",
        content_type="video",
        position=position,
        duration_seconds=120,
        is_free_preview=is_free_preview,
        published=published,
        release_at=release_at,
        drip_days=drip_days,
        content={"text": "secret body"},
        mux_playback_id="mux_secret",
        mux_status="ready",
        thumbnail_url=None,
        thumbnail_object_position=None,
        comments_mode="visible",
        description="card copy",
    )


def _module(lessons: list[SimpleNamespace], **kwargs: object) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        title="Module",
        description="desc",
        position=0,
        release_at=kwargs.get("release_at"),
        drip_days=kwargs.get("drip_days"),
        lessons=lessons,
    )


def test_per_lesson_drip_locks_lesson_in_unlocked_module() -> None:
    open_lesson = _lesson(position=0)
    drip_days_lesson = _lesson(position=1, drip_days=30)  # unlock 20 days from now
    preview_drip_lesson = _lesson(position=2, is_free_preview=True, drip_days=30)
    release_at_lesson = _lesson(position=3, release_at=NOW + timedelta(days=5))

    course = SimpleNamespace(
        modules=[
            _module(
                [
                    open_lesson,
                    drip_days_lesson,
                    preview_drip_lesson,
                    release_at_lesson,
                ]
            )
        ]
    )

    modules, accessible_ids = _build_module_list(
        course, None, ENROLLED_AT, NOW, set()
    )

    # Accessible: the open lesson and the free-preview lesson (preview bypasses
    # drip). NOT accessible: the per-lesson dripped + the future release_at one.
    assert str(open_lesson.id) in accessible_ids
    assert str(preview_drip_lesson.id) in accessible_ids
    assert str(drip_days_lesson.id) not in accessible_ids
    assert str(release_at_lesson.id) not in accessible_ids

    lessons_by_id = {lesson["id"]: lesson for lesson in modules[0]["lessons"]}

    # The module list now exposes locked / locked_until on every lesson, so it
    # agrees with the flat lesson list.
    assert lessons_by_id[str(open_lesson.id)]["locked"] is False
    assert lessons_by_id[str(drip_days_lesson.id)]["locked"] is True
    assert lessons_by_id[str(drip_days_lesson.id)]["locked_until"] is not None
    assert lessons_by_id[str(release_at_lesson.id)]["locked"] is True
    assert (
        lessons_by_id[str(release_at_lesson.id)]["locked_until"]
        == (NOW + timedelta(days=5)).isoformat()
    )

    # Locked lessons must have their body fields stripped so the content
    # endpoints cannot be bypassed by reading the JSON.
    assert lessons_by_id[str(drip_days_lesson.id)]["content"] is None
    assert lessons_by_id[str(drip_days_lesson.id)]["mux_playback_id"] is None
    # Accessible lessons keep their content.
    assert lessons_by_id[str(open_lesson.id)]["content"] == {"text": "secret body"}


def test_module_drip_still_hides_non_preview_lessons() -> None:
    preview = _lesson(position=0, is_free_preview=True)
    locked = _lesson(position=1)

    course = SimpleNamespace(
        modules=[
            _module([preview, locked], release_at=NOW + timedelta(days=3)),
        ]
    )

    modules, accessible_ids = _build_module_list(
        course, None, ENROLLED_AT, NOW, set()
    )

    # Module-level drip: only the free preview is visible, and it's accessible.
    assert modules[0]["locked"] is True
    visible_ids = {lesson["id"] for lesson in modules[0]["lessons"]}
    assert visible_ids == {str(preview.id)}
    assert accessible_ids == {str(preview.id)}


def test_unpublished_lessons_are_excluded() -> None:
    published = _lesson(position=0)
    unpublished = _lesson(position=1, published=False)

    course = SimpleNamespace(modules=[_module([published, unpublished])])

    modules, accessible_ids = _build_module_list(
        course, None, ENROLLED_AT, NOW, set()
    )

    visible_ids = {lesson["id"] for lesson in modules[0]["lessons"]}
    assert visible_ids == {str(published.id)}
    assert accessible_ids == {str(published.id)}
