"""Where the time and the memory go on the six giant Ofgem models.

Measurement only. This script changes nothing in `polar/tieout/` and is
not permitted to: A1's fixes belong to Sentinel, and this is the
« profile first » half done by someone whose only job is the truth of it.

Two questions, answered per file:

  * **reader or audit?** The split decides who fixes what — narrowing
    what the reader keeps is one job, changing an algorithm is another.
  * **what holds the gigabytes?** Peak resident memory is reported
    beside the stage that was running when it peaked.

    uv run python -m scripts.corpus_giant_profile split <file>...
    uv run python -m scripts.corpus_giant_profile objects <file>
"""

import gc
import resource
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any

CORPUS = Path(__file__).parent / "corpus_au_uk"

#: The six the orders name, worst first, plus the WACC model for contrast.
GIANTS = [
    "ofgem_riio3/final_gd3_bpfm.xlsm",
    "ofgem_riio3/draft/RIIO GD3 BPFM_Draft Determinations_Jun25.xlsm",
    "ofgem_riio3/final_gt3_bpfm.xlsm",
    "ofgem_riio3/final_et3_bpfm.xlsm",
    "ofgem_riio3/draft/RIIO GT3 BPFM_Draft Determinations_Jun25.xlsm",
    "ofgem_riio3/draft/RIIO ET3 BPFM_Draft Determinations_Jun25.xlsm",
]


def peak_mb() -> float:
    """Peak resident set size for this process, in MB.

    `ru_maxrss` is a high-water mark and never falls, which is what we
    want: the question is whether this fits in 512 MB at any instant,
    not what is live at the end.
    """
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0


def split(path: Path) -> None:
    from polar.tieout.audit import audit
    from polar.tieout.structure import period_axes
    from polar.tieout.workbook import read_workbook

    start_mb = peak_mb()
    t0 = time.perf_counter()
    book = read_workbook(str(path))
    t1 = time.perf_counter()
    after_read_mb = peak_mb()

    axes = period_axes(book)
    t2 = time.perf_counter()

    result = audit(book, axes=axes)
    t3 = time.perf_counter()
    after_audit_mb = peak_mb()

    cells = len(book.cells)
    formulas = sum(1 for cell in book.cells.values() if cell.formula)
    print(f"{path.name}  {path.stat().st_size / 1e6:.1f} MB")
    print(f"   cells {cells:,}   formulas {formulas:,}   sheets {len(book.sheets)}")
    print(
        f"   read      {t1 - t0:8.1f} s     peak after read   {after_read_mb:8.0f} MB"
    )
    print(f"   axes      {t2 - t1:8.1f} s")
    print(
        f"   audit     {t3 - t2:8.1f} s     peak after audit  {after_audit_mb:8.0f} MB"
    )
    print(
        f"   TOTAL     {t3 - t0:8.1f} s     peak overall      {after_audit_mb:8.0f} MB"
    )
    print(f"   (process began at {start_mb:.0f} MB)")
    print(f"   findings  {len(result.findings)}")


def objects(path: Path) -> None:
    """What is on the heap after the read, counted by type and by owner.

    Counts, not `sys.getsizeof`: the question Sentinel needs answered is
    *which structure* holds the memory, and a count of 30 million tuples
    names it more usefully than a byte total that hides who allocated it.
    """
    from polar.tieout.workbook import read_workbook

    book = read_workbook(str(path))
    gc.collect()
    kinds: Counter[str] = Counter()
    for obj in gc.get_objects():
        kinds[type(obj).__name__] += 1
    print(f"{path.name}  peak {peak_mb():.0f} MB   cells {len(book.cells):,}")
    print("   heap by type, top 15:")
    for name, count in kinds.most_common(15):
        print(f"      {count:12,}  {name}")

    precedents = 0
    references = 0
    for cell in book.cells.values():
        got: Any = getattr(cell, "precedents", None)
        if got is not None:
            precedents += len(got)
        got = getattr(cell, "references", None)
        if got is not None:
            references += len(got)
    print(f"   precedent entries across all cells: {precedents:,}")
    print(f"   reference entries across all cells: {references:,}")


