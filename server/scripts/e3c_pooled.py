"""The coincidence control, restated as the statistic it actually is.

    cd server && uv run python -m scripts.e3c_pooled CORPUS_DIR

Round 1 scored « shuffled patterns / real patterns », per model, against
a 5% bar. The founder's research round of 28 Aug proved that incoherent
in two ways, and both are arithmetic rather than opinion:

**A ratio of two counts is not a false-match rate.** A rate needs the
pairs *examined* as its denominator, and a bound needs the exact
binomial, not the point estimate. With zero matches in `d` mismatched
pairs the one-sided 95% upper bound is `1 - 0.05**(1/d)`: **59 pairs
are needed before « under 5% » can be claimed at all**, and 0 of 2 is
consistent with a true rate of 78%.

**Below four rows the question is not askable.** A permutation test on
`n` rows has `n!` arrangements, so the smallest reachable p-value is
`1/n!` — 0.5 at n=2, 0.167 at n=3. Our two-row models did not fail the
bar; they cannot reach it. « Not measurable » is a third outcome.

And per-model pass/fail was the wrong unit. If the true rate were a
healthy 2%, the chance that at least one of sixteen small samples
breaches 5% is roughly 50–96%. **One model over the line is the
expected outcome of scoring sixteen tiny samples separately**, which is
what round 1 saw and misread. Pool the pairs; report per-model counts
for transparency, never per-model verdicts.
"""

import math
import random
import sys
from pathlib import Path

import scripts.e3c_flow_stock as e3c
from polar.tieout.workbook import read_workbook
from scripts.recalc_period_check import date_axes
from scripts.recalc_period_values import blocks_from_dates

#: Below this many rows in a block-pair, a permutation test cannot
#: reach p < 0.05 however clean the result: 1/3! is 0.167.
MIN_ROWS_TO_BE_ASKABLE = 4

#: Zero matches in this many mismatched pairs is what « under 5% »
#: costs. Rule of three, exact: 1 - 0.05**(1/59) <= 0.05.
PAIRS_FOR_FIVE_PERCENT = 59


def _cdf(k: int, n: int, p: float) -> float:
    """P(X <= k) for X ~ Binomial(n, p)."""
    return sum(math.comb(n, i) * p**i * (1.0 - p) ** (n - i) for i in range(k + 1))


def upper_bound(matches: int, tested: int, confidence: float = 0.95) -> float:
    """One-sided Clopper-Pearson upper bound on the true rate.

    Exact, not the normal approximation, because the counts are small
    relative to the denominator and the approximation misbehaves there.

    **This function had a bug worth recording**: it returned the *point
    estimate* whenever `matches > 0`, under a label that said « upper
    bound ». It was written that way to avoid inventing a bound and it
    invented a worse thing — a number that understates the uncertainty
    while claiming to bound it. Caught by computing the real bound by
    hand and finding it did not match what the script printed.
    """
    if tested == 0:
        return 1.0
    if matches == 0:
        #: The rule of three, exact.
        return 1.0 - (1.0 - confidence) ** (1.0 / tested)
    alpha = 1.0 - confidence
    low, high = matches / tested, 1.0
    for _ in range(200):
        mid = (low + high) / 2.0
        if _cdf(matches, tested, mid) > alpha:
            low = mid
        else:
            high = mid
    return (low + high) / 2.0


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "scripts/corpus_sft")
    models = sorted(p for p in root.glob("*.xls*"))
    pooled_tested = pooled_matched = 0
    askable_tested = askable_matched = 0
    print(f"{'model':38s} {'tested':>7} {'matched':>8} {'askable':>8}")
    for path in models:
        try:
            cells = read_workbook(str(path)).cells
            blocks = blocks_from_dates(date_axes(cells))
        except Exception as error:  # a model we cannot read at all
            print(f"{path.name[:38]:38s}  unreadable: {type(error).__name__}")
            continue
        matched = e3c.patterns(
            cells, blocks, shuffle=random.Random(11), shufflable_only=True
        )
        tested = e3c.LAST_TESTED
        askable = [r for r in matched if r["shared_labels"] >= MIN_ROWS_TO_BE_ASKABLE]
        pooled_tested += tested
        pooled_matched += len(matched)
        askable_matched += len(askable)
        print(f"{path.name[:38]:38s} {tested:7d} {len(matched):8d} {len(askable):8d}")

    bound = upper_bound(pooled_matched, pooled_tested)
    print(f"\nPOOLED across {len(models)} models")
    print(f"  mismatched pairs examined : {pooled_tested}")
    print(f"  of those, still patterned : {pooled_matched}")
    print(
        f"  point estimate            : {pooled_matched / pooled_tested * 100:.2f}%"
        if pooled_tested
        else ""
    )
    print(f"  95% upper bound           : {bound * 100:.2f}%")
    print(
        f"  pairs needed for « <5% »  : {PAIRS_FOR_FIVE_PERCENT} (we have "
        f"{pooled_tested})"
    )
    print(
        f"\n  n! floor: a block-pair needs >= {MIN_ROWS_TO_BE_ASKABLE} shared "
        f"labels before p < 0.05 is reachable (1/3! = {1 / math.factorial(3):.3f})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
