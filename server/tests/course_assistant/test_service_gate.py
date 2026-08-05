"""Tests for the ingestion gate logic (pure; no DB session required).

These construct in-memory CourseLesson instances and exercise the decision
methods that decide whether a course is ready to build and how its lessons
are turned into knowledge-base sources.
"""

from polar.course_assistant.service import course_assistant_service as service
from polar.models.course_lesson import CourseLesson


def _lesson(
    *,
    content_type: str = "video",
    transcript_status: str | None = None,
    mux_status: str | None = None,
    transcript: str | None = None,
    content: object | None = None,
    title: str = "Lesson",
) -> CourseLesson:
    lesson = CourseLesson(
        title=title,
        content_type=content_type,
        transcript_status=transcript_status,
        mux_status=mux_status,
        transcript=transcript,
        content=content,
    )
    return lesson


class TestBlocksBuild:
    def test_text_lesson_never_blocks(self) -> None:
        assert service._lesson_blocks_build(_lesson(content_type="text")) is False

    def test_video_with_ready_transcript_does_not_block(self) -> None:
        lesson = _lesson(transcript_status="ready", mux_status="ready", transcript="hi")
        assert service._lesson_blocks_build(lesson) is False

    def test_video_with_failed_transcript_does_not_block(self) -> None:
        lesson = _lesson(transcript_status="failed", mux_status="ready")
        assert service._lesson_blocks_build(lesson) is False

    def test_video_unavailable_does_not_block(self) -> None:
        lesson = _lesson(transcript_status="unavailable", mux_status="ready")
        assert service._lesson_blocks_build(lesson) is False

    def test_video_pending_captions_blocks(self) -> None:
        lesson = _lesson(transcript_status="pending", mux_status="ready")
        assert service._lesson_blocks_build(lesson) is True

    def test_video_still_processing_blocks(self) -> None:
        lesson = _lesson(transcript_status=None, mux_status="processing")
        assert service._lesson_blocks_build(lesson) is True

    def test_video_errored_does_not_block(self) -> None:
        lesson = _lesson(transcript_status=None, mux_status="errored")
        assert service._lesson_blocks_build(lesson) is False

    def test_video_with_no_upload_does_not_block(self) -> None:
        lesson = _lesson(transcript_status=None, mux_status=None)
        assert service._lesson_blocks_build(lesson) is False


class TestIsIngestable:
    def test_all_resolved(self) -> None:
        lessons = [
            _lesson(transcript_status="ready", mux_status="ready"),
            _lesson(content_type="text", content={"markdown": "x"}),
        ]
        assert service.is_ingestable(lessons) is True

    def test_one_pending_blocks(self) -> None:
        lessons = [
            _lesson(transcript_status="ready", mux_status="ready"),
            _lesson(transcript_status="pending", mux_status="ready"),
        ]
        assert service.is_ingestable(lessons) is False


class TestCollectSources:
    def test_video_uses_transcript_text_uses_content(self) -> None:
        lessons = [
            _lesson(
                content_type="video",
                transcript="spoken words here",
                title="Vid",
            ),
            _lesson(
                content_type="text",
                content={"markdown": "written words"},
                title="Doc",
            ),
        ]
        sources = service._collect_sources(lessons)
        assert sources[0].title == "Vid"
        assert "spoken words here" in sources[0].text
        assert "written words" in sources[1].text

    def test_text_lesson_ignores_transcript_field(self) -> None:
        lessons = [
            _lesson(
                content_type="text",
                transcript="should be ignored",
                content={"text": "real body"},
            )
        ]
        sources = service._collect_sources(lessons)
        assert "should be ignored" not in sources[0].text
        assert "real body" in sources[0].text
