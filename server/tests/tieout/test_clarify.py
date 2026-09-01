"""The chat asking one question back — the founder's clarify pattern.

The shape: the person asks, the chat asks **one** question, a card
names what it would do, and nothing runs until a choice is picked.

Two properties matter more than the rest and both are pinned here.
**It is model-driven** — no phrase is matched and no table is looked
up; the assistant decides it cannot tell which of two readings was
meant and says so by calling a tool. And **the screen draws the tool's
payload, never the prose** — an option the model narrated but did not
put in the call is an option the person must not be offered.
"""

from polar.tieout.agent.model_tools import MODEL_TOOLSET, ask_the_person


class TestTheToolIsOfferedAtAll:
    def test_the_assistant_can_reach_it(self) -> None:
        assert "ask_the_person" in [d["name"] for d in MODEL_TOOLSET.definitions]

    def test_the_description_says_which_option_is_primary(self) -> None:
        #: The model chooses the order, so it has to know that the last
        #: option is the one the interface emphasises. Without this the
        #: wider, slower choice lands in a grey pill and the cheap one
        #: gets the dark button — the opposite of the design.
        one = next(
            d for d in MODEL_TOOLSET.definitions if d["name"] == "ask_the_person"
        )
        assert "LAST" in one["description"]
        assert "primary" in one["description"]


class TestTheVoiceIsTheFoundersOwn:
    """Quoted rather than paraphrased, and read last so it wins."""

    def test_the_rules_reach_the_model_verbatim(self) -> None:
        prompt = MODEL_TOOLSET.prompt()
        for line in (
            "Talk like a sharp colleague who is busy",
            "Lead with the answer, then the evidence",
            'Say "I don\'t know" or "I didn\'t check that" plainly',
            "never add up into one number",
            "Reading the debt schedule",
        ):
            assert line in prompt, line

    def test_the_voice_comes_after_the_toolset_prose(self) -> None:
        #: A later instruction wins over an earlier one, so where the
        #: two disagree the founder's words are what the model read
        #: most recently. Order is the whole mechanism.
        prompt = MODEL_TOOLSET.prompt()
        assert prompt.index("Talk like a sharp colleague") > prompt.index(
            "What you may claim"
        )


class TestAValidAsk:
    def test_it_returns_what_the_screen_draws(self) -> None:
        result = ask_the_person(
            "Should I check just the DSCR chain, or everything it depends on?",
            "Targeted Check",
            "Every check that feeds the DSCR row, with sources",
            ["DSCR chain only", "Everything upstream"],
        )

        assert result.ok
        assert result.data["await_person"] is True
        assert result.data["card"]["title"] == "Targeted Check"
        assert result.data["options"] == ["DSCR chain only", "Everything upstream"]

    def test_the_summary_carries_the_question(self) -> None:
        #: The trace has to show what was asked, not that something was.
        result = ask_the_person(
            "Full review, or just what changed?", "t", "b", ["a", "b"]
        )

        assert "Full review, or just what changed?" in result.summary

    def test_blank_options_are_dropped_not_drawn(self) -> None:
        result = ask_the_person("q", "t", "b", ["Keep", "  ", "Widen"])

        assert result.data["options"] == ["Keep", "Widen"]


class TestWhatItRefuses:
    """Refused with a sentence the model can read, never repaired quietly.

    Each of these is a shape that would reach the person as a broken
    card, and a silent fix would teach the model nothing.
    """

    def test_one_option_is_not_a_question(self) -> None:
        result = ask_the_person("q", "t", "b", ["only this"])

        assert not result.ok
        assert "at least two" in result.summary

    def test_five_options_is_a_menu(self) -> None:
        result = ask_the_person("q", "t", "b", ["a", "b", "c", "d", "e"])

        assert not result.ok
        assert "menu" in result.summary

    def test_a_card_without_a_question_is_decoration(self) -> None:
        result = ask_the_person("   ", "Targeted Check", "b", ["a", "b"])

        assert not result.ok

    def test_two_options_where_one_is_blank_is_still_one_option(self) -> None:
        #: The blank is dropped first, and what is left has to stand on
        #: its own — otherwise the drop quietly manufactures a valid
        #: call out of an invalid one.
        result = ask_the_person("q", "t", "b", ["Keep", "   "])

        assert not result.ok


class TestTheModelIsToldWhatTheScreenDoes:
    """Prose, because the chat renders prose.

    The founder tested the assistant and the first answer came back
    with `**bold**` in it — printed literally, asterisks and all,
    because the answer is drawn as plain text in a serif face and
    nothing parses Markdown on the way. The model could not have known;
    now it is told.
    """

    def test_markdown_is_ruled_out_in_so_many_words(self) -> None:
        prompt = MODEL_TOOLSET.prompt()

        assert "The chat renders plain text" in prompt
        assert "There is no Markdown" in prompt

    def test_it_is_told_not_to_retype_the_cells(self) -> None:
        #: The rows are drawn under the answer from the tool's own
        #: payload. A model that lists them again in prose duplicates
        #: the table and opens the one door a wrong digit could come
        #: through.
        assert "Do not repeat them in your prose" in MODEL_TOOLSET.prompt()

    def test_the_founders_own_words_still_come_last(self) -> None:
        #: The surface rules are mine and sit above the clarify
        #: section; the founder's voice stays where it was, ahead of
        #: both, and after the toolset's own prose.
        prompt = MODEL_TOOLSET.prompt()

        assert prompt.index("What you may claim") < prompt.index(
            "Talk like a sharp colleague"
        )
        assert prompt.index("Talk like a sharp colleague") < prompt.index(
            "The chat renders plain text"
        )
