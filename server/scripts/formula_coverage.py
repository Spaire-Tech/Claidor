"""How much of a real model's formula graph does this product actually see?

The tie-out's whole claim is *here is where this number came from*. That
claim rests on :func:`polar.tieout.workbook.precedents_of`, and until this
script existed nothing measured it against a workbook nobody here wrote.

    uv run python -m scripts.model_corpus        # get the files first
    uv run python -m scripts.formula_coverage    # then measure

**The number that matters is « partial », not « failed ».** A formula
whose precedents cannot be read at all produces no chain, and a missing
chain is visibly missing. A formula that loses *one* of its precedents
produces a chain that is short by exactly the input that mattered and
looks complete — and the screen will present it as the answer. On the
2015 Ofgem transmission model, 11.7% of formulas were in that state, and
one defined name that the parser dropped was the master switch deciding
which company the entire model was calculating for, referenced by 3,542
formulas.

Total failures across two real models: 44. Partial failures: 2,411.

So the output below leads with partial, and the causes are broken out
because they are not the same fix and their weights are nothing alike —
named ranges were 100% of the loss on one model and 7% on the other.
"""

import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from openpyxl import load_workbook
from openpyxl.formula import Tokenizer

from polar.tieout.workbook import REFERENCE, references_of

HERE = Path(__file__).parent / "corpus_models"

#: Why an operand the tokeniser called a RANGE did not match `REFERENCE`.
#: Order matters: an external link can also look like a table reference,
#: and a sheet name is allowed to contain brackets — which is a mistake
#: this script made in its first draft, and which counted 288 resolvable
#: references as undefined.
WHOLE_COLUMN = re.compile(r"^\$?[A-Z]{1,3}:\$?[A-Z]{1,3}$")
WHOLE_ROW = re.compile(r"^\$?\d+:\$?\d+$")
NAME = re.compile(r"^[A-Za-z_\\][A-Za-z0-9_.\\]*$")


def split_sheet(token: str) -> tuple[str, str]:
    """« 'Live Results (SO)'!C15 » → the sheet and the rest.

    Splitting on the *last* `!` outside quotes, because a quoted sheet
    name may contain anything at all — brackets, spaces, exclamation
    marks — and splitting naively is how a real reference gets called
    undefined.
    """
    if token.startswith("'"):
        end = token.find("'", 1)
        while end != -1 and token[end : end + 2] == "''":
            end = token.find("'", end + 2)
        if end != -1 and token[end + 1 : end + 2] == "!":
            return token[1:end], token[end + 2 :]
    if "!" in token:
        sheet, _, rest = token.rpartition("!")
        return sheet, rest
    return "", token


def cause(token: str) -> str:
    sheet, rest = split_sheet(token.strip())
    if sheet.startswith("[") or rest.startswith("["):
        return "external workbook link"
    if WHOLE_COLUMN.match(rest):
        return "whole-column reference"
    if WHOLE_ROW.match(rest):
        return "whole-row reference"
    if "[" in rest:
        return "structured table reference"
    if NAME.match(rest):
        return "named range"
    return "other"


def names_of(book: Any) -> tuple[dict[str, str], dict[tuple[str, str], str]]:
    """Every defined name, split by scope.

    Sheet scope wins over workbook scope in Excel, so the two cannot be
    merged into one map — which is what makes resolving names on the 2026
    distribution model a correctness problem rather than a coverage one.
    """
    book_scope = {name: str(one.value) for name, one in book.defined_names.items()}
    sheet_scope: dict[tuple[str, str], str] = {}
    for sheet in book.worksheets:
        for name, one in (getattr(sheet, "defined_names", {}) or {}).items():
            sheet_scope[(sheet.title, name)] = str(one.value)
    return book_scope, sheet_scope


def names_for(book: Any) -> Any:
    """The engine's own name/extent map, built the way the reader builds it."""
    from polar.tieout.workbook import _names_of

    return _names_of(book)


