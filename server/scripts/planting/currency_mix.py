"""Plant a currency mismatch — E3a's recall.

Protocol: `docs/pierce/e3a-unit-mismatch.md`. The defect is the one
the rule claims to catch: a row denominated in one currency summed
into a total denominated in another.

**The plant changes a number format and nothing else.** Every value,
formula and cached result is left as the model wrote it, so the only
difference between host and planted file is the currency declared
for one row. An openpyxl round-trip would not do: saving through it
drops the cached value of every formula in the workbook, and the
audit would then be reading a different file for reasons unrelated
to the plant. So the surgery is on the XML — one `numFmt` added to
`styles.xml`, one `cellXf` pointing at it, and the planted row's
`s=` attributes repointed at that.

    uv run python -m scripts.planting.currency_mix --scan CORPUS_DIR
    uv run python -m scripts.planting.currency_mix HOST.xlsm OUT.xlsm TRUTH.json 20260828
"""

import json
import random
import re
import shutil
import sys
import warnings
import zipfile
from pathlib import Path
from typing import Any

warnings.filterwarnings("ignore")

from scripts.planting.sibling_totals import sheet_files

#: Quoted deliberately. A bracketed `[$…]` form would be read as USD
#: whatever currency it named — the misread routed to the lead — and
#: planting with it would measure that defect rather than the rule.
FOREIGN = "&quot;$&quot;#,##0.00"

SITES_PER_HOST = 6


def sites(path: Path) -> list[dict[str, Any]]:
    """Additive sums whose precedent rows read as one real currency.

    Both halves matter: a row nothing adds up produces no finding
    however it is formatted, and would measure nothing.
    """
    from polar.tieout.units import Orientation, classify_sheet, orientation
    from polar.tieout.units.inference import rows_from_cells
    from polar.tieout.workbook import read_workbook

    book = read_workbook(str(path))
    found: list[dict[str, Any]] = []
    for sheet in book.sheets:
        rows = rows_from_cells(book.cells, sheet)
        if not rows or orientation(rows) is not Orientation.ROW_WISE:
            continue
        #: `none` is not a currency — the category error that refused
        #: this round's first measurement. Only real currencies count.
        money = {
            row: label.currency
            for (_s, row), label in classify_sheet(rows).items()
            if label.currency not in ("unknown", "none")
        }
        if len(money) < 2:
            continue
        for cell in book.cells.values():
            if cell.sheet != sheet or cell.formula is None:
                continue
            terms = [
                book.cells[ref]
                for ref in (cell.precedents or ())
                if ref in book.cells and book.cells[ref].sheet == sheet
            ]
            hit = {t.row for t in terms if t.row in money}
            if len(hit) < 2:
                continue
            found.append({
                "sheet": sheet,
                "sum_ref": cell.ref,
                "formula": (cell.formula or "")[:80],
                "flip_row": sorted(hit)[0],
                "currency_rows": sorted(hit)[:6],
            })
    return found


def _repoint(styles: str, xml: str, row: int) -> tuple[str, str] | None:
    """Add a dollar format and point one row's cells at it."""
    fmt_id = 900
    if "<numFmts" in styles:
        styles = re.sub(
            r'<numFmts count="(\d+)">',
            lambda m: f'<numFmts count="{int(m.group(1)) + 1}">'
                      f'<numFmt numFmtId="{fmt_id}" formatCode="{FOREIGN}"/>',
            styles,
            count=1,
        )
    else:
        styles = styles.replace(
            "<cellXfs",
            f'<numFmts count="1"><numFmt numFmtId="{fmt_id}" '
            f'formatCode="{FOREIGN}"/></numFmts><cellXfs',
            1,
        )
    match = re.search(r'<cellXfs count="(\d+)">', styles)
    if match is None or "</cellXfs>" not in styles:
        return None
    index = int(match.group(1))
    #: **Appended, not prepended.** The new `xf` must be the *last*
    #: child so its index is the old count. Inserting it first — as
    #: this did originally — renumbers every existing style in the
    #: workbook and points the planted row at somebody else's format:
    #: the planted row came back « General » and the plant measured
    #: nothing, while every other cell's formatting silently moved.
    styles = styles.replace(match.group(0), f'<cellXfs count="{index + 1}">', 1)
    styles = styles.replace(
        "</cellXfs>",
        f'<xf numFmtId="{fmt_id}" fontId="0" fillId="0" borderId="0" '
        f'applyNumberFormat="1"/></cellXfs>',
        1,
    )
    found = re.search(rf'<row r="{row}"[^>]*>(.*?)</row>', xml, re.DOTALL)
    if found is None:
        return None
    body = found.group(1)
    fixed = re.sub(r'(<c r="[A-Z]+\d+")(\s+s="\d+")?', rf'\1 s="{index}"', body)
    return styles, xml[: found.start(1)] + fixed + xml[found.end(1) :]


def plant(host: Path, out: Path, truth_path: Path, seed: int) -> None:
    available = sites(host)
    if not available:
        raise SystemExit(f"{host.name}: no plantable currency sites")
    pool = sorted(available, key=lambda s: (s["sheet"], s["sum_ref"]))
    random.Random(seed).shuffle(pool)
    chosen: list[dict[str, Any]] = []
    used: set[tuple[str, int]] = set()
    for site in pool:
        if (site["sheet"], site["flip_row"]) in used:
            continue
        chosen.append(site)
        used.add((site["sheet"], site["flip_row"]))
        if len(chosen) >= SITES_PER_HOST:
            break

    with zipfile.ZipFile(host) as archive:
        names = sheet_files(archive)
        parts = {
            names[s["sheet"]]: archive.read(names[s["sheet"]]).decode("utf-8")
            for s in chosen
            if s["sheet"] in names
        }
        styles = archive.read("xl/styles.xml").decode("utf-8")
        order = archive.infolist()

    planted: list[dict[str, Any]] = []
    for site in chosen:
        part = names.get(site["sheet"])
        if part is None:
            continue
        done = _repoint(styles, parts[part], site["flip_row"])
        if done is None:
            continue
        styles, parts[part] = done
        planted.append(site)

    with zipfile.ZipFile(host) as source, zipfile.ZipFile(
        out, "w", zipfile.ZIP_DEFLATED
    ) as target:
        for item in order:
            if item.filename in parts:
                data = parts[item.filename].encode("utf-8")
            elif item.filename == "xl/styles.xml":
                data = styles.encode("utf-8")
            else:
                data = source.read(item.filename)
            target.writestr(item, data)

    truth_path.write_text(json.dumps({
        "host": host.name, "seed": seed,
        "planted": planted, "sites_available": len(available),
    }, indent=1))
    print(f"{host.name}: planted {len(planted)} of {len(chosen)} chosen "
          f"({len(available)} sites) -> {out.name}")


def main() -> None:
    if sys.argv[1] == "--scan":
        for path in sorted(Path(sys.argv[2]).rglob("*.xls[xm]")):
            if path.name.startswith("._"):
                continue
            try:
                found = sites(path)
            except Exception as problem:
                print(f"{path.name[:44]:<44} {type(problem).__name__}", flush=True)
                continue
            print(f"{path.name[:44]:<44} {len(found):>5} sites", flush=True)
        return
    host, out, truth, seed = sys.argv[1:5]
    plant(Path(host), Path(out), Path(truth), int(seed))


if __name__ == "__main__":
    main()
