"""Break real spreadsheets on purpose, and see whether the audit notices.

The audit's recall was measured against a fixture I wrote, which is the
weakest evidence there is: a test whose author also wrote the thing under
test tends to plant the defects it knows how to find. The strong version
needs defects planted in spreadsheets somebody else built, at sites chosen
without reference to how the rules work.

That is what this does. It takes real workbooks from EUSES that the audit
currently reports **nothing** on, injects exactly one defect into each,
and re-runs. Two numbers come out:

- **Recall** — how often the injected defect is found. On real files, not
  on mine.
- **Collateral** — how often a mutation raises something *other* than the
  defect. The baseline was clean, so anything extra is a false positive
  that the mutation exposed.

**The sites are chosen the way the mistake happens, not the way the rule
looks for it.** A person pastes a value over a formula in the middle of a
row of formulas; they do not first check whether the column above and
below is also formulas, or whether the header says FY2025A. So the
mutation picks any formula with formulas either side of it, and every
condition the rule adds beyond that shows up here as a *miss*. That is
the point — a rule tightened until it stops firing has to pay for it in
this number.

It also needs no network beyond the corpus already downloaded, and no
labelled data. The label is that I broke it.

    uv run python scripts/mutation_eval.py <corpus-directory> [count]
"""

import glob
import random
import signal
import sys
from collections import Counter
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from polar.tieout.audit import audit
from polar.tieout.workbook import Cell, Workbook, read_workbook

#: Per-file time budget. A corpus off the open web has files that take
#: minutes; none of them are worth waiting for here.
BUDGET_SECONDS = 15

#: Deterministic, so a change in the rules is compared against the same
#: mutations rather than against a new roll of the dice.
SEED = 20260810


class TooSlow(Exception):
    pass


def _row(book: Workbook, cell: Cell) -> list[Cell]:
    return sorted(
        (
            other
            for other in book.cells.values()
            if other.sheet == cell.sheet and other.row == cell.row
        ),
        key=lambda other: other.column,
    )


def paste_over(book: Workbook, rng: random.Random) -> tuple[str, str] | None:
    """Overwrite a formula with a typed number.

    The commonest way a model breaks. The site is any formula with a
    formula on each side of it in its row — which is what somebody sees
    when they paste, and nothing more.
    """
    formulas = [cell for cell in book.cells.values() if cell.formula]
    rng.shuffle(formulas)
    for cell in formulas[:400]:
        row = _row(book, cell)
        where = next((i for i, other in enumerate(row) if other.ref == cell.ref), None)
        if where in (None, 0, len(row) - 1):
            continue
        assert where is not None
        left, right = row[where - 1], row[where + 1]
        if not (left.formula and right.formula):
            continue
        if left.column != cell.column - 1 or right.column != cell.column + 1:
            continue
        book.cells[cell.ref] = replace(cell, formula=None, precedents=(), alias_of=None)
        return cell.ref, "typed-over-formula"
    return None


def bend_a_formula(book: Workbook, rng: random.Random) -> tuple[str, str] | None:
    """Point one cell of a series at the wrong row.

    `=+C152*...` where the row does `=+D104*...` — a real one, found in
    `UT_Modeling_Tools.xls`. Reproduced by rewriting a formula's row
    numbers, which is what a mis-drag does.
    """
    import re

    formulas = [
        cell
        for cell in book.cells.values()
        if cell.formula and re.search(r"[A-Z]\d", cell.formula)
    ]
    rng.shuffle(formulas)
    for cell in formulas[:400]:
        row = _row(book, cell)
        where = next((i for i, other in enumerate(row) if other.ref == cell.ref), None)
        if where in (None, 0, len(row) - 1):
            continue
        assert where is not None
        if not (row[where - 1].formula and row[where + 1].formula):
            continue
        bent = re.sub(
            r"([A-Z]{1,3})(\d+)",
            lambda m: f"{m[1]}{int(m[2]) + 7}",
            cell.formula or "",
            count=1,
        )
        if bent == cell.formula:
            continue
        book.cells[cell.ref] = replace(cell, formula=bent)
        return cell.ref, "inconsistent-row"
    return None


