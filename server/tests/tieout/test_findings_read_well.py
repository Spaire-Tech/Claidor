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

import re

import pytest

from polar.tieout.agent import style
from polar.tieout.audit import HEADLINES, RULE_NAMES, Finding, plain_words

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


# --- every branch, not only the four the founder happened to hit -------


def f(rule, **kw):
    base = dict(
        rule=rule,
        severity=kw.pop("severity", "error"),
        ref=kw.pop("ref", "Debt Schedule!E41"),
        sheet=kw.pop("sheet", "Debt Schedule"),
        name=kw.pop("name", "Total Senior Debt Service"),
        detail=kw.pop("detail", "something happened"),
    )
    base.update(kw)
    return Finding(**base)


#: One case per branch `plain_words` actually has. The `detail` values
#: are the strings the branch keys on.
CASES: list[tuple[str, Finding]] = [
    ("error-value", f("error-value", detail="the cell shows #REF!")),
    (
        "external-link",
        f("external-link", detail="reads a file nobody sent — 3 cells", figure="3"),
    ),
    (
        "broken-name",
        f(
            "broken-name",
            ref="",
            sheet="",
            name="defined names",
            figure="606",
            figure_unit="point at deleted cells",
            detail="Excel stores #REF! where their targets used to be (Tax_Rate).",
        ),
    ),
    (
        "broken-name/one",
        f(
            "broken-name",
            ref="",
            sheet="",
            name="defined names",
            figure="1",
            figure_unit="point at deleted cells",
            detail="Excel stores #REF! where their targets used to be (Tax_Rate).",
        ),
    ),
    (
        "broken-name/foreign",
        f(
            "broken-name",
            ref="",
            sheet="",
            name="defined names",
            figure="4",
            figure_unit="point into files that are not here",
            detail="Tax_Rate and 3 more. Tax_Rate reads [Budget.xlsx]Rates!$C$4.",
        ),
    ),
    (
        "broken-aggregation/flow",
        f(
            "broken-aggregation",
            name="Revenue",
            cells="Annual!G41, Annual!H41, Summary!C5",
            detail=(
                "adds up one month where the row adds all 12. The year "
                "carries one month's figure."
            ),
        ),
    ),
    (
        "broken-aggregation/stock",
        f(
            "broken-aggregation",
            name="Cash Balance",
            detail=(
                "takes the wrong month. Everywhere else the row takes each "
                "year's last month."
            ),
        ),
    ),
    ("volatile", f("volatile")),
    ("long-formula", f("long-formula")),
    (
        "long-formula/fold",
        f("long-formula", figure_unit="in 4 places", detail="312 characters"),
    ),
    (
        "long-formula/sheets",
        f(
            "long-formula",
            figure_unit="repeated on 5 sheets",
            detail="312 characters",
        ),
    ),
    (
        "hardcode-in-formula",
        f(
            "hardcode-in-formula",
            figure="240000",
            detail="240000 typed directly into it",
        ),
    ),
    ("typed-over-formula", f("typed-over-formula")),
    (
        "typed-over-formula/row",
        f("typed-over-formula", detail="the same value typed across 12 columns"),
    ),
    (
        "typed-over-formula/run",
        f("typed-over-formula", detail="4 different values typed across 4 columns"),
    ),
    (
        "typed-over-formula/block",
        f("typed-over-formula", detail="typed over a block of 3 by 4"),
    ),
    (
        "typed-over-formula/places",
        f("typed-over-formula", detail="typed over in 3 places: E12, F12, G12"),
    ),
    ("typed-over-edge", f("typed-over-edge")),
    ("range-over-block", f("range-over-block")),
    ("range-over-block/smell", f("range-over-block", severity="smell")),
    ("inconsistent-total", f("inconsistent-total")),
    ("inconsistent-anchoring", f("inconsistent-anchoring")),
    ("inconsistent-row", f("inconsistent-row")),
    (
        "inconsistent-row/calc",
        f(
            "inconsistent-row",
            detail="the same calculation as its row with a flipped sign",
        ),
    ),
    (
        "inconsistent-row/formula",
        f(
            "inconsistent-row",
            detail="the same formula as its row but reads a different column",
        ),
    ),
    (
        "inconsistent-row/tests",
        f("inconsistent-row", detail="tests a different switch: E9 not E8"),
    ),
    ("circular", f("circular")),
    ("skipped-cell", f("skipped-cell", figure="12.5m")),
    ("skipped-cell/nofigure", f("skipped-cell")),
    (
        "gapped-test",
        f(
            "gapped-test",
            figure="7",
            figure_unit="skipped cells hold numbers",
            detail="it tests 12 cells one at a time and skips E30 to E36",
        ),
    ),
    (
        "hidden-sheet",
        f(
            "hidden-sheet",
            detail="« Module1 » is very hidden but empty. Nothing in the model reads it — safe to delete.",
        ),
    ),
]


