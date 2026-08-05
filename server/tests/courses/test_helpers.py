"""Unit tests for the pure helpers added by the course audit fixes.

These exercise the security-critical logic (paywall + drip enforcement,
locked-content stripping, comment-author fallback, lesson accessibility)
without needing the full async DB stack — the helpers operate over plain
duck-typed objects so they're cheap to verify directly.
"""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest

from polar.course.service import course_service
from polar.customer_portal.endpoints.courses import (
    _build_flat_lesson_list,
    _build_module_list,
    _resolve_author_name,
    _serialize_lesson,
)


def _lesson(
    *,
    id_=None,
    position=0,
    published=True,
    is_free_preview=False,
    drip_days=None,
    release_at=None,
    content="hello",
    mux_playback_id="abc",
    description="desc",
    content_type="text",
):
    return SimpleNamespace(
        id=id_ or uuid4(),
        # _serialize_lesson reads lesson.module_id directly (not via getattr),
        # so the fixture must provide it or every _build_*_list test errors.
        module_id=uuid4(),
        title=f"Lesson {position + 1}",
        description=description,
        content_type=content_type,
        content=content,
        position=position,
        duration_seconds=120,
        is_free_preview=is_free_preview,
        published=published,
        mux_playback_id=mux_playback_id,
        mux_status="ready",
        thumbnail_url=None,
        thumbnail_object_position=None,
        comments_mode="visible",
        drip_days=drip_days,
        release_at=release_at,
    )


def _module(
    *,
    position=0,
    lessons=(),
    drip_days=None,
    release_at=None,
):
    return SimpleNamespace(
        id=uuid4(),
        title=f"Module {position + 1}",
        description=None,
        position=position,
        drip_days=drip_days,
        release_at=release_at,
        lessons=list(lessons),
    )


def _course(*, modules, paywall_enabled=False, paywall_position=None):
    return SimpleNamespace(
        id=uuid4(),
        modules=list(modules),
        paywall_enabled=paywall_enabled,
        paywall_position=paywall_position,
    )


# ──────────────────────────────────────────────────────────────────────────
# _resolve_author_name — the comment "Student" fallback fix
# ──────────────────────────────────────────────────────────────────────────


class TestResolveAuthorName:
    @pytest.mark.parametrize(
        ("name", "email", "expected"),
        [
            pytest.param("Alice", "alice@example.com", "Alice", id="prefers name"),
            pytest.param(
                "  Alice  ", "alice@example.com", "Alice", id="trims whitespace"
            ),
            pytest.param("", "alice@example.com", "alice", id="empty name → email prefix"),
            pytest.param(None, "alice@example.com", "alice", id="null name → email prefix"),
            pytest.param("   ", "alice@example.com", "alice", id="whitespace-only name → email"),
            pytest.param(None, None, None, id="no name and no email → null"),
            pytest.param(None, "", None, id="empty email → null"),
        ],
    )
    def test_fallbacks(self, name, email, expected) -> None:
        assert _resolve_author_name(name, email) == expected


# ──────────────────────────────────────────────────────────────────────────
# _serialize_lesson — locked lessons must not leak content / mux url
# ──────────────────────────────────────────────────────────────────────────


class TestSerializeLesson:
    def test_accessible_includes_body(self) -> None:
        lesson = _lesson()
        out = _serialize_lesson(lesson, set(), accessible=True)
        assert out["content"] == "hello"
        assert out["mux_playback_id"] == "abc"
        assert out["description"] == "desc"
        # mux_playback_url is signed when signing keys configured; otherwise
        # falls back to the public URL. Either way it must not be None when
        # accessible.
        assert out["mux_playback_url"] is not None
        assert "abc" in out["mux_playback_url"]

    def test_inaccessible_strips_body(self) -> None:
        lesson = _lesson()
        out = _serialize_lesson(lesson, set(), accessible=False)
        assert out["content"] is None
        assert out["mux_playback_id"] is None
        assert out["mux_playback_url"] is None
        assert out["description"] is None
        assert out["mux_status"] is None

    def test_inaccessible_keeps_safe_metadata(self) -> None:
        # Title, position, duration, thumbnail_url, completed should all
        # survive — they're how locked cards still show "Lesson 3 · 12 min"
        # in the UI.
        lesson = _lesson(position=2)
        out = _serialize_lesson(lesson, {str(lesson.id)}, accessible=False)
        assert out["title"] == "Lesson 3"
        assert out["position"] == 2
        assert out["duration_seconds"] == 120
        assert out["completed"] is True
        assert out["comments_mode"] == "visible"


# ──────────────────────────────────────────────────────────────────────────
# calculate_lesson_accessibility — enrolled-only check; only drip gates access
# ──────────────────────────────────────────────────────────────────────────


