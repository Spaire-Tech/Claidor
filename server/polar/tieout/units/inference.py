"""The inference itself: evidence in, labels or abstentions out."""

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from decimal import Decimal
from enum import StrEnum
from typing import Any

#: The dimensions E1 labelled, and the two consumers that need them.
DIMENSIONS = ("kind", "b5_type", "currency", "scale", "period", "rate_form")


class Dimension(StrEnum):
    KIND = "kind"
    B5_TYPE = "b5_type"
    CURRENCY = "currency"
    SCALE = "scale"
    PERIOD = "period"
    RATE_FORM = "rate_form"


class Orientation(StrEnum):
    """Which way a sheet reads."""

    #: Labels down the side, periods across — a financial model.
    ROW_WISE = "row-wise"
    #: Records down, fields across — a data table; quantities are
    #: columns and a row has no single unit.
    COLUMN_WISE = "column-wise"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class UnitLabel:
    """One row's inferred units, with the evidence in words.

    `unknown` in any dimension is an **abstention**, not a guess that
    failed: the evidence did not decide and the module says so.
    """

    kind: str = "unknown"
    b5_type: str = "untyped"
    currency: str = "unknown"
    scale: str = "unknown"
    period: str = "unknown"
    rate_form: str = "unknown"
    why: str = "no evidence"
    #: True when a `Units` column decided it — the model telling us.
    declared: bool = False

    def get(self, dimension: str) -> str:
        return getattr(self, dimension)


#: Number-format fragments that name a currency outright.
CURRENCY_IN_FORMAT = (("£", "GBP"), ("$", "USD"), ("€", "EUR"))

#: Header or label text that names a tenor rather than a period.
TENOR = re.compile(r"^(on|1w|[0-9]{1,2}[mwy]|o/n)$", re.I)

YEAR_LABEL = re.compile(r"^(fy)?\s*(19|20)\d{2}(/\d{2,4})?$", re.I)
PERIOD_HEADER = re.compile(r"fy\s*\d{4}|(19|20)\d{2}/\d{2}", re.I)
RECORD_HEADER = re.compile(r"\b(date|maturity|tenor|ticker|code|id)\b", re.I)


@dataclass
class RowEvidence:
    """Everything the inference is allowed to look at for one row."""

    sheet: str
    row: int
    row_label: str = ""
    column_labels: Sequence[str] = field(default_factory=tuple)
    number_formats: Sequence[str] = field(default_factory=tuple)
    values: Sequence[float] = field(default_factory=tuple)
    #: The model's own Units text, when the caller chooses to supply
    #: it. Held back deliberately when E2 is being measured.
    declared_units: str | None = None


def orientation(rows: Sequence[RowEvidence]) -> Orientation:
    """Which way this sheet reads, decided before anything is typed.

    A sheet whose headers name fields (`Date`, `Maturity`, `Tenor`)
    and whose row labels are not period names is a data table: its
    rows are records. A sheet whose headers are periods (`FY2024`,
    `2021/22`) is a model laid out the usual way. Anything else is
    `unknown`, and an unknown orientation means the caller must not
    treat a row as a quantity.
    """
    if not rows:
        return Orientation.UNKNOWN
    headers = " ".join(h for row in rows for h in row.column_labels)
    if RECORD_HEADER.search(headers):
        return Orientation.COLUMN_WISE
    if PERIOD_HEADER.search(headers):
        return Orientation.ROW_WISE
    labelled = sum(1 for row in rows if row.row_label.strip())
    return Orientation.ROW_WISE if labelled > len(rows) / 2 else Orientation.UNKNOWN


def _is_a_run_of_years(values: Sequence[float]) -> bool:
    """Three or more whole numbers stepping up through plausible years.

    Deliberately tight: whole numbers only, strictly increasing by
    one, at least three of them, inside 1900–2200. A money column
    holding 2000, 2100, 2200 fails on the step; a year column holding
    2033, 2034, 2035 passes.
    """
    if len(values) < 3:
        return False
    if not all(float(v).is_integer() and 1900 <= v <= 2200 for v in values):
        return False
    return all(b - a == 1 for a, b in zip(values, values[1:], strict=False))


