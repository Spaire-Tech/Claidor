"""The voice's price and its boundary, tested on their own.

This module imports nothing but the standard library and
`polar.desktop.speech`, so it runs without a database, without settings,
and without the app.
"""

from polar.desktop.speech import (
    MAX_SPEECH_CHARACTERS,
    SpeechRequest,
    credits_for_characters,
    is_valid_voice_id,
    read_speech_request,
)


class TestCreditsForCharacters:
    def test_nothing_said_costs_nothing(self) -> None:
        assert credits_for_characters(0) == 0
        assert credits_for_characters(-1) == 0

    def test_something_said_always_costs_something(self) -> None:
        # A charge that rounds down to nothing is metering that has
        # quietly stopped working, which is the failure being guarded
        # against here rather than a rounding preference.
        assert credits_for_characters(1) >= 1

    def test_cost_rises_with_length(self) -> None:
        assert credits_for_characters(2_000) > credits_for_characters(1_000)

    def test_rounds_up_rather_than_down(self) -> None:
        assert credits_for_characters(1_001) > credits_for_characters(1_000)


class TestVoiceId:
    def test_accepts_an_opaque_id(self) -> None:
        assert is_valid_voice_id("21m00Tcm4TlvDq8ikWAM")

    def test_refuses_a_path_segment_that_is_not_one(self) -> None:
        # The voice id lands in a URL path. Nothing that could leave it
        # may pass this boundary.
        assert not is_valid_voice_id("../../secrets")
        assert not is_valid_voice_id("voice id")
        assert not is_valid_voice_id("short")
        assert not is_valid_voice_id("")


class TestReadSpeechRequest:
    def test_reads_the_text(self) -> None:
        result = read_speech_request({"text": "Good morning."})
        assert isinstance(result, SpeechRequest)
        assert result.text == "Good morning."
        assert result.characters == 13
        assert result.credits >= 1

    def test_refuses_a_body_that_is_not_an_object(self) -> None:
        assert isinstance(read_speech_request(["hello"]), str)

    def test_refuses_empty_text(self) -> None:
        assert isinstance(read_speech_request({"text": "   "}), str)
        assert isinstance(read_speech_request({}), str)

    def test_refuses_more_than_can_be_spoken_at_once(self) -> None:
        reason = read_speech_request({"text": "a" * (MAX_SPEECH_CHARACTERS + 1)})
        assert isinstance(reason, str)
        # The reason has to say both numbers, or the caller cannot tell
        # how much to cut.
        assert str(MAX_SPEECH_CHARACTERS) in reason

    def test_accepts_exactly_the_cap(self) -> None:
        assert isinstance(
            read_speech_request({"text": "a" * MAX_SPEECH_CHARACTERS}), SpeechRequest
        )
