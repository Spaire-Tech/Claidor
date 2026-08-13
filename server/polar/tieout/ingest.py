"""Turning an uploaded file into rows, or into a sentence about why not.

The engines read paths, because `openpyxl` and `python-pptx` both open
files rather than buffers, and a `.xls` has to be seekable. So the bytes
land in a temporary file, are read, and the temporary file goes away. What
survives is the chain — figures, cells, labels, formulas — which is the
retention posture the product commits to: keep what was extracted, drop
the document.

**Every failure has to say what a person can do about it.** A banker who
uploads a model and gets « extraction failed » learns nothing and tries
again with the same file. The messages below name the cause and the fix,
and where there is no fix they say that too.
"""

import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from polar.models.tieout import ArtifactKind

from .audit import audit
from .deck import read_deck
from .figures import Figure
from .legacy import LegacyUnreadable
from .memo import NotADocx, read_memo
from .model import OutputsMissing, read_outputs
from .provenance import repair_outputs
from .source import NotAPdf, read_source
from .workbook import Cell, read_workbook

#: What each kind of artifact is expected to arrive as. A `.pptx` uploaded
#: as a model is a user error worth naming rather than a parse failure.
SUFFIXES: dict[ArtifactKind, tuple[str, ...]] = {
    ArtifactKind.model: (".xlsx", ".xlsm", ".xls", ".xlt"),
    ArtifactKind.deck: (".pptx", ".pptm"),
    ArtifactKind.memo: (".docx", ".doc"),
    ArtifactKind.source: (".pdf",),
}


class Unreadable(Exception):
    """The file could not be read, and the message says why in words."""


@dataclass
class Ingested:
    """What came out of one file."""

    counts: dict[str, Any] = field(default_factory=dict)
    #: Present for a deck. Every printed number and the words naming it.
    figures: list[Figure] = field(default_factory=list)
    #: Present for a model. Every numeric cell, named from its labels.
    cells: list[Cell] = field(default_factory=list)
    #: Present for a model. Mechanical defects found while reading it,
    #: because the audit needs nothing a check run would add.
    defects: list[Any] = field(default_factory=list)
    #: Present for a model with an Outputs tab: the figures it publishes,
    #: with stale source references already repaired against the workbook.
    outputs: list[dict[str, Any]] = field(default_factory=list)


def kind_for(filename: str) -> ArtifactKind | None:
    """What this file is for, from its name. `None` when it is not ours."""
    suffix = Path(filename).suffix.lower()
    for kind, suffixes in SUFFIXES.items():
        if suffix in suffixes:
            return kind
    return None


def read_artifact(payload: bytes, filename: str, kind: ArtifactKind) -> Ingested:
    """Read one uploaded file, or raise :class:`Unreadable` with a reason."""
    suffix = Path(filename).suffix.lower()
    if suffix and suffix not in SUFFIXES.get(kind, ()):
        expected = ", ".join(SUFFIXES.get(kind, ()))
        raise Unreadable(
            f"a {kind.value} has to be one of {expected}; this is a {suffix} file"
        )
    if not payload:
        raise Unreadable("the file is empty")

    with tempfile.TemporaryDirectory(prefix="tieout-") as folder:
        path = Path(folder) / Path(filename).name
        path.write_bytes(payload)
        if kind is ArtifactKind.model:
            return _read_model(str(path))
        if kind is ArtifactKind.deck:
            return _read_deck(str(path))
        if kind is ArtifactKind.memo:
            return _read_memo(str(path), suffix)
        if kind is ArtifactKind.source:
            return _read_source(str(path))
        raise Unreadable(f"reading a {kind.value} is not something this can do")


def _read_source(path: str) -> Ingested:
    """Audited accounts, a term sheet — where a typed input came from.

    The only reader here that opens a document nobody on the deal wrote,
    which is why it counts its pages: « p.42 » is what makes a grounded
    figure checkable by a person, and a page number is the one thing a PDF
    gives away for free.
    """
    try:
        extraction = read_source(path)
    except NotAPdf as error:
        raise Unreadable(str(error)) from error
    except Exception as error:
        raise Unreadable(
            f"this PDF could not be read ({type(error).__name__}). If it "
            "opens in a reader, printing it to a new PDF usually fixes it"
        ) from error

    pages = {figure.slide for figure in extraction.figures}
    counts: dict[str, Any] = {
        "figures": len(extraction.figures),
        "pages_with_figures": len(pages),
    }
    if extraction.year is not None:
        counts["document_year"] = extraction.year
    return Ingested(figures=extraction.figures, counts=counts)