class TestCalculateLessonAccessibility:
    def test_free_preview_always_accessible(self) -> None:
        lesson = _lesson(is_free_preview=True)
        ok, until = course_service.calculate_lesson_accessibility(
            lesson,
            paywall_position=0,
            enrolled_at=datetime.now(UTC),
            now=datetime.now(UTC),
            global_lesson_index=99,
        )
        assert ok is True
        assert until is None

    def test_paywall_does_not_lock_enrolled_customers(self) -> None:
        # The function is called only for enrolled customers; paywall is
        # enforced separately for anonymous visitors at the endpoint level.
        # A lesson sitting well past the paywall must still be accessible.
        lesson = _lesson(position=5)
        ok, until = course_service.calculate_lesson_accessibility(
            lesson,
            paywall_position=2,
            enrolled_at=datetime.now(UTC),
            now=datetime.now(UTC),
            global_lesson_index=10,
        )
        assert ok is True
        assert until is None

    def test_drip_blocks_until_unlock(self) -> None:
        enrolled = datetime.now(UTC) - timedelta(days=1)
        lesson = _lesson(drip_days=3)
        ok, until = course_service.calculate_lesson_accessibility(
            lesson,
            paywall_position=None,
            enrolled_at=enrolled,
            now=datetime.now(UTC),
            global_lesson_index=0,
        )
        assert ok is False
        assert until is not None
        # unlock = enrolled + 3 days
        expected = enrolled + timedelta(days=3)
        assert until == expected

    def test_drip_passes_after_unlock(self) -> None:
        enrolled = datetime.now(UTC) - timedelta(days=10)
        lesson = _lesson(drip_days=3)
        ok, _ = course_service.calculate_lesson_accessibility(
            lesson,
            paywall_position=None,
            enrolled_at=enrolled,
            now=datetime.now(UTC),
            global_lesson_index=0,
        )
        assert ok is True

    def test_module_drip_locks_lesson_with_no_own_drip(self) -> None:
        # Chapter-level drip must lock a lesson even when the lesson itself
        # has no schedule.
        enrolled = datetime.now(UTC) - timedelta(days=1)
        lesson = _lesson()
        module = _module(drip_days=3)
        ok, until = course_service.calculate_lesson_accessibility(
            lesson,
            paywall_position=None,
            enrolled_at=enrolled,
            now=datetime.now(UTC),
            module=module,
        )
        assert ok is False
        assert until == enrolled + timedelta(days=3)

    def test_locked_until_is_later_of_lesson_and_module(self) -> None:
        # A lesson is accessible only once BOTH gates open, so locked_until is
        # the later of the two — here the module's +10d beats the lesson's +3d.
        enrolled = datetime.now(UTC) - timedelta(days=1)
        lesson = _lesson(drip_days=3)
        module = _module(drip_days=10)
        ok, until = course_service.calculate_lesson_accessibility(
            lesson,
            paywall_position=None,
            enrolled_at=enrolled,
            now=datetime.now(UTC),
            module=module,
        )
        assert ok is False
        assert until == enrolled + timedelta(days=10)

    def test_free_preview_bypasses_module_drip(self) -> None:
        lesson = _lesson(is_free_preview=True)
        module = _module(drip_days=30)
        ok, until = course_service.calculate_lesson_accessibility(
            lesson,
            paywall_position=None,
            enrolled_at=datetime.now(UTC),
            now=datetime.now(UTC),
            module=module,
        )
        assert ok is True
        assert until is None

    def test_accessible_once_both_gates_open(self) -> None:
        enrolled = datetime.now(UTC) - timedelta(days=20)
        lesson = _lesson(drip_days=3)
        module = _module(drip_days=10)
        ok, until = course_service.calculate_lesson_accessibility(
            lesson,
            paywall_position=None,
            enrolled_at=enrolled,
            now=datetime.now(UTC),
            module=module,
        )
        assert ok is True
        assert until is None


# ──────────────────────────────────────────────────────────────────────────
# _build_module_list — enrolled customers see everything past the paywall;
# only drip schedules gate access.
# ──────────────────────────────────────────────────────────────────────────


