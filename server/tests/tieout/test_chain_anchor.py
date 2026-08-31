"""D4's registered measurement: eight planted revisions, one table.

The Scribe log registered the expectation for each case **before this
file existed**, and each assertion below is that row. Revisions are
planted for real — the workbook is rebuilt with the change and read
back through the engine's own reader, so « a row was inserted above
the linked cell » means exactly that and not a rearranged tuple.

The property under test is the one the whole track rests on: after a
person confirms a pair, finding it again is exact-key lookup and
saying whether it still holds is arithmetic. Nothing here proposes,
matches, or calls a model.
"""

from decimal import Decimal
from pathlib import Path

import pytest

from polar.tieout.chain.anchor import (
    AGREES,
    BOTH_MOVED,
    MODEL_MOVED,
    SOURCE_MOVED,
    Ambiguous,
    Anchored,
    Broken,
    DocumentAnchor,
    ModelAnchor,
    reanchor_document,
    reanchor_model,
    recheck,
    with_ordinals,
)

#: The confirmed pair every case starts from: a unitary charge a person
#: vouched for, printed in the contract and typed into the model.
CONFIRMED_MODEL = ModelAnchor(
    ref="Model!B2", cell_name="Unitary Charge", value=Decimal("3.741")
)
CONFIRMED_DOCUMENT = DocumentAnchor(
    page=4,
    printed_text="3.741",
    value=3.741,
    anchor_line="Schedule 1 The Unitary Charge is 3.741",
    ordinal_in_line=2,
)


def _workbook(tmp_path: Path, rows, sheet: str = "Model") -> Path:
    """A model with one label column and one value column."""
    from openpyxl import Workbook

    book = Workbook()
    page = book.active
    page.title = sheet
    for index, (label, value) in enumerate(rows, start=1):
        page[f"A{index}"] = label
        page[f"B{index}"] = value
    path = tmp_path / "model.xlsx"
    book.save(str(path))
    return path


def _cells(path: Path):
    """(ref, name, value) through the engine's own reader."""
    from polar.models.tieout import ArtifactKind
    from polar.tieout.ingest import read_artifact

    got = read_artifact(path.read_bytes(), path.name, ArtifactKind.model)
    return [(cell.ref, cell.name, cell.value) for cell in got.cells]


BASE_ROWS = [("Revenue", 100.0), ("Unitary Charge", 3.741), ("Margin", 3.349)]


@pytest.fixture(autouse=True)
def _needs_openpyxl():
    pytest.importorskip("openpyxl")


# --- the model side ------------------------------------------------------


def test_a_row_inserted_above_moves_the_ref_and_keeps_the_link(tmp_path) -> None:
    """Registered: survived; ref changes; agrees.

    The classic. Somebody adds a line above the confirmed cell and
    every address below it shifts — the exact failure that made
    « anchor by name » the rule in the first place.
    """
    revised = _workbook(tmp_path, [("Indexation", 22.0), *BASE_ROWS])

    outcome = reanchor_model(CONFIRMED_MODEL, _cells(revised))

    assert isinstance(outcome, Anchored)
    assert outcome.key == "Model!B3"  # was B2
    assert outcome.relocated is True
    assert outcome.how == "name"
    verdict, ties_out = recheck(
        CONFIRMED_MODEL, CONFIRMED_DOCUMENT, outcome.value, 3.741
    )
    assert verdict == AGREES
    assert ties_out is True


def test_an_edited_value_survives_and_reads_as_the_model_moving(tmp_path) -> None:
    """Registered: survived; the model moved."""
    revised = _workbook(
        tmp_path, [("Revenue", 100.0), ("Unitary Charge", 3.905), ("Margin", 3.349)]
    )

    outcome = reanchor_model(CONFIRMED_MODEL, _cells(revised))

    assert isinstance(outcome, Anchored)
    verdict, ties_out = recheck(
        CONFIRMED_MODEL, CONFIRMED_DOCUMENT, outcome.value, 3.741
    )
    assert verdict == MODEL_MOVED
    assert ties_out is False


def test_a_deleted_cell_breaks_the_link_in_words(tmp_path) -> None:
    """Registered: broken (model side, in words)."""
    revised = _workbook(tmp_path, [("Revenue", 100.0), ("Margin", 3.349)])

    outcome = reanchor_model(CONFIRMED_MODEL, _cells(revised))

    assert isinstance(outcome, Broken)
    assert "Unitary Charge" in outcome.reason
    assert "a person decides" in outcome.reason


def test_a_duplicated_label_is_ambiguous_and_never_re_pointed(tmp_path) -> None:
    """Registered: ambiguous; never re-pointed.

    Two cells now answer to the confirmed name. Picking either would
    be a guess wearing a confirmation's authority, which is worse than
    saying nothing.
    """
    revised = _workbook(tmp_path, [*BASE_ROWS, ("Unitary Charge", 9.99)])

    outcome = reanchor_model(CONFIRMED_MODEL, _cells(revised))

    assert isinstance(outcome, Ambiguous)
    assert set(outcome.candidates) == {"Model!B2", "Model!B4"}
    assert "will not guess" in outcome.reason


