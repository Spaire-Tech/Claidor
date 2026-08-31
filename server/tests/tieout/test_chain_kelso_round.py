"""Round 4's harness, proved ready on a stand-in pair.

The real pair (Kelso's close model and its signed agreement) is not
here — the hub's certificate is expired and issued for the wrong
host, and no archive capture holds the models. So the harness is
proved against a synthetic pair built here: a workbook with a
provenance tab shaped like the deal team's, and a contract PDF that
states some of its figures and not others.

**These tests say nothing whatever about Kelso.** They say the
harness runs end to end, and — the part worth testing — that the
answer sheet stays out of the matcher's inputs, that a row whose
figure the contract never states is judgeable as such, and that the
registered conditions are counted rather than scored.
"""

import importlib.util
import json
import sys
from pathlib import Path

import pytest

_ROUND = (
    Path(__file__).resolve().parents[2] / "scripts" / "corpus_documents_kelso_round.py"
)


@pytest.fixture(scope="module")
def harness():
    pytest.importorskip("pdfplumber")
    pytest.importorskip("openpyxl")
    sys.path.insert(0, str(_ROUND.parent.parent))
    spec = importlib.util.spec_from_file_location("kelso_round", _ROUND)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["kelso_round"] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def pair(tmp_path_factory):
    """A workbook with a provenance tab, and a contract stating one figure."""
    from openpyxl import Workbook

    directory = tmp_path_factory.mktemp("kelso-stand-in")
    book = Workbook()

    model = book.active
    model.title = "Model"
    model["A1"] = "Unitary Charge"
    model["B1"] = 3.741
    model["A2"] = "Base Credit Facility"
    model["B2"] = 21461602.52
    model["A3"] = "Margin"
    model["B3"] = 3.349

    # The deal team's marking scheme: clause -> term -> figure.
    provenance = book.create_sheet("Clause references")
    provenance["A1"] = "Clause"
    provenance["B1"] = "Term"
    provenance["C1"] = "Figure"
    for row, (clause, term, figure) in enumerate(
        (
            ("Schedule 1", "Unitary Charge", 3.741),
            ("Schedule 1", "Base Credit Facility", 21461602.52),
            ("Loan Agreement", "Margin", 3.349),
        ),
        start=2,
    ):
        provenance[f"A{row}"] = clause
        provenance[f"B{row}"] = term
        provenance[f"C{row}"] = figure

    workbook_path = directory / "stand-in-model.xlsx"
    book.save(str(workbook_path))

    contract_path = directory / "stand-in-agreement.pdf"
    contract_path.write_bytes(_contract_pdf())
    return workbook_path, contract_path


def _contract_pdf() -> bytes:
    """One page stating the Unitary Charge and nothing else numeric."""
    text = (
        b"BT /F1 12 Tf 72 700 Td (Schedule 1 The Unitary Charge is 3.741) Tj ET "
        b"BT /F1 12 Tf 72 680 Td (The Authority shall pay quarterly) Tj ET"
    )
    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        b"5 0 obj\n<< /Length %d >>\nstream\n" % len(text)
        + text
        + b"\nendstream\nendobj\n",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for body in objects:
        offsets.append(len(out))
        out += body
    xref_at = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for offset in offsets:
        out += b"%010d 00000 n \n" % offset
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF" % (
        len(objects) + 1,
        xref_at,
    )
    return bytes(out)


def test_the_answer_sheet_is_found_by_its_own_words(harness, pair) -> None:
    model, _ = pair
    assert harness.find_provenance_sheet(model) == "Clause references"


def test_every_provenance_row_becomes_one_sample_row(harness, pair) -> None:
    model, _ = pair
    rows = harness.provenance_rows(model, "Clause references")
    assert [row["figure"] for row in rows] == [3.741, 21461602.52, 3.349]
    assert "Base Credit Facility" in rows[1]["text"]


def test_the_answer_sheet_never_reaches_the_model_side(harness, pair) -> None:
    """The blindness the registration calls structural, asserted.

    Every figure appears twice in the workbook — once in the model,
    once on the provenance tab. The model side must see only the
    first, or the round would be scoring the answer sheet against
    itself.
    """
    model, _ = pair
    cells = harness.model_cells(model, frozenset({"Clause references"}))
    assert {cell.sheet for cell in cells} == {"Model"}
    assert len(cells) == 3


def test_the_sheet_phase_carries_no_matcher_output(harness, pair, capsys) -> None:
    model, contract = pair
    assert harness.sheet(model, contract, "Clause references", frozenset({"Clause references"})) == 0
    written = json.loads((contract.parent / "kelso-round-sheet.json").read_text())

    assert len(written) == 3
    # Truth and condition are the judge's to fill, and start empty.
    assert all(row["truth"] is None and row["condition"] is None for row in written)
    # No proposal, score or verdict may appear before the truth does.
    assert not any(
        key in row for row in written for key in ("proposed", "verdict", "score")
    )
    # The row whose figure the contract states carries its value hit;
    # the row it never states carries none.
    unitary = next(row for row in written if row["figure"] == 3.741)
    margin = next(row for row in written if row["figure"] == 3.349)
    assert unitary["value_hits"]
    assert not margin["value_hits"]
    assert unitary["located"][0]["labels"] == "Unitary Charge"


def test_conditions_are_counted_and_never_scored(harness, pair, capsys) -> None:
    """Unpublished paper and OCR loss leave the table, as registered."""
    model, contract = pair
    harness.sheet(model, contract, "Clause references", frozenset({"Clause references"}))
    written = json.loads((contract.parent / "kelso-round-sheet.json").read_text())

    for row in written:
        if row["figure"] == 3.741:  # stated in the contract, judged sound
            row["condition"] = "ok"
            row["truth"] = [row["value_hits"][0]["key"]]
        elif row["figure"] == 21461602.52:  # judged: the page is a scan
            row["condition"] = "unreachable-ocr"
        else:  # cites a loan agreement that was never published
            row["condition"] = "unreachable-unpublished"
    truth = contract.parent / "kelso-round-truth.json"
    truth.write_text(json.dumps(written))

    capsys.readouterr()
    assert harness.score(truth, model, contract, frozenset({"Clause references"})) == 0
    printed = capsys.readouterr().out

    assert "reachable rows: 1 of 3" in printed
    assert "unreachable-ocr: 1" in printed
    assert "unreachable-unpublished: 1" in printed
    # The one reachable row is scored, and its verdict is a real one.
    verdicts = json.loads((contract.parent / "kelso-round-verdicts.json").read_text())
    assert len(verdicts) == 1
    assert verdicts[0]["verdict"] in {
        "true proposal",
        "false proposal",
        "true abstention",
        "missed",
    }
