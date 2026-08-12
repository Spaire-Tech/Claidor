"""What is in this file that is not on its screen.

    uv run python -m scripts.metadata_check ~/Downloads/deck.pptx
    uv run python -m scripts.metadata_check *.xlsx --traces

**One file, read cold.** No deal, no model, no corpus, no login — hand it
any `.docx`, `.xlsx` or `.pptx` and it prints what travels with it. That is
the whole of this check and it is why it exists separately from everything
else in `polar.tieout`: it is the one thing here that can be judged by
somebody who has never seen this product, on a file we have never seen.

Leaks are printed first and traces only on request, because they are
different questions. « What can the recipient read that I did not put on
the page » is the one that ruins an afternoon. « Whose name is on it » is
worth knowing and is not an emergency.
"""

import sys
from pathlib import Path

from polar.tieout.metadata import NotAnOfficeFile, Report, read_metadata

BOLD, DIM, OFF = "\033[1m", "\033[2m", "\033[0m"
RED, YELLOW = "\033[31m", "\033[33m"


def _show(path: Path, report: Report, *, traces: bool) -> None:
    print(f"\n{BOLD}{path.name}{OFF}  {DIM}{report.kind}, {report.parts} parts{OFF}")

    if not report.leaks:
        print(f"  {DIM}Nothing in this file that is not on its page.{OFF}")
    for finding in report.leaks:
        print(f"  {RED}·{OFF} {BOLD}{finding.where}{OFF} — {finding.detail}")
        if finding.evidence:
            print(f"      {DIM}“{finding.evidence}”{OFF}")

    if not traces:
        if report.traces:
            print(f"  {DIM}and {len(report.traces)} traces — pass --traces{OFF}")
        return
    for finding in report.traces:
        print(f"  {YELLOW}·{OFF} {finding.where} — {finding.detail}")
        if finding.evidence:
            print(f"      {DIM}“{finding.evidence}”{OFF}")


def main() -> int:
    arguments = [one for one in sys.argv[1:] if not one.startswith("--")]
    traces = "--traces" in sys.argv
    if not arguments:
        print(__doc__)
        return 2

    worst = 0
    for name in arguments:
        path = Path(name)
        try:
            report = read_metadata(str(path))
        except NotAnOfficeFile as problem:
            print(f"\n{BOLD}{path.name}{OFF}\n  {problem}")
            worst = max(worst, 1)
            continue
        except OSError as problem:
            print(f"\n{BOLD}{path.name}{OFF}\n  {problem}")
            worst = max(worst, 1)
            continue
        _show(path, report, traces=traces)
        if report.leaks:
            worst = max(worst, 1)
    print()
    return worst


if __name__ == "__main__":
    raise SystemExit(main())
