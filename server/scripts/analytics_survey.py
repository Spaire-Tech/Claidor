"""Round harness for the analytical checks — Phase 2 of the protocol.

Runs the structure layer and the analytical checks over every corpus
model and prints findings and abstentions. Expectation on published
files: zero balance and time-axis findings; own-check findings only
where the model's own rows genuinely fire, each hand-read before it
counts.

Usage:  uv run python scripts/analytics_survey.py [substring…]
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from polar.tieout.analytics import run_analytics
from polar.tieout.structure import read_structure
from polar.tieout.workbook import read_workbook

HERE = Path(__file__).parent
CORPORA = [HERE / 'corpus_pr24dd', HERE / 'corpus_sft']


def models() -> list[Path]:
    found: list[Path] = []
    for corpus in CORPORA:
        if not corpus.exists():
            continue
        for path in sorted(corpus.iterdir()):
            if path.suffix.lower() in ('.xlsx', '.xlsm', '.xls'):
                found.append(path)
    return found


def survey(path: Path) -> None:
    started = time.monotonic()
    try:
        book = read_workbook(str(path))
    except Exception as problem:  # noqa: BLE001
        print(f"\n=== {path.name}: UNREADABLE — {problem}")
        return
    structure = read_structure(book)
    analytics = run_analytics(book, structure)
    took = time.monotonic() - started

    print(f"\n=== {path.name} ({took:.0f}s)")
    if not analytics.findings:
        print("  findings: none")
    for finding in analytics.findings:
        print(f"  FINDING [{finding.rule}] {finding.ref}: {finding.detail}")
    for abstention in analytics.abstentions:
        print(f"  abstains ({abstention.rule}): {abstention.why}")


if __name__ == '__main__':
    wanted = [w.lower() for w in sys.argv[1:]]
    for path in models():
        if wanted and not any(w in path.name.lower() for w in wanted):
            continue
        survey(path)
