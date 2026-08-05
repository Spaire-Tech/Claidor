"""Unit tests for the email recap-copy brain (pure logic, no DB / no network).

Mirrors tests/course_assistant/test_ai.py — these exercise the prompt builder
and the defensive JSON parser without importing the Anthropic SDK.
"""

from polar.email_copy import ai


class TestBuildCourseBrief:
    def test_nested_modules(self) -> None:
        brief = ai.build_course_brief(
            {
                "title": "Southern Cooking",
                "description": "Soul food.",
                "instructor_name": "Adaeze Bello",
                "modules": [
                    {"lessons": [{"title": "The Southern Pantry"}, {"title": "Cornbread"}]},
                    {"lessons": [{"title": "Braises"}]},
                ],
            }
        )
        assert brief.title == "Southern Cooking"
        assert brief.instructor == "Adaeze Bello"
        assert brief.lessons == ["The Southern Pantry", "Cornbread", "Braises"]

    def test_flat_lessons(self) -> None:
        brief = ai.build_course_brief(
            {"title": "X", "lessons": [{"title": "One"}, {"title": "Two"}]}
        )
        assert brief.lessons == ["One", "Two"]

    def test_missing_fields_default(self) -> None:
        brief = ai.build_course_brief({})
        assert brief.title == "this course"
        assert brief.lessons == []
        assert brief.instructor == ""


class TestBuildMessages:
    def test_includes_moment_lessons_and_json_instruction(self) -> None:
        brief = ai.CourseBrief(
            title="Southern Cooking",
            description="Soul food.",
            instructor="Adaeze Bello",
            lessons=["The Southern Pantry", "Braises"],
        )
        msgs = ai.build_email_copy_messages(brief=brief, moment="halfway")
        assert msgs[0]["role"] == "user"
        content = msgs[0]["content"]
        assert "halfway" in content
        assert "The Southern Pantry" in content
        assert "Adaeze Bello" in content
        assert "JSON" in content

    def test_unknown_moment_falls_back_to_enrolment(self) -> None:
        brief = ai.CourseBrief(title="X", description="", instructor="", lessons=[])
        content = ai.build_email_copy_messages(brief=brief, moment="bogus")[0][
            "content"
        ]
        assert ai.MOMENTS["enrolment"] in content


class TestParseEmailCopy:
    def test_fenced_json(self) -> None:
        copy = ai.parse_email_copy(
            '```json\n{"subject":"Halfway!","preview":"Keep going",'
            '"heading":"Halfway there","body":["One.","Two."]}\n```'
        )
        assert copy.subject == "Halfway!"
        assert copy.preview == "Keep going"
        assert copy.heading == "Halfway there"
        assert copy.body == ["One.", "Two."]

    def test_json_embedded_in_prose(self) -> None:
        copy = ai.parse_email_copy(
            'Sure: {"subject":"Hi","preview":"p","heading":"h","body":"single"} done'
        )
        assert copy.subject == "Hi"
        assert copy.body == ["single"]

    def test_garbage_is_safe(self) -> None:
        copy = ai.parse_email_copy("not json at all")
        assert copy.subject == ""
        assert copy.preview == ""
        assert copy.heading == ""
        assert copy.body == []

    def test_empty_string(self) -> None:
        copy = ai.parse_email_copy("")
        assert copy.body == []