def is_percent_format(number_format: str) -> bool:
    """A percent-style format: a `%` outside any quoted section.

    `0.00%` and `#,##0.0%;(0.0%);"-"` are percent styles. A format
    whose only `%` sits inside quotes — `0.0" % of total"` — is not:
    Excel is printing the character, not scaling the value.
    """
    outside, quoted = [], False
    for character in number_format or "":
        if character == '"':
            quoted = not quoted
        elif not quoted:
            outside.append(character)
    return "%" in "".join(outside)


def percent_convention(
    number_formats: Sequence[str], declared: str | None = None
) -> str:
    """`decimal`, `percent`, or `unknown` — decided by the format alone.

    The founder's fourth research round, six real models of six:
    **a percent-style number format means the stored value is a
    decimal fraction; a non-percent format under a declared `%` means
    it is a whole number of percent.** Neither the value nor the
    label may be consulted, and both directions have killer cases —
    their `Module Degradation = 0.5` under `% p.a.` (0.5 meaning half
    of one percent), and our own 24 percent-formatted cells above 1.5
    (gearing at 647%, all decimal fractions). An Australian model
    carries both conventions in one column of one sheet, so
    per-sheet and per-column inference is wrong too.

    A declared `%` with no format to read **abstains**. Assuming is
    what this function exists to stop.

    Note, and it is a property rather than a defect: a format-based
    rule inherits the file's own mistakes. Five cells in our corpus
    read exactly `2` under `0.0%`; this returns `decimal`, so they
    are 200%. If their author meant 2%, nothing here can know.
    """
    formats = [f for f in number_formats if f]
    if any(is_percent_format(f) for f in formats):
        return "decimal"
    if declared and "%" in declared and formats:
        return "percent"
    return "unknown"


def _from_declared(units: str, number_formats: Sequence[str] = ()) -> UnitLabel | None:
    """The model's own Units text, read together with its format.

    The units text alone cannot decide the percent convention — that
    is `percent_convention`'s job and it needs the format.
    """
    text = units.strip().lower()
    if not text:
        return None
    currency = next((c for sign, c in CURRENCY_IN_FORMAT if sign in text), "unknown")
    if currency != "unknown":
        scale = "millions" if re.search(r"\bm\b|m\s|million", text) else "units"
        return UnitLabel(
            kind="continuous",
            b5_type="money",
            currency=currency,
            scale=scale,
            period="annual",
            rate_form="not-a-rate",
            why=f"the sheet's Units column says « {units.strip()} »",
            declared=True,
        )
    if "%" in text:
        return UnitLabel(
            kind="continuous",
            b5_type="rate",
            currency="none",
            scale="units",
            period="annual" if "annual" in text else "none",
            rate_form=percent_convention(number_formats, text),
            why=f"the sheet's Units column says « {units.strip()} »"
            + _convention_note(percent_convention(number_formats, text)),
            declared=True,
        )
    return None


def _convention_note(convention: str) -> str:
    if convention == "decimal":
        return "; a percent number format means the value is a decimal fraction"
    if convention == "percent":
        return "; no percent format, so the value is a whole number of percent"
    return "; no number format to read, so the percent convention is not claimed"


