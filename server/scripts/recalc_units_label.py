"""E1 — apply the hand labelling to the drawn sample.

The labels are mine, not an inference: the decision table below is
what I decided while reading the sample's evidence (the model's own
Units column where it has one, the column headers, the number
formats, the values), written out so the truth set can be audited
and argued with rather than trusted.

**The methodological hazard, named**: ED2 and GD3 declare units in a
`Units` column of their own (« £m 20/21 prices », « % »), and my
labels for those rows come from it. E2 may read that column too, and
on those models it should be accurate almost trivially. H7, the RoE
summary and the WACC model declare nothing — no Units column
anywhere — and there the labels come from headers, formats and
values. **E2's accuracy is therefore reported split by whether the
model declares its units**, because they are two different problems
and one number would hide the hard half.
"""

import json
import re
import sys
from pathlib import Path
from typing import Any

Label = dict[str, str]


def label_row(row: dict[str, Any], units: str | None) -> Label:
    """One row's labels and the evidence sentence behind them."""
    fmt = " ".join(row["number_formats"]).lower()
    text = (row["row_label"] or "").lower()
    heads = " ".join(row["column_labels"]).lower()
    values = row["values"]
    declared = (units or "").lower()

    # --- the model said so itself -----------------------------------
    if declared:
        if declared.startswith("£m"):
            price_base = re.search(r"(\d\d/\d\d|\d{4}/\d\d)", declared)
            return {
                "kind": "continuous",
                "b5_type": "money",
                "currency": "GBP",
                "scale": "millions",
                "period": "annual",
                "rate_form": "not-a-rate",
                "why": f"the sheet's own Units column says « {units} »"
                + (f", price base {price_base.group(1)}" if price_base else ""),
            }
        if declared.startswith("%") or "%" in declared:
            return {
                "kind": "continuous",
                "b5_type": "rate",
                "currency": "none",
                "scale": "units",
                "period": "annual" if "annual" in declared else "none",
                "rate_form": "decimal" if "%" in fmt else "unknown",
                "why": f"Units column says « {units} »; format « {fmt} »",
            }

    # --- a record row, not a quantity --------------------------------
    # On a data table (SONIA curve, LIBOR fixings, BoE series) the
    # quantities live in COLUMNS and a row is one record: a date, a
    # maturity and a rate side by side. Labelling such a row with one
    # unit would be false, so it is labelled `mixed` and reported as
    # a finding about orientation, not smuggled into a rate.
    if re.search(r"\bdate\b|\bmaturity\b", heads) or re.match(
        r"^\d{5}-\d", row["row_label"].strip()
    ):
        return {
            "kind": "mixed",
            "b5_type": "untyped",
            "currency": "unknown",
            "scale": "unknown",
            "period": "unknown",
            "rate_form": "unknown",
            "why": "a record row on a data table (headers "
            f"« {row['column_labels'][:3]} »): the quantities are the "
            "columns, so the row has no single unit",
        }

    # --- a date, by format or by value ------------------------------
    if "mm-dd-yy" in fmt or "yy" in fmt and "#" not in fmt:
        return {
            "kind": "categorical",
            "b5_type": "date",
            "currency": "none",
            "scale": "units",
            "period": "point-in-time",
            "rate_form": "not-a-rate",
            "why": f"date number format « {fmt} »",
        }
    # A bare year in a labelled year row: an index, not a quantity.
    if values and all(1990 <= v <= 2100 and float(v).is_integer() for v in values[:1]):
        if re.match(r"^\d{4}/\d{2}$", row["row_label"].strip()):
            return {
                "kind": "categorical",
                "b5_type": "date",
                "currency": "none",
                "scale": "units",
                "period": "annual",
                "rate_form": "not-a-rate",
                "why": "the row is a year (« 2033/34 ») holding its own year number",
            }

    # --- percent-formatted: a rate stored as a decimal ---------------
    if "%" in fmt:
        return {
            "kind": "continuous",
            "b5_type": "rate",
            "currency": "none",
            "scale": "units",
            "period": "annual"
            if re.search(r"fy\d{4}|20\d\d/\d\d", heads + text)
            else "none",
            "rate_form": "decimal",
            "why": f"percent number format « {fmt} », values around {values[0]:.4g}",
        }

    # --- yields and rate curves named in their headers ---------------
    if re.search(
        r"non-financials|iboxx|sonia|libor|maturity|iudl", heads + text
    ) or re.match(
        r"^(on|1w|1m|2m|3m|6m|12m)$", (row["column_labels"] or [""])[0].strip().lower()
    ):
        return {
            "kind": "continuous",
            "b5_type": "rate",
            "currency": "none",
            "scale": "units",
            "period": "point-in-time",
            "rate_form": "percent",
            "why": f"a market rate series (headers « {row['column_labels'][:2]} »), "
            f"values around {values[0]:.4g} read as percent",
        }

    # --- an index level (inflation series) ---------------------------
    if re.search(r"inflation|cpi|rpi", row["sheet"].lower() + text + heads):
        return {
            "kind": "continuous",
            "b5_type": "rate",
            "currency": "none",
            "scale": "units",
            "period": "annual",
            "rate_form": "not-a-rate",
            "why": "an inflation index level, not a rate and not an amount",
        }

    return {
        "kind": "unknown",
        "b5_type": "untyped",
        "currency": "unknown",
        "scale": "unknown",
        "period": "unknown",
        "rate_form": "unknown",
        "why": "no units declared, no informative label or header, "
        "format « " + fmt + " » decides nothing — abstained",
    }


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__)
        return 2
    sample = json.loads(Path(sys.argv[1]).read_text())
    units_map = json.loads(Path(sys.argv[2]).read_text())
    out = Path(sys.argv[3])
    labelled = []
    for row in sample:
        key = f"{row['model']}|{row['sheet']}|{row['row']}"
        entry = dict(row)
        entry["declared_units"] = units_map.get(key)
        entry["labels"] = label_row(row, units_map.get(key))
        labelled.append(entry)
    out.write_text(json.dumps(labelled, indent=1))
    from collections import Counter

    for dim in ("kind", "b5_type", "currency", "scale", "period", "rate_form"):
        print(dim, dict(Counter(r["labels"][dim] for r in labelled)))
    declared = sum(1 for r in labelled if r["declared_units"])
    unknown = sum(1 for r in labelled if r["labels"]["kind"] == "unknown")
    print(
        f"rows {len(labelled)}, units declared by the model on {declared}, "
        f"abstained on {unknown}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
