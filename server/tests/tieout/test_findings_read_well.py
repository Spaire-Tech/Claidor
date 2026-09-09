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


#: One case per branch the engine actually has, carrying the fields
#: that branch reads. **Both sentences are scored**: `plain_words`
#: writes the headline and `detail` is the finding's second sentence,
#: and until this round only the first was gated — which is how « … the
#: same formula as its 19 siblings with one pinned reference out of
#: step — they read 'Control Panel'!$C$51, it reads $D$51:
#: =(E45+E48)/2*… » kept reaching a person when they expanded the card.
CASES: list[tuple[str, Finding]] = [
    ("error-value", f("error-value", detail="The cell shows #REF!.")),
    (
        "error-value/torn",
        f(
            "error-value",
            figure="6",
            figure_unit="cells sharing one broken formula",
            detail="One broken formula, repeated over the block, from E10 to E21.",
            formula="=Inputs!#REF!",
        ),
    ),
    (
        "error-value/live",
        f(
            "error-value",
            figure_unit="#REF! breaks a live column",
            kind="breaks a live column",
            detail="Values resume at E13.",
        ),
    ),
    (
        "error-value/tails",
        f(
            "error-value",
            figure="40",
            figure_unit="cells past the data's edge",
            detail="« Debt Schedule » carries #N/A past its data's edge.",
        ),
    ),
    (
        "error-value/sheets",
        f(
            "error-value",
            figure="#REF!",
            figure_unit="repeated on 5 sheets",
            detail="The same formula sits on 5 sheets: A, B, C.",
        ),
    ),
    (
        "external-link",
        f(
            "external-link",
            figure="3",
            detail="It reads another workbook, [1], in 3 cells of « Ops ».",
            formula="=[1]Outputs!C2",
        ),
    ),
    (
        "external-link/one",
        f(
            "external-link",
            figure="1",
            detail="It reads another workbook, [1], at Ops!B2.",
            formula="=[1]Outputs!C2",
        ),
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
            detail="Excel stores #REF! where its target used to be (Tax_Rate).",
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
            figure_unit="adds up one month where the row adds all 12",
            kind="one period out of pattern",
            detail="This year carries one month's figure.",
            cells="Annual!G41, Annual!H41",
        ),
    ),
    (
        "broken-aggregation/stock",
        f(
            "broken-aggregation",
            name="Cash Balance",
            figure_unit="takes the wrong month",
            kind="one period out of pattern",
            detail="Everywhere else the row takes each year's last month.",
        ),
    ),
    (
        "volatile",
        f(
            "volatile",
            figure_unit="uses INDIRECT",
            detail="It uses INDIRECT, which Excel works out again on every change.",
            formula="=INDIRECT($C$4)",
        ),
    ),
    (
        "volatile/fold",
        f(
            "volatile",
            figure_unit="in 4 places",
            detail="It uses INDIRECT. The same one sits in 4 cells of this row.",
        ),
    ),
    (
        "long-formula",
        f(
            "long-formula",
            figure_unit="267 characters long",
            kind="one long formula",
            detail="The formula runs to 267 characters.",
            formula="=IF(E2<1,0,MIN(E3*12,E4))",
        ),
    ),
    (
        "long-formula/fold",
        f(
            "long-formula",
            figure_unit="in 4 places",
            detail="The formula runs to 267 characters. The same one sits in 4 cells.",
        ),
    ),
    (
        "long-formula/all",
        f(
            "long-formula",
            severity="smell",
            name="",
            kind="every long formula",
            figure_unit="81 formulas across 3 places",
            detail="Hand-checking them is impractical; nothing is known to be wrong.",
            cells="Assumptions Processing!E23, Assumptions Processing!E37",
        ),
    ),
    (
        "long-formula/sheets",
        f(
            "long-formula",
            figure_unit="repeated on 5 sheets",
            detail="The formula runs to 267 characters.",
        ),
    ),
    (
        "hardcode-in-formula",
        f(
            "hardcode-in-formula",
            figure="240000",
            detail="240000 sits inside the formula rather than in an input cell.",
            formula="=IF(E2<1,0,MIN(240000,E4))",
        ),
    ),
    (
        "hardcode-in-formula/sheets",
        f(
            "hardcode-in-formula",
            figure="240000",
            figure_unit="repeated on 5 sheets",
            detail="240000 sits inside the formula. The same formula sits on 5 sheets.",
        ),
    ),
    (
        "hardcode-in-formula/own-numbers",
        f(
            "hardcode-in-formula",
            figure="240000",
            figure_unit="repeated on 5 sheets, each with its own number",
            detail="240000 sits inside the formula. The same decision sits on 5 sheets.",
        ),
    ),
    (
        "hardcode-in-formula/convention",
        f(
            "hardcode-in-formula",
            figure="0.7",
            figure_unit="in 5 formulas on one sheet",
            detail="0.7 is written into 5 different formulas rather than held in one cell.",
        ),
    ),
    (
        "typed-over-formula",
        f(
            "typed-over-formula",
            detail="The cell holds a typed 19,100 where the rest of the series calculates.",
            against="=E41*1.03",
        ),
    ),
    (
        "typed-over-formula/row",
        f(
            "typed-over-formula",
            figure_unit="one value typed across 12 cells",
            kind="one value across a row",
            detail="It was one paste.",
            cells="E12, F12, G12",
        ),
    ),
    (
        "typed-over-formula/run",
        f(
            "typed-over-formula",
            figure_unit="4 values typed across 4 cells",
            kind="a run of values",
            detail="It was one paste, and each cell holds its own number.",
            cells="E12, F12, G12, H12",
        ),
    ),
    (
        "typed-over-formula/block",
        f(
            "typed-over-formula",
            figure_unit="typed over a block 3 columns wide and 4 rows deep, E12 to G15",
            kind="typed over a block",
            detail="One paste went over the block's formulas.",
        ),
    ),
    (
        "typed-over-formula/places",
        f(
            "typed-over-formula",
            figure_unit="typed over in 3 places",
            kind="typed over down a column",
            detail="Every other cell in those rows calculates.",
            cells="E12, E40, E77",
        ),
    ),
    (
        "anchored-elsewhere",
        f(
            "anchored-elsewhere",
            name="Adjustment Factor phasing",
            figure="5",
            figure_unit="cells read the switch of « K Correction Factor phasing »",
            detail=(
                "The row « K Correction Factor phasing » reads its own, so this "
                "answer holds only while I474 and I472 agree."
            ),
            formula="=IF($I$474=1,$AU$471/5,AT10*$AU$471)",
            against="=IF($I$474=1,$AU$473/5,AT10*$AU$473)",
        ),
    ),
    (
        "formula-overwritten/link",
        f(
            "formula-overwritten",
            name="Switch - QAA reward/(penalty)",
            kind="one",
            figure="2",
            figure_unit="typed where the version before held a formula",
            detail=(
                "The cell it used to read now holds 1, so this one will not follow it."
            ),
            formula="2",
            against="=F_Inputs!T1586",
        ),
    ),
    (
        "formula-overwritten/row",
        f(
            "formula-overwritten",
            name="Ofwat - Ordinary shares issued",
            kind="row",
            figure="5",
            figure_unit="cells typed over the version before's formulas",
            detail="They will not follow their inputs any more.",
            cells="N2191, O2191, P2191, Q2191, R2191",
        ),
    ),
    (
        "typed-over-edge",
        f(
            "typed-over-edge",
            detail="The series holds a typed 19,100 at its end where the rest of it calculates.",
            against="=E41*1.03",
        ),
    ),
    (
        "typed-over-beat",
        f(
            "typed-over-beat",
            figure="19,100",
            figure_unit="typed into a beat of 3 columns",
            kind="typed into a beat",
            detail="The rest of the row calculates on this beat; this cell holds a typed number.",
            formula="19100",
            against="=E41*1.03",
        ),
    ),
    (
        "range-over-block",
        f(
            "range-over-block",
            detail="Those rows are already added by the total at E40, so they count twice.",
            formula="=SUM(E30:E45)",
            against="=SUM(E30:E39)",
        ),
    ),
    (
        "range-over-block/smell",
        f(
            "range-over-block",
            severity="smell",
            detail="The range reaches past the block it should cover.",
        ),
    ),
    (
        "inconsistent-total",
        f(
            "inconsistent-total",
            detail="The 5 totals beside it at E12 are built the same way as each other.",
            formula="=SUM(E30:E45)",
            against="=SUM(E30:E39)",
        ),
    ),
    (
        "inconsistent-anchoring",
        f(
            "inconsistent-anchoring",
            detail="This cell locks its references differently from the rest of the row.",
            formula="=$E$41*1.03",
            against="=E41*1.03",
        ),
    ),
    (
        "inconsistent-row",
        f(
            "inconsistent-row",
            detail="This cell is built differently from the rest of the series.",
            formula="=E41*1.03",
        ),
    ),
    (
        "inconsistent-row/operator",
        f(
            "inconsistent-row",
            kind="one operator changed",
            detail=(
                "The other 19 cells in the row use + here. This one uses -, "
                "so its answer moves the wrong way."
            ),
            formula="=E45-E48",
        ),
    ),
    (
        "inconsistent-row/reference",
        f(
            "inconsistent-row",
            kind="one reference out of step",
            detail=(
                "The other 19 cells in the row read Control Panel!C51. "
                "This one reads Control Panel!D51."
            ),
            formula="=(E45+E48)/2*'Control Panel'!$D$51",
        ),
    ),
    (
        "inconsistent-row/switch",
        f(
            "inconsistent-row",
            kind="a different switch setting",
            detail="The other 12 cells in the row test 1, 2. This one tests 3.",
            formula="=IF($C$9=3,E41,0)",
        ),
    ),
    (
        "inconsistent-row/column",
        f(
            "inconsistent-row",
            figure_unit="3 rows broken in column E",
            kind="rows broken in one column",
            detail="Every row here reads one place and its column E cell another.",
            cells="E5, E9, E13",
        ),
    ),
    (
        "circular",
        f("circular", detail="The loop runs through 4 cells and back to this one."),
    ),
    (
        "circular/loops",
        f(
            "circular",
            figure="88",
            figure_unit="cells in 22 identical loops",
            detail="The same loop is repeated on every asset block.",
        ),
    ),
    (
        "skipped-cell",
        f(
            "skipped-cell",
            figure="12.5m",
            detail=(
                "The sum starts below E40, worth 12.5m together, so every "
                "number built on this total is out by that amount."
            ),
            formula="=SUM(E37:E37)",
        ),
    ),
    (
        "skipped-cell/row",
        f(
            "skipped-cell",
            figure="377.1m",
            figure_unit="filled across Year 2–Year 20",
            detail=(
                "The sum starts below the same row in every period; 37.5m of "
                "it is in Year 2 alone. One formula, filled across 19 cells, "
                "so every period's total is out by its own share."
            ),
            formula="=SUM(F37:F37)",
            cells=", ".join(
                f"Assumptions Processing!{c}41" for c in "FGHIJKLMNOPQRSTUVWX"
            ),
        ),
    ),
    (
        "skipped-cell/nofigure",
        f(
            "skipped-cell",
            detail=(
                "The sum starts below E40, which it should cover, so nothing "
                "built on this total counts that row."
            ),
            formula="=SUM(E37:E37)",
        ),
    ),
    (
        "gapped-test",
        f(
            "gapped-test",
            figure="7",
            figure_unit="skipped cells hold numbers",
            detail="It tests 12 cells one at a time and skips E30 to E36.",
            formula="=IF(E10<0,1,0)",
        ),
    ),
    (
        "currency-mismatch",
        f(
            "currency-mismatch",
            figure="GBP, EUR",
            figure_unit="the currencys added together in one sum",
            detail="The terms of this sum do not agree on their currency.",
            formula="=SUM(E10:E20)+F30",
        ),
    ),
    (
        "scale-mismatch",
        f(
            "scale-mismatch",
            figure="thousands, millions",
            figure_unit="the scales added together in one sum",
            detail="The terms of this sum do not agree on their scale.",
            formula="=SUM(E10:E20)+F30",
        ),
    ),
    (
        "hidden-sheet/empty",
        f(
            "hidden-sheet",
            name="Module1",
            figure_unit="« Module1 » is very hidden but empty",
            kind="a hidden sheet",
            detail="Nothing in the model reads it — safe to delete.",
        ),
    ),
    (
        "hidden-sheet/unread",
        f(
            "hidden-sheet",
            name="Module1",
            figure_unit="« Module1 » is very hidden and has not been read",
            kind="a hidden sheet",
            detail="It does not appear in Excel's unhide menu.",
        ),
    ),
    (
        "hidden-sheet/plain",
        f(
            "hidden-sheet",
            name="Workings",
            figure_unit="« Workings » is hidden",
            kind="a hidden sheet",
            detail="It is in the workbook, one right-click away from visible.",
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

        #: A number or an error token may open a sentence — the
        #: founder's own edge case is « Total Revenue misses 4 rows »,
        #: and « #REF! breaks a column » names the thing a person sees.
        #: What may not open one is a bare cell address, and `CellFirst`
        #: is the rule that catches that.
        assert said, label
        assert said[0].isupper() or said[0] in "«\"'#0123456789", f"{label}: {said}"
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

    #: The convention check reads formulas and row labels, so its scene
    #: is built by hand: a line the models we hold compute one way
    #: (« discounted closing rav » = closing RAV × the discount factor,
    #: 21 of 21 files across three families), computed here by adding.
    def formula_cell(sheet, ref, row, column, formula, row_label):
        return Cell(
            sheet=sheet,
            ref=f"{sheet}!{ref}",
            row=row,
            column=column,
            value=None,
            formula=formula,
            row_label=row_label,
            column_label="",
        )

    convention_scene = (
        row("RAV", 2, [100, 110, 120], "Closing RAV")
        + row("RAV", 3, [0.9, 0.8, 0.7], "Single year discount factor")
        + [
            formula_cell(
                "RAV", f"{col}4", 4, i + 3, f"={col}2+{col}3", "Discounted closing RAV"
            )
            for i, col in enumerate("CDE")
        ]
    )

    out: list[tuple[str, object]] = []
    book = Workbook(
        cells={one.ref: one for one in convention_scene},
        sheets=["RAV"],
    )
    book.row_words = {
        "RAV": {
            2: "Closing RAV",
            3: "Single year discount factor",
            4: "Discounted closing RAV",
        }
    }
    fired = [
        one
        for one in run_analytics(book, read_structure(book)).findings
        if one.rule == "convention"
    ]
    assert fired, "the scene for convention raised nothing to score"
    out.append(("convention", fired[0]))
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


class TestTheSecondSentence:
    """The detail — what the card shows when a person expands it.

    **This is the surface that was never gated.** The headline went
    through `plain_words` and through this file; `detail` went straight
    from the engine to the screen. The founder expanded a finding on
    their own model and read:

        the same formula as its 19 siblings with one pinned reference
        out of step — they read 'Control Panel'!$C$51, it reads
        'Control Panel'!$D$51: =(E45+E48)/2*'Control Panel'!$D$51

    Two banned words, two cell references and a formula, in one clause,
    on the field the title had been carefully kept clear of.

    `findings-voice.md` is explicit about the shape: « Every finding is
    two sentences. 1. Headline … 2. Detail — one sentence with the
    mechanism or the evidence. » So the detail is a *sentence*, held to
    the same rules, and the formulas live in `formula` and `against`
    where a screen can print them as formulas.
    """

    @pytest.mark.parametrize(("label", "finding"), CASES, ids=[o[0] for o in CASES])
    def test_it_keeps_the_house_style(self, label: str, finding: Finding) -> None:
        broke = style.errors(style.check(finding.detail))

        assert broke == [], f"{label}: {finding.detail}\n  " + "\n  ".join(
            f"« {one.found} » — {one.say}" for one in broke
        )

    @pytest.mark.parametrize(("label", "finding"), CASES, ids=[o[0] for o in CASES])
    def test_it_is_a_sentence(self, label: str, finding: Finding) -> None:
        said = finding.detail.strip()

        assert said, label
        assert said[0].isupper() or said[0] in "«\"'#0123456789", f"{label}: {said}"
        assert said.endswith((".", "!", "?")), f"{label}: {said}"

    @pytest.mark.parametrize(("label", "finding"), CASES, ids=[o[0] for o in CASES])
    def test_it_carries_no_formula(self, label: str, finding: Finding) -> None:
        #: The rule this whole class exists for. A formula in a sentence
        #: is a formula nobody reads; `formula` and `against` are where
        #: it goes, and the screen prints those as formulas.
        assert not re.search(r"=[A-Z]{2,}\(", finding.detail), (
            f"{label}: {finding.detail}"
        )
        assert not re.search(r"=[A-Z]{1,3}\d+[*+/-]", finding.detail), (
            f"{label}: {finding.detail}"
        )
        assert "`" not in finding.detail, f"{label}: {finding.detail}"

    @pytest.mark.parametrize(("label", "finding"), CASES, ids=[o[0] for o in CASES])
    def test_the_whole_finding_reads_at_the_founders_bar(
        self, label: str, finding: Finding
    ) -> None:
        """Both sentences together, which is how a person reads them.

        The unit is the finding, not the field: « Every finding is two
        sentences », and a headline that scores 6 beside a detail that
        scores 12 is not a finding anybody wants. The row label is held
        out for the reason given above — it is the model's naming, not
        the engine's writing.
        """
        whole = f"{plain_words(finding)} {finding.detail}"
        bare = whole.replace(finding.name, "X") if finding.name else whole
        reading = style.readability(bare)

        assert reading.grade <= style.GRADE_CEILING, (
            f"{label}: grade {reading.grade:.1f} — {whole}"
        )

    @pytest.mark.parametrize(("label", "finding"), CASES, ids=[o[0] for o in CASES])
    def test_the_two_sentences_do_not_repeat_each_other(
        self, label: str, finding: Finding
    ) -> None:
        #: The card shows both. When the headline is built by splicing
        #: the detail into it, the reader gets the same words twice —
        #: which is what « things are duplicated » was about.
        said = plain_words(finding).strip()

        assert finding.detail.strip() not in said, f"{label}: {said}"


class TestEveryFindingSaysWhatItCosts:
    """« Make the consequence mandatory. A finding with no second half
    isn't finished. » Four findings told the reader what it cost them
    and five just stated a fact. Every case here must carry the second
    half — a cue that says what follows from the fact."""

    CUES = (
        "so ",
        "breaks",
        "will not",
        "cannot",
        "would pass",
        "would change",
        "counted twice",
        "count twice",
        "never",
        "safe to delete",
        "ask",
        "stale",
        "builds on",
        "does not",
        "not tested",
        "carries",
        "impractical",
        "wrong",
        "differs",
        "moves",
        "one paste",
        "typed",
        "calculates",
        "the same",
        "worked out",
        "does not appear",
        "one right-click",
        "read",
    )

    @pytest.mark.parametrize(("label", "finding"), CASES, ids=[o[0] for o in CASES])
    def test_the_two_sentences_carry_a_consequence(
        self, label: str, finding: Finding
    ) -> None:
        whole = f"{plain_words(finding)} {finding.detail}".lower()
        assert any(cue in whole for cue in self.CUES), f"{label}: {whole}"