def classify_row(
    evidence: RowEvidence, sheet_orientation: Orientation = Orientation.ROW_WISE
) -> UnitLabel:
    """One row's units, from format, label, headers and values."""
    if evidence.declared_units:
        declared = _from_declared(evidence.declared_units, evidence.number_formats)
        if declared is not None:
            return declared

    formats = " ".join(evidence.number_formats).lower()
    label = evidence.row_label.strip()
    headers = " ".join(evidence.column_labels)
    values = [float(v) for v in evidence.values]

    if sheet_orientation is Orientation.COLUMN_WISE:
        return UnitLabel(
            kind="mixed",
            why="the sheet reads column-wise, so this row is a record "
            "and has no single unit",
        )

    # A date format is decisive, and dates are categorical for B5.
    if re.search(r"(^|[^#0])(yy|mm-dd|dd/mm|mmm)", formats):
        return UnitLabel(
            kind="categorical",
            b5_type="date",
            currency="none",
            scale="units",
            period="point-in-time",
            rate_form="not-a-rate",
            why=f"date number format « {formats.strip()} »",
        )

    # A row whose label is a year and whose value is that year is an
    # index, not a quantity — B5 must hold it, never scale it.
    if YEAR_LABEL.match(label) and values and 1900 <= values[0] <= 2100:
        if float(values[0]).is_integer():
            return UnitLabel(
                kind="categorical",
                b5_type="date",
                currency="none",
                scale="units",
                period="annual",
                rate_form="not-a-rate",
                why=f"the row is a year (« {label} ») holding its own year number",
            )

    # The same index read sideways. A transposed column's label is
    # its header, which is usually blank, so the label rule above
    # cannot fire — and the year column then reads as a quantity.
    # Registered as costless when it was found on a fixture; the E1
    # measurement priced it at four of a hundred rows on `kind` and
    # four on `b5_type`, all of them RoE's year column (lane log,
    # 28 Aug). The values are the evidence when the label is not.
    if _is_a_run_of_years(values):
        return UnitLabel(
            kind="categorical",
            b5_type="date",
            currency="none",
            scale="units",
            # `annual`, matching the row-wise year rule above so the
            # two readings of the same index agree. E1's own hand
            # labels split on this — two year rows labelled `annual`
            # and two `point-in-time` — which is a defect in my key,
            # not in the inference, and one more reason `period` has
            # no answer key worth arming a finding on.
            period="annual",
            rate_form="not-a-rate",
            why=f"a run of consecutive years ({values[0]:.0f}…{values[-1]:.0f}) "
            "is a date index, whichever way the sheet is read",
        )

    # Currency in the number format is the only currency evidence
    # that does not require reading the Units column.
    currency = next((c for sign, c in CURRENCY_IN_FORMAT if sign in formats), "unknown")
    periodic = "annual" if PERIOD_HEADER.search(headers + " " + label) else "unknown"

    if "%" in formats:
        return UnitLabel(
            kind="continuous",
            b5_type="rate",
            currency="none",
            scale="units",
            period=periodic if periodic != "unknown" else "none",
            rate_form="decimal",
            why=f"percent number format « {formats.strip()} »: the stored "
            "value is a decimal shown as a percentage",
        )

    # A tenor header (ON, 1W, 3M) marks a rate curve read across.
    if evidence.column_labels and any(
        TENOR.match(h.strip()) for h in evidence.column_labels if h.strip()
    ):
        return UnitLabel(
            kind="continuous",
            b5_type="rate",
            currency="none",
            scale="units",
            period="point-in-time",
            rate_form="percent",
            why="tenor headers (« "
            + ", ".join(h for h in evidence.column_labels[:3] if h.strip())
            + " ») mark a rate curve; values read as percent",
        )

    if currency != "unknown":
        return UnitLabel(
            kind="continuous",
            b5_type="money",
            currency=currency,
            scale="unknown",
            period=periodic,
            rate_form="not-a-rate",
            why=f"the number format carries « {currency} »; scale is not "
            "stated anywhere and is not guessed from magnitude",
        )

    # Plain decimal amounts under period headers: continuous, and
    # that is *all* the evidence supports. Scale and currency are
    # abstentions, deliberately.
    if periodic == "annual" and values:
        return UnitLabel(
            kind="continuous",
            b5_type="unknown-quantity",
            currency="unknown",
            scale="unknown",
            period="annual",
            rate_form="not-a-rate",
            why="period headers make this a quantity per year, but nothing "
            "states its currency or scale — abstained on both",
        )

    return UnitLabel(why="no units declared, no decisive format, label or header")


def classify_sheet(
    rows: Sequence[RowEvidence], *, read_declared: bool = False
) -> dict[tuple[str, int], UnitLabel]:
    """Every row on one sheet, orientation decided first.

    `read_declared=False` (the default) makes the inference **blind
    to any Units column**, which is how it is measured against one.
    """
    facing = orientation(rows)
    out: dict[tuple[str, int], UnitLabel] = {}
    for row in rows:
        evidence = row if read_declared else _without_declared(row)
        out[(row.sheet, row.row)] = classify_row(evidence, facing)
    return out


def _without_declared(row: RowEvidence) -> RowEvidence:
    return RowEvidence(
        sheet=row.sheet,
        row=row.row,
        row_label=row.row_label,
        column_labels=row.column_labels,
        number_formats=row.number_formats,
        values=row.values,
        declared_units=None,
    )


