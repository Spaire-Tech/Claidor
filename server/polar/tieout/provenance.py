"""The chain, and what to do when a link in it has already broken.

Two jobs, both of which only became possible once the workbook could be
read rather than taken on trust.

**Check the Outputs tab against the model.** A model that publishes its
deck figures is publishing a claim — « FY2025A adjusted EBITDA is 48.9 and
it lives at `Model!D25` » — and the second half of that claim goes stale
the first time somebody inserts a row. Cascade's does: four of its
twenty-three references are off by one, all in the adjustments block, all
pointing one row above the figure they name. The values are right, so
nothing downstream *computes* wrongly; a banker sent to `Model!D25` simply
finds an empty cell and stops trusting the tool.

This is not a defect in Cascade. It is the product's own thesis applied
one link earlier: the chain breaks quietly, and nobody notices until
somebody follows it.

**Show the chain.** « Slide 2 says $49.6mm; the model says 48.9 » is a
finding. « ...at `Model!D26` = `D16 + D24` = reported EBITDA 41.2 plus
total adjustments 7.7 » is an answer. The second is what a banker needs to
decide whether the deck is wrong or the model moved, and it costs nothing
extra now that the formulas are parsed.
"""

from dataclasses import dataclass
from decimal import Decimal

from .model import Output
from .workbook import Cell, Workbook

#: How far a value may sit from the cell that is supposed to hold it
#: before the reference counts as pointing somewhere else. Loose, because
#: the Outputs tab may round and the cell will not.
TOLERANCE = Decimal("0.005")

#: How deep to walk a formula's precedents when showing a chain. Two
#: levels is « adjusted EBITDA = reported plus adjustments », which is the
#: answer; five is the whole model, which is not.
DEPTH = 2

#: Sheets whose cells are never candidates when the workbook stands in for
#: an Outputs tab. The Outputs tab restates figures from elsewhere, so
#: leaving it in means every figure has two homes.
RESTATING_SHEETS = frozenset({"outputs", "output", "summary"})


@dataclass(frozen=True)
class BadReference:
    """An Outputs row whose source cell does not hold its value."""

    ref: str
    name: str
    value: Decimal
    #: What the model's Outputs tab says the cell is.
    claimed: str
    #: What that cell actually holds, or None when it is empty.
    found: Decimal | None
    #: Where the value really is, when it could be located. A repair, not
    #: a guess: the cell has to hold the value *and* be named the same way.
    actual: str | None
    #: How it was found, for a reader deciding whether to trust it.
    how: str


def verify_outputs(outputs: list[Output], book: Workbook) -> list[BadReference]:
    """Every Outputs row whose stated cell is not where its value lives."""
    problems: list[BadReference] = []
    for output in outputs:
        claimed = output.source.strip()
        if "!" not in claimed or ":" in claimed or "," in claimed:
            # « Model!D6, I6 » is a computed figure citing two cells, and
            # « Model!B6:D6 » is a series. Neither is a claim that one cell
            # holds this value, so neither can be wrong in this way — the
            # CAGR really is derived from D6 and I6, and reading only the
            # first of them reports a correct row as broken.
            continue
        cell = book.get(claimed)
        if (
            cell is not None
            and cell.value is not None
            and abs(cell.value - output.value) <= TOLERANCE
        ):
            continue

        actual, how = _relocate(output, book)
        problems.append(
            BadReference(
                ref=output.ref,
                name=output.name,
                value=output.value,
                claimed=claimed,
                found=cell.value if cell else None,
                actual=actual,
                how=how,
            )
        )
    return problems


def _relocate(output: Output, book: Workbook) -> tuple[str | None, str]:
    """Where the figure really is.

    Only offered when one cell both holds the value and is named the way
    the output names it. A cell that merely holds 48.9 is not evidence —
    Cascade has four of those — and a repair proposed on a value alone is
    the same mistake as a checker that links on values.
    """
    from .link import tokens

    wanted = set(tokens(output.name))
    by_value = [
        cell
        for cell in book.cells.values()
        if cell.sheet.lower() not in RESTATING_SHEETS
        and cell.alias_of is None
        and cell.value is not None
        and abs(cell.value - output.value) <= TOLERANCE
    ]
    if not by_value:
        return None, "no cell in the model holds this value"

    named = [cell for cell in by_value if wanted <= set(tokens(cell.name))]
    if len(named) == 1:
        return named[0].ref, "the only cell holding this value and named for it"
    if len(named) > 1:
        return None, f"{len(named)} cells hold this value and are named for it"

    #: The reference is usually stale by a row or two rather than wrong, so
    #: a match in the same column of the sheet it named is strong evidence
    #: even when the labels have drifted.
    sheet, coordinate = output.source.strip().split("!", 1)
    nearby = [
        cell
        for cell in by_value
        if cell.sheet == sheet and f"{coordinate[:1]}" == cell.ref.split("!")[1][:1]
    ]
    if len(nearby) == 1:
        return nearby[0].ref, "the only cell holding this value in the column it named"
    return None, f"{len(by_value)} cells hold this value; none is named for it"


