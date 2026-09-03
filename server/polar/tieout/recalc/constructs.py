"""The construct scan — what newer Excel put in the file, read from its bytes.

Registered in `docs/pierce/modern-excel.md` before this file existed.
Three of the four constructs the round is about live outside the
formula text the denylist prescan reads, so they are read from the
workbook's own parts, never evaluated:

- **tables** — parts under `xl/tables/`, one per structured table; a
  formula reads one as `T[Amt]`. Formualizer refuses a whole workbook
  that carries one (measured 2 September 2026: every cell came back
  « Undefined table »), IronCalc and LibreOffice compute it.
- **spill metadata** — `xl/metadata.xml` carrying the dynamic-array
  block (`XLDAPR`), and cells with the `cm` attribute that point into
  it. A formula reads a spill as `E1#`, stored `_xlfn.ANCHORARRAY(E1)`.
  No engine of ours computes that reference today (IronCalc `#VALUE!`,
  Formualizer `#NAME?`, LibreOffice 25.8 error 525); real Excel does.
- **named LAMBDAs** — a `definedName` whose text starts with
  `_xlfn.LAMBDA(`, called by its bare name in cells, so the formula
  text alone reads like a user-defined function. Real Excel computes
  it; LibreOffice has no LAMBDA.
- **the modern functions** — every `_xlfn.` and `_xlfn._xlws.` name in
  formula text, counted by name, so the mark can say which the file
  uses. Both native engines compute LET, SEQUENCE, FILTER, TEXTJOIN
  and IFS (measured the same day); the count is information, not a
  route.

The scan is a zip read with regular expressions over the parts, not a
workbook load: it must be cheap enough to run before any engine is
chosen, on every upload, and must never fail a file the reader can
open — a scan error is reported as a construct of kind « unreadable »
so the caller can say so.
"""

from __future__ import annotations

import re
import zipfile
from collections import Counter
from dataclasses import dataclass, field

_TABLE_NAME = re.compile(rb'displayName="([^"]*)"')
_TABLE_REF = re.compile(rb'\bref="([^"]*)"')
_DEFINED_NAME = re.compile(rb"<definedName\b([^>]*)>([^<]*)<")
_NAME_ATTR = re.compile(rb'\bname="([^"]*)"')
_CM_CELL = re.compile(rb'<c\b[^>]*\bcm="')
#: An array formula whose range covers more than one cell — the anchor
#: and the range it fills. A single-cell `ref` is not a spill.
_MULTI_CELL_ARRAY = re.compile(
    rb'<c\b[^>]*\br="([A-Z]+\d+)"[^>]*>\s*<f\b[^>]*\bt="array"[^>]*\bref="([A-Z]+\d+:[A-Z]+\d+)"'
)
_MODERN_FUNCTION = re.compile(rb"_xlfn\.(?:_xlws\.)?([A-Za-z0-9_.]+)\(")
_SHEET_PART = re.compile(r"xl/worksheets/sheet\d+\.xml$")


@dataclass(frozen=True)
class Construct:
    """One kind of modern construct the file carries, counted."""

    #: `table`, `spill`, `named-lambda`, `function`, or `unreadable`.
    kind: str
    count: int
    #: A few names: table names, defined names, function names, or
    #: the error for `unreadable`.
    examples: tuple[str, ...] = ()


