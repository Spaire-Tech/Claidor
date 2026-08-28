"""The declared version: an input, not an output of the diff.

Size and cadence both group transitions by something the diff or the
clock produced. This reads what the author said before the change
existed — so the tests here are about *reading faithfully* and
*refusing plainly*, never about a threshold, because there is none.
"""

from decimal import Decimal

from polar.tieout.watch.version import (
    FAMILY,
    MAJOR,
    MINOR,
    NONE,
    PATCH,
    UNDECLARED,
    UNKNOWN,
    Declaration,
    declared_version,
    step,
)
from polar.tieout.workbook import Cell


def cell(ref: str, value: object, label: str = "", column_label: str = "") -> Cell:
    sheet = ref.split("!")[0]
    return Cell(
        sheet=sheet,
        ref=ref,
        row=1,
        column=1,
        value=Decimal(str(value)) if isinstance(value, (int, float)) else None,
        formula=None,
        row_label=label,
        column_label=column_label,
    )


def book(cells: list[Cell]) -> dict[str, Cell]:
    return {one.ref: one for one in cells}


class TestReadingTheDeclaration:
    def test_a_labelled_cell_wins(self) -> None:
        cells = book([cell("Summary!C3", None, label="github release: v0.1.6")])
        found = declared_version(cells, "anything_v9.xlsx")
        assert found.version == "v0.1.6"
        assert found.where == "Summary!C3"

    def test_the_filename_is_the_fallback(self) -> None:
        found = declared_version(book([]), "v2_2023-07-14.xlsx")
        assert found.version == "v2"
        assert found.where == "filename"

    def test_a_model_that_declares_nothing_is_refused_not_guessed(self) -> None:
        found = declared_version(book([cell("M!A1", 5, label="Revenue")]), "model.xlsx")
        assert not found.declared
        assert found.where == ""

    def test_a_versionish_label_without_a_version_does_not_match(self) -> None:
        cells = book([cell("M!A1", None, label="Version history")])
        assert not declared_version(cells, "model.xlsx").declared


class TestTheStep:
    def make(self, text: str) -> Declaration:
        return Declaration(text, "Summary!C3")

    def test_identical_declarations_are_no_step(self) -> None:
        assert step(self.make("v0.1.6"), self.make("v0.1.6")) == NONE

    def test_the_three_dotted_steps(self) -> None:
        assert step(self.make("0.1.6"), self.make("0.1.7")) == PATCH
        assert step(self.make("0.1.6"), self.make("0.2.0")) == MINOR
        assert step(self.make("0.1.6"), self.make("1.0.0")) == MAJOR

    def test_a_build_suffix_is_the_smallest_step_there_is(self) -> None:
        """« updates binaries for v0.1.6 to v0.1.6-b » — the numerals
        agree and the strings do not."""
        assert step(self.make("v0.1.6"), self.make("v0.1.6-b")) == PATCH

    def test_a_bare_numeral_scheme_can_only_say_family(self) -> None:
        assert step(self.make("v2"), self.make("v3")) == FAMILY
        assert step(self.make("v2"), self.make("v2")) == NONE

    def test_an_undeclared_side_is_undeclared_never_unknown(self) -> None:
        assert step(Declaration("", ""), self.make("v2")) == UNDECLARED

    def test_two_schemes_that_do_not_meet_are_unknown(self) -> None:
        assert step(self.make("v2"), self.make("0.1.6")) == UNKNOWN


class TestWhatTheCorpusCaughtAndTheTestsDidNot:
    """Ten of `hickeng/financial`'s sixteen workbooks came back
    declaring « 42036 » — an Excel date serial under a column labelled
    *Release Date*. Every step computed from it was fiction. Both
    halves of the fix are pinned here."""

    def test_a_release_date_does_not_declare_a_version(self) -> None:
        cells = book(
            [cell("RSU!C10", 42036, label="00029420", column_label="Release Date")]
        )
        assert not declared_version(cells, "model.xlsx").declared

    def test_a_bare_integer_is_not_a_version(self) -> None:
        cells = book([cell("M!C10", 42036, label="Version")])
        assert not declared_version(cells, "model.xlsx").declared

    def test_a_v_prefix_or_a_dot_is_what_counts(self) -> None:
        assert (
            declared_version(book([cell("M!C1", None, label="Version v7")]), "").version
            == "v7"
        )
        assert (
            declared_version(
                book([cell("M!C1", None, label="Version 1.4")]), ""
            ).version
            == "1.4"
        )
