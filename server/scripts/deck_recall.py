"""Break figures on a clean deck on purpose, and see whether the check notices.

The deck tie-out has never had its recall measured. What it has is five
injected errors on one deck, all five found — which is not a measurement,
it is an anecdote with a good outcome. This is the number that says how
many of a banker's mistakes the product actually catches.

**Method.** Take the clean Cascade deck. Establish its baseline findings.
Then, one figure at a time, rewrite what the slide *printed* and re-run the
whole check. A hit is a new drift naming that figure. Everything else new
is collateral — a false positive the mutation exposed.

**The figures are mutated, not the file.** The printed text is rewritten
and re-parsed by `figures.parse_number` — the reader's own parser — so the
figure that reaches the check is exactly the one the reader would have
produced had the deck really said that. Then it goes through
`check.tie_out_both`, which is the production path, not a replica of it.

**Three severities, reported apart.** Conflating them flatters the tool:

    one tick    the last printed digit off by one — 9.9x → 9.8x
    stale       a model revision the deck never caught up with, ±4–15%
    transposed  two digits swapped — 42.6 → 24.6, the classic typo

**Two denominators, and the harsh one is the headline.** A figure the
checker never linked cannot be caught drifting, but a banker's deck does
not care why it was missed. So this reports recall over the figures that
*were* linked, and recall over every figure on the deck. The second is the
number that belongs in a sales conversation.

    uv run python -m scripts.deck_recall
    uv run python -m scripts.deck_recall --deck path.pptx --model path.xlsx
"""

import argparse
import random
import sys
from collections import Counter
from dataclasses import replace
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from polar.tieout.check import TieOut, repair, tie_out_both
from polar.tieout.deck import read_deck
from polar.tieout.figures import Figure, parse_number
from polar.tieout.model import OutputsMissing, read_outputs
from polar.tieout.workbook import read_workbook


def _reason(text: str) -> str:
    """Group the linker's reasons, as the coverage line does."""
    for prefix in ("no output fits the label", "two outputs fit equally well"):
        if text.startswith(prefix):
            return prefix
    return text


HERE = Path(__file__).resolve().parent
DECK = HERE / "cascade" / "cascade_deck.pptx"
MODEL = HERE / "cascade" / "cascade_model.xlsx"

#: Deterministic, so a change to the linker is compared against the same
#: mutations rather than against a new roll of the dice.
SEED = 20260810


def _rewrite(printed: str, digits: str) -> str:
    """`$48.9mm` with its digits replaced, keeping prefix and suffix."""
    start = next((i for i, c in enumerate(printed) if c.isdigit()), None)
    if start is None:
        return printed
    end = max(i for i, c in enumerate(printed) if c.isdigit()) + 1
    return printed[:start] + digits + printed[end:]


def _digits_of(printed: str) -> str:
    start = next((i for i, c in enumerate(printed) if c.isdigit()), None)
    if start is None:
        return ""
    end = max(i for i, c in enumerate(printed) if c.isdigit()) + 1
    return printed[start:end]


def _reprint(figure: Figure, value: Decimal) -> str | None:
    """The figure as the deck would have printed *this* value instead.

    A percentage is held as a fraction and printed as a percentage — 11.8%
    is 0.118 — so the value has to come back into printed units first.
    Without this the mutation turned `11.8%` into `0.1%`, which does not
    link to anything and was counted as a miss the checker never had a
    chance at. Currency is already in the model's millions and needs no
    conversion; so does a multiple.
    """
    shown = abs(value) * 100 if figure.kind == "percent" else abs(value)
    digits = f"{shown:,.{figure.decimals}f}"
    if "," not in _digits_of(figure.printed):
        digits = digits.replace(",", "")
    return _rewrite(figure.printed, digits)


def one_tick(figure: Figure, rng: random.Random) -> str | None:
    """The last printed digit, off by one. The hardest and the commonest."""
    step = Decimal(1).scaleb(-figure.decimals)
    if figure.kind == "percent":
        step = step / 100
    return _reprint(figure, abs(figure.value) + step * rng.choice([1, -1]))


def stale(figure: Figure, rng: random.Random) -> str | None:
    """A model revision the deck never caught up with."""
    factor = Decimal(str(rng.choice([1.04, 1.09, 1.15, 0.96, 0.91, 0.85])))
    moved = abs(figure.value) * factor
    printed = _reprint(figure, moved)
    # A 4 % move on a figure printed to no decimals can round back to the
    # same string. That is not a mutation, it is a no-op, and counting it
    # as a miss would understate the tool.
    return None if printed == figure.printed else printed


def transposed(figure: Figure, rng: random.Random) -> str | None:
    """Two adjacent digits swapped — the classic typing mistake."""
    digits = _digits_of(figure.printed)
    spots = [
        i
        for i in range(len(digits) - 1)
        if digits[i].isdigit()
        and digits[i + 1].isdigit()
        and digits[i] != digits[i + 1]
    ]
    if not spots:
        return None
    at = rng.choice(spots)
    swapped = digits[:at] + digits[at + 1] + digits[at] + digits[at + 2 :]
    printed = _rewrite(figure.printed, swapped)
    return None if printed == figure.printed else printed


MUTATIONS = (("one tick", one_tick), ("stale", stale), ("transposed", transposed))


def _mutate(figure: Figure, printed: str) -> Figure | None:
    """The figure the reader *would* have produced from that printed text."""
    parsed = parse_number(printed)
    if parsed is None:
        return None
    value, decimals, kind = parsed
    if kind != figure.kind or decimals != figure.decimals:
        # The rewrite changed what kind of number it is, or its precision.
        # Either way it is no longer the same claim and is not a fair test.
        return None
    return replace(figure, printed=printed, value=value, decimals=decimals)


