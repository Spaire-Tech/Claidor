"""Terms table round 2b, exactly as registered — the credit convention.

Criteria, bars and predictions: `docs/pierce/terms-table-round2b.md`,
committed before this ran. Round 2's frozen selection geometry and
term construction are imported, not re-derived; the one change is the
person's statement: rows 21, 57 and 59 — the parenthesised credits —
are bound with « negate ». Plus the wrong-statement probe: row 10
bound with « negate » it does not deserve must flag.

    uv run python -m scripts.terms_table_round2b <corpus-dir>

Verdicts land in `docs/pierce/terms-table-round2b-verdicts.json`.
"""

import json
import sys
import warnings
from pathlib import Path
from typing import Any

from scripts.terms_table_round2 import DOCS, SCORABLE, _check, _select, _term

warnings.filterwarnings("ignore")

#: The rows whose schedule prints credits in parentheses; the person
#: states « negate » for exactly these, reading the page.
NEGATE_ROWS = {21, 57, 59}


def _transformation(row: int) -> str:
    return "negate" if row in NEGATE_ROWS else "identity"


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(__doc__)
        return 2
    corpus = Path(argv[0])
    document = corpus / "rmu-2015-form1.pdf"

    import pdfplumber

    from polar.tieout.chain.anchor import _printed_decimals
    from polar.tieout.chain.extract import extract_pdf
    from scripts.corpus_d3_oracle import FOOTER, _anchors

    sample = [
        s
        for s in json.loads((DOCS / "scribe-d3-round8-sample.json").read_text())
        if s["row"] in SCORABLE
    ]
    assert len(sample) == 15

    printed: dict[int, int] = {}
    with pdfplumber.open(document) as pdf:
        for index, page in enumerate(pdf.pages):
            found = FOOTER.findall(page.extract_text() or "")
            if found:
                printed[int(found[0])] = index + 1

    numbers = extract_pdf(document).numbers

    selected: dict[int, Any] = {}
    for entry in sample:
        truth_page = printed[entry["page"]]
        truths = [
            n
            for n in numbers
            if n.page == truth_page and entry["line"] in _anchors(n.line)
        ]
        fact = _select(entry, truths) if truths else None
        assert fact is not None, f"row {entry['row']} resolved in round 2"
        selected[entry["row"]] = fact

    cells = [(f"row {e['row']}", e["label"], float(e["value"])) for e in sample]

    # --- control leg, conventions stated ---------------------------------
    control: list[dict[str, Any]] = []
    control_ties: dict[int, bool | None] = {}
    for entry in sample:
        term = _term(
            entry,
            selected[entry["row"]],
            float(entry["value"]),
            1.0,
            transformation=_transformation(entry["row"]),
        )
        verdict, ties, detail = _check(term, cells)
        control_ties[entry["row"]] = ties
        control.append(
            {
                "row": entry["row"],
                "transformation": term.transformation,
                "document_text": term.printed_text,
                "model_value": float(entry["value"]),
                "verdict": verdict,
                "ties_out": ties,
                "detail": detail,
            }
        )

    # --- planted leg, conventions stated ---------------------------------
    plants: list[dict[str, Any]] = []
    quiet_breaks = 0
    quiet_checks = 0
    for entry in sample:
        true_value = float(entry["value"])
        p2_step = 10 ** -_printed_decimals(selected[entry["row"]].text)
        for plant_name, planted_value in (
            ("P1", 100000.0 if true_value == 0 else true_value * 10),
            ("P2", true_value + p2_step),
        ):
            planted_cells = [
                (ref, name, planted_value if ref == f"row {entry['row']}" else value)
                for ref, name, value in cells
            ]
            term = _term(
                entry,
                selected[entry["row"]],
                planted_value,
                1.0,
                transformation=_transformation(entry["row"]),
            )
            verdict, ties, _ = _check(term, planted_cells)
            plants.append(
                {
                    "row": entry["row"],
                    "plant": plant_name,
                    "planted_value": planted_value,
                    "ties_out": ties,
                    "caught": ties is False,
                }
            )
            for other in sample:
                if other["row"] == entry["row"]:
                    continue
                other_term = _term(
                    other,
                    selected[other["row"]],
                    float(other["value"]),
                    1.0,
                    transformation=_transformation(other["row"]),
                )
                _, other_ties, _ = _check(other_term, planted_cells)
                quiet_checks += 1
                if other_ties != control_ties[other["row"]]:
                    quiet_breaks += 1

    # --- the wrong-statement probe ---------------------------------------
    row10 = next(e for e in sample if e["row"] == 10)
    probe = _term(
        row10, selected[10], float(row10["value"]), 1.0, transformation="negate"
    )
    _, probe_ties, _ = _check(probe, cells)

    caught = sum(1 for p in plants if p["caught"])
    flags = [c for c in control if c["ties_out"] is False]
    print(f"{'row':>4} {'stated':<9} {'document':>14} {'model':>13}  tie")
    for c in control:
        tie = "yes" if c["ties_out"] else "NO"
        print(
            f"{c['row']:>4} {c['transformation']:<9} {c['document_text']:>14} "
            f"{c['model_value']:>13g}  {tie}"
        )
    print(
        f"control: {len(flags)} flagged of {len(control)}: rows "
        f"{sorted(c['row'] for c in flags)}"
    )
    print(f"plants: {caught} of {len(plants)} caught")
    print(f"quiet under plants: {quiet_breaks} changed of {quiet_checks} row-checks")
    print(
        "wrong-statement probe (row 10 bound negate): "
        f"{'FLAGGED' if probe_ties is False else 'MISSED'}"
    )

    (DOCS / "terms-table-round2b-verdicts.json").write_text(
        json.dumps(
            {
                "control": control,
                "plants": plants,
                "quiet": {"checks": quiet_checks, "breaks": quiet_breaks},
                "wrong_statement_probe": {"row": 10, "ties_out": probe_ties},
            },
            indent=1,
        )
        + "\n"
    )
    print(f"verdicts: {DOCS / 'terms-table-round2b-verdicts.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
