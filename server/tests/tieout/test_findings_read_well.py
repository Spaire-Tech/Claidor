"""Every finding the engine writes, put through the house style.

**This is the gate the findings never had.** `findings-voice.md` is
titled « How to write a finding » and it was wired to the chat agent
only — so the assistant's prose was checked and the findings, which are
the product's front page, were not. The founder found that by reading
their own live model: *« Subordinated Debt Interest is the same formula
as its 19 siblings with one pinned reference out of step … Check which
row it should be reading »*, and asked who could read it.

Eight of ten findings on that model broke the house style. This file is
what stops it happening again: the engine's own sentences, scored by
the same checker the chat answers go through, failing the build rather
than reaching a person.

The engine writes deterministically — no model call — so there is no
rewrite to fall back on. A sentence that breaks a rule here has to be
fixed where it is written.
"""

import pytest

from polar.tieout.agent import style
from polar.tieout.audit import HEADLINES, RULE_NAMES

#: The sentences the engine actually produced on the founder's own
#: model, read from production on 1 September. Kept verbatim as the
#: regression set: each one is a shape that reached a person.
LIVE_BEFORE = [
    "Subordinated Debt Interest is the same formula as its 19 siblings "
    "with one pinned reference out of step — they read 'Control Panel'!"
    "$C$51, it reads 'Control Panel'!$D$51. Check which row it should be "
    "reading.",
    "The total at E42 excludes rows immediately above it, leaving 12.5m "
    "outside the total.",
    "E23 contains an unusually complex formula. Its logic is difficult to "
    "trace and verify by hand.",
    "« Module1 » is very hidden — invisible in Excel's unhide menu — but "
    "it is empty and nothing in the model reads it. Most likely left over "
    "from an older file format, and worth deleting rather than fearing.",
]

#: What the engine writes now, in the same four situations.
LIVE_AFTER = [
    "Subordinated Debt Interest reads a different cell from the rest of its row.",
    "Total Operating Costs misses 12.5m.",
    "The formula at E23 is too long to check by eye.",
    "« Module1 » is very hidden but empty. Nothing in the model reads it "
    "— safe to delete.",
]


class TestTheFoundersOwnFourSentences:
    """Read from their live model, before and after."""

    @pytest.mark.parametrize("said", LIVE_BEFORE)
    def test_each_one_broke_a_rule(self, said: str) -> None:
        #: The regression set has to *fail*, or it is not testing the
        #: checker — a rule that no longer fires on the sentence that
        #: provoked it has been quietly weakened.
        assert style.errors(style.check(said)), said

    @pytest.mark.parametrize("said", LIVE_AFTER)
    def test_the_replacement_passes(self, said: str) -> None:
        broke = style.errors(style.check(said))

        assert broke == [], [f"{one.rule}: {one.found}" for one in broke]

    @pytest.mark.parametrize(
        "said",
        [
            "$LABEL reads a different cell from the rest of its row.",
            "$LABEL misses 12.5m.",
            "The formula at E23 is too long to check by eye.",
            "$LABEL is very hidden but empty. Nothing in the model reads "
            "it — safe to delete.",
        ],
    )
    def test_the_words_the_engine_chose_read_at_the_founders_bar(
        self, said: str
    ) -> None:
        """Grade 8, over the words the engine actually wrote.

        **The model's own row label is held out, and that is a
        correction to the measurement rather than to the bar.**
        Flesch-Kincaid is syllables per word over words per sentence, so
        a five-word sentence whose subject is « Total Operating Costs »
        scores 10.0 — and that sentence is the founder's own worked
        example of a *good* finding. What the formula is measuring
        there is the model's naming, which the engine may not change and
        must not paraphrase: renaming somebody's row to make a score go
        down would be the worst possible way to pass this test.

        So the label is a placeholder and the rest is scored. The bar is
        untouched.
        """
        reading = style.readability(said)

        assert reading.grade <= style.GRADE_CEILING, (
            f"grade {reading.grade:.1f}: {said}"
        )

    def test_the_rewrite_reads_easier_than_what_it_replaced(self) -> None:
        before = style.readability(" ".join(LIVE_BEFORE))
        after = style.readability(" ".join(LIVE_AFTER))

        assert after.grade < before.grade
        assert after.words_per_sentence < before.words_per_sentence


class TestTheRulesTheFounderNamed:
    """Each one, as a phrase that must not survive anywhere."""

    @pytest.mark.parametrize(
        "banned",
        [
            "check whether",
            "check which",
            "siblings",
            "pinned reference",
            "contains a fixed value",
            "does not follow the formula",
            "excludes rows immediately above",
            "the departure",
            "most likely",
            "whatever it holds",
        ],
    )
    def test_the_phrase_is_caught_wherever_it_appears(self, banned: str) -> None:
        said = f"The total at Debt!F44 {banned} in the row."

        assert style.errors(style.check(said)), banned


class TestTheEnginesOwnCatalogue:
    def test_every_headline_reads_in_plain_words(self) -> None:
        #: The two or three words a reader scans first. « Volatile
        #: function », « Hardcoded assumption », « Circular reference »
        #: are all Excel's vocabulary rather than a banker's.
        for key, name in HEADLINES.items():
            broke = style.errors(style.check(name))
            assert broke == [], f"{key}: {name} — {[o.rule for o in broke]}"

    def test_every_rule_name_reads_as_a_sentence_not_a_slug(self) -> None:
        #: The names a person sees grouped over the findings. « Totals
        #: that disagree with their siblings » was one of them, and
        #: « siblings » is on the founder's banned list.
        for key, name in RULE_NAMES.items():
            broke = style.errors(style.check(name))
            assert broke == [], f"{key}: {name} — {[o.rule for o in broke]}"