def _at(anchor: dict[str, object], printed: str) -> tuple[object, ...]:
    """A key that names one figure and no other.

    Deliberately **not** `(slide, location, printed)`. `location` on a deck
    figure is « slide 2 » — the slide, not the spot — so two figures that
    print the same text on one slide share it. Cascade has exactly one such
    pair, `$48.9mm` on slide 2 in a tile and again in a sentence, and it
    was enough to make the harness report a detection failure on the
    deck's headline figure that the checker had in fact caught.

    The anchor is the coordinate the panel already navigates by: a shape
    id, a paragraph and a character span.
    """
    return (tuple(sorted(anchor.items())), printed)


def _named(result: TieOut) -> set[tuple[object, ...]]:
    return {_at(d.anchor, d.printed) for d in result.drifts}


def run(deck_path: Path, model_path: Path) -> None:
    figures = read_deck(str(deck_path)).figures
    book = read_workbook(str(model_path))
    published = []
    try:
        published = repair(read_outputs(str(model_path)), book)
    except OutputsMissing:
        pass

    base = tie_out_both(figures, book, published)
    baseline = _named(base)
    linked = {
        _at(link.figure.anchor, link.figure.printed) for link in base.agreed
    } | baseline

    # Counted off the anchors rather than off `len(base.unlinked)`. The
    # merge returns the *workbook* pass's unlinked list whole, so a figure
    # the Outputs pass checked can appear in both: on Cascade that is
    # 94 + 8 + 33 = 135 against 128 figures printed. The service layer
    # already works around it; the check itself still has it, and a
    # denominator built on it would be wrong.
    every = {_at(f.anchor, f.printed) for f in figures}
    print(f"{deck_path.name} against {model_path.name}")
    print(f"  {len(figures)} figures printed, {len(every)} distinct")
    print(
        f"  {len(base.agreed)} agree · {len(base.drifts)} drift · "
        f"{len(every - linked)} never linked, before anything is broken"
    )
    print(f"  coverage {len(linked) / len(every):.0%} of what the deck prints\n")

    rng = random.Random(SEED)
    found: Counter[str] = Counter()
    missed: Counter[str] = Counter()
    found_linked: Counter[str] = Counter()
    missed_linked: Counter[str] = Counter()
    skipped: Counter[str] = Counter()
    collateral = 0
    misses: list[tuple[str, int, str, str, bool]] = []

    for index, figure in enumerate(figures):
        where = _at(figure.anchor, figure.printed)
        # A figure the clean deck already reports is not a clean site: a
        # new drift on it cannot be attributed to the mutation.
        if where in baseline:
            continue
        was_linked = where in linked

        name, mutate = MUTATIONS[index % len(MUTATIONS)]
        printed = mutate(figure, rng)
        if printed is None:
            skipped[name] += 1
            continue
        broken = _mutate(figure, printed)
        if broken is None:
            skipped[name] += 1
            continue

        after = tie_out_both(
            [broken if one is figure else one for one in figures], book, published
        )
        raised = _named(after) - baseline
        hit = _at(figure.anchor, printed) in raised

        (found if hit else missed)[name] += 1
        if was_linked:
            (found_linked if hit else missed_linked)[name] += 1
        if not hit:
            misses.append((name, figure.slide, figure.printed, printed, was_linked))
        collateral += len(raised) - (1 if hit else 0)

    total = sum(found.values()) + sum(missed.values())
    on_linked = sum(found_linked.values()) + sum(missed_linked.values())
    print(f"  {total} figures broken, one at a time\n")
    print(f"  {'':<12}{'found':>8}{'missed':>8}{'recall':>9}")
    for name, _ in MUTATIONS:
        hits, gaps = found[name], missed[name]
        rate = hits / (hits + gaps) if hits + gaps else 0
        print(f"  {name:<12}{hits:>8}{gaps:>8}{rate:>8.0%}")
    print(f"  {'':-<37}")
    if on_linked:
        print(
            f"  {'linked only':<12}{sum(found_linked.values()):>8}"
            f"{sum(missed_linked.values()):>8}"
            f"{sum(found_linked.values()) / on_linked:>8.0%}"
        )
    if total:
        print(
            f"  {'every figure':<12}{sum(found.values()):>8}{sum(missed.values()):>8}"
            f"{sum(found.values()) / total:>8.0%}   ← the honest one"
        )

    print(f"\n  collateral findings the mutations exposed: {collateral}")
    if skipped:
        print("\n  sites the mutation could not use, which is not a miss:")
        for name, count in skipped.most_common():
            print(f"    {name:<12}{count:>4}")

    if misses:
        print("\n  what it did not catch — « linked » is a real detection")
        print("  failure, « never linked » is a coverage one:")
        for name, slide, was, now, was_linked in misses:
            mark = "linked" if was_linked else "never linked"
            print(f"    {name:<12} slide {slide:<3} {was:>12} → {now:<12} {mark}")

    print("\n  why the clean deck leaves figures unchecked:")
    reasons: Counter[str] = Counter()
    for one in base.unlinked:
        reasons[_reason(one.reason)] += 1
    for reason, count in reasons.most_common():
        print(f"    {count:>4}  {reason}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--deck", type=Path, default=DECK)
    parser.add_argument("--model", type=Path, default=MODEL)
    args = parser.parse_args()
    run(args.deck, args.model)