def rows_from_cells(
    cells: Mapping[str, Any], sheet: str, formats: Mapping[str, str] | None = None
) -> list[RowEvidence]:
    """Build one `RowEvidence` per input row of a sheet, from the reader."""
    grouped: dict[int, list[Any]] = {}
    for _ref, cell in cells.items():
        if cell.sheet != sheet or cell.formula is not None:
            continue
        if isinstance(cell.value, (int, float, Decimal)) and not isinstance(
            cell.value, bool
        ):
            grouped.setdefault(cell.row, []).append(cell)
    rows = []
    for row, group in sorted(grouped.items()):
        group.sort(key=lambda c: c.column)
        rows.append(
            RowEvidence(
                sheet=sheet,
                row=row,
                row_label=(group[0].row_label or "").strip(),
                column_labels=[(c.column_label or "").strip() for c in group[:8]],
                number_formats=sorted({c.number_format or "General" for c in group})[
                    :4
                ],
                values=[float(c.value) for c in group[:8]],
            )
        )
    return rows


def columns_from_cells(
    cells: Mapping[str, Any], sheet: str
) -> list[tuple[int, RowEvidence]]:
    """The same evidence read sideways, for a record sheet.

    On a sheet whose rows are records — one period per row, `RPI`
    and `CPI` across — a row has no single unit and a **column**
    does. So the evidence is transposed: the column header becomes
    the label, the row labels become the headers, and the column's
    own cells become the values and formats. `classify_row` then
    runs unchanged.

    Measured reason this exists: on the RoE model every one of the
    26 rate cells the hand typing perturbed was typed `date` and
    frozen, because each row is labelled with its year and holds
    that year in its first column. Coverage went from 10 of 193 to
    0 (lane log, 28 Aug).

    Returns `(column index, evidence)` so the caller can map a
    verdict back onto the cells it came from.
    """
    grouped: dict[int, list[Any]] = {}
    for _ref, cell in cells.items():
        if cell.sheet != sheet or cell.formula is not None:
            continue
        if isinstance(cell.value, (int, float, Decimal)) and not isinstance(
            cell.value, bool
        ):
            grouped.setdefault(cell.column, []).append(cell)
    columns = []
    for column, group in sorted(grouped.items()):
        group.sort(key=lambda c: c.row)
        columns.append(
            (
                column,
                RowEvidence(
                    sheet=sheet,
                    row=group[0].row,
                    row_label=(group[0].column_label or "").strip(),
                    column_labels=[(c.row_label or "").strip() for c in group[:8]],
                    number_formats=sorted(
                        {c.number_format or "General" for c in group}
                    )[:4],
                    values=[float(c.value) for c in group[:8]],
                ),
            )
        )
    return columns


def sheet_reading(cells: Mapping[str, Any], sheet: str) -> Orientation:
    """Which way to read a sheet, asking twice before refusing.

    Registered, then measured wrong, then amended (lane log, 28 Aug):
    the first version refused an `unknown` sheet outright, and the
    RoE `One-Off Wedge` sheet is exactly that — its headers are
    `RPI · CPI · % of 'legacy' RPI`, none of them in the record-header
    word list, and its row labels are years, so neither test decides.
    Refusing it meant the column path never ran on the one sheet it
    was built for.

    So an undecidable sheet is **transposed and asked again**. If the
    sideways view is decisive — the original row labels turn out to
    be period headers, which is what a record table looks like from
    the side — the sheet is column-wise. If it is still undecided, it
    is `unknown` and the caller must refuse it.
    """
    rows = rows_from_cells(cells, sheet)
    if not rows:
        return Orientation.UNKNOWN
    facing = orientation(rows)
    if facing is not Orientation.UNKNOWN:
        return facing
    sideways = [row for _column, row in columns_from_cells(cells, sheet)]
    if sideways and orientation(sideways) is Orientation.ROW_WISE:
        return Orientation.COLUMN_WISE
    return Orientation.UNKNOWN


def classify_columns(
    columns: Sequence[tuple[int, RowEvidence]],
) -> dict[int, UnitLabel]:
    """Every column of a record sheet, classified by the same rules."""
    evidence = [row for _column, row in columns]
    facing = orientation(evidence)
    return {
        column: classify_row(_without_declared(row), facing) for column, row in columns
    }


# --- rate form read from how a row is consumed ----------------------