class TestBuildModuleList:
    def test_paywall_is_irrelevant_for_enrolled_customers(self) -> None:
        modules = [
            _module(
                position=0,
                lessons=[_lesson(position=0), _lesson(position=1)],
            ),
            _module(
                position=1,
                lessons=[_lesson(position=0), _lesson(position=1)],
            ),
        ]
        course = _course(
            modules=modules, paywall_enabled=True, paywall_position=1
        )
        result, accessible = _build_module_list(
            course,
            paywall_position=1,
            enrolled_at=datetime.now(UTC),
            now=datetime.now(UTC),
            completed_ids=set(),
        )
        # Both modules — and every published lesson — must be visible.
        assert [len(m["lessons"]) for m in result] == [2, 2]
        assert all(m["locked"] is False for m in result)
        assert len(accessible) == 4

    def test_drip_locked_module_shows_only_free_previews(self) -> None:
        modules = [
            _module(
                position=0,
                drip_days=7,
                lessons=[
                    _lesson(position=0, is_free_preview=True),
                    _lesson(position=1),
                ],
            ),
        ]
        course = _course(modules=modules)
        result, accessible = _build_module_list(
            course,
            paywall_position=None,
            enrolled_at=datetime.now(UTC),
            now=datetime.now(UTC),
            completed_ids=set(),
        )
        assert result[0]["locked"] is True
        assert result[0]["locked_until"] is not None
        assert len(result[0]["lessons"]) == 1  # only the free preview
        assert len(accessible) == 1

    def test_unpublished_lessons_are_hidden(self) -> None:
        modules = [
            _module(
                position=0,
                lessons=[
                    _lesson(position=0, published=False),
                    _lesson(position=1, published=True),
                ],
            ),
        ]
        course = _course(modules=modules)
        result, accessible = _build_module_list(
            course,
            paywall_position=None,
            enrolled_at=datetime.now(UTC),
            now=datetime.now(UTC),
            completed_ids=set(),
        )
        assert len(result[0]["lessons"]) == 1
        assert len(accessible) == 1

    def test_lesson_level_drip_is_hidden_in_module_list(self) -> None:
        # A lesson with its OWN drip inside a NON-dripped module must be
        # omitted and absent from accessible_ids — accessible_ids is the
        # authority the playback / complete / comments gate trusts, so a
        # lesson-level drip that only showed in the flat list (and was
        # bypassable on the gate) is now enforced here too.
        modules = [
            _module(
                position=0,
                lessons=[
                    _lesson(position=0),
                    _lesson(position=1, drip_days=7),
                ],
            ),
        ]
        course = _course(modules=modules)
        result, accessible = _build_module_list(
            course,
            paywall_position=None,
            enrolled_at=datetime.now(UTC),
            now=datetime.now(UTC),
            completed_ids=set(),
        )
        assert result[0]["locked"] is False  # the module itself isn't dripped
        assert len(result[0]["lessons"]) == 1  # the dripped lesson is hidden
        assert len(accessible) == 1


# ──────────────────────────────────────────────────────────────────────────
# _build_flat_lesson_list — enrolled customers see content past the paywall;
# drip is the only gate.
# ──────────────────────────────────────────────────────────────────────────


class TestBuildFlatLessonList:
    def test_paywall_does_not_strip_content_for_enrolled(self) -> None:
        modules = [
            _module(
                position=0,
                lessons=[
                    _lesson(position=0, content="public content"),
                    _lesson(position=1, content="paid content"),
                ],
            ),
        ]
        course = _course(
            modules=modules, paywall_enabled=True, paywall_position=1
        )
        flat, accessible = _build_flat_lesson_list(
            course,
            paywall_position=1,
            enrolled_at=datetime.now(UTC),
            now=datetime.now(UTC),
            completed_ids=set(),
        )
        assert len(flat) == 2
        assert all(l["locked"] is False for l in flat)
        assert flat[0]["content"] == "public content"
        assert flat[1]["content"] == "paid content"
        assert len(accessible) == 2

    def test_drip_locked_lesson_strips_content(self) -> None:
        modules = [
            _module(
                position=0,
                lessons=[
                    _lesson(position=0, content="immediate"),
                    _lesson(position=1, content="dripped", drip_days=7),
                ],
            ),
        ]
        course = _course(modules=modules)
        flat, accessible = _build_flat_lesson_list(
            course,
            paywall_position=None,
            enrolled_at=datetime.now(UTC),
            now=datetime.now(UTC),
            completed_ids=set(),
        )
        assert len(flat) == 2
        assert flat[0]["locked"] is False
        assert flat[0]["content"] == "immediate"
        assert flat[1]["locked"] is True
        assert flat[1]["content"] is None
        assert flat[1]["mux_playback_id"] is None
        assert flat[1]["mux_playback_url"] is None
        assert len(accessible) == 1

    def test_module_drip_locks_flat_lesson(self) -> None:
        # The watch UI reads the flat list, so module-level drip must lock the
        # lesson there too — even when the lesson has no schedule of its own.
        modules = [
            _module(
                position=0,
                drip_days=7,
                lessons=[_lesson(position=0, content="dripped")],
            ),
        ]
        course = _course(modules=modules)
        flat, accessible = _build_flat_lesson_list(
            course,
            paywall_position=None,
            enrolled_at=datetime.now(UTC),
            now=datetime.now(UTC),
            completed_ids=set(),
        )
        assert len(flat) == 1
        assert flat[0]["locked"] is True
        assert flat[0]["content"] is None
        assert len(accessible) == 0

    def test_module_drip_keeps_free_preview_visible_in_flat_list(self) -> None:
        # A free-preview lesson inside a dripped module stays accessible — the
        # flag wins over the schedule.
        modules = [
            _module(
                position=0,
                drip_days=7,
                lessons=[
                    _lesson(position=0, is_free_preview=True, content="teaser"),
                ],
            ),
        ]
        course = _course(modules=modules)
        flat, accessible = _build_flat_lesson_list(
            course,
            paywall_position=None,
            enrolled_at=datetime.now(UTC),
            now=datetime.now(UTC),
            completed_ids=set(),
        )
        assert len(flat) == 1
        assert flat[0]["locked"] is False
        assert flat[0]["content"] == "teaser"
        assert len(accessible) == 1