def chain(book: Workbook, ref: str, depth: int = DEPTH) -> str:
    """« Model!D26 = D16 + D24 = reported EBITDA 41.2 + adjustments 7.7 ».

    One line, because a finding that needs a diagram is a finding nobody
    reads. Stops at a hardcoded input, which is the end of the chain
    inside this workbook and the beginning of the next question — where
    did *that* number come from.
    """
    cell = book.get(ref)
    if cell is None:
        return ref

    line = f"{ref} = {_short(cell.value)}" if cell.value is not None else ref
    if cell.formula is None:
        return f"{line} (input)"

    line = f"{line}, {cell.formula}"
    if depth <= 0 or not cell.precedents:
        return line

    parts = []
    for precedent in cell.precedents[:4]:
        source = book.get(precedent)
        if source is None:
            continue
        shown = "" if source.value is None else f" {_short(source.value)}"
        parts.append(f"{_relative(cell, source) or precedent}{shown}")
    if len(cell.precedents) > 4:
        parts.append(f"and {len(cell.precedents) - 4} more")
    # An input that could not be followed belongs in the sentence, not
    # under it. A chain reading « = EBIT 41.2, taxes 9.8 » when a third
    # input existed and was dropped is the product asserting something it
    # does not know.
    for _, why in cell.unresolved[:2]:
        parts.append(f"and one {why}")
    return f"{line} = {', '.join(parts)}" if parts else line


def _relative(cell: Cell, source: Cell) -> str:
    """A precedent's name, with everything the reader already knows removed.

    `Model!E37` is FY2026E unlevered free cash flow and its five precedents
    are FY2026E unlevered free cash flow EBIT, taxes, D&A, capex and
    working capital. Printed in full that is the same eight words six
    times, which buries the four that differ.
    """
    name = source.row_label or source.name
    parent = cell.row_label
    if parent and name.lower().startswith(parent.lower()):
        name = name[len(parent) :].strip() or parent
    if source.column_label and source.column_label != cell.column_label:
        name = f"{source.column_label} {name}".strip()
    return name


def _short(value: Decimal) -> str:
    """Enough digits to recognise the figure, and no more.

    Two decimals for a figure in millions; four for a fraction, because a
    WACC shown as « 0.1 » is not recognisable as 9.8%.
    """
    places = Decimal("0.0001") if abs(value) < 1 else Decimal("0.01")
    return f"{value.quantize(places).normalize():f}"


def outputs_from_workbook(book: Workbook) -> list[Output]:
    """Every named cell, offered as something a deck figure could be.

    The point of the whole module. Cascade publishes an Outputs tab; most
    models do not, and a product that requires one works on the demo and
    nowhere else. Because a cell's name is built to the same shape as an
    output row's — a period and a line item — the matcher that links a
    deck to twenty-three published figures links it to three hundred
    cells without knowing the difference.

    What changes is not the code but the odds. Twenty-three names are
    nearly all distinct; three hundred contain duplicates, near-duplicates
    and intermediate workings nobody would print. The gates that refuse
    an ambiguous link are what has to survive that, and whether they do is
    a measurement, not an opinion.
    """
    candidates: list[Output] = []
    for cell in book.cells.values():
        if cell.sheet.lower() in RESTATING_SHEETS:
            continue
        if cell.alias_of is not None:
            continue
        if not cell.row_label or cell.value is None:
            continue
        candidates.append(
            Output(
                ref=cell.ref,
                name=cell.name,
                value=cell.value,
                source=cell.ref,
                # The sheet is the nearest thing a raw workbook has to a
                # stated basis, and it is a real signal: a figure on the
                # Comps tab is a trading comparable and one on the DCF tab
                # is not, which is the distinction slide 6 and slide 7 turn
                # on.
                basis=cell.sheet,
            )
        )
    return candidates