def shrink_a_total(book: Workbook, rng: random.Random) -> tuple[str, str] | None:
    """Make a total stop one row short of the block it sums."""
    import re

    sums = [
        cell
        for cell in book.cells.values()
        if cell.formula
        and re.search(
            r"SUM\(\s*[A-Z]{1,3}(\d+)\s*:\s*[A-Z]{1,3}(\d+)", cell.formula, re.I
        )
    ]
    rng.shuffle(sums)
    for cell in sums[:400]:
        match = re.search(
            r"SUM\(\s*([A-Z]{1,3})(\d+)\s*:\s*([A-Z]{1,3})(\d+)\s*\)",
            cell.formula or "",
            re.I,
        )
        if match is None:
            continue
        top, bottom = int(match[2]), int(match[4])
        if bottom - top < 2 or match[1] != match[3]:
            continue
        # The row that falls out must actually hold something, or nothing
        # has been skipped.
        dropped = f"{cell.sheet}!{match[3]}{bottom}"
        if dropped not in book.cells:
            continue
        shrunk = (cell.formula or "").replace(
            match[0], f"SUM({match[1]}{top}:{match[3]}{bottom - 1})"
        )
        book.cells[cell.ref] = replace(cell, formula=shrunk)
        return cell.ref, "skipped-cell"
    return None


MUTATIONS = (paste_over, bend_a_formula, shrink_a_total)


def run(root: Path, wanted: int) -> None:
    files = sorted(
        glob.glob(str(root / "**" / "*.xls"), recursive=True)
        + glob.glob(str(root / "**" / "*.XLS"), recursive=True)
        + glob.glob(str(root / "**" / "*.xlsx"), recursive=True)
    )
    rng = random.Random(SEED)
    rng.shuffle(files)
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TooSlow()))

    found: Counter[str] = Counter()
    missed: Counter[str] = Counter()
    collateral: Counter[str] = Counter()
    tried = 0
    misses: list[tuple[str, str, str]] = []

    for path in files:
        if tried >= wanted:
            break
        try:
            signal.setitimer(signal.ITIMER_REAL, BUDGET_SECONDS)
            book = read_workbook(path)
            if audit(book).errors:
                continue  # need a silent baseline to attribute anything to
            mutate = MUTATIONS[tried % len(MUTATIONS)]
            planted = mutate(book, rng)
            if planted is None:
                continue
            ref, rule = planted
            after = audit(book)
        except Exception:
            continue
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)

        tried += 1
        hit = any(f.ref == ref and f.rule == rule for f in after.errors)
        (found if hit else missed)[rule] += 1
        if not hit:
            misses.append((rule, Path(path).name, ref))
        for finding in after.errors:
            if finding.ref != ref:
                collateral[finding.rule] += 1

    total = sum(found.values()) + sum(missed.values())
    print(f"{total} defects planted in real spreadsheets that were silent before")
    print(f"  found   {sum(found.values()):>4}")
    print(f"  missed  {sum(missed.values()):>4}")
    if total:
        print(f"  recall  {sum(found.values()) / total:.0%}")
    print("\n  by kind:")
    for rule in {*found, *missed}:
        hits, gaps = found[rule], missed[rule]
        rate = hits / (hits + gaps) if hits + gaps else 0
        print(f"    {rule:<24} {hits:>3} found, {gaps:>3} missed  ({rate:.0%})")

    print(
        f"\n  collateral findings on files that were silent before: {sum(collateral.values())}"
    )
    for rule, count in collateral.most_common():
        print(f"    {rule:<24} {count:>4}")

    if misses:
        print("\n  a sample of the misses, which are the honest cost of every")
        print("  condition a rule adds beyond « this looks wrong »:")
        for rule, name, ref in misses[:10]:
            print(f"    {rule:<24} {ref:<28} {name[:34]}")


if __name__ == "__main__":
    directory = Path(sys.argv[1])
    run(directory, int(sys.argv[2]) if len(sys.argv) > 2 else 150)
