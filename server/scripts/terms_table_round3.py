"""Terms table round 3, exactly as registered — real revisions.

Criteria, bars and predictions: `docs/pierce/terms-table-round3.md`,
committed before this ran. Two legs, both on real files:

  leg A   class 3, the source moved: the 2016 model stands still (it
          is the same file); the document side re-reads from the
          CY2016 Form 1 by printed line + ordinal — the D4 rule, no
          matcher. Typed terms are blind by design and say so.
  leg B   class 2, the model moved: the document side stands as
          stated; the model side re-anchors by the cell's name
          against the 2017 workbook's Appendix A rows (C = name,
          H = value — the round-8 frozen geometry on the new file).

Everything the hand-verification needs is printed: old value, new
value, the re-found printed page and line (leg A) or workbook row
(leg B).

    uv run python -m scripts.terms_table_round3 <corpus-dir>

Verdicts land in `docs/pierce/terms-table-round3-verdicts.json`.
"""

import json
import sys
import uuid
import warnings
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from scripts.terms_table_round2 import DOCS, SCORABLE, TYPED_ROWS, _select, _term
from scripts.terms_table_round2b import _transformation

warnings.filterwarnings("ignore")

APPENDIX = "Appendix A - TSRR Summary"

#: One lineage id shared by the term rows and the leg-A document
#: artifact stand-in, so `_check_term` treats the CY2016 filing as a
#: revision of the confirmed document — which is exactly what it is.
DOCUMENT_LINEAGE = uuid.uuid4()


