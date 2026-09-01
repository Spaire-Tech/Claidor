"""The house style, enforced rather than requested.

The founder's own sentence, and why this file exists:

> The gate is the part that matters. A prompt rule is a request. A gate
> is a rule.

The rules are in `docs/pierce/house-style/`, measured by the founder on
31 August against the agent's real answers: 39 alerts on what it wrote,
0 on the rewrite. What is pinned here is that each rule fires on the
sentence that provoked it and stays quiet on the sentence that fixed
it — a checker that flags good writing is worse than none, because it
teaches the model to hedge.
"""

import pytest

from polar.tieout.agent import gate, style

#: The answer the founder tested, verbatim from what the product wrote.
WROTE = """It's a three-statement operating model, about 6,200 formula cells across 13 sheets, laid out in the classic banded order: inputs, then processing, then outputs, with divider tabs between each band.

The depreciation schedule is by far the biggest block at roughly 3,000 formulas — half the model — feeding a fairly conventional income statement, cash flow and balance sheet. Assumptions Processing is the other engine at ~860 formulas. Iterative calculation is off.

No sheet has a period axis my reader recognised — worth knowing before you assume column N is year N.

I read the formula graph, not the code."""

#: The founder's own rewrite of it, from the same message.
REWROTE = """It's a three-statement operating model for the CPO semiconductor project. It covers the income statement, cash flow and balance sheet across 13 sheets.

The layout is standard: inputs, then the calculation sheets, then the statements. A divider tab sits between each part.

Two sheets do nearly all the work. Depreciation holds 3,000 formulas, half the model on its own. Assumptions Processing holds another 860. It sits between the Control Panel and everything downstream, so every input passes through it.

Circular calculation is off, so there is no loop in the file.

I could not find the period axis on any sheet. So I cannot tell you which column is which year. And there is a hidden module called Module1, which I have not read."""


class TestTheFoundersOwnTestCase:
    """The two answers they put side by side, scored the same way."""

    def test_the_answer_they_rejected_is_caught(self) -> None:
        alerts = style.check(WROTE)

        assert len(style.errors(alerts)) >= 10
        broken = {one.rule for one in alerts}
        assert {"Hedges", "MachineVoice", "NotThere", "CheckWhether"} <= broken

    def test_the_rewrite_they_wrote_passes(self) -> None:
        #: The whole point. A checker that also flags the good version
        #: is measuring length, not style.
        assert style.errors(style.check(REWROTE)) == []

    def test_the_reading_grade_matches_what_they_measured(self) -> None:
        #: They measured 10.5 with `textstat`. This uses the same
        #: formula over an estimated syllable count, so it is allowed to
        #: differ — but not by a grade.
        assert 9.5 <= style.readability(WROTE).grade <= 11.5

    def test_the_rewrite_reads_easier_by_every_measure(self) -> None:
        bad, good = style.readability(WROTE), style.readability(REWROTE)

        assert good.grade < bad.grade
        assert good.fog < bad.fog
        assert good.ease > bad.ease
        assert good.words_per_sentence < bad.words_per_sentence


class TestTheRuleUnderneathTheModule1Mistake:
    """« I couldn't find X », never « the model doesn't have X ».

    The founder's deepest rule, because it is the difference between a
    limit of the review and a claim about somebody's file — and it is
    the same error three times over in their three test answers.
    """

    @pytest.mark.parametrize(
        "said",
        [
            "No sheet has a period axis.",
            "The model has no depreciation line.",
            "There is no income statement label anywhere.",
            "The workbook does not have a debt schedule.",
        ],
    )
    def test_a_claim_about_the_file_is_caught(self, said: str) -> None:
        assert "NotThere" in {one.rule for one in style.check(said)}

    @pytest.mark.parametrize(
        "said",
        [
            "I could not find the period axis on any sheet.",
            "I could not find a depreciation line on the income statement.",
        ],
    )
    def test_the_honest_version_passes(self, said: str) -> None:
        assert style.errors(style.check(said)) == []

    def test_a_setting_that_was_read_is_not_a_guess(self) -> None:
        #: « Circular calculation is off, so there is no loop » is a
        #: fact: the workbook carries the flag and the reader read it.
        #: Flagging it would teach the model to hedge what it knows,
        #: which is the opposite failure and just as bad.
        said = "Circular calculation is off, so there is no loop in the file."

        assert style.errors(style.check(said)) == []


