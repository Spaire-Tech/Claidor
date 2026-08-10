"""Reading a model as labelled rows rather than as coordinates."""

from pathlib import Path

import pytest

from polar.tieout.model import read_outputs
from polar.tieout.provenance import chain, outputs_from_workbook, verify_outputs
from polar.tieout.workbook import precedents_of, read_workbook

CASCADE = Path(__file__).resolve().parents[2] / "scripts" / "cascade"
MODEL = str(CASCADE / "cascade_model.xlsx")


@pytest.fixture(scope="module")
def book():
    return read_workbook(MODEL)


def test_a_cell_is_named_by_its_row_and_its_period(book) -> None:
    """« Model!D26 » means nothing; « FY2025A Adjusted EBITDA » is the
    same shape of name an Outputs row carries, which is what lets one
    matcher serve a published interface and a raw workbook alike."""
    assert book.get("Model!D26").name == "FY2025A Adjusted EBITDA"
    assert book.get("Model!D16").name == "FY2025A Reported EBITDA"
    assert book.get("Comps!F13").name == "EV / EBITDA Median"


def test_a_bridge_under_a_forecast_grid_does_not_inherit_its_years(book) -> None:
    """DCF rows 6-9 are a five-year series under FY2026E…FY2030E; rows
    13-21 are a valuation bridge in one column. Reading the header down
    the page makes the enterprise value claim to be about FY2026E."""
    assert book.get("DCF!B9").name == "FY2026E Present value of FCF"
    assert book.get("DCF!B16").name == "Enterprise value"
    assert book.get("DCF!B21").name == "Implied value per share"


def test_an_indented_row_belongs_to_the_one_above(book) -> None:
    assert book.get("Model!D27").name == "FY2025A Adjusted EBITDA margin %"


def test_a_cell_that_only_restates_another_is_an_alias(book) -> None:
    """`Comps!B18` is `=Model!D26`. Left in the candidate set it gives
    « FY2025A adjusted EBITDA » two homes with one value, which is the
    ambiguity the matcher is built to refuse."""
    assert book.get("Comps!B18").alias_of == "Model!D26"
    assert book.get("Model!D30").alias_of == "Model!D26"
    assert book.get("Model!D26").alias_of is None
    assert book.get("Comps!B20").alias_of is None


def test_precedents_come_from_the_formula() -> None:
    assert precedents_of("=D16+D24", "Model") == ("Model!D16", "Model!D24")
    assert precedents_of("=SUM(D20:D23)", "Model") == tuple(
        f"Model!D{row}" for row in range(20, 24)
    )
    assert precedents_of("=B16/Model!D26", "DCF") == ("DCF!B16", "Model!D26")
    assert precedents_of("=1/(1+Assumptions!$B$19)^B7", "DCF") == (
        "Assumptions!B19",
        "DCF!B7",
    )


def test_a_hardcoded_input_is_the_end_of_the_chain(book) -> None:
    assert book.get("Assumptions!B19").hardcoded is True
    assert book.get("Model!D26").hardcoded is False
    assert chain(book, "Assumptions!B19") == "Assumptions!B19 = 0.098 (input)"


def test_the_chain_reads_as_a_sentence(book) -> None:
    assert chain(book, "Model!D26") == (
        "Model!D26 = 48.9, =D16+D24 = Reported EBITDA 41.2, Total adjustments 7.7"
    )


def test_the_chain_drops_what_the_reader_already_knows(book) -> None:
    """Model!E37's five precedents are all « FY2026E unlevered free cash
    flow » something. Printed in full that is the same eight words six
    times over, which buries the four that differ."""
    assert chain(book, "Model!E37").endswith(
        "= EBIT 40.69, Taxes on EBIT -10.17, Add back D&A 10.49, "
        "Capital expenditure -9.21, and 1 more"
    )


def test_the_outputs_tab_is_a_link_in_the_chain_not_the_end_of_it(book) -> None:
    """Four of Cascade's twenty-three source references point one row
    above the figure they name — the values are right, the pointers are
    stale, and a banker sent to Model!D25 finds an empty cell."""
    problems = {p.ref: p for p in verify_outputs(read_outputs(MODEL), book)}
    assert set(problems) == {"O5", "O6", "O8", "O10"}
    assert problems["O5"].claimed == "Model!D25"
    assert problems["O5"].found is None
    assert problems["O5"].actual == "Model!D26"
    assert problems["O6"].claimed == "Model!D26"
    assert problems["O6"].actual == "Model!D27"


def test_a_reference_citing_several_cells_is_not_a_claim_about_one(book) -> None:
    """O11's source is « Model!D6, I6 » — a CAGR derived from two cells.
    Reading the first of them and finding revenue rather than a growth
    rate reports a correct row as broken."""
    assert "O11" not in {p.ref for p in verify_outputs(read_outputs(MODEL), book)}


def test_a_repair_needs_the_name_as_well_as_the_value(book) -> None:
    """Four cells in the model hold 48.9. Only one of them is called
    adjusted EBITDA, and a repair proposed on the value alone would be the
    same mistake as a checker that links on values."""
    problem = next(
        p for p in verify_outputs(read_outputs(MODEL), book) if p.ref == "O5"
    )
    assert "named for it" in problem.how


def test_the_workbook_offers_far_more_than_the_interface_does(book) -> None:
    assert len(read_outputs(MODEL)) == 23
    assert len(outputs_from_workbook(book)) > 250
    assert not any(
        candidate.ref.startswith("Outputs!")
        for candidate in outputs_from_workbook(book)
    )
