"""Verify OOXML workbooks (.xlsx/.xlsm) as formula-intact project-finance models.

Evidence comes from the raw OOXML parts, not from a library's interpretation:
sheet XML is streamed and every <c> element classified. openpyxl is used only
to resolve shared strings into readable row labels for the sample rows.
"""

import hashlib
import json
import pathlib
import re
import sys
import zipfile
from collections import Counter
from xml.etree import ElementTree as ET

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_RELS = "http://schemas.openxmlformats.org/package/2006/relationships"
M = f"{{{NS_MAIN}}}"

CELL_RE = re.compile(r"^([A-Z]+)([0-9]+)$")
EXT_REF_RE = re.compile(r"\[\d+\]")

# Terms a project-finance model must actually contain, grouped by the concept
# the user asked us to evidence.
PF_TERMS = {
    "revenue / operating assumptions": [
        "revenue", "tariff", "toll", "traffic", "throughput", "volume",
        "price", "availability payment", "unitary charge", "unitary payment",
    ],
    "construction period": [
        "construction", "build period", "construction period", "commissioning",
        "cod", "works period", "practical completion",
    ],
    "operating period": [
        "operation", "operating period", "operations period", "concession period",
        "service period", "operating phase",
    ],
    "CAPEX": ["capex", "capital expenditure", "capital cost", "construction cost", "capital spend"],
    "OPEX": ["opex", "operating expenditure", "operating cost", "o&m", "lifecycle", "maintenance cost"],
    "debt schedule": ["debt schedule", "loan schedule", "opening balance", "closing balance", "debt balance", "senior debt"],
    "debt drawdowns": ["drawdown", "draw down", "drawing", "utilisation", "utilization", "debt draw"],
    "interest": ["interest", "margin", "libor", "sonia", "euribor", "swap rate", "interest rate"],
    "principal repayment": ["repayment", "principal", "amortisation", "amortization", "redemption"],
    "DSCR / ADSCR": ["dscr", "adscr", "llcr", "plcr", "cover ratio", "coverage ratio", "debt service cover"],
    "CFADS": ["cfads", "cash available for debt service", "cash flow available for debt"],
    "debt sizing": ["debt sizing", "sizing", "gearing", "debt:equity", "debt / equity", "sculpt", "target dscr"],
    "cash flows": ["cash flow", "cashflow", "net cash", "cash balance", "free cash"],
    "project IRR / equity IRR": ["irr", "internal rate of return", "npv", "equity return", "project irr", "equity irr"],
    "taxes": ["tax", "corporation tax", "vat", "capital allowance", "taxable"],
    "depreciation": ["depreciation", "amortisation of", "written down", "wdv", "depreciate"],
    "financing structure": ["equity", "share capital", "subordinated", "subdebt", "mezzanine", "funding", "senior", "junior"],
    "sensitivity / scenario analysis": ["sensitivity", "scenario", "switch", "downside", "base case", "stress", "flex"],
}

DEBT_SHEET_HINT = re.compile(
    r"debt|loan|financ|funding|dscr|cover|cash|cfads|senior|facility|amort|repay", re.I
)


def col_to_num(col):
    n = 0
    for ch in col:
        n = n * 26 + (ord(ch) - 64)
    return n


def sha256_and_size(path):
    h = hashlib.sha256()
    size = 0
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
            size += len(chunk)
    return h.hexdigest(), size


def load_shared_strings(z):
    """Shared strings, in index order; concatenates rich-text runs."""
    out = []
    if "xl/sharedStrings.xml" not in z.namelist():
        return out
    with z.open("xl/sharedStrings.xml") as fh:
        for _, el in ET.iterparse(fh, events=("end",)):
            if el.tag == f"{M}si":
                out.append("".join(t.text or "" for t in el.iter(f"{M}t")))
                el.clear()
    return out


def workbook_meta(z):
    """Sheet list with visibility, defined names, and calc settings."""
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = {}
    if "xl/_rels/workbook.xml.rels" in z.namelist():
        for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels")):
            rels[r.get("Id")] = r.get("Target")

    sheets = []
    for sh in wb.iter(f"{M}sheet"):
        rid = sh.get(f"{{{NS_REL}}}id")
        target = rels.get(rid, "")
        target = target[1:] if target.startswith("/") else target
        if not target.startswith("xl/"):
            target = "xl/" + target
        sheets.append({
            "name": sh.get("name"),
            "state": sh.get("state") or "visible",
            "path": target.replace("xl/worksheets/../", "xl/"),
        })

    names = []
    for dn in wb.iter(f"{M}definedName"):
        names.append({"name": dn.get("name"), "refers_to": (dn.text or "")[:200],
                      "hidden": dn.get("hidden") == "1"})

    calc = wb.find(f"{M}calcPr")
    calc_pr = dict(calc.attrib) if calc is not None else {}
    return sheets, names, calc_pr


