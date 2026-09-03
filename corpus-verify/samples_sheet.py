"""Print label+formula rows from named sheets (the financing/debt logic)."""
import json, re, sys

data = json.load(open(sys.argv[1]))
fname_filter = sys.argv[2]
sheet_pat = re.compile(sys.argv[3], re.I)
label_pat = re.compile(sys.argv[4], re.I) if len(sys.argv) > 4 else None
limit = int(sys.argv[5]) if len(sys.argv) > 5 else 12

for d in data:
    if "error" in d or fname_filter not in d["filename"]:
        continue
    pool = [s for s in d["sample_pool"] if sheet_pat.search(s["sheet"])]
    if label_pat:
        pool = [s for s in pool if label_pat.search(s["label"])]
    pool.sort(key=lambda s: (s["sheet"], s["row"]))
    seen = set()
    n = 0
    for s in pool:
        lab = s["label"].strip().lower()
        if lab in seen:
            continue
        seen.add(lab)
        n += 1
        if n > limit:
            break
        print(f"\n  sheet: {s['sheet']}   row: {s['row']}   formulas in row: {s['n_formulas_in_row']}")
        print(f"  label: {s['label'].strip()[:110]}")
        for ref, txt, t in s["cells"][:3]:
            shared = " [shared-formula child of the group master]" if (t == "shared" and not txt) else ""
            print(f"      {ref}: ={txt}{shared}")
