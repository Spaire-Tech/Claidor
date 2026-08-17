"""Grade the one-step evaluator against the corpus's own answers.

Every formula cell whose cached value Excel already computed is a test
case with the answer written in it. Registered acceptance (protocol,
17 August): agreement on ≥ 99.5% of claimed cells at one part in a
million, disagreement sample hand-read with causes named. Coverage is
reported, never inflated.

Usage:  uv run python scripts/evaluator_grading.py [substring…]
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from polar.tieout.evaluate import evaluate
from polar.tieout.workbook import read_workbook

HERE = Path(__file__).parent
CORPORA = [HERE / 'corpus_pr24dd', HERE / 'corpus_sft']


def agree(computed: float, cached: float) -> bool:
    return abs(computed - cached) <= max(1e-6 * max(abs(cached), 1.0), 1e-9)


def main() -> None:
    only = [word.lower() for word in sys.argv[1:]]
    grand_formulas = grand_claimed = grand_agreed = 0
    disagreements: list[tuple[str, str, str, float, float]] = []

    for corpus in CORPORA:
        if not corpus.exists():
            continue
        for path in sorted(corpus.iterdir()):
            if path.suffix.lower() not in ('.xlsx', '.xlsm', '.xls'):
                continue
            if only and not any(word in path.name.lower() for word in only):
                continue
            book = read_workbook(str(path))
            formulas = claimed = agreed = 0
            for cell in book.cells.values():
                if not cell.formula or cell.value is None:
                    continue
                formulas += 1
                computed = evaluate(book, cell.sheet, cell.formula)
                if computed is None:
                    continue
                claimed += 1
                if agree(computed, float(cell.value)):
                    agreed += 1
                elif len(disagreements) < 40:
                    disagreements.append(
                        (
                            path.name,
                            cell.ref,
                            cell.formula[:90],
                            computed,
                            float(cell.value),
                        )
                    )
            grand_formulas += formulas
            grand_claimed += claimed
            grand_agreed += agreed
            coverage = claimed / formulas * 100 if formulas else 0.0
            accuracy = agreed / claimed * 100 if claimed else 0.0
            print(
                f'{path.name:42} formulas={formulas:>8,} '
                f'claimed={claimed:>8,} ({coverage:5.1f}%) '
                f'agree={accuracy:7.3f}%'
            )

    print()
    total_coverage = (
        grand_claimed / grand_formulas * 100 if grand_formulas else 0.0
    )
    total_accuracy = (
        grand_agreed / grand_claimed * 100 if grand_claimed else 0.0
    )
    print(
        f'TOTAL: formulas={grand_formulas:,} claimed={grand_claimed:,} '
        f'({total_coverage:.1f}%) agreement={total_accuracy:.4f}% '
        f'(bar: 99.5%)'
    )
    if disagreements:
        print('\nDisagreement sample (hand-read before anything ships):')
        for name, ref, formula, computed, cached in disagreements[:15]:
            print(f'  {name} {ref}: {formula}')
            print(f'    computed {computed:,.6g}  cached {cached:,.6g}')


if __name__ == '__main__':
    main()