def external_links(z):
    out = []
    for n in z.namelist():
        if re.match(r"xl/externalLinks/externalLink\d+\.xml$", n):
            book = None
            relp = n.replace("externalLinks/", "externalLinks/_rels/") + ".rels"
            if relp in z.namelist():
                for r in ET.fromstring(z.read(relp)):
                    if "externalLinkPath" in (r.get("Type") or "") or r.get("TargetMode") == "External":
                        book = r.get("Target")
            out.append({"part": n, "target": book})
    return out


def scan_sheet(z, path):
    """Stream one sheet's XML and classify every cell element."""
    st = {
        "populated": 0, "formula": 0, "hardcoded": 0,
        "formula_cross_sheet": 0, "formula_external": 0, "formula_shared": 0,
        "min_row": None, "max_row": 0, "min_col": None, "max_col": 0,
        "text_cells": 0, "numeric_hardcoded": 0,
    }
    rows_with_formula = {}
    row_text = {}
    formula_heads = Counter()
    if path not in z.namelist():
        return st, rows_with_formula, row_text, formula_heads

    with z.open(path) as fh:
        for _, c in ET.iterparse(fh, events=("end",)):
            if c.tag != f"{M}c":
                continue
            ref = c.get("r") or ""
            m = CELL_RE.match(ref)
            r = int(m.group(2)) if m else 0
            cn = col_to_num(m.group(1)) if m else 0
            f = c.find(f"{M}f")
            v = c.find(f"{M}v")
            is_str = c.find(f"{M}is")
            has_value = v is not None or is_str is not None

            if f is not None:
                st["formula"] += 1
                txt = f.text or ""
                if f.get("t") == "shared" and not txt:
                    st["formula_shared"] += 1
                # A real external-workbook reference is an indexed book token
                # like [1]Sheet1!A1. A bare "[" is usually a structured table
                # reference (Table[[#This Row],[Col]]), which is NOT external.
                if EXT_REF_RE.search(txt):
                    st["formula_external"] += 1
                if "!" in txt:
                    st["formula_cross_sheet"] += 1
                head = re.match(r"\s*([A-Z][A-Z0-9\.]*)\s*\(", txt)
                if head:
                    formula_heads[head.group(1).upper()] += 1
                rows_with_formula.setdefault(r, []).append((ref, txt, f.get("t")))
            elif has_value:
                st["hardcoded"] += 1
                if c.get("t") in ("s", "str", "inlineStr"):
                    st["text_cells"] += 1
                    # remember leftmost text cell as the row's label
                    key = (cn, v.text if v is not None else None, c.get("t"))
                    prev = row_text.get(r)
                    if prev is None or cn < prev[0]:
                        row_text[r] = key
                else:
                    st["numeric_hardcoded"] += 1

            if f is not None or has_value:
                st["populated"] += 1
                st["max_row"] = max(st["max_row"], r)
                st["max_col"] = max(st["max_col"], cn)
                st["min_row"] = r if st["min_row"] is None else min(st["min_row"], r)
                st["min_col"] = cn if st["min_col"] is None else min(st["min_col"], cn)
            c.clear()
    return st, rows_with_formula, row_text, formula_heads


