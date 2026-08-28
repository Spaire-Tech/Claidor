"""Every disagreement in full, not a capped sample.

Criterion 2 of `a6-intake.md` requires each one enumerated and
hand-read, so the sampling in the sweep is not enough to close the
round.
"""

import collections
import sys
import warnings
from pathlib import Path

from scripts.a6_fidelity import _converted, _witness_xls, _witness_xlsb

warnings.filterwarnings("ignore")

CORPUS = Path(__file__).parent / "corpus_sft"


def main() -> None:
    converted_dir = Path(sys.argv[1])
    for name in sys.argv[2:]:
        original = CORPUS / name
        witness = (
            _witness_xlsb(original)
            if original.suffix.lower() == ".xlsb"
            else _witness_xls(original)
        )
        after = _converted(converted_dir / (original.stem + ".xlsx"))
        before_values, after_values = witness["values"], after["values"]

        missing = {k: v for k, v in before_values.items() if k not in after_values}
        added = {k: v for k, v in after_values.items() if k not in before_values}
        print(f"=== {name}")
        print(f"  missing {len(missing)}, added {len(added)}")

        if missing:
            zeros = sum(1 for v in missing.values() if v == 0.0)
            print(f"    missing that are exactly 0.0: {zeros} of {len(missing)}")
            print(
                "    sheets:", collections.Counter(k[0] for k in missing).most_common(6)
            )
            nonzero = [(k, v) for k, v in missing.items() if v != 0.0]
            print(f"    missing non-zero: {len(nonzero)}", nonzero[:8])
        if added:
            zeros = sum(1 for v in added.values() if v == 0.0)
            print(f"    added that are exactly 0.0: {zeros} of {len(added)}")
            print(
                "    sheets:", collections.Counter(k[0] for k in added).most_common(8)
            )
            nonzero = [(k, v) for k, v in added.items() if v != 0.0]
            print(f"    added non-zero: {len(nonzero)}", nonzero[:8])
        print(
            "    sheets in witness but not converted:",
            sorted(set(witness["sheets"]) - set(after["sheets"])),
        )
        print(
            "    sheets in converted but not witness:",
            sorted(set(after["sheets"]) - set(witness["sheets"])),
        )


if __name__ == "__main__":
    main()