def inputs_from_workbook(book: Workbook) -> list[Output]:
    """Every number somebody **typed**, offered as something a source said.

    The other end of the chain. :func:`outputs_from_workbook` offers every
    named cell as something a deck could be claiming; this offers the ones
    with no formula behind them as something an audited set of accounts
    could be the origin of.

    **Inputs only, and the restriction is the whole point.** A computed
    cell agreeing with the accounts is arithmetic working, not provenance:
    the accounts are not the source of a calculation, they are the source
    of what it was calculated from. Grounding a formula cell would also
    put the loosest match in this product — prose in a document nobody on
    the deal wrote — against its largest set of candidates, which is how a
    grounding engine starts inventing origins. Cascade has 85 typed inputs
    against 313 named cells, and the narrower set is the safer one.

    **And not a row number.** Measured against the first real pair this
    ever saw — an NHS workforce report and the workbook published beside
    it — the only two links it made were both to a lookup list whose first
    column counts `1, 2, 3 …` and whose second column holds the staff
    group's name. « 13,686 FTE are Support to clinical staff » on page 8
    matched `Controls!A10`, named *Support to clinical staff*, holding the
    number **10**. Two links, two false positives, and each one was then
    reported as the document contradicting the model.

    The label was right. The cell was never a quantity. A column that
    counts its own rows is an index, and an index is not something a set of
    accounts can be the origin of — see :func:`_counting_columns`.
    """
    counting = _counting_columns(book)
    return [
        Output(
            ref=cell.ref,
            name=cell.name,
            value=cell.value,
            source=cell.ref,
            basis=basis_of(cell),
        )
        for cell in book.cells.values()
        if cell.formula is None
        and cell.value is not None
        and cell.row_label
        and cell.alias_of is None
        and cell.sheet.lower() not in RESTATING_SHEETS
        and (cell.sheet, cell.column) not in counting
    ]


def basis_of(cell: Cell) -> str:
    """What kind of thing a cell is, for the matcher to weigh below its name.

    The sheet, and the short descriptors printed beside the row. A sheet
    name is the nearest thing a raw workbook has to a stated basis — a
    figure on the Comps tab is a trading comparable and one on the DCF tab
    is not — and the descriptors are the rest of that sentence: the units,
    the licence condition, the mnemonic.

    **Below the name, deliberately.** These words identify a row when its
    name cannot, and they must never be able to carry a match on their own:
    `£m 09/10 prices` appears on hundreds of rows of a regulator's model
    and says nothing about which one.
    """
    return " ".join((cell.sheet, *cell.row_tags))


#: How many cells in a row must count before the column is an index rather
#: than a coincidence. Four consecutive integers each one more than the
#: last, in one column, is not something a table of quantities does.
COUNTING_RUN = 4


def _counting_columns(book: Workbook) -> set[tuple[str, int]]:
    """Columns that number their own rows, as `(sheet, column)`.

    Two shapes, both structural rather than a guess about magnitude:

    - **The value is the row it sits on.** `A10 = 10`, `A11 = 11`. This is
      what a lookup list written straight down a sheet looks like.
    - **The values count from one.** `A5 = 1`, `A6 = 2`, `A7 = 3`. The same
      list, started lower down the page.

    Nothing here excludes a column of years — 2015, 2016, 2017 also ascend
    by one — because a year column fails both tests: 2015 is not row 3, and
    it does not start at 1. That mattered enough to check: suppressing a
    model's period headers would take real inputs out of the grounding set.
    """
    columns: dict[tuple[str, int], list[tuple[int, int]]] = {}
    for cell in book.cells.values():
        if cell.formula is not None or cell.value is None:
            continue
        if cell.value != int(cell.value):
            continue
        columns.setdefault((cell.sheet, cell.column), []).append(
            (cell.row, int(cell.value))
        )

    counting: set[tuple[str, int]] = set()
    for where, cells in columns.items():
        ordered = sorted(cells)
        run_as_row = from_one = 0
        previous: tuple[int, int] | None = None
        for row, number in ordered:
            run_as_row = run_as_row + 1 if number == row else 0
            # A run only counts once it has seen a one. Without that
            # condition any column ascending by one qualifies — which is
            # every column of consecutive years, and suppressing those
            # would take a model's period headers out of the grounding set.
            if number == 1:
                from_one = 1
            elif from_one and previous is not None and number == previous[1] + 1:
                from_one += 1
            else:
                from_one = 0
            previous = (row, number)
            if max(run_as_row, from_one) >= COUNTING_RUN:
                counting.add(where)
                break
    return counting


def repair_outputs(outputs: list[Output], book: Workbook) -> list[Output]:
    """Outputs rows with stale source references pointed at the real cell.

    Four of Cascade's twenty-three point one row above the figure they
    name. The values are right, so this changes no finding's arithmetic —
    it changes where the finding sends the reader.
    """
    from dataclasses import replace

    fixed = {
        problem.ref: problem.actual
        for problem in verify_outputs(outputs, book)
        if problem.actual
    }
    if not fixed:
        return outputs
    return [
        replace(output, source=fixed[output.ref]) if output.ref in fixed else output
        for output in outputs
    ]


__all__ = [
    "DEPTH",
    "RESTATING_SHEETS",
    "TOLERANCE",
    "BadReference",
    "Cell",
    "chain",
    "inputs_from_workbook",
    "outputs_from_workbook",
    "repair_outputs",
    "verify_outputs",
]
