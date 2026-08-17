"""The one write a model gets: the fix, proven cell by cell.

Every test reads the written bytes back through the product's own reader
— the same standard as the deck and memo writers. The refusals are most
of the point: each one is a case where a search-and-replace would have
cheerfully written something.
"""

import tempfile
from pathlib import Path

import pytest

from polar.tieout.audit import audit
from polar.tieout.workbook import read_workbook
from polar.tieout.write import CannotWrite, Edit, write_workbook

CASCADE = Path(__file__).resolve().parents[2] / "scripts" / "cascade"
FIXTURE = CASCADE / "audit_fixture.xlsx"


@pytest.fixture(scope="module")
def payload() -> bytes:
    return FIXTURE.read_bytes()


def _reread(written: bytes):
    with tempfile.NamedTemporaryFile(suffix=".xlsx") as file:
        file.write(written)
        file.flush()
        return read_workbook(file.name)


def _fix_edit() -> Edit:
    """The edit exactly as the audit derives it — not hand-typed."""
    finding = next(
        one
        for one in audit(read_workbook(str(FIXTURE))).findings
        if one.rule == "typed-over-formula" and one.fix
    )
    return Edit(
        page=0,
        anchor={"kind": "cell", "ref": finding.ref, "sheet": finding.sheet},
        before=finding.fix_before,
        after=finding.fix,
    )


def test_the_fix_lands_and_nothing_else_moves(payload: bytes) -> None:
    edit = _fix_edit()
    written = write_workbook(payload, [edit])

    was = read_workbook(str(FIXTURE))
    now = _reread(written)

    fixed = now.cells[edit.anchor["ref"]]
    assert fixed.formula == edit.after
    #: The cached answer went with the typed value; Excel computes it
    #: on the next open. The reader says so honestly.
    assert fixed.value is None

    #: Every other cell identical — the writer's own verification made
    #: this promise; the test holds it to it independently.
    assert set(was.cells) == set(now.cells)
    for ref, cell in was.cells.items():
        if ref == edit.anchor["ref"]:
            continue
        assert cell.value == now.cells[ref].value, ref
        assert cell.formula == now.cells[ref].formula, ref


def test_a_moved_value_is_refused(payload: bytes) -> None:
    edit = _fix_edit()
    with pytest.raises(CannotWrite, match="moved since this was found"):
        write_workbook(
            payload,
            [Edit(page=0, anchor=edit.anchor, before="-999", after=edit.after)],
        )


def test_a_cell_that_already_calculates_is_refused(payload: bytes) -> None:
    with pytest.raises(CannotWrite, match="already calculates"):
        write_workbook(
            payload,
            [
                Edit(
                    page=0,
                    anchor={"kind": "cell", "ref": "Model!E11", "sheet": "Model"},
                    before="x",
                    after="=1",
                )
            ],
        )


def test_an_unknown_sheet_is_refused(payload: bytes) -> None:
    with pytest.raises(CannotWrite, match="no sheet called"):
        write_workbook(
            payload,
            [
                Edit(
                    page=0,
                    anchor={"kind": "cell", "ref": "Nope!A1", "sheet": ""},
                    before="1",
                    after="=1",
                )
            ],
        )


def test_a_missing_anchor_is_refused(payload: bytes) -> None:
    with pytest.raises(CannotWrite, match="does not name a cell"):
        write_workbook(payload, [Edit(page=0, anchor={}, before="1", after="=1")])


def test_an_empty_formula_is_refused(payload: bytes) -> None:
    edit = _fix_edit()
    with pytest.raises(CannotWrite, match="no formula"):
        write_workbook(
            payload,
            [Edit(page=0, anchor=edit.anchor, before=edit.before, after="=")],
        )
