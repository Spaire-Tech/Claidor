"""Terms table round 2, exactly as registered — run after the commit.

Criteria, bars and predictions: `docs/pierce/terms-table-round2.md`,
committed before this ran. This script is the measurement of finding
class 1 — a model input that disagrees with a confirmed term — and
nothing else.

Three legs, per the registration:

  control   the unmodified pair: 15 terms selected by the frozen
            per-schedule geometry (never by value), bound to the
            model's own typed inputs at stated scale 1.0, checked
  plants    30 runs, one row at a time: P1 slipped magnitude (×10;
            0 → 100,000 for the zero row), P2 last printed digit
            (+10^−p at the document's own precision) — each applied
            to the model value *before* binding, class 1's exact
            day-one shape; every other row must not change verdict
  probe     row 10 bound at a deliberately wrong stated scale (1000):
            the person's statement governs and nothing infers around
            it, so the pair must not tie

    uv run python -m scripts.terms_table_round2 <corpus-dir>

`<corpus-dir>` is where `corpus_ferc_fetch.py` put the RMU pair.
Verdicts land in `docs/pierce/terms-table-round2-verdicts.json`.
"""

import json
import sys
import warnings
from pathlib import Path
from typing import Any

warnings.filterwarnings("ignore")

DOCS = Path(__file__).parent.parent.parent / "docs" / "pierce"

#: Round 8's scorable rows, exactly as round 1 used them.
SCORABLE = {10, 12, 13, 19, 21, 36, 41, 44, 57, 59, 88, 119, 121, 179, 187}

#: Round 1's classes, carried over: these four rows' truth lines are
#: label-less (the facing-page spread), so their terms are typed.
TYPED_ROWS = {19, 36, 41, 44}

#: The frozen per-schedule selection (registered): how the harness
#: stands in for the person's eyes, value-free. `g-band` picks the one
#: fact whose x0 lies in [400, 540]; integers pick the k-th fact from
#: the right.
SELECT: dict[tuple[int, str], Any] = {
    (207, "g"): "g-band",
    (227, "c"): 1,  # rightmost
    (354, "b"): 2,  # second from right
    (323, "b"): 2,
    (219, "c"): 2,
    (112, "c"): 2,
    (111, "c"): 2,
}

G_BAND = (400.0, 540.0)


def _select(entry: dict[str, Any], truths: list[Any]) -> Any | None:
    """The cited column's fact, by frozen geometry. None = UNRESOLVABLE."""
    rule = SELECT[(entry["page"], entry["col"])]
    if rule == "g-band":
        banded = [t for t in truths if G_BAND[0] <= t.box.x0 <= G_BAND[1]]
        return banded[0] if len(banded) == 1 else None
    if len(truths) < rule:
        return None
    return truths[-rule]


def _term(entry: dict[str, Any], fact: Any, model_value: float, scale: float) -> Any:
    """A bound ChainTerm exactly as the routes would persist it.

    Constructed, not flushed, so every column the check reads is set
    explicitly — SQLAlchemy defaults apply at flush, not here.
    """
    from polar.tieout.chain.terms import (
        STATED_EXTRACTED,
        STATED_TYPED,
        ChainTerm,
    )

    typed = entry["row"] in TYPED_ROWS
    return ChainTerm(
        name=entry["label"],
        stated=STATED_TYPED if typed else STATED_EXTRACTED,
        page=entry["page"],
        printed_text=fact.text,
        anchor_line="" if typed else fact.line,
        ordinal_in_line=0 if typed else 1,
        column="" if typed else fact.column,
        value=fact.value,
        superseded_at=None,
        superseded_note="",
        model_ref=f"row {entry['row']}",
        cell_name=entry["label"],
        model_value_at_confirmation=model_value,
        scale=scale,
        basis="",
        note="",
    )


