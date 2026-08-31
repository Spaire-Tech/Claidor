"""Reading a `.xlsb`, which is a format nothing in this stack opens.

Excel's binary workbook is what large models become when a bank gets
tired of waiting for a save. It is not a dialect of the XML format —
it is a different container with a different record encoding — and
`openpyxl` says so plainly and refuses. Until now the product's answer
to one was « we cannot read this file », which is the worst thing a
model auditor can say to somebody holding a model.

**The route: convert, then read the conversion.** LibreOffice reads
`.xlsb` and writes `.xlsx`, so a converted copy goes through the same
reader as everything else and no rule downstream learns a new format.
Six real closed-deal models convert in about eleven seconds each.

**LibreOffice cannot write `.xlsb`**, so this is one-way. That is
fine: nothing here needs to hand the file back.

**The trap this module exists to close.** A converted workbook is not
the workbook. Measured on the real files, LibreOffice writes every
*boolean* cell out as a formula — `=TRUE()` or `=FALSE()` — which is
harmless in a spreadsheet and poison here, because the audit's whole
subject is formulas. One closed-deal model with **no formulas at all**
converts into a file carrying 10,417 of them, and every check that
counts formulas, or looks for a hardcode among them, would have been
reading LibreOffice's punctuation as the author's arithmetic. So the
conversion artifacts are stripped on the way in and the boolean is put
back as a value, which is what it was.

Fidelity, measured before this was wired (`docs/pierce/worklog.md`,
28 Aug): the value layer of two real `.xls` models compared cell by
cell against `xlrd` reading the originals — **243,812 numeric cells,
100.0000% agreement, zero disagreements, zero missing sheets**. Two
implementations that know nothing about each other.
"""

import shutil
import subprocess
import tempfile
from pathlib import Path

#: Where `dev/setup-libreoffice` puts it, then anything on PATH. A
#: deployment without LibreOffice is a deployment that cannot read
#: `.xlsb`, and it says so rather than guessing.
CANDIDATES = ("/opt/libreoffice25.8/program/soffice", "soffice", "libreoffice")

#: Converting a large binary workbook is tens of seconds, not minutes.
#: Past this something is wrong and waiting longer will not fix it.
TIMEOUT = 600

#: What LibreOffice writes a boolean cell as. Both are formulas that no
#: model author typed, and both would otherwise be audited as if they
#: were. Mapped back to the values they stand for.
ARTIFACTS = {"=TRUE()": True, "=FALSE()": False}


class BinaryUnreadable(Exception):
    """The `.xlsb` could not be converted, with the reason in words."""


def converter() -> str | None:
    """The LibreOffice binary, or `None` where there is not one."""
    for candidate in CANDIDATES:
        found = candidate if Path(candidate).is_file() else shutil.which(candidate)
        if found and Path(found).is_file():
            return found
    return None


def to_xlsx(path: str, folder: str) -> str:
    """Convert one `.xlsb` into `folder`, and return the new path.

    The caller owns `folder` and its lifetime; nothing is written beside
    the original, because the original may be read-only and is never
    ours to litter.
    """
    binary = converter()
    if binary is None:
        raise BinaryUnreadable(
            "this is an Excel binary workbook (.xlsb), which needs "
            "LibreOffice installed to read. Saving it as .xlsx in Excel "
            "works too, and takes a moment"
        )

    try:
        completed = subprocess.run(
            [
                binary,
                "--headless",
                "--convert-to",
                "xlsx",
                "--outdir",
                folder,
                path,
            ],
            capture_output=True,
            timeout=TIMEOUT,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise BinaryUnreadable(
            f"this workbook did not convert within {TIMEOUT // 60} minutes"
        ) from error

    converted = Path(folder) / (Path(path).stem + ".xlsx")
    if not converted.is_file():
        detail = (completed.stderr or b"").decode("utf-8", "replace").strip()
        raise BinaryUnreadable(
            "this workbook could not be converted from the binary format"
            + (f" ({detail.splitlines()[-1][:120]})" if detail else "")
        )
    return str(converted)


def is_artifact(formula: object) -> bool:
    """Whether a formula was written by the converter, not by an author.

    Deliberately exact rather than a pattern: a model that really does
    contain `=TRUE()` typed by a person is vanishingly rare, and a rule
    loose enough to catch `=TRUE()+1` would start deleting real work.
    """
    return isinstance(formula, str) and formula in ARTIFACTS


def unartifact(value: object) -> object:
    """One cell value with the converter's punctuation undone.

    Applied where the grid is built rather than by walking the loaded
    book: a read-only load hands out cells that cannot be assigned to,
    and the grid is the one place every value passes through anyway.
    """
    if isinstance(value, str) and value in ARTIFACTS:
        return ARTIFACTS[value]
    return value


def converted_copy(path: str) -> tuple[str, tempfile.TemporaryDirectory[str]]:
    """A readable `.xlsx` for a `.xlsb`, and the folder holding it.

    The folder is returned rather than cleaned up here: the reader is
    still going to open the file, and a temporary directory that
    removes itself at the end of this function takes the conversion
    with it.
    """
    folder = tempfile.TemporaryDirectory(prefix="tieout-xlsb-")
    try:
        return to_xlsx(path, folder.name), folder
    except Exception:
        folder.cleanup()
        raise


__all__ = [
    "BinaryUnreadable",
    "converted_copy",
    "converter",
    "is_artifact",
    "to_xlsx",
    "unartifact",
]
