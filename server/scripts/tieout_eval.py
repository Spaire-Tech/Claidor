"""Run the tie-out against the Cascade pair and print what it decided.

Two things are being measured and they are not the same thing.

**Quiet on the clean deck.** Every figure in `cascade_deck.pptx` agrees
with the model. Any drift reported is a false positive, and the target is
zero — not « few ». A checker that reports one wrong thing per deck is one
a banker stops opening.

**Loud on the broken deck.** `cascade_deck_broken.pptx` has injected
errors, and the target is all of them and nothing else. How many there
are is read from the two files rather than from the README, which says
four and undercounts by one — see `injected` below.

Between them sits the number that is easy to hide: how many figures were
*linked at all*. Silence from a checker that reconciled nothing looks
exactly like silence from a checker that reconciled everything and found
nothing wrong, so the link count is printed first and loudest.

    uv run python scripts/tieout_eval.py
    uv run python scripts/tieout_eval.py <clean.pptx> <broken.pptx> <model.xlsx>

With no arguments it runs against the vendored pair in `scripts/cascade/`.
"""

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from polar.tieout.check import tie_out
from polar.tieout.deck import read_deck
from polar.tieout.link import link
from polar.tieout.model import read_outputs


def injected(clean_path: str, broken_path: str) -> set[tuple[int, str]]:
    """The figures the broken deck actually got wrong.

    Read from the two files, not from the README beside them. The README
    says four breaks and that « slide 8 still prints 9.9x »; the file
    shipped six wrong figures and slide 8 prints 10.4x, because the
    injected 9.9x → 10.4x replacement hit every occurrence. Scoring
    against the prose would have marked a correct finding as a false
    positive and reported 80% precision on a run that made no mistakes.

    Ground truth is what is in the file.
    """
    clean = {
        (figure.slide, figure.location, figure.label): figure
        for figure in read_deck(clean_path).figures
    }
    wrong: set[tuple[int, str]] = set()
    for figure in read_deck(broken_path).figures:
        was = clean.get((figure.slide, figure.location, figure.label))
        if was is not None and was.printed != figure.printed:
            wrong.add((figure.slide, figure.printed))
    return wrong


def run(deck_path: str, model_path: str, title: str) -> None:
    print("=" * 78)
    print(title)
    print("=" * 78)

    result = tie_out(deck_path, model_path)
    figures = read_deck(deck_path).figures

    print(
        f"  {len(figures)} figures read, {result.checked} reconciled "
        f"({len(result.agreed)} agree, {len(result.drifts)} drift), "
        f"{len(result.unlinked)} not reconciled"
    )

    if result.drifts:
        print("\n  DRIFTS")
        for drift in result.drifts:
            print(
                f"    slide {drift.slide}: {drift.printed} "
                f"— {drift.ref} {drift.name} ({drift.source}, {drift.basis}) "
                f"says {drift.expected}   [{drift.confidence:.2f}]"
            )
            print(f"      {drift.location}")
            print(f"      « {drift.context[:110]} »")

    print("\n  LINKED AND AGREED")
    for item in sorted(result.agreed, key=lambda a: (a.figure.slide, a.output.ref)):
        print(
            f"    slide {item.figure.slide}  {item.figure.printed:>10}  "
            f"{item.output.ref:<4} {item.output.name:<38} "
            f"[{item.score:.2f} / {item.runner_up:.2f}]  "
            f"« {item.figure.label[:44]} »"
        )
    print()


def unlinked_report(deck_path: str, model_path: str) -> None:
    """Why each unreconciled figure was left alone.

    Read this before believing a zero. Most of these are correct refusals —
    peer multiples, sensitivity grids, timetable weeks — and a handful are
    figures the linker should have caught and did not.
    """
    outputs = read_outputs(model_path)
    figures = read_deck(deck_path).figures
    _, unlinked = link(figures, outputs)

    print("=" * 78)
    print("NOT RECONCILED, AND WHY")
    print("=" * 78)
    for item in sorted(unlinked, key=lambda u: u.figure.slide):
        print(
            f"  slide {item.figure.slide}  {item.figure.printed:>10}  "
            f"{item.reason:<52} « {item.figure.label[:40]} »"
        )
    print()


def score_broken(clean_path: str, deck_path: str, model_path: str) -> None:
    result = tie_out(deck_path, model_path)
    found = {(drift.slide, drift.printed) for drift in result.drifts}
    wanted = injected(clean_path, deck_path)

    print("=" * 78)
    print(f"SCORE — {len(wanted)} figures differ from the clean deck")
    print("=" * 78)
    for slide, printed in sorted(wanted):
        hit = (slide, printed) in found
        print(f"  {'FOUND ' if hit else 'MISSED'}  slide {slide}: {printed}")
    extra = found - wanted
    for slide, printed in sorted(extra):
        print(f"  EXTRA   slide {slide}: {printed}")

    recall = len(found & wanted) / len(wanted)
    precision = len(found & wanted) / len(found) if found else 0.0
    print(f"\n  recall {recall:.0%}   precision {precision:.0%}")
    print()


def coverage(deck_path: str, model_path: str, map_path: str) -> None:
    """Which of the linkage map's rows the linker actually reached.

    The map is the ground truth for *what could be checked*. Recall here
    is the honest ceiling on the whole engine: an output the linker never
    reaches is an output that could drift without anyone hearing about it.
    """
    outputs = read_outputs(model_path)
    figures = read_deck(deck_path).figures
    links, _ = link(figures, outputs)

    with open(map_path, newline="") as handle:
        rows = list(csv.DictReader(handle))

    wanted: set[str] = set()
    for row in rows:
        for ref in row["output_ref"].split(","):
            ref = ref.strip()
            if ref and ref != "-":
                wanted.add(ref)

    reached = {item.output.ref for item in links}
    print("=" * 78)
    print("COVERAGE — output rows the linker reached")
    print("=" * 78)
    print(f"  linkage map names {len(wanted)} outputs; linker reached {len(reached)}")
    missed = sorted(wanted - reached, key=lambda r: int(r[1:]))
    if missed:
        by_ref = {output.ref: output for output in outputs}
        print("  never reached:")
        for ref in missed:
            print(f"    {ref}  {by_ref[ref].name}")
    spurious = sorted(reached - wanted, key=lambda r: int(r[1:]))
    if spurious:
        print(f"  reached but not in the map: {', '.join(spurious)}")
    print()


CASCADE = Path(__file__).resolve().parent / "cascade"

if __name__ == "__main__":
    if len(sys.argv) > 3:
        clean, broken, model = sys.argv[1], sys.argv[2], sys.argv[3]
        linkage = sys.argv[4] if len(sys.argv) > 4 else None
    else:
        clean = str(CASCADE / "cascade_deck.pptx")
        broken = str(CASCADE / "cascade_deck_broken.pptx")
        model = str(CASCADE / "cascade_model.xlsx")
        linkage = str(CASCADE / "linkage_map.csv")

    run(clean, model, "CLEAN DECK — every drift below is a false positive")
    unlinked_report(clean, model)
    if linkage:
        coverage(clean, model, linkage)
    run(broken, model, "BROKEN DECK — injected errors")
    score_broken(clean, broken, model)
