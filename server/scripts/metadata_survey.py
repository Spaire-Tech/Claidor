"""What the metadata checker finds in files nobody here made.

    uv run python -m scripts.document_corpus     # fetch, once
    uv run python -m scripts.metadata_survey     # measure
    uv run python -m scripts.metadata_survey --rule speaker-notes

**Two numbers, and the second is the one to watch.** How often a rule
fires says the rule works. How many files come back with *nothing* says
whether a report on a clean file looks clean — and a checker that finds
something in every file has found nothing in any of them.

There is no recall number here and there cannot be one. Nobody has
labelled these files, so « how many speaker notes did it miss » has no
answer short of opening 29 decks by hand. What can be checked, and was, is
the other direction: every finding printed by `--rule` can be confirmed by
unzipping the file and reading the part. That is how the four defects
listed in `docs/pierce/accuracy-backlog.md` were found — by reading the
output, not by running it.
"""

import collections
import sys
from pathlib import Path

from polar.tieout.metadata import NotAnOfficeFile, read_metadata

HERE = Path(__file__).parent / "corpus_documents"


def main() -> int:
    if not HERE.exists():
        print(f"No corpus. Run:  uv run python -m scripts.document_corpus\n{HERE}")
        return 1

    only = ""
    if "--rule" in sys.argv:
        only = sys.argv[sys.argv.index("--rule") + 1]

    files = sorted(one for one in HERE.iterdir() if one.is_file())
    findings: collections.Counter[str] = collections.Counter()
    carrying: collections.Counter[str] = collections.Counter()
    grade: dict[str, str] = {}
    kinds: collections.Counter[str] = collections.Counter()
    refused: list[tuple[str, str]] = []
    silent = quiet = 0

    for path in files:
        try:
            report = read_metadata(str(path))
        except NotAnOfficeFile as problem:
            refused.append((path.name, str(problem)))
            continue
        except Exception as problem:
            refused.append((path.name, f"CRASHED: {type(problem).__name__} {problem}"))
            continue

        kinds[report.kind] += 1
        silent += not report.findings
        quiet += not report.leaks
        for one in report.findings:
            findings[one.rule] += 1
            grade[one.rule] = one.severity
        for rule in {one.rule for one in report.findings}:
            carrying[rule] += 1

        if only:
            for one in report.findings:
                if one.rule != only:
                    continue
                print(f"\n{path.name}\n  {one.where}\n  {one.detail}")
                if one.evidence:
                    print(f"  → {one.evidence}")

    if only:
        return 0

    print(f"\n{len(files)} files · " + " · ".join(f"{n} {k}" for k, n in kinds.items()))
    print(
        f"{len(refused)} refused · {silent} with nothing at all · {quiet} with no leaks"
    )
    print(f"\n{'rule':<24}{'grade':<8}{'files':>6}{'found':>7}")
    for rule, count in findings.most_common():
        print(f"{rule:<24}{grade[rule]:<8}{carrying[rule]:>6}{count:>7}")

    if refused:
        print("\nRefused, and why:")
        for name, why in refused:
            print(f"  {name[:52]:<52} {why[:70]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
