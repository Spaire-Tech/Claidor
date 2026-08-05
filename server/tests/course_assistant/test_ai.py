"""Unit tests for the Course Assistant brain (pure logic, no DB / no network).

These mirror the assertions in ``scripts/course_assistant_eval.py --self-test``
in pytest form for CI.
"""

from polar.course_assistant import ai


class TestParseVtt:
    def test_strips_header_and_timestamps(self) -> None:
        vtt = (
            "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\n"
            "Hello there\n\n2\n00:00:02.000 --> 00:00:04.000\nwelcome\n"
        )
        out = ai.parse_vtt(vtt)
        assert out == "Hello there welcome"
        assert "WEBVTT" not in out
        assert "-->" not in out
        assert "00:00" not in out

    def test_strips_note_and_style_blocks(self) -> None:
        vtt = (
            "WEBVTT\n\nNOTE this is a note\nthat spans lines\n\n"
            "STYLE\n::cue { color: red }\n\n"
            "1\n00:00:00.000 --> 00:00:01.000\nReal content\n"
        )
        assert ai.parse_vtt(vtt) == "Real content"

    def test_strips_voice_and_inline_timestamp_tags(self) -> None:
        vtt = (
            "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\n"
            "<v Carla><00:00:00.500>Start here\n"
        )
        assert ai.parse_vtt(vtt) == "Start here"

    def test_dedupes_rolling_caption_substring(self) -> None:
        vtt = (
            "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\n"
            "A premise is the pressure. It won't let them sit still.\n\n"
            "2\n00:00:02.000 --> 00:00:04.000\n"
            "It won't let them sit still.\n"
        )
        out = ai.parse_vtt(vtt)
        assert out.count("It won't let them sit still.") == 1

    def test_extends_when_new_cue_supersets_previous(self) -> None:
        vtt = (
            "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nthe want\n\n"
            "2\n00:00:02.000 --> 00:00:04.000\nthe want and the wall\n"
        )
        assert ai.parse_vtt(vtt) == "the want and the wall"

    def test_empty(self) -> None:
        assert ai.parse_vtt("") == ""


class TestLessonText:
    def test_none(self) -> None:
        assert ai.lesson_text_from_content(None) == ""

    def test_string(self) -> None:
        assert ai.lesson_text_from_content("  hi  ") == "hi"

    def test_markdown_key(self) -> None:
        assert (
            ai.lesson_text_from_content({"markdown": "# Title\nBody"}) == "# Title Body"
        )

    def test_excludes_attachments_and_captions(self) -> None:
        out = ai.lesson_text_from_content(
            {"text": "real", "attachments": ["x.pdf"], "captions": True}
        )
        assert out == "real"

    def test_blocks(self) -> None:
        out = ai.lesson_text_from_content(
            {"blocks": [{"text": "a"}, {"content": "b"}, "c"]}
        )
        assert out == "a b c"


class TestKnowledgeBase:
    def test_assembly_labels_lessons(self) -> None:
        sources = [
            ai.LessonSource("1", "Intro", "video", "hello world"),
            ai.LessonSource("2", "Deep Dive", "text", "more text"),
        ]
        kb = ai.assemble_knowledge_base(sources)
        assert "[Lesson 1: Intro]" in kb
        assert "[Lesson 2: Deep Dive]" in kb
        assert "hello world" in kb

    def test_empty_lesson_marked(self) -> None:
        kb = ai.assemble_knowledge_base([ai.LessonSource("1", "Empty", "video", "")])
        assert "no transcript or text available" in kb

    def test_build_lesson_source_combines_content_and_transcript(self) -> None:
        src = ai.build_lesson_source(
            lesson_id="1",
            title="L",
            content_type="video",
            content={"markdown": "notes"},
            transcript="spoken words",
        )
        assert "notes" in src.text
        assert "spoken words" in src.text

    def test_estimate_tokens(self) -> None:
        assert ai.estimate_tokens("") == 0
        assert ai.estimate_tokens("abcd" * 100) > 0


class TestPrompts:
    def test_system_blocks_grounding_and_cache(self) -> None:
        blocks = ai.build_system_blocks(
            course_title="My Course",
            instructor_name="Carla",
            display_name="Carla",
            voice_card="Warm and blunt.",
        )
        assert len(blocks) == 1
        assert blocks[0]["cache_control"] == {"type": "ephemeral"}
        text = blocks[0]["text"]
        assert "ONLY from the course material" in text
        assert "doesn't cover that" in text
        assert "AI version of the instructor" in text
        assert "Warm and blunt." in text

    def test_user_blocks_document_then_question(self) -> None:
        blocks = ai.build_user_blocks(
            knowledge_base="KB", question="Why?", course_title="My Course"
        )
        assert blocks[0]["type"] == "document"
        assert blocks[0]["citations"] == {"enabled": True}
        assert "cache_control" in blocks[0]
        assert blocks[-1]["type"] == "text"
        assert blocks[-1]["text"] == "Why?"
        # The volatile question must sit after the cache breakpoint.
        assert "cache_control" not in blocks[-1]


