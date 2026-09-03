"""Diff audit findings across two versions of the same model.

The revision-defect study's engine (docs/pierce/revision-defect-protocol.md):
same audit, both sides, findings matched on rule + sheet + cell name —
never the cell address, because rows move between versions. A finding
folded down a column carries its row label in `flow` and no `name`;
the label is the same thing the name is built from, so it stands in
(truth-set.md, the matcher gap found on South West's base revenue).
Findings with neither fall to UNMATCHED rather than being guessed at,
on the matcher's own discipline.

Usage:
    uv run python -m scripts.revision_diff DRAFT.xlsx FINAL.xlsx [label]
"""

import sys
import warnings
from collections import Counter
from pathlib import Path

warnings.filterwarnings("ignore")

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.regulator_eval import _read


def name_of(finding) -> str:
    """The finding's cell name, or the row label a column fold kept in
    `flow`; empty when it carries neither."""
    return (finding.name or "").strip() or (getattr(finding, "flow", "") or "").strip()


def keyed(defects: list) -> tuple[Counter, int]:
    """Multiset of matchable keys, and the count that could not be keyed."""
    keys: Counter = Counter()
    unmatched = 0
    for finding in defects:
        name = name_of(finding)
        if not name:
            unmatched += 1
            continue
        keys[(finding.rule, finding.sheet, name)] += 1
    return keys, unmatched


def diff(draft_path: str, final_path: str, label: str = "") -> dict:
    draft, draft_took = _read(Path(draft_path))
    final, final_took = _read(Path(final_path))

    draft_keys, draft_unmatched = keyed(draft.defects)
    final_keys, final_unmatched = keyed(final.defects)

    persistent = sum((draft_keys & final_keys).values())
    fixed = sum((draft_keys - final_keys).values())
    new = sum((final_keys - draft_keys).values())

    formulas = int(final.counts.get("formulas") or 0)
    result = {
        "label": label or Path(final_path).stem,
        "draft_findings": len(draft.defects),
        "final_findings": len(final.defects),
        "new": new,
        "fixed": fixed,
        "persistent": persistent,
        "unmatched_draft": draft_unmatched,
        "unmatched_final": final_unmatched,
        "final_formulas": formulas,
        "new_per_1000_formulas": round(new * 1000 / formulas, 2) if formulas else None,
        "draft_seconds": round(draft_took),
        "final_seconds": round(final_took),
        "new_samples": [
            {
                "rule": rule,
                "sheet": sheet,
                "name": name,
                "refs": [
                    f.ref
                    for f in final.defects
                    if f.rule == rule and f.sheet == sheet and name_of(f) == name
                ][:3],
            }
            for (rule, sheet, name) in list((final_keys - draft_keys).keys())[:40]
        ],
    }
    return result


def main() -> None:
    draft_path, final_path = sys.argv[1], sys.argv[2]
    label = sys.argv[3] if len(sys.argv) > 3 else ""
    result = diff(draft_path, final_path, label)
    samples = result.pop("new_samples")
    print(
        f"{result['label']}: draft={result['draft_findings']} "
        f"final={result['final_findings']} NEW={result['new']} "
        f"FIXED={result['fixed']} PERSISTENT={result['persistent']} "
        f"UNMATCHED(d/f)={result['unmatched_draft']}/{result['unmatched_final']} "
        f"formulas={result['final_formulas']} "
        f"new/1k={result['new_per_1000_formulas']}",
        flush=True,
    )
    for s in samples:
        print(
            f"  NEW [{s['rule']}] {s['sheet']}!{','.join(s['refs'])} {s['name'][:60]!r}",
            flush=True,
        )


if __name__ == "__main__":
    main()