#: A reference or range immediately divided by 100 — `C6:C25/100`,
#: `$D$6/100`. The model dividing a row by 100 is the file stating
#: that the row is a percentage written as a number, which is a fact
#: about the row and not a guess about its name.
OVER_HUNDRED = re.compile(
    r"(?:'[^']+'!|[A-Za-z_][\w. ]*!)?"
    r"(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?)\s*/\s*100\b",
    re.I,
)

#: `1 + <this cell>` — the shape that consumes a rate already in
#: decimal form. It must name the cell: matching a bare « 1 + »
#: anywhere in a consumer formula turned ten of E1's inflation
#: **index** rows into « decimal rates » and took `rate_form` from
#: 80 right / 4 wrong to 71 / 14. The registration said a fall
#: anywhere means the change comes out; the loose half came out and
#: this precise one replaced it (lane log, 28 Aug).
ONE_PLUS_REF = re.compile(
    r"1\s*\+\s*\(?\s*"
    r"(?:'[^']+'!|[A-Za-z_][\w. ]*!)?"
    r"(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?)"
    # Reject a following `/100`, `:` or digit. Without all three the
    # match backtracks inside the range — `1+(C6:C25/100)` yields
    # `C6`, then `C6:C2` — sees something other than `/100` after it,
    # and calls the RoE model's own percent rows decimals, costing 18
    # of the 26 cells this rule exists to recover.
    r"(?!\s*(?::|\d|/\s*100))",
    re.I,
)


def _in_span(token: str, column: int, row: int) -> bool:
    """Does `C6:C25` (or `$D$6`) cover this column and row?"""
    parts = token.replace("$", "").split(":")
    bounds = []
    for part in parts:
        letters = "".join(ch for ch in part if ch.isalpha()).upper()
        digits = "".join(ch for ch in part if ch.isdigit())
        if not letters or not digits:
            return False
        index = 0
        for ch in letters:
            index = index * 26 + (ord(ch) - 64)
        bounds.append((index, int(digits)))
    if len(bounds) == 1:
        return bounds[0] == (column, row)
    (c1, r1), (c2, r2) = bounds
    return min(c1, c2) <= column <= max(c1, c2) and min(r1, r2) <= row <= max(r1, r2)


def rate_form_from_usage(cells: Mapping[str, Any]) -> dict[str, tuple[str, str]]:
    """`{ref: (rate_form, why)}` read from the formulas that consume it.

    The RoE model's blocker, and the reason this exists: `RPI` is
    stored as `5.8` under a plain `0.00` format, so every
    format-and-label rule abstains and B5 holds the column that
    drives the whole sheet. The sheet's own formula says what it is:

        F6 = GEOMEAN(1 + (C6:C25/100)) / GEOMEAN(1 + (D6:D25/100)) - 1

    A row its consumers divide by 100 is a percentage written as a
    number. A row a consumer names in `1 + <that row>` without
    dividing is already a decimal. A row consumed both ways is an
    **abstention**, because the file is then saying two things and
    this module does not pick one.

    Both tests check that the reference **covers the cell**. The
    first version tested for a bare « 1 + » anywhere in the consumer
    formula, which is not evidence about any particular row, and it
    cost ten of E1's hundred rows.
    """
    verdicts: dict[str, set[str]] = {}
    for _ref, cell in cells.items():
        formula = getattr(cell, "formula", None)
        if not formula:
            continue
        divided = [match.group(1) for match in OVER_HUNDRED.finditer(formula)]
        added = [match.group(1) for match in ONE_PLUS_REF.finditer(formula)]
        if not divided and not added:
            continue
        for precedent in getattr(cell, "precedents", ()) or ():
            target = cells.get(precedent)
            if target is None or getattr(target, "formula", None) is not None:
                continue
            # Both tests run: a row divided by 100 in one consumer and
            # added to 1 in another is a file saying two things, and
            # two entries in the set make it an abstention below. An
            # `elif` here would have let « percent » win silently.
            if any(_in_span(token, target.column, target.row) for token in divided):
                verdicts.setdefault(precedent, set()).add("percent")
            if any(_in_span(token, target.column, target.row) for token in added):
                verdicts.setdefault(precedent, set()).add("decimal")
    decided: dict[str, tuple[str, str]] = {}
    for ref, seen in verdicts.items():
        if len(seen) != 1:
            continue
        form = seen.pop()
        decided[ref] = (
            form,
            "its own consumers divide it by 100"
            if form == "percent"
            else "its own consumers add it to 1 without dividing",
        )
    return decided


