"""D1 measured: the Chain's extraction over the document corpus.

Runs `polar/tieout/chain/extract.py` over every PDF that
`scripts.corpus_documents` fetched and prints the numbers the Scribe
log registers before results are looked at: documents, pages, numbers
extracted, pages refused — and, with ``--spot-check``, draws the
registered seeded sample of extracted numbers and crops each one's
highlight box out of the rendered page into
`corpus_documents/pdfs/spot-checks/`, where a person verifies that the
box covers the digits. The crop is padded a few points so the verdict
is visibly about the box, not about tight cropping luck.

The extractor is imported by file location so this also runs in a bare
environment holding only pdfplumber (the server env does not carry it
yet — the dependency is proposed in the Scribe log).

    python -m scripts.corpus_documents_extract
    python -m scripts.corpus_documents_extract --spot-check
"""

import importlib.util
import random
import sys
from pathlib import Path

HERE = Path(__file__).parent / "corpus_documents" / "pdfs"
CHECKS = HERE / "spot-checks"

#: Registered in the Scribe log before any result existed.
SEED = 271828
SAMPLE = 10

_EXTRACT = Path(__file__).parent.parent / "polar" / "tieout" / "chain" / "extract.py"
_spec = importlib.util.spec_from_file_location("chain_extract", _EXTRACT)
assert _spec is not None
assert _spec.loader is not None
extract = importlib.util.module_from_spec(_spec)
sys.modules["chain_extract"] = extract
_spec.loader.exec_module(extract)


def main() -> int:
    pdfs = sorted(HERE.glob("*.pdf"))
    if not pdfs:
        print("no corpus — run scripts.corpus_documents first", file=sys.stderr)
        return 1

    documents = 0
    pages = 0
    numbers: list[tuple[Path, object]] = []
    refusals: list[tuple[Path, object]] = []
    failures: list[tuple[Path, str]] = []

    for pdf in pdfs:
        try:
            extraction = extract.extract_pdf(pdf)
        except Exception as problem:  # counted, not hidden
            failures.append((pdf, f"{type(problem).__name__}: {problem}"))
            continue
        documents += 1
        pages += len(extraction.pages)
        numbers.extend((pdf, number) for number in extraction.numbers)
        refusals.extend((pdf, refusal) for refusal in extraction.refusals)

    print(f"documents: {documents} readable of {len(pdfs)} fetched")
    print(f"pages: {pages}")
    print(f"numbers extracted: {len(numbers)}")
    print(f"pages refused: {len(refusals)}")
    for pdf, refusal in refusals:
        print(f"  [refused] {pdf.name}: {refusal.reason}")
    for pdf, why in failures:
        print(f"  [unreadable] {pdf.name}: {why}")

    if "--spot-check" in sys.argv and numbers:
        import pdfplumber

        CHECKS.mkdir(exist_ok=True)
        drawn = random.Random(SEED).sample(numbers, min(SAMPLE, len(numbers)))
        print(f"\nspot-check sample (seed {SEED}):")
        for index, (pdf, number) in enumerate(drawn, start=1):
            with pdfplumber.open(pdf) as book:
                page = book.pages[number.page - 1]
                pad = 24
                crop = page.crop(
                    (
                        max(0, number.box.x0 - pad),
                        max(0, number.box.top - pad),
                        min(page.width, number.box.x1 + pad),
                        min(page.height, number.box.bottom + pad),
                    )
                )
                image = crop.to_image(resolution=300)
                image.draw_rect(
                    (number.box.x0, number.box.top, number.box.x1, number.box.bottom),
                    stroke="red",
                    stroke_width=2,
                )
                out = CHECKS / f"{index:02d}.png"
                image.save(out)
            print(
                f"  {index:02d}: {number.text!r} = {number.value} — "
                f"{pdf.name} page {number.page} "
                f"box=({number.box.x0:.1f},{number.box.top:.1f},"
                f"{number.box.x1:.1f},{number.box.bottom:.1f}) -> {out.name}"
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
