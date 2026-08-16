"""Reading a model's structure: periods, sections, statements, schedules.

The mechanical audit asks whether each cell is built the way it claims.
The analytical checks ask whether the model holds together as a set of
financial statements — and that question is meaningless until the engine
knows which columns are periods, which rows are accounts over time, and
where the statements and the debt schedule live. This module answers
those questions and nothing else; the checks that consume the answers
live beside it.

**The claim discipline, from the protocol** (`docs/pierce/
analytical-checks-protocol.md`): the structure layer never guesses.
Every block it identifies carries *how* it was identified; anything it
cannot identify is reported as unlocated, which downstream checks turn
into « did not run » with the reason on screen. A wrong location is the
only failure; abstention never is.

**Everything is derived from the model's own statements about itself:**
- Column labels name the period axis. The model's own `PERIOD`-shaped
  headers say which columns are time, and each sheet's map is its own —
  a project finance model that runs monthly through construction and
  semi-annually through operations is normal, and the map records the
  transition rather than flagging it.
- `SUM` ranges are the model's own section boundaries: `=SUM(J58:J60)`
  *says* rows 58–60 are a block with a total.
- Opening/closing vocabulary and the carry-forward formula shape say
  which rows are balances over time.
- Sheet names and row vocabulary say where the statements are, and the
  model's own check rows corroborate them.
"""

import re
from dataclasses import dataclass, field

from .workbook import Cell, Workbook

# --- the period axis ------------------------------------------------------

#: A column label that names a period. Wider than the audit's own
#: PERIOD regex: it also reads dates the way models print them in
#: header rows (« 31-Mar-25 », « Mar 2025 », « 2025/26 », « 30 June
#: 2025 », plain serial years) — measured against the Time sheets of
#: the Ofwat suite and the timing sheets of the Scottish close models.
PERIOD_LABEL = re.compile(
    r"""^\s*(?:
        (?:FY|CY|AY|LTM|NTM)?\s*(?:19|20)\d{2}(?:\s*/\s*\d{2})?\s*[AEPF]?
      | Q[1-4](?:\s*(?:19|20)\d{2})?
      | (?:Year|Yr|Period|Sem|Semester)\s*\d+
      | (?:Half\s*[12]|H[12])(?:\s*(?:19|20)\d{2})?
      | \d{1,2}[-/\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/\s](?:19|20)?\d{2}
      | (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/\s](?:19|20)\d{2}
    )\s*$""",
    re.VERBOSE | re.IGNORECASE,
)