def with_usage(label: UnitLabel, usage: tuple[str, str] | None) -> UnitLabel:
    """A label upgraded by what the formulas do with the cell.

    Only ever fills an abstention or agrees with what is there: a
    format that already said `percent` is not overturned by usage,
    per the registration (« usage evidence must not overturn a
    format-based answer that was already right »).
    """
    if usage is None or label.rate_form not in ("unknown", "not-a-rate"):
        return label
    form, why = usage
    if label.b5_type not in ("unknown-quantity", "untyped"):
        return label
    return UnitLabel(
        kind="continuous",
        b5_type="rate",
        currency="none",
        scale="units",
        period=label.period,
        rate_form=form,
        why=f"{why} — so it is a rate, read from usage not from its name",
    )


# --- propagation through the dependency graph -----------------------

#: Functions that multiply their arguments. They must not be read as
#: additive: `SUMPRODUCT(rates, amounts)` contains no `*` character
#: and is a product all the same — which is exactly the mistake that
#: produced 216 phantom « unit conflicts » on ED2 before it was
#: caught by hand-reading one of them (lane log, 28 Aug).
MULTIPLICATIVE_FUNCTIONS = re.compile(
    r"\b(sumproduct|product|mmult|sumx2my2|sumx2py2|sumxmy2|sumsq)\s*\(", re.I
)

#: A formula that is nothing but one cell over another. The
#: dimensionless conclusion needs this much: « `/` appears somewhere »
#: fired on `(AP83/AP$13 - AP84) * AP$16 * AQ$16 * AR$13`, which is
#: money divided by an inflation index and is money, and calling it
#: dimensionless put 18 revenue rows into phantom conflict.
_REF = r"(?:'[^']+'!|[A-Za-z_][\w. ]*!)?\$?[A-Z]{1,3}\$?\d+"
SIMPLE_RATIO = re.compile(rf"^=\s*-?\s*{_REF}\s*/\s*{_REF}\s*$", re.I)

#: Formulas that only add and subtract: every term must share a unit,
#: and the result carries it. The test is the whole formula, not its
#: leading function — `=SUM(AP65:AP67) * AP$16 * AQ$16` opens with a
#: SUM and is a product, and reading it as a sum is what put 240
#: phantom conflicts on ED2 (lane log, 28 Aug).
ADDITIVE = re.compile(r"^[^*/^]*$")


@dataclass(frozen=True)
class Conflict:
    """Cells added together whose declared units disagree.

    Not a finding — this module reports nothing to anyone. It is
    evidence handed to the lead, and Sentinel decides whether E3
    turns any of it into something a banker reads.
    """

    ref: str
    units: tuple[str, ...]
    why: str