class TestEveryBranchOfEverySentence:
    """The whole catalogue, driven through the real sentence builder.

    Not the templates read by eye: `plain_words` is called with a
    finding shaped to reach each branch, and what comes out is scored.
    A rule with three branches is three cases, because a rule is only
    as good as its worst one — and the founder's own four were all
    inside branches that a template-level read would have missed.
    """

    @pytest.mark.parametrize(("label", "finding"), CASES, ids=[one[0] for one in CASES])
    def test_the_sentence_keeps_the_house_style(
        self, label: str, finding: Finding
    ) -> None:
        said = plain_words(finding)
        broke = style.errors(style.check(said))

        assert broke == [], f"{label}: {said}\n  " + "\n  ".join(
            f"« {one.found} » — {one.say}" for one in broke
        )

    @pytest.mark.parametrize(("label", "finding"), CASES, ids=[one[0] for one in CASES])
    def test_the_sentence_is_a_sentence(self, label: str, finding: Finding) -> None:
        #: `gapped-test` had no branch at all, so it fell through to the
        #: raw `detail` and reached a person as a fragment with sixty
        #: characters of formula in it. A sentence starts with a capital
        #: and ends with a stop; a fragment does neither.
        said = plain_words(finding).strip()

        assert said, label
        assert said[0].isupper() or said[0] in "«\"'", f"{label}: {said}"
        assert said.endswith((".", "!", "?")), f"{label}: {said}"

    @pytest.mark.parametrize(("label", "finding"), CASES, ids=[one[0] for one in CASES])
    def test_no_formula_is_spliced_into_the_prose(
        self, label: str, finding: Finding
    ) -> None:
        #: The founder's second example: « … 7 live cells a failure
        #: could hide in: =IF(OR(D10<0,E10<0,F10<0,… ». A formula in a
        #: sentence is a formula nobody reads.
        said = plain_words(finding)

        assert "=IF(" not in said, f"{label}: {said}"
        assert "=SUM(" not in said, f"{label}: {said}"
        assert said.count("(") - said.count("=") < 4, f"{label}: {said}"

    @pytest.mark.parametrize(("label", "finding"), CASES, ids=[one[0] for one in CASES])
    def test_the_sentence_reads_at_the_founders_bar(
        self, label: str, finding: Finding
    ) -> None:
        """« Flesch-Kincaid grade under 8 », over every branch.

        The model's own row label is held out, for the reason set out
        on `TestTheFoundersOwnFourSentences`: the formula scores the
        model's naming, which the engine may not change. Everything
        else in the sentence is the engine's own choice of words and is
        scored as written.
        """
        said = plain_words(finding)
        bare = said.replace(finding.name, "X") if finding.name else said
        reading = style.readability(bare)

        assert reading.grade <= style.GRADE_CEILING, (
            f"{label}: grade {reading.grade:.1f} — {said}"
        )

    @pytest.mark.parametrize(("label", "finding"), CASES, ids=[one[0] for one in CASES])
    def test_the_sentence_is_never_three_sentences(
        self, label: str, finding: Finding
    ) -> None:
        #: `findings-voice.md`, « The shape »: a headline and one detail
        #: sentence, « Never three sentences ». A fold's roster of other
        #: cells is not a third sentence — it belongs in `cells`.
        said = plain_words(finding)
        sentences = [one for one in said.split(". ") if one.strip()]

        assert len(sentences) <= 2, f"{label}: {said}"

    def test_every_rule_in_the_catalogue_has_a_case_here(self) -> None:
        #: The guard on this file's own completeness. A rule added to
        #: the engine without a case here would be a rule nobody scored,
        #: and it would pass by being absent.
        covered = {label.split("/")[0] for label, _ in CASES}

        assert set(RULE_NAMES) - covered == set(), sorted(set(RULE_NAMES) - covered)


# --- the statement checks, which write their own sentence ---------------
#
# `plain_words` never sees these: `run_analytics` composes the claim
# where the measured values are in scope, and `service` puts it on the
# screen unchanged. So the gate has to run the real checks and score
# what they actually wrote — which is how « The model's own check row …
# reports 1.234e+06 » was found, scientific notation and all.