def test_a_renamed_sheet_does_not_disturb_a_name_anchor(tmp_path) -> None:
    """Registered: survived (the anchor is a name, not an address)."""
    revised = _workbook(tmp_path, BASE_ROWS, sheet="Financial Model")

    outcome = reanchor_model(CONFIRMED_MODEL, _cells(revised))

    assert isinstance(outcome, Anchored)
    assert outcome.key == "Financial Model!B2"
    assert outcome.relocated is True
    verdict, _ = recheck(CONFIRMED_MODEL, CONFIRMED_DOCUMENT, outcome.value, 3.741)
    assert verdict == AGREES


# --- the document side ---------------------------------------------------


def _facts(lines: list[tuple[int, str]]):
    """Facts as `with_ordinals` shapes them, from (page, line) pairs."""

    class _Number:
        def __init__(self, page: int, line: str, text: str, value: float):
            self.page, self.line, self.text, self.value = page, line, text, value

    numbers = []
    for page, line in lines:
        for token in line.split():
            bare = token.strip("£$€%(),.")
            try:
                value = float(bare.replace(",", ""))
            except ValueError:
                continue
            numbers.append(_Number(page, line, token, value))
    return with_ordinals(numbers)


CONTRACT = [
    (4, "Schedule 1 The Unitary Charge is 3.741"),
    (4, "The Authority shall pay quarterly"),
]


def test_an_edited_figure_survives_and_reads_as_the_source_moving() -> None:
    """Registered: survived; the source moved.

    The case that decides the whole design. The contract was revised
    and the figure changed — and because the anchor is the line and
    not the number, the link is re-found and the movement is the
    finding. Had it anchored on the value, this would read « not
    found » and the reviewer would learn nothing.
    """
    revised = _facts([(4, "Schedule 1 The Unitary Charge is 3.905")])

    outcome = reanchor_document(CONFIRMED_DOCUMENT, revised)

    assert isinstance(outcome, Anchored)
    assert outcome.value == 3.905
    verdict, ties_out = recheck(
        CONFIRMED_MODEL, CONFIRMED_DOCUMENT, Decimal("3.741"), outcome.value
    )
    assert verdict == SOURCE_MOVED
    assert ties_out is False


def test_a_deleted_line_breaks_the_document_side_in_words() -> None:
    """Registered: broken (document side)."""
    revised = _facts([(4, "The Authority shall pay 12 instalments")])

    outcome = reanchor_document(CONFIRMED_DOCUMENT, revised)

    assert isinstance(outcome, Broken)
    assert "is not in this version" in outcome.reason


def test_repagination_alone_keeps_the_link_and_agrees() -> None:
    """Registered: survived; agrees.

    A page number is a coordinate, so a document that grew a preface
    must not break anything.
    """
    revised = _facts([(9, "Schedule 1 The Unitary Charge is 3.741")])

    outcome = reanchor_document(CONFIRMED_DOCUMENT, revised)

    assert isinstance(outcome, Anchored)
    assert outcome.relocated is True  # page 4 -> page 9, and it does not matter
    verdict, ties_out = recheck(
        CONFIRMED_MODEL, CONFIRMED_DOCUMENT, Decimal("3.741"), outcome.value
    )
    assert verdict == AGREES
    assert ties_out is True


# --- the parts of the promise that are not in the registered table -------


def test_two_identical_lines_are_separated_by_position_or_not_at_all() -> None:
    """The ordinal tiebreak, and its honest limit."""
    twice = _facts(
        [
            (4, "Schedule 1 The Unitary Charge is 3.741"),
            (7, "Schedule 1 The Unitary Charge is 3.741"),
        ]
    )

    outcome = reanchor_document(CONFIRMED_DOCUMENT, twice)

    # Same labels, same position in the line: nothing separates them.
    assert isinstance(outcome, Ambiguous)
    assert len(outcome.candidates) == 2


def test_both_sides_moving_together_still_ties_out() -> None:
    """« Both moved » and « disagrees » are different facts.

    A deal team that revised the contract and updated the model is not
    in trouble; a reviewer wants to see that they moved together.
    """
    verdict, ties_out = recheck(
        CONFIRMED_MODEL, CONFIRMED_DOCUMENT, Decimal("3.905"), 3.905
    )

    assert verdict == BOTH_MOVED
    assert ties_out is True


def test_the_person_states_the_scale_and_arithmetic_does_the_rest() -> None:
    """Levenmouth's case: a contract in pounds, a model in millions.

    The scale is confirmed by a person, never inferred here — unit
    inference is Track E's ground, and this is the declared boundary.
    """
    contract = DocumentAnchor(
        page=4,
        printed_text="3,741,000",
        value=3_741_000.0,
        anchor_line="the Unitary Charge is 3,741,000 a year",
        ordinal_in_line=1,
    )
    model = ModelAnchor(ref="Model!B2", cell_name="Unitary Charge", value=3.741)

    verdict, ties_out = recheck(model, contract, 3.741, 3_741_000.0, scale=0.000001)

    assert verdict == AGREES
    assert ties_out is True


def test_the_package_calls_no_model_and_imports_no_client() -> None:
    """« No model call » as a structural fact, not a runtime promise.

    The re-check cannot call a language model because nothing in the
    chain package can. Asserted by reading the source rather than by
    counting calls, because a count only covers the paths a test
    happens to walk.
    """
    package = Path(__file__).resolve().parents[1].parent / "polar" / "tieout" / "chain"
    source = "\n".join(
        path.read_text() for path in package.glob("*.py") if path.name != "__pycache__"
    )

    for forbidden in ("anthropic", "openai", "pydantic_ai", "litellm", "llm_client"):
        assert forbidden not in source
