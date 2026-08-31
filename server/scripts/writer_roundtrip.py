"""The write path against the real corpus — F1/F2's owed round trip.

Three passes over `scripts/corpus_au_uk/` (rebuild it with
`scripts.corpus_au_uk`), from cheap to full:

1. **No-op identity, every file.** Open through the writer, save,
   compare every archive member byte for byte — A1's original
   standard, re-proven on today's writer.
2. **Touch identity, every file.** Rewrite the first formula cell of
   the first populated sheet *as itself* (same formula, same cached
   value), save, and require that only that sheet's member changed —
   the surgery stays surgical on real Excel-produced XML. Then create
   a text cell in the row beyond the sheet's dimension, save, same
   requirement, and openpyxl must read both edits back.
3. **The full changeset gate, smallest files.** `apply_corrections`
   (cell-exact compare + re-audit + undo) end to end on the two
   smallest corpus files — the audit runs twice per file, so the big
   models stay out of this pass and the honest record says so.

Every failure prints the file and the sentence; the exit code is the
count of failures. This is a verification harness, not a gate that
edits anything — sources are opened read-only and written to a temp
dir.
"""

import io
import sys
import tempfile
import zipfile
from pathlib import Path

from openpyxl import load_workbook

from polar.tieout.changeset import Correction, apply_corrections
from polar.tieout.writer import REF, WorkbookWriter, WriteRefused

HERE = Path(__file__).parent / "corpus_au_uk"


def _members(path: Path) -> dict[str, bytes]:
    with zipfile.ZipFile(path) as archive:
        return {i.filename: archive.read(i.filename) for i in archive.infolist()}


def _first_formula(path: Path) -> tuple[str, str, str, str] | None:
    """(sheet, ref, formula, cached value) of the first formula cell
    whose cached value survives, scanning sheets in order."""
    formulas = load_workbook(path, read_only=True)
    values = load_workbook(path, read_only=True, data_only=True)
    try:
        for name in formulas.sheetnames:
            for row in formulas[name].iter_rows(max_row=200, max_col=60):
                for cell in row:
                    held = cell.value
                    if not (isinstance(held, str) and held.startswith("=")):
                        continue
                    cached = values[name][cell.coordinate].value
                    if cached is None or isinstance(cached, bool):
                        continue
                    if not REF.fullmatch(cell.coordinate):
                        continue
                    return name, cell.coordinate, held, str(cached)
        return None
    finally:
        formulas.close()
        values.close()


def main() -> int:
    files = sorted(HERE.rglob("*.xls[xm]"))
    if not files:
        print(f"no corpus under {HERE} — run scripts.corpus_au_uk first")
        return 1
    failures = 0

    def fail(name: str, sentence: str) -> None:
        nonlocal failures
        failures += 1
        print(f"[FAIL] {name}: {sentence}")

    with tempfile.TemporaryDirectory() as folder:
        out = Path(folder) / "out.xlsx"
        for path in files:
            name = str(path.relative_to(HERE))

            # pass 1 — no-op identity
            try:
                WorkbookWriter(path).save(out)
            except Exception as problem:
                fail(name, f"no-op save died: {problem}")
                continue
            before, after = _members(path), _members(out)
            if before != after:
                changed = sorted(
                    k for k in set(before) | set(after) if before.get(k) != after.get(k)
                )
                fail(name, f"no-op changed members: {changed[:5]}")
                continue

            # pass 2 — rewrite a real formula cell as itself
            found = _first_formula(path)
            if found is None:
                print(f"[ -- ] {name}: no formula cell with a cached value")
                continue
            sheet, ref, formula, cached = found
            writer = WorkbookWriter(path)
            try:
                writer.set_cell(sheet, ref, formula=formula, value=cached)
            except WriteRefused as refusal:
                print(f"[ -- ] {name}: {sheet}!{ref} refused honestly: {refusal}")
                continue
            writer.save(out)
            after = _members(out)
            target_member = writer.sheet_paths[sheet]
            unexpected = sorted(
                k
                for k in set(before) | set(after)
                if before.get(k) != after.get(k)
                and k not in {target_member, "[Content_Types].xml"}
                and k != "xl/calcChain.xml"
            )
            if unexpected:
                fail(name, f"self-rewrite leaked into {unexpected[:5]}")
                continue
            seen = load_workbook(out)
            if str(seen[sheet][ref].value) != formula:
                fail(name, f"{sheet}!{ref} reads {seen[sheet][ref].value!r}")
                continue

            # pass 2b — create a note beyond the dimension
            edge = seen[sheet].max_row + 2
            seen.close()
            writer = WorkbookWriter(path)
            try:
                writer.set_cell(
                    sheet, f"A{edge}", formula=None, value="swens probe", create=True
                )
            except WriteRefused as refusal:
                fail(name, f"creation refused: {refusal}")
                continue
            writer.save(out)
            after = _members(out)
            unexpected = sorted(
                k
                for k in set(before) | set(after)
                if before.get(k) != after.get(k) and k != target_member
            )
            if unexpected:
                fail(name, f"creation leaked into {unexpected[:5]}")
                continue
            seen = load_workbook(out)
            if seen[sheet][f"A{edge}"].value != "swens probe":
                fail(name, f"created A{edge} reads {seen[sheet][f'A{edge}'].value!r}")
                seen.close()
                continue
            seen.close()
            print(f"[ ok ] {name}: no-op, self-rewrite, creation all clean")

        # pass 3 — the full changeset gate on the two smallest files
        for path in sorted(files, key=lambda p: p.stat().st_size)[:2]:
            name = str(path.relative_to(HERE))
            found = _first_formula(path)
            if found is None:
                print(f"[ -- ] gate {name}: no formula cell to rewrite")
                continue
            sheet, ref, formula, cached = found
            payload = path.read_bytes()
            result = apply_corrections(
                payload,
                [
                    Correction(
                        sheet=sheet,
                        ref=ref,
                        formula=formula,
                        value=cached,
                        why="round-trip probe: the cell as itself",
                    )
                ],
                who="harness",
            )
            if result.state == "refused":
                fail(name, f"gate refused the identity rewrite: {result.reason}")
                continue
            restored = result.undo()
            held = _members(path)
            got = {
                i.filename: b
                for i, b in (
                    (i, zipfile.ZipFile(io.BytesIO(restored)).read(i.filename))
                    for i in zipfile.ZipFile(io.BytesIO(restored)).infolist()
                )
            }
            if held != got:
                changed = sorted(
                    k for k in set(held) | set(got) if held.get(k) != got.get(k)
                )
                fail(name, f"undo not member-identical: {changed[:5]}")
                continue
            print(
                f"[ ok ] gate {name}: apply → undo member-identical, state {result.state}"
            )

    print(f"\n{len(files)} files; {failures} failures")
    return failures


if __name__ == "__main__":
    sys.exit(main())
