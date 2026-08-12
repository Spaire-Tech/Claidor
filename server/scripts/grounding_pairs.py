"""Does a source document actually ground a workbook nobody here wrote?

    uv run python -m scripts.grounding_pairs <folder-with-a-pdf-and-a-workbook>
    uv run python -m scripts.grounding_pairs --all

**The one leg of the chain that has never met a real pair.** The tie-out
(deck against model) has been measured on real decks. The formula graph has
been measured on real models. The figure reader has been measured on a real
annual report. But *grounding* — a figure in a source document matched to
the typed input cell it is the origin of — has only ever run against the
Cascade fixture, where the accounts and the model were both written here,
by the same hand, on the same afternoon. That is not evidence of anything.

**What a real pair is, and where to find one.** A government department
publishing a report and the spreadsheet behind it on the same page, on the
same day, is exactly the shape: a PDF stating figures, and a workbook whose
typed cells are where those figures came from. Nobody involved has heard of
us and nobody wrote either file to be matched.

**What it can and cannot say.** It can say how many of a document's figures
the linker attaches to a cell, how many it declines, and — by printing them
— whether the attachments are right. It cannot produce a recall number,
because nobody has labelled which figure belongs to which cell. Reading the
printed links is the measurement; the counts are only the shape of it.

**The direction is inverted from a deal and that is fine.** On a deal the
accounts come first and the model is built from them. Here the spreadsheet
is usually the published data and the PDF is the report written from it.
The matching problem is identical in both directions: a figure named by
prose against a cell named by its row and column.
"""

import sys
from pathlib import Path

from polar.tieout.check import compare
from polar.tieout.link import link
from polar.tieout.provenance import inputs_from_workbook
from polar.tieout.source import NotAPdf, read_source
from polar.tieout.workbook import read_workbook

HERE = Path(__file__).parent / "corpus_pairs"


def _measure(folder: Path, *, show: int) -> bool:
    # The biggest of each. A publication carries its report and also its
    # pre-release access declaration — two pages listing job titles and no
    # figures at all — and reading that one produces « 0 figures », which
    # looks like a defect in the reader and is a defect in the choosing.
    pdfs = sorted(folder.glob("*.pdf"), key=lambda one: -one.stat().st_size)
    books = sorted(
        (one for one in folder.iterdir() if one.suffix.lower() in (".xlsx", ".xlsm")),
        key=lambda one: -one.stat().st_size,
    )
    if not pdfs or not books:
        print(f"{folder.name}: needs one PDF and one workbook")
        return False

    document, workbook = pdfs[0], books[0]
    print(f"\n=== {folder.name}")
    print(f"    {document.name}\n    {workbook.name}")

    try:
        extraction = read_source(str(document))
    except NotAPdf as problem:
        print(f"    the PDF was refused: {problem}")
        return False
    try:
        book = read_workbook(str(workbook))
    except Exception as problem:
        print(f"    the workbook was refused: {type(problem).__name__} {problem}")
        return False

    inputs = inputs_from_workbook(book)
    links, unlinked = link(extraction.figures, inputs)
    contradictions, agreed = compare(links)

    print(
        f"    {len(extraction.figures):,} named figures "
        f"({extraction.rejected:,} rejected as unnamed) · "
        f"{len(inputs):,} typed input cells of {len(book.cells):,}"
    )
    if not extraction.figures or not inputs:
        return False
    print(
        f"    linked {len(links):,} ({100 * len(links) / len(extraction.figures):.0f}%)"
        f" · agreed {len(agreed):,} · contradicted {len(contradictions):,}"
    )

    reasons: dict[str, int] = {}
    for one in unlinked:
        reasons[one.reason] = reasons.get(one.reason, 0) + 1
    for reason, count in sorted(reasons.items(), key=lambda one: -one[1])[:4]:
        print(f"      declined · {count:>5}  {reason}")

    # **The links themselves are the measurement.** Printed strongest
    # first, because a wrong link with a high score is the failure this
    # product cannot pay for and a wrong link with a low one is noise.
    for made in sorted(links, key=lambda one: -one.score)[:show]:
        print(
            f"      {made.score:.2f} (next {made.runner_up:.2f})  "
            f"{made.figure.printed:>12}  p{made.figure.slide:<4} "
            f"{made.figure.label[:44]!r}\n"
            f"{'':>22}→ {made.output.ref} {made.output.name[:44]!r} "
            f"= {made.output.value}"
        )
    return True


def main() -> int:
    show = 12
    words = sys.argv[1:]
    if "--show" in words:
        at = words.index("--show")
        show = int(words[at + 1])
        del words[at : at + 2]

    folders = [Path(one) for one in words if not one.startswith("--")]
    if "--all" in words or not folders:
        if not HERE.exists():
            print(f"No pairs. Put a PDF and a workbook in a folder under {HERE}")
            return 1
        folders = sorted(one for one in HERE.iterdir() if one.is_dir())

    measured = sum(_measure(one, show=show) for one in folders)
    print(f"\n{measured} of {len(folders)} pairs measured")
    return 0 if measured else 1


if __name__ == "__main__":
    raise SystemExit(main())