def _check(
    term: Any, cells: list[tuple[str, str, float]]
) -> tuple[str, bool | None, str]:
    from polar.tieout.chain.router import _check_term

    verdict, ties, _, detail = _check_term(term, cells, [], None)
    return verdict, ties, detail


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

    # --- selection: the person's eyes, frozen ---------------------------
    selected: dict[int, Any] = {}
    unresolvable: list[int] = []
    for entry in sample:
        truth_page = printed[entry["page"]]
        truths = [
            n
            for n in numbers
            if n.page == truth_page and entry["line"] in _anchors(n.line)
        ]
        fact = _select(entry, truths) if truths else None
        if fact is None:
            unresolvable.append(entry["row"])
        else:
            selected[entry["row"]] = fact

    cells = [
        (f"row {e['row']}", e["label"], float(e["value"]))
        for e in sample
        if e["row"] in selected
    ]

    # --- control leg ----------------------------------------------------
    control: list[dict[str, Any]] = []
    control_ties: dict[int, bool | None] = {}
    for entry in sample:
        if entry["row"] not in selected:
            continue
        term = _term(entry, selected[entry["row"]], float(entry["value"]), 1.0)
        verdict, ties, detail = _check(term, cells)
        control_ties[entry["row"]] = ties
        control.append(
            {
                "row": entry["row"],
                "citation": entry["citation"],
                "stated": term.stated,
                "document_text": term.printed_text,
                "document_value": term.value,
                "model_value": float(entry["value"]),
                "verdict": verdict,
                "ties_out": ties,
                "detail": detail,
            }
        )

    # --- planted leg: one row at a time, class 1's day-one shape --------
    plants: list[dict[str, Any]] = []
    quiet_breaks = 0
    quiet_checks = 0
    for entry in sample:
        if entry["row"] not in selected:
            continue
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
            term = _term(entry, selected[entry["row"]], planted_value, 1.0)
            verdict, ties, _ = _check(term, planted_cells)
            plants.append(
                {
                    "row": entry["row"],
                    "plant": plant_name,
                    "planted_value": planted_value,
                    "verdict": verdict,
                    "ties_out": ties,
                    "caught": ties is False,
                }
            )
            for other in sample:
                if other["row"] not in selected or other["row"] == entry["row"]:
                    continue
                other_term = _term(
                    other, selected[other["row"]], float(other["value"]), 1.0
                )
                _, other_ties, _ = _check(other_term, planted_cells)
                quiet_checks += 1
                if other_ties != control_ties[other["row"]]:
                    quiet_breaks += 1

    # --- the scale probe ------------------------------------------------
    row10 = next(e for e in sample if e["row"] == 10)
    probe_term = _term(row10, selected[10], float(row10["value"]), 1000.0)
    _, probe_ties, _ = _check(probe_term, cells)

    # --- report ----------------------------------------------------------
    caught = sum(1 for p in plants if p["caught"])
    flags = [c for c in control if c["ties_out"] is False]
    print(f"selection: {len(selected)} of 15 resolve; unresolvable: {unresolvable}")
    print(f"{'row':>4} {'stated':<10} {'document':>14} {'model':>13}  tie  detail")
    for c in control:
        tie = "yes" if c["ties_out"] else "NO"
        print(
            f"{c['row']:>4} {c['stated']:<10} {c['document_text']:>14} "
            f"{c['model_value']:>13g}  {tie:<4} {c['detail'][:60]}"
        )
    print(f"control: {len(flags)} flagged of {len(control)}")
    print(f"plants: {caught} of {len(plants)} caught")
    print(f"quiet under plants: {quiet_breaks} changed of {quiet_checks} row-checks")
    print(
        f"scale probe (row 10 at stated 1000): {'FLAGGED' if probe_ties is False else 'MISSED'}"
    )

    (DOCS / "terms-table-round2-verdicts.json").write_text(
        json.dumps(
            {
                "selection": {"resolved": len(selected), "unresolvable": unresolvable},
                "control": control,
                "plants": plants,
                "quiet": {"checks": quiet_checks, "breaks": quiet_breaks},
                "scale_probe": {"stated_scale": 1000.0, "ties_out": probe_ties},
            },
            indent=1,
        )
        + "\n"
    )
    print(f"verdicts: {DOCS / 'terms-table-round2-verdicts.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
