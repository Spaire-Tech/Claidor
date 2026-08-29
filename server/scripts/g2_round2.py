"""G2 round 2 — the two questions round 1 could not ask properly.

Round 1 hit two problems that were mine, not the product's: `inventory`
was called with « typed inputs » when its vocabulary is « typed », and
Q2 was asked of a values-pasted close copy, where nothing feeds
anything because the file holds no formulas. Both are fixed here.

    uv run python -m scripts.g2_round2 MODEL [MODEL ...]
"""

import json
import sys
from typing import Any
from uuid import uuid4

from polar.tieout.agent.model_tools import (
    build_workspace,
    inventory,
    locate,
    trace_back,
)
from polar.tieout.workbook import read_workbook

SHOWN = 8


def show(title: str, asked: str, result: Any) -> None:
    print(f"\n{'-' * 70}\n{title}\n  asked: {asked}")
    print(f"  ok      : {result.ok}")
    print(f"  summary : {result.summary}")
    for key, value in result.data.items():
        if isinstance(value, list):
            print(f"  {key} ({len(value)}):")
            for row in value[:SHOWN]:
                print(f"      {json.dumps(row, default=str)[:260]}")
        else:
            print(f"  {key}: {str(value)[:400]}")


def main() -> None:
    for path in sys.argv[1:]:
        name = path.split("/")[-1]
        book = read_workbook(path)
        formulas = sum(1 for cell in book.cells.values() if cell.formula)
        print(f"\n{'=' * 70}\n# {name}")
        print(f"  {len(book.cells)} cells, {formulas} with formulas")
        if formulas == 0:
            print("  values-pasted: no walk is possible in this file, by nature")
            continue

        space = build_workspace(
            dossier_id=uuid4(),
            name="G2 bench",
            filename=name,
            version=1,
            book=book,
            axes={},
            versions_list=[{"version": 1, "when": "", "by": ""}],
            diff=None,
        )

        found = locate(space, "equity IRR")
        show("Q2 — locate", "locate('equity IRR')", found)
        if found.ok:
            for row in found.data["rows"][:3]:
                show(
                    "Q2 — what feeds it",
                    f"trace_back({row['ref']!r})",
                    trace_back(space, row["ref"]),
                )

        show("Q3 — typed inputs", "inventory('typed')", inventory(space, "typed"))
        show("Q4 — hardcodes", "inventory('hardcodes')", inventory(space, "hardcodes"))


if __name__ == "__main__":
    main()