def measure(path: Path) -> dict[str, Any]:
    book = load_workbook(path, data_only=False, read_only=False)
    sheets = set(book.sheetnames)
    book_names, sheet_names = names_of(book)

    formulas = clean = partial = lost = dangling = 0
    after_clean = after_partial = after_lost = 0
    after_causes: Counter[str] = Counter()
    resolver = names_for(book)
    causes: Counter[str] = Counter()
    dropped: Counter[str] = Counter()
    examples: dict[str, str] = {}

    for sheet in book.worksheets:
        for row in sheet.iter_rows():
            for cell in row:
                value = cell.value
                if not isinstance(value, str) or not value.startswith("="):
                    continue
                formulas += 1
                read = references_of(value, sheet.title, resolver)
                if read.unresolved and read.refs:
                    after_partial += 1
                elif read.unresolved:
                    after_lost += 1
                else:
                    after_clean += 1
                for text, why in read.unresolved:
                    after_causes[why] += 1

                hit = miss = 0
                loose = False
                for token in Tokenizer(value).items:
                    if token.type != "OPERAND" or token.subtype != "RANGE":
                        continue
                    text = token.value.strip()
                    match = REFERENCE.fullmatch(text)
                    if match is None:
                        miss += 1
                        why = cause(text)
                        causes[why] += 1
                        dropped[text] += 1
                        examples.setdefault(
                            why, f"{sheet.title}!{cell.coordinate}  {value[:66]}"
                        )
                        continue
                    hit += 1
                    where = (match.group("sheet") or sheet.title).strip("'")
                    if where not in sheets:
                        loose = True
                if miss and hit:
                    partial += 1
                elif miss:
                    lost += 1
                else:
                    clean += 1
                dangling += loose

    #: Of everything dropped, how much a name resolver would actually get
    #: back. Without this the fix is sized by guess.
    recoverable = sum(
        count
        for token, count in dropped.items()
        if token in book_names or any(name == token for _, name in sheet_names)
    )
    broken = sum(
        count
        for token, count in dropped.items()
        if book_names.get(token, "").startswith("#")
    )

    return {
        "file": path.name,
        "sheets": len(sheets),
        "book_names": len(book_names),
        "sheet_names": len(sheet_names),
        "formulas": formulas,
        "clean": clean,
        "partial": partial,
        "lost": lost,
        "dangling": dangling,
        "causes": causes,
        "examples": examples,
        "dropped": sum(dropped.values()),
        "recoverable": recoverable,
        "broken": broken,
        "worst": dropped.most_common(5),
        "after_clean": after_clean,
        "after_partial": after_partial,
        "after_lost": after_lost,
        "after_causes": after_causes,
    }


def report(one: dict[str, Any]) -> None:
    total = one["formulas"]
    print(f"\n{one['file']}")
    print(
        f"  {one['sheets']} sheets · {one['book_names']} workbook names · "
        f"{one['sheet_names']} sheet-scoped names · {total:,} formulas"
    )
    if not total:
        return
    print(f"    fully resolved        {one['clean']:>8,}  {one['clean'] / total:6.1%}")
    print(
        f"    PARTIAL, silent loss  {one['partial']:>8,}  {one['partial'] / total:6.1%}"
        "   <- chain short by the input that mattered"
    )
    print(f"    nothing resolved      {one['lost']:>8,}  {one['lost'] / total:6.1%}")
    print(
        f"    dangling reference    {one['dangling']:>8,}  {one['dangling'] / total:6.1%}"
    )

    if one["dropped"]:
        print(f"\n    {one['dropped']:,} operands dropped")
        for why, count in one["causes"].most_common():
            print(f"      {count:>7,}  {why}")
            print(f"               {one['examples'][why]}")
        share = one["recoverable"] / one["dropped"]
        print(
            f"\n    {one['recoverable']:,} of them name something defined "
            f"in this workbook ({share:.1%})"
        )
        if one["broken"]:
            print(
                f"    {one['broken']:,} name a defined name that is #REF! — "
                "a finding, not a parse failure"
            )
        print("    most-dropped operands:")
        for token, count in one["worst"]:
            print(f"      {count:>7,}  {token}")


def main() -> int:
    given = [Path(one) for one in sys.argv[1:] if not one.startswith("-")]
    files = given or sorted(
        one for one in HERE.glob("*.xls*") if not one.name.startswith("~")
    )
    if not files:
        print(
            f"No workbooks in {HERE}.\nRun:  uv run python -m scripts.model_corpus",
            file=sys.stderr,
        )
        return 1

    every = [measure(one) for one in files]
    for one in every:
        report(one)

    formulas = sum(one["formulas"] for one in every)
    partial = sum(one["partial"] for one in every)
    lost = sum(one["lost"] for one in every)
    print(f"\n{'-' * 60}")
    print("with names, scopes and whole-column extents resolved")
    for one in every:
        total = one["formulas"]
        print(f"\n  {one['file']}")
        print(
            f"    fully resolved        {one['after_clean']:>8,}  "
            f"{one['after_clean'] / total:6.1%}"
        )
        print(
            f"    PARTIAL, now NAMED    {one['after_partial']:>8,}  "
            f"{one['after_partial'] / total:6.1%}   <- and every one carries a reason"
        )
        print(
            f"    nothing resolved      {one['after_lost']:>8,}  "
            f"{one['after_lost'] / total:6.1%}"
        )
        for why, count in one["after_causes"].most_common(6):
            print(f"        {count:>7,}  {why}")

    print(f"\n{'=' * 60}")
    print(f"{len(every)} workbooks · {formulas:,} formulas")
    after_p = sum(one["after_partial"] for one in every)
    print(f"  BEFORE  partial, silent  {partial:,}  ({partial / formulas:.1%})")
    print(f"  AFTER   partial, named   {after_p:,}  ({after_p / formulas:.1%})")
    print(f"  total failure            {lost:,}  ({lost / formulas:.1%})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
