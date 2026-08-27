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


def _from_declared(units: str) -> UnitLabel | None:
    """The model's own Units text, when the caller supplies it."""
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
            rate_form="unknown",
            why=f"the sheet's Units column says « {units.strip()} »",
            declared=True,
        )
    return None


def classify_row(
    evidence: RowEvidence, sheet_orientation: Orientation = Orientation.ROW_WISE
) -> UnitLabel:
    """One row's units, from format, label, headers and values."""
    if evidence.declared_units:
        declared = _from_declared(evidence.declared_units)
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
