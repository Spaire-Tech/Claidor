"""What a reviewer actually receives, per real model.

Every lane tests its own module. Nobody runs the whole engine over the
whole corpus and asks the reader's question: **is this a page a person
can act on, or a wall?** A rule that fires twice is a finding; the same
rule firing two hundred times is noise that buries the other nine.
"""
import collections, sys
from pathlib import Path
sys.path.insert(0, "/home/user/Claidor/server")
from polar.tieout.analytics import run_analytics
from polar.tieout.audit import audit
from polar.tieout.structure import read_structure
from polar.tieout.workbook import read_workbook

rows = []
worst: collections.Counter = collections.Counter()
for path in sorted(Path("scripts/corpus_sft").glob("*.xls*")):
    if path.suffix.lower() == ".xlsb":
        continue
    try:
        book = read_workbook(str(path))
        structure = read_structure(book)
        result = audit(book, axes=structure.axes)
        found = list(result.findings)
        try:
            found += list(run_analytics(book, structure).findings)
        except Exception:
            pass
    except Exception as exc:
        print(f"{path.name}: refused — {type(exc).__name__}")
        continue
    per_rule = collections.Counter(f.rule for f in found)
    material = sum(1 for f in found if f.severity == "error")
    rows.append((path.name, len(found), material, per_rule))
    for rule, n in per_rule.items():
        worst[rule] = max(worst[rule], n)

print(f"{'model':34} {'findings':>8} {'material':>9}  worst rule")
for name, total, material, per_rule in rows:
    top = per_rule.most_common(1)
    tag = f"{top[0][0]} ×{top[0][1]}" if top else "-"
    print(f"{name:34} {total:>8} {material:>9}  {tag}")

print("\nmost a single rule fires on one model:")
for rule, n in worst.most_common(12):
    print(f"  {rule:24} ×{n}")