def _read_model(path: str) -> Ingested:
    try:
        book = read_workbook(path)
    except LegacyUnreadable as error:
        raise Unreadable(_legacy_reason(str(error))) from error
    except Exception as error:
        raise Unreadable(
            f"this workbook could not be opened ({type(error).__name__}). "
            "If it opens in Excel, saving it again as .xlsx usually fixes it."
        ) from error

    if not book.cells:
        raise Unreadable(
            "no numbers were found in this workbook — if it is a template "
            "with the inputs still empty, fill one in and upload it again"
        )

    calculated = sum(1 for cell in book.cells.values() if cell.value is not None)
    if calculated == 0:
        raise Unreadable(
            "this workbook has formulas but no calculated values. Excel "
            "stores its last answers in the file; open it once, save, and "
            "upload again"
        )

    published: list[dict[str, Any]] = []
    try:
        published = [
            {
                "ref": output.ref,
                "name": output.name,
                "value": str(output.value),
                "source": output.source,
                "basis": output.basis,
            }
            for output in repair_outputs(read_outputs(path), book)
        ]
    except OutputsMissing:
        # The common case in the wild. The workbook pass carries it alone.
        pass

    result = audit(book)
    return Ingested(
        outputs=published,
        counts={
            "sheets": len(book.sheets),
            # The workbook's own tab order, which nothing else records and
            # which cannot be recovered from the cells: a screen that lists
            # sheets in whatever order the database returned them puts
            # Assumptions before Model on one load and after it on the
            # next.
            "sheet_order": list(book.sheets),
            "cells": len(book.cells),
            "formulas": sum(1 for cell in book.cells.values() if cell.formula),
            "named": sum(1 for cell in book.cells.values() if cell.row_label),
            "errors": len(result.errors),
            "smells": len(result.smells),
            "iterative": book.iterative,
        },
        cells=list(book.cells.values()),
        defects=list(result.findings),
    )


def _read_deck(path: str) -> Ingested:
    try:
        extraction = read_deck(path)
    except Exception as error:
        raise Unreadable(
            f"this deck could not be opened ({type(error).__name__}). "
            "A .ppt saved by an old PowerPoint has to be re-saved as .pptx."
        ) from error

    if not extraction.figures:
        raise Unreadable(
            "no figures were found on any slide — if the numbers are in "
            "pictures rather than text or tables, nothing can be read from them"
        )

    pages = {figure.slide for figure in extraction.figures}
    return Ingested(
        counts={
            "slides": max(pages) if pages else 0,
            "figures": len(extraction.figures),
            "pages_with_figures": len(pages),
        },
        figures=list(extraction.figures),
    )


def _read_memo(path: str, suffix: str) -> Ingested:
    if suffix == ".doc":
        # A .doc is the pre-2007 binary format, not a zip of XML. There is
        # no partial answer to give: the reader cannot open it at all.
        raise Unreadable("this is an old .doc — open it in Word once and save as .docx")

    try:
        extraction = read_memo(path)
    except NotADocx as error:
        raise Unreadable(
            f"this file is named .docx but is not a Word document inside ({error})"
        ) from error
    except Exception as error:
        raise Unreadable(
            f"this memo could not be opened ({type(error).__name__}). "
            "If it opens in Word, saving it again usually fixes it."
        ) from error

    if not extraction.figures:
        raise Unreadable(
            "no figures were found in this memo — if the numbers are in "
            "images or an embedded object, nothing can be read from them"
        )

    return Ingested(
        counts={
            "figures": len(extraction.figures),
            "paragraphs_with_figures": len(
                {figure.location for figure in extraction.figures}
            ),
            "named": sum(1 for figure in extraction.figures if figure.label),
        },
        figures=list(extraction.figures),
    )


def _legacy_reason(message: str) -> str:
    """Turn the reader's own complaint into something actionable."""
    lowered = message.lower()
    if "password" in lowered or "encrypt" in lowered:
        return (
            "this .xls is password protected — remove the password and upload it again"
        )
    if "workbook" in lowered and "stream" in lowered:
        return (
            "this file is named .xls but is not an Excel workbook inside; "
            "check it opens in Excel"
        )
    return (
        "this .xls could not be read. Files older than Excel 97 are not "
        "supported — opening it once in Excel and saving as .xlsx fixes it."
    )


__all__ = ["SUFFIXES", "Ingested", "Unreadable", "kind_for", "read_artifact"]