def _analytic_findings() -> list[tuple[str, object]]:
    """One real finding per statement check, from the real checks."""
    from decimal import Decimal

    from polar.tieout.analytics import run_analytics
    from polar.tieout.structure import read_structure
    from polar.tieout.workbook import Cell, Workbook

    def cell(sheet, ref, row, column, *, value=None, row_label="", column_label=""):
        return Cell(
            sheet=sheet,
            ref=f"{sheet}!{ref}",
            row=row,
            column=column,
            value=value,
            formula=None,
            row_label=row_label,
            column_label=column_label,
        )

    def axis(sheet, count, first=2020):
        return [
            cell(sheet, f"H{i}1", 1, i + 3, column_label=f"FY{first + i}")
            for i in range(count)
        ]

    def row(sheet, at, values, label, first=2020):
        return [
            cell(
                sheet,
                f"C{i}{at}",
                at,
                i + 3,
                value=Decimal(str(v)),
                row_label=label,
            )
            for i, v in enumerate(values)
        ]

    def run(cells):
        book = Workbook(
            cells={one.ref: one for one in cells},
            sheets=sorted({one.sheet for one in cells}),
        )
        return run_analytics(book, read_structure(book)).findings

    #: Debt machinery, so the debt pair locates at all.
    machinery = [
        cell("Debt", "A2", 2, 3, row_label="Drawdown"),
        cell("Debt", "A3", 3, 3, row_label="Repayment"),
        cell("Debt", "A4", 4, 3, row_label="Interest"),
    ]
    opening = [100, 90, 80, 70, 60, 50, 40]
    steady = [v * 0.05 for v in opening]
    spiked = list(steady)
    spiked[3] = opening[3] * 0.25

    scenes = {
        "model-own-check": axis("S", 6)
        + row("S", 5, [0, 0, 0, 0, 0, 50.92], "BS Check"),
        "balance-sheet": axis("BS", 5)
        + row("BS", 20, [10, 20, 30, 40, 50], "Net assets")
        + row("BS", 24, [10, 20, 30, 40, 51.5], "Total equity"),
        "time-axis": [
            cell("S", f"H{i}1", 1, i + 3, column_label=label)
            for i, label in enumerate(
                ["FY2024", "FY2025", "FY2023", "FY2026", "FY2027"]
            )
        ],
        "cash-continuity": axis("S", 6)
        + row("S", 10, [0, 10, 999, 30, 40, 50], "DSRA opening balance")
        + row("S", 14, [10, 20, 30, 40, 50, 60], "DSRA closing balance"),
        "debt-terminal": axis("Debt", 6)
        + machinery
        + row("Debt", 10, [100, 80, 60, 40, 20, 4.2], "Senior loan opening balance")
        + row("Debt", 14, [100, 80, 60, 40, 20, 4.2], "Senior loan closing balance"),
        "interest-consistency": axis("Debt", 7, first=2018)
        + machinery
        + row("Debt", 10, opening, "Senior loan opening balance", first=2018)
        + row("Debt", 12, spiked, "Senior loan interest", first=2018)
        + row("Debt", 14, opening, "Senior loan closing balance", first=2018),
    }

    out: list[tuple[str, object]] = []
    for rule, cells in scenes.items():
        fired = [one for one in run(cells) if one.rule == rule]
        assert fired, f"the scene for {rule} raised nothing to score"
        out.append((rule, fired[0]))
    return out


ANALYTIC_CASES = _analytic_findings()


class TestTheStatementChecksSentences:
    """The six analytical checks, scored on what they really wrote."""

    @pytest.mark.parametrize(
        ("rule", "claim"),
        ANALYTIC_CASES,
        ids=[one[0] for one in ANALYTIC_CASES],
    )
    def test_it_keeps_the_house_style(self, rule: str, claim) -> None:
        broke = style.errors(style.check(claim.detail))

        assert broke == [], f"{rule}: {claim.detail}\n  " + "\n  ".join(
            f"« {one.found} » — {one.say}" for one in broke
        )

    @pytest.mark.parametrize(
        ("rule", "claim"),
        ANALYTIC_CASES,
        ids=[one[0] for one in ANALYTIC_CASES],
    )
    def test_it_reads_at_the_founders_bar(self, rule: str, claim) -> None:
        said = claim.detail
        bare = said.replace(claim.row_label, "X") if claim.row_label else said
        reading = style.readability(bare)

        assert reading.grade <= style.GRADE_CEILING, (
            f"{rule}: grade {reading.grade:.1f} — {said}"
        )

    @pytest.mark.parametrize(
        ("rule", "claim"),
        ANALYTIC_CASES,
        ids=[one[0] for one in ANALYTIC_CASES],
    )
    def test_it_prints_no_number_the_engine_talks_to_itself_in(
        self, rule: str, claim
    ) -> None:
        #: « reports 1.234e+06 » reached a screen. `shown_number` is the
        #: one printer, and every figure in these sentences goes through
        #: it — so an exponent here means one was written by hand again.
        #: The checker carries the same rule, so chat answers are held to
        #: it too; this asserts it on the sentence the engine wrote.
        assert not re.search(r"\d[eE][+-]\d", claim.detail), f"{rule}: {claim.detail}"

    @pytest.mark.parametrize(
        ("rule", "claim"),
        ANALYTIC_CASES,
        ids=[one[0] for one in ANALYTIC_CASES],
    )
    def test_it_is_never_three_sentences(self, rule: str, claim) -> None:
        sentences = [one for one in claim.detail.split(". ") if one.strip()]

        assert len(sentences) <= 2, f"{rule}: {claim.detail}"

    def test_every_statement_check_has_a_case_here(self) -> None:
        from polar.tieout.analytics import ANALYTIC_RULE_NAMES

        covered = {rule for rule, _ in ANALYTIC_CASES}

        assert set(ANALYTIC_RULE_NAMES) - covered == set(), sorted(
            set(ANALYTIC_RULE_NAMES) - covered
        )
