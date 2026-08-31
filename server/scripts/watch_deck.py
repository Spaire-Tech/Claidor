"""C5 — run the Watch on a deck across two model versions.

    uv run python -m scripts.watch_deck OLD.xlsx NEW.xlsx DECK.pptx OUT.json

**The new model must carry real cached values.** A revision saved
by openpyxl carries none, and the tie-out then reconciles a
fraction of what it reconciled before — the first C5 round lost 90
of 111 figures that way and reported them as `coverage_changed`,
which was the instrument talking, not the deck. Recalculate the
revision with a real engine first (`recalc.UnoCalculator` with
`store_to`), exactly as a person saving in Excel would.
"""

import json
import sys
from dataclasses import asdict
from pathlib import Path

from polar.tieout.watch import deck_delta


def main() -> int:
    old_model, new_model, deck, out_path = sys.argv[1:5]
    result = deck_delta(old_model, new_model, deck)
    payload = {
        "old_model": old_model,
        "new_model": new_model,
        "deck": deck,
        "summary": result.summary,
        "broken": [asdict(item) for item in result.broken],
        "repaired": [asdict(item) for item in result.repaired],
        "still_drifting": [asdict(item) for item in result.still_drifting],
        "coverage_changed": [asdict(item) for item in result.coverage_changed],
    }
    Path(out_path).write_text(json.dumps(payload, indent=1, default=str))
    print(json.dumps(result.summary, indent=1))
    for item in result.broken:
        print(
            f"  slide {item.slide}: {item.printed} → should read {item.expected}"
            f"  ({item.name[:40]})"
        )
        print(
            f"      because — {item.cause or 'the delta names no change at this row'}"
        )
    if result.still_drifting:
        print(
            f"  {len(result.still_drifting)} figure(s) already disagreed before this "
            "revision and are not counted against it"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