def propagate(
    cells: Mapping[str, Any],
    seeds: Mapping[str, UnitLabel],
    *,
    rounds: int = 20,
) -> tuple[dict[str, UnitLabel], list[Conflict]]:
    """Carry units from input cells into the formulas that use them.

    The Williams-2020 half. A formula that only adds and subtracts
    must have one unit across every term, so it **inherits** that
    unit — and when its terms disagree, that disagreement is recorded
    rather than averaged away. A formula that is *nothing but* one
    amount over another of the same currency is dimensionless;
    multiplying an amount by a dimensionless factor keeps the
    amount's unit; and where the terms do not settle it, nothing is
    claimed. Every one of those conditions is narrower than it first
    was, and each narrowing is a bug the ED2 and GD3 workbooks found
    — see the tests, which carry the formulas that caught them.

    **What this cannot do, measured before it was built**: neither
    ED2 nor GD3 has a single currency-bearing number format — the
    « £m » lives in a Units column and nowhere else in the file. So
    propagation has no anchor to spread unless the caller supplies
    the declared units. A blind run spreads what blind evidence
    knows: percent, dates, and consistency.
    """
    known: dict[str, UnitLabel] = dict(seeds)
    #: How many precedents each conclusion rested on. A cell settled
    #: from two of its five terms is **revisited** when the other
    #: three arrive: the first pass over a 20k-cell model reaches a
    #: sum before some of its own terms, and a conclusion that is
    #: never revised misses the disagreement that arrives later.
    #: Measured: without revision the planted-mismatch control caught
    #: 6 of 20 (lane log, 28 Aug).
    rested_on: dict[str, int] = {}
    conflicts: dict[str, Conflict] = {}
    for _ in range(rounds):
        changed = False
        for ref, cell in cells.items():
            formula = getattr(cell, "formula", None)
            if formula is None or ref in seeds or ref in conflicts:
                continue
            precedents = [
                known[p] for p in (getattr(cell, "precedents", ()) or ()) if p in known
            ]
            if not precedents or len(precedents) <= rested_on.get(ref, 0):
                continue
            body = formula
            multiplicative = bool(MULTIPLICATIVE_FUNCTIONS.search(body))
            additive = not multiplicative and bool(ADDITIVE.match(body))
            currencies = {p.currency for p in precedents if p.currency != "unknown"}
            scales = {p.scale for p in precedents if p.scale != "unknown"}
            if additive:
                if len(currencies) > 1 or len(scales) > 1:
                    conflicts[ref] = Conflict(
                        ref=ref,
                        units=tuple(sorted(currencies | scales)),
                        why="added or subtracted terms whose units disagree",
                    )
                    known.pop(ref, None)
                    changed = True
                    continue
                source = precedents[0]
                label = UnitLabel(
                    kind=source.kind,
                    b5_type=source.b5_type,
                    currency=next(iter(currencies), "unknown"),
                    scale=next(iter(scales), "unknown"),
                    period=source.period,
                    rate_form=source.rate_form,
                    why="inherited: a sum carries the unit of its terms",
                )
            elif (
                SIMPLE_RATIO.match(body)
                and len(currencies) == 1
                and len(precedents) > 1
            ):
                label = UnitLabel(
                    kind="continuous",
                    b5_type="rate",
                    currency="none",
                    scale="units",
                    period="unknown",
                    rate_form="decimal",
                    why="one amount divided by another of the same currency "
                    "is dimensionless",
                )
            elif ("*" in body or multiplicative) and currencies:
                # The unit of a product is the unit of whichever term
                # carries one. Taking the first *known* term instead of
                # the first *moneyed* one labelled « rate × £m » as
                # dimensionless whenever the rate came first, and every
                # sum downstream then read as a unit conflict.
                moneyed = [
                    p for p in precedents if p.currency not in ("unknown", "none")
                ]
                if moneyed:
                    money = moneyed[0]
                    label = UnitLabel(
                        kind="continuous",
                        b5_type="money",
                        currency=money.currency,
                        scale=money.scale,
                        period=money.period,
                        rate_form="not-a-rate",
                        why="an amount multiplied by a dimensionless factor "
                        "keeps its unit",
                    )
                elif _all_known(cells, cell, known):
                    label = UnitLabel(
                        kind="continuous",
                        b5_type="rate",
                        currency="none",
                        scale="units",
                        period="unknown",
                        rate_form="decimal",
                        why="a product of dimensionless factors is dimensionless",
                    )
                else:
                    # Some factor is unlabelled, and no labelled factor
                    # carries a currency: the product's unit is not
                    # known, and « dimensionless » would be a guess.
                    # `-(SUM($AI101:AQ101))*AR98` reaches here — the
                    # amounts are blank in this file and only the rate
                    # is labelled — and calling it dimensionless made
                    # every sum below it read as a unit conflict.
                    continue
            else:
                continue
            if known.get(ref) != label or rested_on.get(ref) != len(precedents):
                known[ref] = label
                rested_on[ref] = len(precedents)
                changed = True
        if not changed:
            break
    return known, list(conflicts.values())


def _all_known(
    cells: Mapping[str, Any], cell: Any, known: Mapping[str, UnitLabel]
) -> bool:
    """Every one of a formula's precedents carries a label.

    Abstention's precondition: a conclusion drawn from part of a
    formula's terms is a guess about the rest. A precedent that is
    blank in this file counts as unlabelled, not as absent — the
    row it sits on still has a unit, and `SUM($AI101:AQ101)*AR98`
    over an empty amounts row is a money × rate product whose money
    happens to be zero, not a dimensionless one.
    """
    del cells
    return all(ref in known for ref in (getattr(cell, "precedents", ()) or ()))
