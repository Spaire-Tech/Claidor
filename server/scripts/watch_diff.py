"""Run the Watch's raw diff (C1) and write it where eyes can reach it.

Output carries the same status lists as `scripts.watch_handcheck`
(added / removed / formula_changed / value_changed, plus counts), so
the registered comparison between the two instruments is a mechanical
set comparison, not an interpretation.

    uv run python -m scripts.watch_diff OLD.xlsx NEW.xlsx OUT.json
"""

import json
import sys
from pathlib import Path

from polar.tieout.watch import diff_paths


def main() -> int:
    old_path, new_path, out_path = sys.argv[1:4]
    diff = diff_paths(old_path, new_path)
    changed = [delta for delta in diff.deltas if delta.kind == "changed"]
    payload = {
        "summary": diff.summary,
        "sheets_added": list(diff.sheets_added),
        "sheets_removed": list(diff.sheets_removed),
        "added": diff.refs("added"),
        "removed": diff.refs("removed"),
        "formula_changed": [d.ref for d in changed if d.formula_changed],
        "value_changed": [d.ref for d in changed if d.value_changed],
        "examples": [
            {
                "ref": d.ref,
                "before": (d.before_content or "")[:180],
                "after": (d.after_content or "")[:180],
            }
            for d in changed[:200]
        ],
    }
    Path(out_path).write_text(json.dumps(payload, indent=1))
    print(json.dumps(diff.summary, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