def analyze(path):
    path = pathlib.Path(path)
    digest, size = sha256_and_size(path)
    z = zipfile.ZipFile(path)
    names_in_zip = z.namelist()
    sst = load_shared_strings(z)
    sheets, defined_names, calc_pr = workbook_meta(z)

    def label_for(row_text, r):
        ent = row_text.get(r)
        if not ent:
            return ""
        _, raw, t = ent
        if raw is None:
            return ""
        if t == "s":
            try:
                return sst[int(raw)]
            except (ValueError, IndexError):
                return ""
        return raw

    per_sheet = []
    totals = Counter()
    all_heads = Counter()
    sample_pool = []
    label_index = []  # (sheet, row, label) for PF term matching

    for sh in sheets:
        st, rf, rt, heads = scan_sheet(z, sh["path"])
        all_heads.update(heads)
        used_cells = 0
        if st["min_row"] is not None:
            used_cells = (st["max_row"] - st["min_row"] + 1) * (st["max_col"] - st["min_col"] + 1)
        blank = max(0, used_cells - st["populated"])
        rec = {
            "sheet": sh["name"], "state": sh["state"],
            "used_range_cells": used_cells,
            "populated": st["populated"], "formula": st["formula"],
            "hardcoded": st["hardcoded"], "text_cells": st["text_cells"],
            "numeric_hardcoded": st["numeric_hardcoded"], "blank_in_used_range": blank,
            "formula_cross_sheet": st["formula_cross_sheet"],
            "formula_external": st["formula_external"],
            "max_row": st["max_row"], "max_col": st["max_col"],
        }
        rec["pct_formula_of_populated"] = round(100.0 * st["formula"] / st["populated"], 2) if st["populated"] else 0.0
        per_sheet.append(rec)
        for k in ("used_range_cells", "populated", "formula", "hardcoded", "text_cells",
                  "numeric_hardcoded", "blank_in_used_range", "formula_cross_sheet", "formula_external"):
            totals[k] += rec[k]

        for r, lab in ((r, label_for(rt, r)) for r in rt):
            if lab:
                label_index.append((sh["name"], r, lab))

        # candidate sample rows: a text label plus formulas on the same row
        for r, cells in rf.items():
            lab = label_for(rt, r)
            if lab and len(lab) > 3:
                sample_pool.append({
                    "sheet": sh["name"], "row": r, "label": lab,
                    "cells": cells[:4],
                    "n_formulas_in_row": len(cells),
                })

    # ---- project-finance evidence, from labels actually present in the file
    pf_hits = {}
    lowered = [(s, r, l, l.lower()) for s, r, l in label_index]
    for concept, terms in PF_TERMS.items():
        hits = []
        for term in terms:
            for s, r, l, ll in lowered:
                if term in ll:
                    hits.append({"term": term, "sheet": s, "row": r, "label": l[:120]})
                    break
        pf_hits[concept] = {"present": bool(hits), "n_terms_matched": len(hits), "evidence": hits[:3]}

    # ---- values-only classification
    pop = totals["populated"]
    pct_formula = round(100.0 * totals["formula"] / pop, 2) if pop else 0.0
    # formulas among non-label cells is the sharper measure
    non_label = pop - totals["text_cells"]
    pct_formula_of_numeric_area = round(100.0 * totals["formula"] / non_label, 2) if non_label else 0.0

    # Do the CALCULATION sheets carry formulas, or only cover sheets?
    calc_sheets = [s for s in per_sheet if DEBT_SHEET_HINT.search(s["sheet"] or "")]
    calc_formula = sum(s["formula"] for s in calc_sheets)
    calc_pop = sum(s["populated"] for s in calc_sheets)
    calc_pct = round(100.0 * calc_formula / calc_pop, 2) if calc_pop else None

    vba = any(n.lower().endswith("vbaproject.bin") for n in names_in_zip)
    ext = external_links(z)

    return {
        "filename": path.name,
        "path": str(path),
        "file_type": path.suffix.lower(),
        "bytes": size,
        "sha256": digest,
        "n_worksheets": len(sheets),
        "worksheet_names": [s["name"] for s in sheets],
        "hidden_sheets": [s["name"] for s in sheets if s["state"] == "hidden"],
        "very_hidden_sheets": [s["name"] for s in sheets if s["state"] == "veryHidden"],
        "totals": dict(totals),
        "pct_formula_of_populated": pct_formula,
        "pct_formula_of_non_label_cells": pct_formula_of_numeric_area,
        "calc_sheets_checked": [s["sheet"] for s in calc_sheets],
        "calc_sheets_pct_formula": calc_pct,
        "calc_sheets_formula_count": calc_formula,
        "n_defined_names": len(defined_names),
        "defined_names_sample": defined_names[:15],
        "calcPr": calc_pr,
        "iterative_calculation": calc_pr.get("iterate") == "1",
        "external_links": ext,
        "has_vba": vba,
        "top_formula_functions": all_heads.most_common(20),
        "per_sheet": per_sheet,
        "pf_evidence": pf_hits,
        "sample_pool": sample_pool,
    }


if __name__ == "__main__":
    out = []
    for p in sys.argv[1:]:
        try:
            out.append(analyze(p))
            print(f"OK  {p}", file=sys.stderr)
        except Exception as e:
            out.append({"filename": pathlib.Path(p).name, "error": repr(e)})
            print(f"ERR {p} {e!r}", file=sys.stderr)
    print(json.dumps(out, indent=1))