def _appendix_cells(path: Path) -> list[tuple[str, str, float]]:
    """The 2017 model's re-anchor pool, by the round-8 frozen geometry.

    Every Appendix A row whose column C carries a label and whose
    column H carries a number becomes ``(ref, name, value)``. No
    filtering beyond that: `reanchor_model`'s exact-name rule decides,
    and a label that repeats comes back ambiguous, honestly.
    """
    import openpyxl

    book = openpyxl.load_workbook(path, data_only=True)
    sheet = book[APPENDIX]
    cells = []
    for row in range(1, sheet.max_row + 1):
        label = sheet.cell(row=row, column=3).value
        value = sheet.cell(row=row, column=8).value
        if isinstance(label, str) and label.strip() and isinstance(value, int | float):
            cells.append((f"'{APPENDIX}'!H{row}", label.strip(), float(value)))
    return cells


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(__doc__)
        return 2
    corpus = Path(argv[0])

    import pdfplumber

    from polar.tieout.chain.anchor import with_ordinals
    from polar.tieout.chain.extract import extract_pdf
    from polar.tieout.chain.router import _check_term
    from scripts.corpus_d3_oracle import FOOTER, _anchors

    sample = [
        s
        for s in json.loads((DOCS / "scribe-d3-round8-sample.json").read_text())
        if s["row"] in SCORABLE
    ]
    assert len(sample) == 15

    def footer_pages(path: Path) -> dict[int, int]:
        printed: dict[int, int] = {}
        with pdfplumber.open(path) as pdf:
            for index, page in enumerate(pdf.pages):
                found = FOOTER.findall(page.extract_text() or "")
                if found:
                    printed.setdefault(int(found[0]), index + 1)
        return printed

    old_printed = footer_pages(corpus / "rmu-2015-form1.pdf")
    old_numbers = extract_pdf(corpus / "rmu-2015-form1.pdf").numbers
    old_ordinals = with_ordinals(old_numbers)

    new_printed = footer_pages(corpus / "cor-2016-form1.pdf")
    pdf_to_printed = {pdf: printed for printed, pdf in new_printed.items()}
    new_numbers = extract_pdf(corpus / "cor-2016-form1.pdf").numbers
    new_facts = with_ordinals(new_numbers)
    fact_by_key = {key: (line, value, text) for key, line, _, value, text in new_facts}

    # --- terms exactly as round 2b confirmed them, with true ordinals ----
    terms: dict[int, Any] = {}
    for entry in sample:
        truth_page = old_printed[entry["page"]]
        truths = [
            n
            for n in old_numbers
            if n.page == truth_page and entry["line"] in _anchors(n.line)
        ]
        fact = _select(entry, truths)
        assert fact is not None, f"row {entry['row']} resolved in rounds 1-2"
        term = _term(
            entry,
            fact,
            float(entry["value"]),
            1.0,
            transformation=_transformation(entry["row"]),
        )
        if entry["row"] not in TYPED_ROWS:
            #: The re-read resolves by line AND ordinal, so the term
            #: must carry which number within its line it is — computed
            #: by the same rule confirmation uses, over the same
            #: extraction the fact came from.
            position = next(index for index, n in enumerate(old_numbers) if n is fact)
            term.ordinal_in_line = old_ordinals[position][2]
        term.document_id = DOCUMENT_LINEAGE
        terms[entry["row"]] = term

    cells_2016 = [(f"row {e['row']}", e["label"], float(e["value"])) for e in sample]

    # --- leg A: the source moved -----------------------------------------
    document_artifact = SimpleNamespace(lineage_id=DOCUMENT_LINEAGE)
    leg_a: list[dict[str, Any]] = []
    for entry in sample:
        term = terms[entry["row"]]
        verdict, ties, _, detail = _check_term(
            term, cells_2016, new_facts, document_artifact
        )
        found = None
        if entry["row"] not in TYPED_ROWS:
            from polar.tieout.chain.anchor import (
                Anchored,
                DocumentAnchor,
                reanchor_document,
            )

            outcome = reanchor_document(
                DocumentAnchor(
                    page=term.page,
                    printed_text=term.printed_text,
                    value=term.value,
                    anchor_line=term.anchor_line,
                    ordinal_in_line=term.ordinal_in_line,
                ),
                new_facts,
            )
            if isinstance(outcome, Anchored):
                line, value, text = fact_by_key[outcome.key]
                pdf_page = int(outcome.key.split("|")[0][1:])
                found = {
                    "printed_page": pdf_to_printed.get(pdf_page),
                    "line": line,
                    "text": text,
                    "value": value,
                    "how": outcome.how,
                }
        leg_a.append(
            {
                "row": entry["row"],
                "typed": entry["row"] in TYPED_ROWS,
                "transformation": term.transformation,
                "old_document": term.printed_text,
                "old_value": term.value,
                "refound": found,
                "verdict": verdict,
                "ties_out": ties,
                "detail": detail,
            }
        )

    # --- leg B: the model moved ------------------------------------------
    cells_2017 = _appendix_cells(corpus / "cor-2017-h25b.xlsx")
    leg_b: list[dict[str, Any]] = []
    for entry in sample:
        term = terms[entry["row"]]
        verdict, ties, ref_now, detail = _check_term(term, cells_2017, [], None)
        leg_b.append(
            {
                "row": entry["row"],
                "label": entry["label"],
                "old_model": float(entry["value"]),
                "model_ref_now": ref_now,
                "verdict": verdict,
                "ties_out": ties,
                "detail": detail,
            }
        )

    # --- report -----------------------------------------------------------
    print("=== leg A: the source moved (document re-read from CY2016) ===")
    print(f"{'row':>4} {'old':>14}  {'refound (printed page · value)':<34} verdict")
    for a in leg_a:
        if a["typed"]:
            where = "typed — blind to document revisions"
        elif a["refound"]:
            where = (
                f"p{a['refound']['printed_page']} · {a['refound']['text']} "
                f"({a['refound']['how']})"
            )
        else:
            where = "not re-found"
        print(f"{a['row']:>4} {a['old_document']:>14}  {where:<34} {a['verdict']}")
    print()
    print("=== leg B: the model moved (re-anchored in the 2017 workbook) ===")
    print(f"{'row':>4} {'old model':>13} {'now at':<26} verdict")
    for b in leg_b:
        print(
            f"{b['row']:>4} {b['old_model']:>13g} {b['model_ref_now'] or '—':<26} "
            f"{b['verdict']}"
        )

    (DOCS / "terms-table-round3-verdicts.json").write_text(
        json.dumps({"leg_a": leg_a, "leg_b": leg_b}, indent=1) + "\n"
    )
    print(f"\nverdicts: {DOCS / 'terms-table-round3-verdicts.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