def precedents(path: Path) -> None:
    """How big is the precedent list, and how much of it is repeated?

    `gc.get_objects()` cannot answer this: CPython untracks a tuple whose
    members are all immutable, so 23.5 million precedent tuples are
    invisible to a heap walk and the type census above under-reports them
    by three orders of magnitude. Counted directly instead.
    """
    import sys as _sys

    from polar.tieout.workbook import read_workbook

    book = read_workbook(str(path))
    total = 0
    unique: set[str] = set()
    tuple_bytes = 0
    string_bytes = 0
    seen_ids: set[int] = set()
    for cell in book.cells.values():
        got = getattr(cell, "precedents", None)
        if not got:
            continue
        total += len(got)
        tuple_bytes += _sys.getsizeof(got)
        for ref in got:
            if ref not in unique:
                unique.add(ref)
                string_bytes += _sys.getsizeof(ref)
            if id(ref) not in seen_ids:
                seen_ids.add(id(ref))
    print(f"{path.name}   cells {len(book.cells):,}   peak {peak_mb():.0f} MB")
    print(f"   precedent entries          {total:,}")
    print(f"   distinct precedent strings {len(unique):,}")
    print(f"   distinct string OBJECTS    {len(seen_ids):,}")
    print(f"   container overhead         {tuple_bytes / 1e6:,.0f} MB")
    print(f"   unique string payload      {string_bytes / 1e6:,.0f} MB")
    if len(seen_ids) and len(unique):
        print(f"   sharing already present    {1 - len(seen_ids) / max(total, 1):.1%}")
        print(
            f"   headroom if fully shared   {1 - len(unique) / len(seen_ids):.1%} of objects"
        )


def shape(path: Path) -> None:
    """What the reader's resident memory is actually made of.

    Reported because the first guess -- expanded precedents -- turned out
    to be 271 MB of a 1,267 MB peak, so the rest had to be named rather
    than assumed.
    """
    import sys as _sys

    from polar.tieout.workbook import read_workbook

    book = read_workbook(str(path))
    cells = book.cells
    formula_bytes = 0
    formula_objects: set[int] = set()
    label_bytes = 0
    label_objects: set[int] = set()
    cell_bytes = 0
    value_bytes = 0
    for cell in cells.values():
        cell_bytes += _sys.getsizeof(cell)
        text = getattr(cell, "formula", None)
        if text is not None and id(text) not in formula_objects:
            formula_objects.add(id(text))
            formula_bytes += _sys.getsizeof(text)
        label = getattr(cell, "row_label", None)
        if label is not None and id(label) not in label_objects:
            label_objects.add(id(label))
            label_bytes += _sys.getsizeof(label)
        got = getattr(cell, "value", None)
        if got is not None:
            value_bytes += _sys.getsizeof(got)
    words = sum(
        _sys.getsizeof(text)
        for rows in book.row_words.values()
        for text in rows.values()
    )
    print(f"{path.name}   cells {len(cells):,}   peak {peak_mb():.0f} MB")
    print(f"   Cell objects (shallow)   {cell_bytes / 1e6:8,.0f} MB")
    print(
        f"   formula text             {formula_bytes / 1e6:8,.0f} MB  ({len(formula_objects):,} distinct)"
    )
    print(f"   values (Decimal etc.)    {value_bytes / 1e6:8,.0f} MB")
    print(
        f"   row labels on cells      {label_bytes / 1e6:8,.0f} MB  ({len(label_objects):,} distinct)"
    )
    print(f"   book.row_words           {words / 1e6:8,.0f} MB")
    print(f"   the cells dict itself    {_sys.getsizeof(cells) / 1e6:8,.0f} MB")


def main(argv: list[str]) -> int:
    if not argv or argv[0] not in ("split", "objects", "precedents", "shape"):
        print(__doc__)
        return 2
    names = argv[1:] or GIANTS
    for name in names:
        path = Path(name)
        if not path.exists():
            path = CORPUS / name
        if not path.exists():
            print(f"missing: {name}")
            continue
        {"split": split, "objects": objects, "precedents": precedents, "shape": shape}[
            argv[0]
        ](path)
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