class TestTheOtherRules:
    def test_a_softener_in_front_of_a_counted_number(self) -> None:
        alerts = style.check("There are about 6,200 formula cells.")

        assert "Hedges" in {one.rule for one in alerts}

    def test_about_is_left_alone_where_it_is_not_a_hedge(self) -> None:
        assert style.errors(style.check("A question about the model.")) == []

    def test_the_machine_talking_about_itself(self) -> None:
        alerts = style.check("Walked back from Assumptions Processing!G67.")

        assert "MachineVoice" in {one.rule for one in alerts}

    def test_a_sentence_opening_with_a_cell(self) -> None:
        alerts = style.check("Z104 is typed in. Every other year calculates.")

        assert "CellFirst" in {one.rule for one in alerts}

    def test_the_finance_word_is_swapped_for_the_plain_one(self) -> None:
        alerts = style.check("The asset is amortised over 20 years.")

        assert any("written off" in one.say for one in alerts)

    def test_markdown_reaches_the_screen_as_punctuation(self) -> None:
        alerts = style.check("It is a **three-statement** model.")

        assert "Markdown" in {one.rule for one in alerts}

    def test_every_alert_says_what_to_write_instead(self) -> None:
        #: An alert the model cannot act on is a rejection, not a
        #: correction — and the rewrite call has only these to work
        #: from.
        for one in style.check(WROTE):
            assert one.say
            assert not one.say.lower().startswith("avoid")


@pytest.mark.asyncio
class TestTheGate:
    """Sent back and written again, before anybody reads it."""

    async def test_clean_writing_costs_nothing(self) -> None:
        async def never(*args: object) -> str:
            raise AssertionError("a clean answer must not be rewritten")

        written = await gate.written(
            object(), REWROTE, model="claude-opus-5", ask=never
        )

        assert written.clean
        assert written.tries == 0
        assert written.answer == REWROTE

    async def test_broken_writing_goes_back_with_the_alerts(self) -> None:
        seen: list[str] = []

        async def rewrite(client: object, model: str, prompt: str) -> str:
            seen.append(prompt)
            return REWROTE

        written = await gate.written(
            object(), WROTE, model="claude-opus-5", ask=rewrite
        )

        assert written.clean
        assert written.tries == 1
        assert written.answer == REWROTE
        assert written.first == WROTE
        #: The alerts travel with it, and so does the original — a
        #: rewrite prompt without the text is a request to invent one.
        assert "my reader" in seen[0]
        assert WROTE in seen[0]

    async def test_it_gives_up_rather_than_looping(self) -> None:
        async def stubborn(*args: object) -> str:
            return WROTE

        written = await gate.written(
            object(), WROTE, model="claude-opus-5", ask=stubborn
        )

        assert written.tries == gate.MOST_TRIES
        assert not written.clean
        #: Shipped, not blocked. An answer nobody sees is worse than one
        #: that says « fairly » — and the alerts ride along so this is
        #: countable rather than invisible.
        assert written.answer == WROTE
        assert written.alerts

    async def test_a_rewrite_that_fails_keeps_the_answer(self) -> None:
        async def broken(*args: object) -> str:
            raise RuntimeError("the provider is down")

        written = await gate.written(object(), WROTE, model="claude-opus-5", ask=broken)

        assert written.answer == WROTE
        assert not written.clean


class TestWhatCostsAModelCallAndWhatDoesNot:
    """Markdown is taken out; everything else is sent back.

    The distinction is whether fixing it changes a word. An asterisk
    does not — the screen prints it literally and nobody meant to send
    it — so removing it here saves a whole model call, which is a
    second or ten of somebody's wait. A hedge deleted changes a
    sentence, so that goes to the model where it can see what it is
    doing.
    """

    def test_the_asterisks_come_out_and_the_words_stay(self) -> None:
        said = style.tidy("It is a **three-statement** model with `Debt!F44`.")

        assert said == "It is a three-statement model with Debt!F44."

    def test_a_bulleted_line_becomes_a_sentence(self) -> None:
        assert style.tidy("- Depreciation holds 3,000 formulas.") == (
            "Depreciation holds 3,000 formulas."
        )

    def test_tidying_alone_never_reaches_the_model(self) -> None:
        #: Markdown and nothing else must not cost a rewrite.
        assert style.errors(style.check(style.tidy("A **clean** sentence."))) == []


class TestTheTwoTermsOfArt:
    def test_very_hidden_keeps_its_very(self) -> None:
        #: Excel's own name for a sheet absent from the unhide menu.
        #: Deleting the « very » turns a fact into a weaker, wrong one.
        assert style.errors(style.check("Module1 is very hidden.")) == []

    def test_very_anything_else_is_still_a_hedge(self) -> None:
        alerts = style.check("The schedule is very large.")

        assert "Hedges" in {one.rule for one in alerts}


class TestTheClosingOffer:
    """« The person knows they can ask. »"""

    def test_the_exact_sentence_the_founder_pointed_at(self) -> None:
        said = (
            "I also have not opened Module1. Nor have I checked which typed "
            "inputs are backed by a source document. Ask and I will."
        )

        assert "Offers" in {one.rule for one in style.check(said)}
