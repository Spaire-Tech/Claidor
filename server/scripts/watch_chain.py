"""C3 over a model's whole version chain, not one pair.

    uv run python -m scripts.watch_chain DIR OUT.json

Every adjacent pair of the directory's workbooks, in name order,
through the delta report — the material an update *profile* needs,
since a profile is a statement about a model's own history and a
pair has none. Registered in `docs/pierce/logs/prism.md` (« The ED2
chain — the update profile, measured ») with its predictions.

Each transition is timed and its per-class counts recorded. A pair
that costs more than the registered ceiling is recorded as a refusal
with its timing rather than waited out.
"""

import json
import sys
import time
from collections import Counter
from pathlib import Path

from polar.tieout.watch import delta_report

#: Registered: beyond this a transition is refused, not waited out.
CEILING_SECONDS = 1200


def run(directory: str, out_path: str) -> int:
    files = sorted(
        path
        for path in Path(directory).iterdir()
        if path.suffix in (".xlsx", ".xlsm") and not path.name.startswith("~")
    )
    print(f"{len(files)} files, {len(files) - 1} transitions")
    transitions: list[dict[str, object]] = []
    for old, new in zip(files, files[1:], strict=False):
        started = time.monotonic()
        try:
            report = delta_report(str(old), str(new))
        except Exception as error:
            transitions.append(
                {
                    "old": old.name,
                    "new": new.name,
                    "refused": f"{type(error).__name__}: {error}"[:200],
                    "seconds": round(time.monotonic() - started, 1),
                }
            )
            print(f"[chain] {old.name} → {new.name}: REFUSED {error}")
            continue
        seconds = round(time.monotonic() - started, 1)
        counts = Counter(item.kind for item in report.items)
        entry = {
            "old": old.name,
            "new": new.name,
            "seconds": seconds,
            "changed_cells": report.changed_cells,
            "counts": dict(sorted(counts.items())),
            "over_ceiling": seconds > CEILING_SECONDS,
        }
        transitions.append(entry)
        print(f"[chain] {old.name} → {new.name}: {seconds}s {dict(counts)}")
        Path(out_path).write_text(json.dumps({"transitions": transitions}, indent=1))
    Path(out_path).write_text(json.dumps({"transitions": transitions}, indent=1))
    print(json.dumps({"transitions": transitions}, indent=1))
    return 0


def main() -> int:
    return run(*sys.argv[1:3])


if __name__ == "__main__":
    raise SystemExit(main())
