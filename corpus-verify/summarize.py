import json, sys

data = json.load(open(sys.argv[1]))
for d in data:
    if "error" in d:
        print(f"\n===== {d['filename']}  ERROR {d['error']}")
        continue
    t = d["totals"]
    print("\n" + "=" * 78)
    print(f"FILE      {d['filename']}   [{d['file_type']}]")
    print(f"bytes     {d['bytes']:,}")
    print(f"sha256    {d['sha256']}")
    print(f"sheets    {d['n_worksheets']}  (hidden={len(d['hidden_sheets'])}, veryHidden={len(d['very_hidden_sheets'])})")
    print(f"used-range cells {t['used_range_cells']:,} | populated {t['populated']:,} | "
          f"formulas {t['formula']:,} | hardcoded {t['hardcoded']:,} "
          f"(text {t['text_cells']:,} / numeric {t['numeric_hardcoded']:,}) | blank-in-range {t['blank_in_used_range']:,}")
    print(f"formula % of populated  {d['pct_formula_of_populated']}%   "
          f"| % of non-label cells {d['pct_formula_of_non_label_cells']}%")
    print(f"CALC sheets ({len(d['calc_sheets_checked'])}) formula% = {d['calc_sheets_pct_formula']}  "
          f"(formulas there: {d['calc_sheets_formula_count']:,})")
    print(f"cross-sheet formulas {t['formula_cross_sheet']:,} | external-workbook formulas {t['formula_external']:,}")
    print(f"named ranges {d['n_defined_names']} | externalLinks parts {len(d['external_links'])} | VBA {d['has_vba']}")
    print(f"calcPr {d['calcPr']}  -> iterative={d['iterative_calculation']}")
    print(f"top functions: {', '.join(f'{k}({v})' for k, v in d['top_formula_functions'][:12])}")
    if d["hidden_sheets"]:
        print(f"hidden: {d['hidden_sheets']}")
    if d["very_hidden_sheets"]:
        print(f"VERY hidden: {d['very_hidden_sheets']}")
    print("\n-- PF feature evidence --")
    for k, v in d["pf_evidence"].items():
        mark = "YES" if v["present"] else "no "
        ev = v["evidence"][0] if v["evidence"] else None
        s = f"   {mark}  {k:<34}"
        if ev:
            s += f" e.g. '{ev['label'][:60]}' ({ev['sheet']}!r{ev['row']})"
        print(s)
    print("\n-- per-sheet (top 15 by populated) --")
    for s in sorted(d["per_sheet"], key=lambda x: -x["populated"])[:15]:
        print(f"   {s['sheet'][:34]:<34} state={s['state'][:10]:<10} pop={s['populated']:>7,} "
              f"f={s['formula']:>7,} hard={s['hardcoded']:>7,} f%={s['pct_formula_of_populated']:>6}")
