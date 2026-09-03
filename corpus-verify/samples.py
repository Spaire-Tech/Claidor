"""Print representative label+formula rows from the analysis JSON.

Picks rows on the sheets that carry the financial calculation logic (debt,
cash flow, ratios), preferring rows whose label names a project-finance
concept, so the sample shows the actual mechanics rather than cover-sheet
arithmetic.
"""
import json, re, sys

WANT = re.compile(
    r"cfads|dscr|adscr|llcr|debt|drawdown|repay|principal|interest|balance|"
    r"capex|opex|revenue|toll|traffic|tax|deprec|irr|npv|equity|cash|cover|"
    r"gearing|amort|reserve|sculpt|funding|senior", re.I)

data = json.load(open(sys.argv[1]))
per_file = int(sys.argv[2]) if len(sys.argv) > 2 else 10
only = sys.argv[3] if len(sys.argv) > 3 else None

for d in data:
    if "error" in d or not d.get("sample_pool"):
        continue
    if only and only not in d["filename"]:
        continue
    print("\n" + "#" * 78)
    print(f"# {d['filename']}")
    print("#" * 78)
    pool = d["sample_pool"]
    strong = [s for s in pool if WANT.search(s["label"])]
    # spread across distinct sheets, and prefer wide (time-series) rows
    strong.sort(key=lambda s: (-s["n_formulas_in_row"], s["sheet"], s["row"]))
    seen_sheet, seen_label, out = {}, set(), []
    for s in strong:
        lab = s["label"].strip().lower()
        if lab in seen_label:
            continue
        if seen_sheet.get(s["sheet"], 0) >= 3:
            continue
        seen_sheet[s["sheet"]] = seen_sheet.get(s["sheet"], 0) + 1
        seen_label.add(lab)
        out.append(s)
        if len(out) >= per_file:
            break
    for s in out:
        print(f"\n  sheet: {s['sheet']}   row: {s['row']}   formulas in row: {s['n_formulas_in_row']}")
        print(f"  label: {s['label'].strip()[:100]}")
        for ref, txt, t in s["cells"][:3]:
            shared = " [shared-formula child]" if (t == "shared" and not txt) else ""
            print(f"      {ref}: ={txt}{shared}")
