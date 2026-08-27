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