@dataclass
class ConstructScan:
    """Everything the scan saw, with the questions the router asks."""

    constructs: list[Construct] = field(default_factory=list)
    #: The defined names whose definition is a LAMBDA, upper-cased —
    #: the prescan needs them to classify a bare call as a LAMBDA.
    named_lambdas: frozenset[str] = frozenset()

    def count(self, kind: str) -> int:
        return sum(one.count for one in self.constructs if one.kind == kind)

    @property
    def has_tables(self) -> bool:
        return self.count("table") > 0

    @property
    def has_spill(self) -> bool:
        return self.count("spill") > 0

    def words(self) -> str:
        """The constructs in one plain sentence fragment, or empty."""
        parts: list[str] = []
        for one in self.constructs:
            if one.kind == "table":
                parts.append(f"{one.count} table{'' if one.count == 1 else 's'}")
            elif one.kind == "spill":
                parts.append(
                    f"{one.count} cell that spills"
                    if one.count == 1
                    else f"{one.count} cells that spill"
                )
            elif one.kind == "named-lambda":
                parts.append(
                    f"{one.count} named LAMBDA{'' if one.count == 1 else 's'}"
                    + (f" ({', '.join(one.examples)})" if one.examples else "")
                )
        return ", ".join(parts)


def scan_constructs(path: str) -> ConstructScan:
    """Read the file's parts and count the constructs. Never evaluates."""
    scan = ConstructScan()
    try:
        archive = zipfile.ZipFile(path)
    except Exception as problem:
        scan.constructs.append(
            Construct(kind="unreadable", count=1, examples=(str(problem)[:120],))
        )
        return scan
    with archive:
        names = archive.namelist()

        tables = sorted(n for n in names if n.startswith("xl/tables/"))
        if tables:
            examples: list[str] = []
            for part in tables[:4]:
                data = archive.read(part)
                name = _TABLE_NAME.search(data)
                ref = _TABLE_REF.search(data)
                examples.append(
                    (name.group(1).decode(errors="replace") if name else part)
                    + (f" ({ref.group(1).decode(errors='replace')})" if ref else "")
                )
            scan.constructs.append(
                Construct(kind="table", count=len(tables), examples=tuple(examples))
            )

        #: Measured on the corpus, 2 September 2026: a workbook saved by
        #: current Excel marks *every* formula that could return an
        #: array as a single-cell dynamic array — `<f t="array"
        #: ref="E56">` with `cm="1"` — 125,060 of them in one RIIO-3
        #: model, `INDEX(range, m_identity)` and the like, none of which
        #: spills past its own cell. Those evaluate as plain formulas in
        #: every engine. A **spill** is the case that matters: an array
        #: formula whose `ref` covers more than one cell, so the cells
        #: below or beside it hold values the engine must fill.
        dynamic_cells = 0
        spills: list[str] = []
        functions: Counter[str] = Counter()
        for part in names:
            if not _SHEET_PART.search(part):
                continue
            data = archive.read(part)
            dynamic_cells += len(_CM_CELL.findall(data))
            for anchor, ref in _MULTI_CELL_ARRAY.findall(data):
                spills.append(f"{anchor.decode()} → {ref.decode()}")
            for found in _MODERN_FUNCTION.findall(data):
                functions[found.decode(errors="replace").upper()] += 1
        if spills:
            scan.constructs.append(
                Construct(kind="spill", count=len(spills), examples=tuple(spills[:4]))
            )
        if dynamic_cells:
            scan.constructs.append(Construct(kind="dynamic-array", count=dynamic_cells))

        lambdas: list[str] = []
        if "xl/workbook.xml" in names:
            for attributes, text in _DEFINED_NAME.findall(
                archive.read("xl/workbook.xml")
            ):
                if text.strip().upper().startswith(b"_XLFN.LAMBDA("):
                    name = _NAME_ATTR.search(attributes)
                    if name:
                        lambdas.append(name.group(1).decode(errors="replace"))
        if lambdas:
            scan.constructs.append(
                Construct(
                    kind="named-lambda", count=len(lambdas), examples=tuple(lambdas[:4])
                )
            )
            scan.named_lambdas = frozenset(one.upper() for one in lambdas)

        if functions:
            scan.constructs.append(
                Construct(
                    kind="function",
                    count=sum(functions.values()),
                    examples=tuple(
                        f"{name} ×{count}" for name, count in functions.most_common(6)
                    ),
                )
            )
    return scan
