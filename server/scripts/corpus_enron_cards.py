"""Judging cards for the Enron usefulness sample.

For each sampled finding, re-fetch its file from the partial clone
and harvest the cell neighbourhood the verdict is judged from: the
cell itself (formula and stored value), its row label and column
header, the same row a few columns either side, the same column a few
rows either side, and the cells the finding names. The verdict is made
from these cards, never from the finding's own sentence — the rule
that has held since the first usefulness audit.

    cd server && uv run python -m scripts.corpus_enron_cards REPO_DIR SAMPLE.json CARDS.md
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from openpyxl.utils import column_index_from_string, get_column_letter

WINDOW = 4


def _split(ref: str) -> tuple[str, str, int]:
    sheet, _, cell = ref.rpartition("!")
    letters = "".join(ch for ch in cell if ch.isalpha())
    digits = "".join(ch for ch in cell if ch.isdigit())
    return sheet, letters, int(digits or 0)


def _show(book: Any, sheet: str, column: int, row: int) -> str:
    if column < 1 or row < 1:
        return ""
    cell = book.cells.get(f"{sheet}!{get_column_letter(column)}{row}")
    if cell is None:
        return ""
    if cell.formula is not None:
        shown = cell.formula
        if cell.value is not None:
            shown += f"  → {cell.value}"
        return shown
    return "" if cell.value is None else str(cell.value)


def _card(book: Any, item: dict[str, Any]) -> str:
    lines = [
        f"### {item['stratum']} · {item['rule']} · tier {item['tier']} · {item['file']}",
        f"ref: {item['ref'] or '(none)'}   name: {item['name']!r}   figure: {item['figure']} {item['figure_unit']}",
        f"detail: {item['detail']}",
        f"formula: {item['formula']}",
    ]
    if item.get("cells"):
        lines.append(f"cells: {item['cells'][:300]}")
    if not item["ref"]:
        return "\n".join(lines) + "\n"
    sheet, letters, row = _split(item["ref"])
    try:
        column = column_index_from_string(letters)
    except ValueError:
        return "\n".join(lines) + "\n"
    label = book.row_words.get(sheet, {}).get(row, "")
    lines.append(f"row label: {label!r}")
    lines.append("row, same window:")
    for c in range(column - WINDOW, column + WINDOW + 1):
        shown = _show(book, sheet, c, row)
        mark = "»" if c == column else " "
        if shown:
            lines.append(f"  {mark} {get_column_letter(c)}{row}: {shown[:140]}")
    lines.append("column, same window:")
    for r in range(row - WINDOW, row + WINDOW + 1):
        shown = _show(book, sheet, column, r)
        mark = "»" if r == row else " "
        rl = book.row_words.get(sheet, {}).get(r, "")
        if shown or rl:
            lines.append(f"  {mark} {letters}{r} [{rl[:40]}]: {shown[:140]}")
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    from polar.tieout.workbook import read_workbook

    repo, sample_path, out = Path(argv[1]), Path(argv[2]), Path(argv[3])
    sample = json.loads(sample_path.read_text())
    files = sorted({item["file"] for item in sample})
    subprocess.run(
        ["git", "checkout", "-q", "HEAD", "--", *files],
        cwd=repo,
        check=False,
        capture_output=True,
    )
    cards: list[str] = []
    books: dict[str, Any] = {}
    for number, item in enumerate(sample, 1):
        path = repo / item["file"]
        if item["file"] not in books:
            try:
                books[item["file"]] = read_workbook(str(path))
            except Exception as problem:
                books[item["file"]] = None
                cards.append(
                    f"### {number}. could not re-read {item['file']}: {problem}\n"
                )
                continue
        book = books[item["file"]]
        if book is None:
            cards.append(f"### {number}. could not re-read {item['file']}\n")
            continue
        cards.append(f"## {number}\n" + _card(book, item))
    out.write_text("\n".join(cards))
    for name in files:
        try:
            (repo / name).unlink()
        except OSError:
            pass
    print(f"{len(cards)} cards → {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