@dataclass(frozen=True)
class PeriodAxis:
    """One sheet's time axis: which columns are periods, in order.

    Labels are the sheet's own printing and are **not always unique**:
    a semi-annual project finance model prints « FY2015 » on two
    columns, honestly (measured on Dumfries — two columns per year,
    both labelled with the year). `unique_labels` says whether
    label-based cross-sheet alignment is possible; when it is not, the
    checks walk columns in axis order, which is all continuity needs.
    """

    sheet: str
    #: Column index → the label the sheet itself prints for it.
    columns: tuple[tuple[int, str], ...]

    @property
    def labels(self) -> tuple[str, ...]:
        return tuple(label for _, label in self.columns)

    @property
    def unique_labels(self) -> bool:
        canon = [_canon(label) for label in self.labels]
        return len(set(canon)) == len(canon)

    @property
    def per_year(self) -> int:
        """Columns per canonical year — 1 annual, 2 semi-annual, 4
        quarterly, 12 monthly. 0 when the labels are not year-shaped."""
        from collections import Counter

        years: Counter[str] = Counter()
        for label in self.labels:
            canonical = _canon(label)
            if re.fullmatch(r"(?:19|20)\d{2}(?:\s*/\s*\d{2})?", canonical):
                years[canonical] += 1
        if not years:
            return 0
        counts = sorted(years.values())
        return counts[len(counts) // 2]

    def column_of(self, label: str) -> int | None:
        wanted = _canon(label)
        for column, printed in self.columns:
            if _canon(printed) == wanted:
                return column
        return None


def _canon(label: str) -> str:
    """`FY2025A` ≡ `FY 2025` ≡ `2025` — the same period, printed three
    ways. Canonicalised for cross-sheet alignment only; the sheet's own
    printing is always what a finding quotes."""
    text = label.strip().upper()
    text = re.sub(r"^(?:FY|CY|AY)\s*", "", text)
    text = re.sub(r"\s*[AEPF]$", "", text)
    return re.sub(r"\s+", " ", text)


def period_axes(book: Workbook) -> dict[str, PeriodAxis]:
    """Each sheet's own period axis, from its column labels.

    A column counts as a period column when its label reads as a
    period; a sheet has an axis when at least three of its columns do
    and they are in a consistent order (strictly non-decreasing by
    canonical label where the labels are comparable). Sheets laid out
    as label/value pairs have no column labels and honestly no axis.
    """
    per_sheet: dict[str, dict[int, str]] = {}
    for cell in book.cells.values():
        label = cell.column_label.strip()
        if not label or not PERIOD_LABEL.match(label):
            continue
        columns = per_sheet.setdefault(cell.sheet, {})
        columns.setdefault(cell.column, label)

    axes: dict[str, PeriodAxis] = {}
    for sheet, columns in per_sheet.items():
        if len(columns) < 3:
            continue
        ordered = tuple(sorted(columns.items()))
        axes[sheet] = PeriodAxis(sheet=sheet, columns=ordered)
    return axes


# --- sections, from the model's own sums ---------------------------------

#: `SUM(J58:J60)` over one column — the model stating a section.
_COLUMN_SUM = re.compile(
    r"^=\s*SUM\(\s*(?:'([^']+)'|([A-Za-z_][\w .]*))?!?"
    r"\$?([A-Z]{1,3})\$?(\d+)\s*:\s*\$?([A-Z]{1,3})\$?(\d+)\s*\)\s*$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Section:
    """Rows the model itself totals: a block and the row that sums it."""

    sheet: str
    total_row: int
    first_row: int
    last_row: int
    #: The total row's own label — « Total operating costs ».
    label: str


def sections(book: Workbook) -> list[Section]:
    """Blocks the model's own `SUM` formulas declare, deduplicated.

    Only single-column vertical sums on the row's own sheet count — a
    sum across sheets or across a row is an aggregation, not a section
    boundary. One section per (sheet, total row, span): the same sum
    repeated across thirty period columns is one statement, not thirty.
    """
    seen: set[tuple[str, int, int, int]] = set()
    found: list[Section] = []
    for cell in book.cells.values():
        if not cell.formula:
            continue
        match = _COLUMN_SUM.match(cell.formula.replace(" ", ""))
        if not match:
            continue
        quoted, bare, col_a, row_a, col_b, row_b = match.groups()
        other_sheet = quoted or bare
        if other_sheet and other_sheet != cell.sheet:
            continue
        if col_a.upper() != col_b.upper():
            continue
        first, last = sorted((int(row_a), int(row_b)))
        if last - first < 1:
            continue
        key = (cell.sheet, cell.row, first, last)
        if key in seen:
            continue
        seen.add(key)
        found.append(
            Section(
                sheet=cell.sheet,
                total_row=cell.row,
                first_row=first,
                last_row=last,
                label=cell.row_label.strip(),
            )
        )
    return found


# --- balance rows: opening/closing pairs over time ------------------------

_OPENING = re.compile(
    r"\b(?:opening|open\b|b/?fwd|b/?f\b|brought\s+forward|beginning|start(?:ing)?\s+(?:balance|cash))\b",
    re.IGNORECASE,
)
_CLOSING = re.compile(
    r"\b(?:closing|close\b|c/?fwd|c/?f\b|carried\s+forward|end(?:ing)?\s+(?:balance|cash)|period\s+end)\b",
    re.IGNORECASE,
)
_BALANCEISH = re.compile(
    r"\b(?:balance|cash|reserve|rcv|debt|loan|dsra|mra)\b", re.IGNORECASE
)


@dataclass(frozen=True)
class BalancePair:
    """An account carried over time: its opening row and closing row.

    Identified two ways, recorded on the pair: `vocabulary` — the rows
    say opening/closing in words — and `formula`, the opening row reads
    the closing row's previous column (`=J42` one column left), which
    is the model itself saying « this account carries forward ».
    """

    sheet: str
    opening_row: int
    closing_row: int
    label: str
    how: str  # 'vocabulary' | 'vocabulary+formula'


def balance_pairs(book: Workbook, axes: dict[str, PeriodAxis]) -> list[BalancePair]:
    """Opening/closing row pairs, per sheet, nearest-match by vocabulary.

    Conservative on purpose: a pair needs opening *and* closing words
    on rows at most eight apart whose labels share their account word
    (« DSRA opening balance » / « DSRA closing balance »), on a sheet
    that has a period axis. One row can join one pair.
    """
    by_sheet: dict[str, list[Cell]] = {}
    rows_seen: set[tuple[str, int]] = set()
    for cell in book.cells.values():
        if cell.sheet not in axes:
            continue
        key = (cell.sheet, cell.row)
        if key in rows_seen:
            continue
        label = cell.row_label.strip()
        if not label or not _BALANCEISH.search(label):
            continue
        if _OPENING.search(label) or _CLOSING.search(label):
            rows_seen.add(key)
            by_sheet.setdefault(cell.sheet, []).append(cell)

    pairs: list[BalancePair] = []
    for sheet, cells in by_sheet.items():
        openings = sorted(
            (c for c in cells if _OPENING.search(c.row_label)), key=lambda c: c.row
        )
        closings = sorted(
            (c for c in cells if _CLOSING.search(c.row_label)), key=lambda c: c.row
        )
        used: set[int] = set()
        for at, opening in enumerate(openings):
            #: The block ends where the next opening begins — measured
            #: on Anderson, whose « Opening Cash » closes twelve rows
            #: later and whose dozens of generic « Opening Balance »
            #: rows each head their own block.
            block_end = (
                openings[at + 1].row if at + 1 < len(openings) else opening.row + 40
            )
            best: Cell | None = None
            for closing in closings:
                if closing.row in used or closing.row <= opening.row:
                    continue
                if closing.row >= block_end:
                    continue
                mine = _account_word(opening.row_label)
                theirs = _account_word(closing.row_label)
                #: Named accounts must agree; a generic label agrees
                #: with anything inside its own block.
                if mine and theirs and mine != theirs:
                    continue
                if best is None or closing.row < best.row:
                    best = closing
            if best is None:
                continue
            used.add(best.row)
            how = "vocabulary"
            if _carries_forward(book, axes[sheet], opening, best):
                how = "vocabulary+formula"
            pairs.append(
                BalancePair(
                    sheet=sheet,
                    opening_row=opening.row,
                    closing_row=best.row,
                    label=_account_word(opening.row_label) or opening.row_label.strip(),
                    how=how,
                )
            )

    #: The Ofwat idiom has no opening/closing vocabulary at all — its
    #: carry lives in formula shape: a row's cell reads another row one
    #: period earlier, column after column. Rows already paired by
    #: words are not paired again.
    worded = {(pair.sheet, pair.opening_row) for pair in pairs}
    pairs.extend(
        pair
        for pair in _formula_pairs(book, axes)
        if (pair.sheet, pair.opening_row) not in worded
    )
    return pairs


def _formula_pairs(book: Workbook, axes: dict[str, PeriodAxis]) -> list[BalancePair]:
    """Pairs the formulas declare: row A's cell in period *n* is a bare
    reference to row B in period *n−1*, recurring across at least three
    periods. The recurrence is the model itself saying « B carries into
    A » — no vocabulary needed, which is how the FAST models write
    their continuity.
    """
    from collections import Counter

    from openpyxl.utils import column_index_from_string

    single = re.compile(r"^=\s*\$?([A-Z]{1,3})\$?(\d+)\s*$")
    votes: Counter[tuple[str, int, int]] = Counter()
    columns_of = {
        sheet: [column for column, _ in axis.columns] for sheet, axis in axes.items()
    }
    for cell in book.cells.values():
        columns = columns_of.get(cell.sheet)
        if columns is None or not cell.formula:
            continue
        match = single.match(cell.formula.replace(" ", ""))
        if not match:
            continue
        try:
            at = columns.index(cell.column)
        except ValueError:
            continue
        if at == 0:
            continue
        read_column = column_index_from_string(match.group(1))
        read_row = int(match.group(2))
        if read_column != columns[at - 1] or read_row == cell.row:
            continue
        votes[(cell.sheet, cell.row, read_row)] += 1

    labels: dict[tuple[str, int], str] = {}
    for cell in book.cells.values():
        if cell.row_label:
            labels.setdefault((cell.sheet, cell.row), cell.row_label.strip())

    found: list[BalancePair] = []
    taken: set[tuple[str, int]] = set()
    for (sheet, opening_row, closing_row), count in votes.most_common():
        if count < 3:
            break
        if (sheet, opening_row) in taken:
            continue
        taken.add((sheet, opening_row))
        found.append(
            BalancePair(
                sheet=sheet,
                opening_row=opening_row,
                closing_row=closing_row,
                label=labels.get((sheet, opening_row), ""),
                how="formula",
            )
        )
    return found


def _account_word(label: str) -> str:
    """The account behind the vocabulary: « DSRA opening balance » →
    « dsra » — the label with the opening/closing/balance words removed."""
    text = _OPENING.sub(" ", label)
    text = _CLOSING.sub(" ", text)
    text = re.sub(r"\b(?:balance|of|the|at|period)\b", " ", text, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", text).strip().lower()


def _carries_forward(
    book: Workbook, axis: PeriodAxis, opening: Cell, closing: Cell
) -> bool:
    """Does the opening row's formula read the closing row one period
    earlier — the model's own carry-forward statement? Checked on one
    mid-axis column; the check itself will walk every column."""
    columns = [column for column, _ in axis.columns]
    if len(columns) < 2:
        return False
    from openpyxl.utils import get_column_letter

    middle = columns[len(columns) // 2]
    previous = columns[columns.index(middle) - 1]
    cell = book.get(f"{opening.sheet}!{get_column_letter(middle)}{opening.row}")
    if cell is None or not cell.formula:
        return False
    wanted = f"{get_column_letter(previous)}{closing.row}"
    return bool(
        re.search(
            rf"(?<![A-Z0-9$]){re.escape(wanted)}(?!\d)", cell.formula.replace("$", "")
        )
    )


# --- the blocks: statements, debt, the model's own checks -----------------

_BALANCE_SHEET_NAME = re.compile(
    r"^(?:bs|sofp|balance\s*sheet)(?:\s*\(?a?\)?)?$|balance\s*sheet|finstat",
    re.IGNORECASE,
)
_BALANCE_ROW_WORDS = (
    "net assets",
    "total assets",
    "total liabilities",
    "total equity",
    "shareholders funds",
    "shareholders' funds",
)
_DEBT_SHEET_NAME = re.compile(
    r"debt|loan|facilit|tranche|_tl\b|\btl\b|senior|mezz", re.IGNORECASE
)
_DEBT_ROW_WORDS = ("drawdown", "repayment", "principal", "debt service", "interest")
_CHECK_SHEET_NAME = re.compile(r"check|alert|audit", re.IGNORECASE)


@dataclass(frozen=True)
class Located:
    """One block the structure layer is willing to name."""

    kind: str  # 'balance-sheet' | 'debt-schedule' | 'check-sheet'
    sheet: str
    #: Every anchor that supported the location — a finding will cite
    #: them, and a survey hand-verifies them.
    anchors: tuple[str, ...]


@dataclass
class Structure:
    """Everything the structure layer could honestly say about a model."""

    axes: dict[str, PeriodAxis] = field(default_factory=dict)
    sections: list[Section] = field(default_factory=list)
    pairs: list[BalancePair] = field(default_factory=list)
    located: list[Located] = field(default_factory=list)
    #: What could not be found, each with the sentence a screen shows
    #: under « Checks that did not run ».
    unlocated: list[tuple[str, str]] = field(default_factory=list)
    #: True when the workbook carries values but (almost) no formulas —
    #: a values-pasted copy, which is how close models are routinely
    #: issued: **every one of the five Scottish financial-close models
    #: on disk is such a file.** The mechanical audit can say little
    #: about one; the analytical checks, which run on cached values,
    #: are unaffected — that asymmetry is a product fact, and this flag
    #: is how a screen gets to say it.
    values_pasted: bool = False


def read_structure(book: Workbook) -> Structure:
    """The whole layer, in dependency order."""
    axes = period_axes(book)
    formula_cells = sum(1 for cell in book.cells.values() if cell.formula)
    result = Structure(
        axes=axes,
        sections=sections(book),
        pairs=balance_pairs(book, axes),
        values_pasted=len(book.cells) > 1000 and formula_cells < len(book.cells) / 100,
    )

    #: Row vocabulary per sheet, for anchoring.
    words_by_sheet: dict[str, set[str]] = {}
    for cell in book.cells.values():
        words_by_sheet.setdefault(cell.sheet, set()).add(cell.row_label.strip().lower())

    balance_hits: list[Located] = []
    debt_hits: list[Located] = []
    for sheet in book.sheets:
        rows = words_by_sheet.get(sheet, set())
        anchors: list[str] = []
        if _BALANCE_SHEET_NAME.search(sheet):
            anchors.append(f"sheet name « {sheet} »")
        row_anchor = [w for w in _BALANCE_ROW_WORDS if any(w in row for row in rows)]
        if row_anchor:
            anchors.append("rows: " + ", ".join(sorted(row_anchor)[:3]))
        #: Two independent anchors, or no claim: a sheet that merely
        #: *mentions* net assets is not the balance sheet, and neither
        #: is one whose name alone looks right while its rows do not.
        if len(anchors) >= 2 and sheet in result.axes:
            balance_hits.append(Located("balance-sheet", sheet, tuple(anchors)))

        anchors = []
        if _DEBT_SHEET_NAME.search(sheet):
            anchors.append(f"sheet name « {sheet} »")
        debt_rows = [w for w in _DEBT_ROW_WORDS if any(w in row for row in rows)]
        if len(debt_rows) >= 3:
            anchors.append("rows: " + ", ".join(sorted(debt_rows)[:4]))
        has_pair = any(p.sheet == sheet for p in result.pairs)
        if has_pair:
            anchors.append("carries an opening/closing pair")
        if len(anchors) >= 2 and sheet in result.axes:
            debt_hits.append(Located("debt-schedule", sheet, tuple(anchors)))

        if _CHECK_SHEET_NAME.search(sheet):
            checkish = sum(1 for row in rows if "check" in row or "alert" in row)
            if checkish >= 3:
                result.located.append(
                    Located(
                        "check-sheet",
                        sheet,
                        (f"sheet name « {sheet} »", f"{checkish} check-labelled rows"),
                    )
                )

    result.located.extend(balance_hits)
    result.located.extend(debt_hits)

    if not axes:
        result.unlocated.append(
            ("time-axis", "No period axis: no sheet has three period-labelled columns.")
        )
    if not balance_hits:
        result.unlocated.append(
            (
                "balance-sheet",
                "The balance sheet could not be located with two independent anchors.",
            )
        )
    if not debt_hits:
        result.unlocated.append(
            (
                "debt-schedule",
                "No debt schedule could be located with two independent anchors.",
            )
        )
    return result