class TestGuardrail:
    def test_allow(self) -> None:
        d = ai.parse_guardrail_text("ALLOW\nlooks fine")
        assert d.allowed is True

    def test_refuse_with_reason(self) -> None:
        d = ai.parse_guardrail_text("REFUSE\nmedical advice")
        assert d.allowed is False
        assert d.reason == "medical advice"

    def test_fails_open_on_ambiguous(self) -> None:
        assert ai.parse_guardrail_text("not sure").allowed is True
        assert ai.parse_guardrail_text("").allowed is True


class TestSampleQuestions:
    def test_fenced_json(self) -> None:
        parsed = ai.parse_sample_questions(
            '```json\n[{"question":"Q1?","category":"core"},'
            '{"question":"Q2?","category":"out_of_scope"}]\n```'
        )
        assert len(parsed) == 2
        assert parsed[1].category == "out_of_scope"

    def test_bad_category_coerced(self) -> None:
        parsed = ai.parse_sample_questions('[{"question":"x","category":"weird"}]')
        assert parsed[0].category == "core"

    def test_garbage_returns_empty(self) -> None:
        assert ai.parse_sample_questions("not json") == []

    def test_missing_question_skipped(self) -> None:
        assert ai.parse_sample_questions('[{"category":"core"}]') == []


class TestLessonDraft:
    def test_plain_json(self) -> None:
        draft = ai.parse_lesson_draft(
            '{"title": "Serve Mechanics", "description": "Build a repeatable '
            'serve from the ground up", "overview": "In this one we fix your '
            'toss.", "takeaways": ["Anchor your stance", "Slow the toss"]}'
        )
        assert draft is not None
        assert draft.title == "Serve Mechanics"
        assert draft.description.startswith("Build a repeatable")
        assert draft.overview == "In this one we fix your toss."
        assert draft.takeaways == ["Anchor your stance", "Slow the toss"]

    def test_fenced_json_with_prose(self) -> None:
        draft = ai.parse_lesson_draft(
            'Here you go!\n```json\n{"title": "T", "description": "D", '
            '"overview": "O", "takeaways": ["a"]}\n```'
        )
        assert draft is not None
        assert draft.title == "T"
        assert draft.takeaways == ["a"]

    def test_takeaways_capped_at_four_and_cleaned(self) -> None:
        draft = ai.parse_lesson_draft(
            '{"takeaways": ["one", "  two  ", "", null, "three", "four", "five"]}'
        )
        assert draft is not None
        assert draft.takeaways == ["one", "two", "three", "four"]

    def test_garbage_returns_none(self) -> None:
        assert ai.parse_lesson_draft("not json at all") is None
        assert ai.parse_lesson_draft("") is None
        assert ai.parse_lesson_draft("[1, 2, 3]") is None

    def test_all_empty_fields_returns_none(self) -> None:
        assert (
            ai.parse_lesson_draft(
                '{"title": "", "description": " ", "overview": "", "takeaways": []}'
            )
            is None
        )

    def test_prompt_carries_transcript_and_field_contract(self) -> None:
        messages = ai.build_lesson_draft_messages(
            transcript="Today we cover the kick serve.",
            course_title="Tennis Mastery",
            lesson_title="The Kick Serve",
            instructor_name="Carla",
        )
        assert len(messages) == 1
        content = messages[0]["content"]
        assert "Today we cover the kick serve." in content
        assert "Tennis Mastery" in content
        assert "Carla" in content
        for key in ('"title"', '"description"', '"overview"', '"takeaways"'):
            assert key in content


class TestCitations:
    def test_extract(self) -> None:
        class _Cite:
            cited_text = "premise is the pressure"
            document_title = "Course"
            start_char_index = 1
            end_char_index = 2

        class _TextBlock:
            type = "text"
            citations = [_Cite()]

        class _Msg:
            content = [_TextBlock()]

        cites = ai.extract_citations(_Msg())
        assert len(cites) == 1
        assert cites[0]["cited_text"] == "premise is the pressure"

    def test_no_citations(self) -> None:
        class _Msg:
            content: list[object] = []

        assert ai.extract_citations(_Msg()) == []
