"""Measure the engine against real regulator models and documents.

The corpus is fetched by hand into ``scripts/corpus_regulator/`` (see
``docs/pierce/corpus-sources.md`` — Ofwat PR24 final-determination
models via the UK Government Web Archive, Ofgem RIIO-3 models from
ofgem.gov.uk). Nothing in it was made by anyone on this team, which is
the point: these are the first crosscheck and audit numbers measured
against foreign files.

Subcommands, each printing what it measured:

    uv run python -m scripts.regulator_eval ingest <file...>
        Read each file through the real ingest path. Prints timing,
        cell/formula counts, defect counts — the "can Pierce even open
        a real company model, and how long does it take" table.

    uv run python -m scripts.regulator_eval audit <model> [refs...]
        Ingest a model, print its defects by rule, and — when cell
        refs are given — say whether each was flagged. Used with the
        ground truth Ofwat's own queries document names (FM02
        Northumbrian/Yorkshire InpS!N1885-1888, hard-keyed where every
        other year is a formula).

    uv run python -m scripts.regulator_eval crosscheck <pdf> <model>
        The real pipeline: source figures -> workbook candidates ->
        two-pass linker -> compare. Prints every proposed link with its
        confidence so precision can be adjudicated by hand, and the
        unlinked count. Recall is only claimable against a hand-built
        list of quoted values, which lives in the accuracy backlog, not
        here.

    uv run python -m scripts.regulator_eval overlap <pdf> <model>
        The upper bound a value-aware linker could ever reach: how many
        document figures share an exact value with any model cell.
        Prints samples, which is how the bound was found to be mostly
        coincidence (small round numbers occur everywhere).
"""

import sys
import time
import warnings
from collections import Counter
from pathlib import Path

warnings.filterwarnings("ignore")

from polar.tieout.check import compare  # noqa: E402
from polar.tieout.ingest import (  # noqa: E402
    Ingested,
    Unreadable,
    kind_for,
    read_artifact,
)
from polar.tieout.link import link as propose_links  # noqa: E402
from polar.tieout.provenance import outputs_from_workbook  # noqa: E402
from polar.tieout.workbook import Workbook  # noqa: E402


def _read(path: Path) -> tuple[Ingested, float]:
    kind = kind_for(path.name)
    if kind is None:
        raise Unreadable(f"{path.name} is not a kind of file this reads")
    start = time.monotonic()
    got = read_artifact(path.read_bytes(), path.name, kind)
    return got, time.monotonic() - start


def _book_of(model: Ingested) -> Workbook:
    book = Workbook()
    for cell in model.cells:
        book.cells[cell.ref] = cell
    book.sheets = list(dict.fromkeys(cell.sheet for cell in model.cells))
    return book


def ingest(paths: list[str]) -> None:
    for name in paths:
        path = Path(name)
        try:
            got, took = _read(path)
        except Unreadable as error:
            print(f"{path.name[:52]:54} UNREADABLE: {error}", flush=True)
            continue
        c = got.counts
        print(
            f"{path.name[:52]:54} {took:7.1f}s"
            f" cells={c.get('cells', '-'):>7} formulas={c.get('formulas', '-'):>7}"
            f" figures={len(got.figures):>5} defects={len(got.defects):>5}"
            f" outputs={len(got.outputs)}",
            flush=True,
        )


def audit(path: str, refs: list[str]) -> None:
    got, took = _read(Path(path))
    print(f"{Path(path).name}: {took:.0f}s, {len(got.defects)} defects", flush=True)
    for rule, n in Counter(d.rule for d in got.defects).most_common():
        print(f"  {rule:28} {n:>6}", flush=True)
    if refs:
        flagged = {d.ref: d for d in got.defects}
        hits = 0
        for ref in refs:
            defect = flagged.get(ref)
            if defect is None:
                print(f"  MISS {ref}: not flagged", flush=True)
            else:
                hits += 1
                print(
                    f"  HIT  {ref} [{defect.rule}/{defect.severity}]"
                    f" {defect.detail[:110]}",
                    flush=True,
                )
        print(f"ground truth: {hits} of {len(refs)} flagged", flush=True)


def crosscheck(pdf: str, model: str) -> None:
    doc, doc_took = _read(Path(pdf))
    got, model_took = _read(Path(model))
    candidates = outputs_from_workbook(_book_of(got))
    print(
        f"{Path(pdf).name} ({len(doc.figures)} figures, {doc_took:.0f}s) vs"
        f" {Path(model).name} ({len(candidates)} candidates, {model_took:.0f}s)",
        flush=True,
    )
    start = time.monotonic()
    proposed, unlinked = propose_links(list(doc.figures), candidates)
    drifts, agreed = compare(proposed)
    print(
        f"linker: {time.monotonic() - start:.0f}s;"
        f" linked={len(proposed)} agreed={len(agreed)}"
        f" drifts={len(drifts)} unlinked={len(unlinked)}",
        flush=True,
    )
    for item in proposed:
        fig = item.figure
        state = "agrees"
        for drift in drifts:
            if drift.printed == fig.printed and drift.slide == fig.slide:
                state = f"DRIFT (model says {drift.expected})"
                break
        print(
            f"  p{fig.slide:>3} {fig.printed!r:>14} {state:24}"
            f" -> {item.output.ref} {item.output.name[:44]!r}"
            f" conf={item.confidence:.2f}  label={fig.label[:60]!r}",
            flush=True,
        )


def overlap(pdf: str, model: str) -> None:
    doc, _ = _read(Path(pdf))
    got, _ = _read(Path(model))
    values = {
        round(float(cell.value), 3)
        for cell in got.cells
        if cell.value is not None and cell.value
    }
    shared = [
        figure
        for figure in doc.figures
        if figure.value is not None and round(float(figure.value), 3) in values
    ]
    print(
        f"model values={len(values)} document figures={len(doc.figures)}"
        f" sharing a value={len(shared)}",
        flush=True,
    )
    for figure in shared[:10]:
        print(f"  p{figure.slide} {figure.printed!r} label={figure.label[:70]!r}")


def main() -> None:
    if len(sys.argv) < 3:
        print(__doc__)
        raise SystemExit(1)
    verb, rest = sys.argv[1], sys.argv[2:]
    if verb == "ingest":
        ingest(rest)
    elif verb == "audit":
        audit(rest[0], rest[1:])
    elif verb == "crosscheck":
        crosscheck(rest[0], rest[1])
    elif verb == "overlap":
        overlap(rest[0], rest[1])
    else:
        print(__doc__)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
