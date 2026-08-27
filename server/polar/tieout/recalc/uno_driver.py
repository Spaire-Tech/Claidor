# mypy: ignore-errors
# (`uno` and `com.sun.star` exist only for the LibreOffice-bundled
# interpreter this script runs under.)
"""The UNO driver — the one file that runs inside LibreOffice's world.

This script is executed by the **LibreOffice-bundled Python**
(`/opt/libreoffice25.8/program/python`), never by the project venv:
python-uno only exists for the interpreter its LibreOffice shipped
with, which is the whole reason the recalculator is out-of-process
(the audit in `docs/pierce/logs/dynamo.md`). It therefore imports the
standard library and `uno` — nothing from `polar`, nothing from the
venv — and speaks to `UnoCalculator` over pipes, one JSON object per
line.

Protocol (requests on stdin, responses on stdout, one line each):

    {"ready": true}                                  # after connecting
    -> {"id": 1, "path": "/abs/model.xlsx",
        "calc": {"iterative": true, "count": 100, "delta": 0.001},
        "store_to": "/abs/computed.xlsx"}            # store_to optional
    <- {"id": 1, "values": {"Sheet!A1": 50.0, ...}}  # formula cells only
    -> {"exit": true}

The hard-won rules from `ambre-toolbox.md` §2, encoded here:

- the file's own `calcPr` iteration settings are **pushed into the
  document explicitly** (`calc` in the request, read venv-side) —
  import mapping is not trusted;
- `calculateAll()` on the UNO connection — the CLI convert path does
  not reliably recalculate;
- macros never execute, links never update: the file is recalculated
  exactly as it is, or not at all.

Errors in a cell come back as `"#ERR:<code>"` strings (LibreOffice
error codes, e.g. 532 for division by zero) — a different *kind* than
a number, which is exactly how the gate treats them. A request that
fails as a whole comes back as `{"id": n, "error": "..."}`.
"""

import json
import sys
import traceback

import uno
import unohelper
from com.sun.star.beans import PropertyValue
from com.sun.star.task import XInteractionHandler


class QuietInteraction(unohelper.Base, XInteractionHandler):
    """Swallow load-time interaction requests instead of aborting.

    Headless, nobody answers dialogs. Without a handler, a document
    that raises one (macro warnings on big .xlsm — the three draft
    BPFMs, measured 26 Aug) makes `loadComponentFromURL` return None,
    while the CLI convert path — which loads the same files fine —
    supplies its own handler. Ignoring a request means « no » to
    every optional prompt; it can never enable anything (macros stay
    NEVER_EXECUTE, links stay un-updated, repair is never accepted —
    a repaired file would not be the file the gate certifies).
    """

    def handle(self, request):
        pass


#: com.sun.star.sheet.CellFlags.FORMULA — the query for formula cells.
FORMULA = 16

#: com.sun.star.sheet.FormulaResult: the formula's result kind.
RESULT_VALUE = 1
RESULT_STRING = 2
RESULT_ERROR = 4


def _prop(name, value):
    prop = PropertyValue()
    prop.Name = name
    prop.Value = value
    return prop


def _column_letters(index):
    letters = ""
    index += 1
    while index:
        index, rem = divmod(index - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def connect(pipe_name):
    local = uno.getComponentContext()
    resolver = local.ServiceManager.createInstanceWithContext(
        "com.sun.star.bridge.UnoUrlResolver", local
    )
    context = resolver.resolve(
        f"uno:pipe,name={pipe_name};urp;StarOffice.ComponentContext"
    )
    return context.ServiceManager.createInstanceWithContext(
        "com.sun.star.frame.Desktop", context
    )


def open_document(desktop, path):
    url = uno.systemPathToFileUrl(path)
    props = (
        _prop("Hidden", True),
        _prop("MacroExecutionMode", 0),  # NEVER_EXECUTE
        _prop("UpdateDocMode", 0),  # NO_UPDATE: external links stay stale
        _prop("InteractionHandler", QuietInteraction()),
    )
    document = desktop.loadComponentFromURL(url, "_blank", 0, props)
    if document is None:
        raise RuntimeError(f"LibreOffice could not load {path}")
    return document


def push_calc_settings(document, calc):
    """The file's own calcPr, pushed — never trusted to import mapping."""
    document.setPropertyValue("IsIterationEnabled", bool(calc.get("iterative")))
    if calc.get("iterative"):
        document.setPropertyValue("IterationCount", int(calc.get("count", 100)))
        document.setPropertyValue("IterationEpsilon", float(calc.get("delta", 0.001)))


def read_formula_cells(document, only=None):
    """Every formula cell's value, or only those on the named sheets.

    A mining round watches one sheet and re-solves hundreds of times;
    reading the whole workbook each time is work nobody asked for.
    The gate's one-shot path passes no filter and still reads all.
    """
    values = {}
    sheets = document.Sheets
    wanted = set(only) if only else None
    for i in range(sheets.Count):
        sheet = sheets.getByIndex(i)
        name = sheet.Name
        if wanted is not None and name not in wanted:
            continue
        enumeration = sheet.queryContentCells(FORMULA).Cells.createEnumeration()
        while enumeration.hasMoreElements():
            cell = enumeration.nextElement()
            address = cell.CellAddress
            ref = f"{name}!{_column_letters(address.Column)}{address.Row + 1}"
            error = cell.getError()
            if error:
                values[ref] = f"#ERR:{error}"
                continue
            try:
                kind = cell.getPropertyValue("FormulaResultType2")
            except Exception:
                kind = RESULT_VALUE
            if kind == RESULT_STRING:
                values[ref] = cell.getString()
            elif kind == RESULT_ERROR:
                values[ref] = f"#ERR:{cell.getError()}"
            else:
                values[ref] = cell.getValue()
    return values


def store_copy(document, path):
    url = uno.systemPathToFileUrl(path)
    props = (
        _prop("FilterName", "Calc MS Excel 2007 XML"),
        _prop("Overwrite", True),
    )
    document.storeToURL(url, props)


#: One document held open across many perturbation runs. Opening a
#: 40MB workbook costs seconds; a mining round does hundreds of runs
#: that change only a handful of input cells, so the document is
#: opened once and re-solved in place. Values are only ever written
#: to cells the caller names — never to a formula cell — so the
#: document stays the file it was.
KEPT = {"document": None, "path": None}


def close_kept():
    document = KEPT.get("document")
    KEPT["document"] = None
    KEPT["path"] = None
    if document is None:
        return
    try:
        document.close(False)
    except Exception:
        document.dispose()


def open_kept(desktop, request):
    close_kept()
    document = open_document(desktop, request["open"])
    push_calc_settings(document, request.get("calc") or {})
    KEPT["document"] = document
    KEPT["path"] = request["open"]
    return {"id": request.get("id"), "opened": request["open"]}


def set_and_recalculate(request):
    document = KEPT.get("document")
    if document is None:
        raise RuntimeError("no document is open; send {'open': path} first")
    sheets = document.Sheets
    for ref, value in (request.get("set") or {}).items():
        name, _, at = ref.rpartition("!")
        sheets.getByName(name).getCellRangeByName(at).setValue(float(value))
    document.calculateAll()
    return {
        "id": request.get("id"),
        "values": read_formula_cells(document, request.get("sheets")),
    }


def cosmetic(desktop, request):
    """Make presentation-only edits and store the result.

    Rows inserted, a sheet renamed, a block reformatted — the three
    edits C6's claim stands or falls on. They go through LibreOffice
    rather than a file library **because the engine adjusts every
    formula and reference as it moves them**; a library that shifts
    cells without rewriting the formulas that point at them produces
    a broken model, not a cosmetic variant, and would make the test
    a lie.
    """
    spec = request["cosmetic"]
    document = open_document(desktop, spec["path"])
    try:
        for edit in spec.get("insert_rows", []):
            sheet = document.Sheets.getByName(edit["sheet"])
            sheet.Rows.insertByIndex(int(edit["at"]), int(edit.get("count", 1)))
        for edit in spec.get("rename", []):
            document.Sheets.getByName(edit["from"]).setName(edit["to"])
        for edit in spec.get("reformat", []):
            sheet = document.Sheets.getByName(edit["sheet"])
            cells = sheet.getCellRangeByName(edit["range"])
            formats = document.getNumberFormats()
            from com.sun.star.lang import Locale

            locale = Locale()
            key = formats.queryKey(edit["format"], locale, False)
            if key == -1:
                key = formats.addNew(edit["format"], locale)
            cells.NumberFormat = key
        document.calculateAll()
        store_copy(document, request["store_to"])
        return {"id": request.get("id"), "stored": request["store_to"]}
    finally:
        try:
            document.close(False)
        except Exception:
            document.dispose()


def handle(desktop, request):
    document = open_document(desktop, request["path"])
    try:
        push_calc_settings(document, request.get("calc") or {})
        document.calculateAll()
        values = read_formula_cells(document)
        if request.get("store_to"):
            store_copy(document, request["store_to"])
        return {"id": request.get("id"), "values": values}
    finally:
        try:
            document.close(False)
        except Exception:
            document.dispose()


def main():
    pipe_name = sys.argv[sys.argv.index("--pipe") + 1]
    desktop = None
    last_error = None
    # soffice takes a moment to open its pipe; retry, then report.
    import time

    for _ in range(120):
        try:
            desktop = connect(pipe_name)
            break
        except Exception as error:
            last_error = error
            time.sleep(0.5)
    if desktop is None:
        _emit({"fatal": f"could not connect: {last_error}"})
        return 1
    _emit({"ready": True})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request = json.loads(line)
        if request.get("exit"):
            close_kept()
            break
        try:
            if request.get("cosmetic"):
                response = cosmetic(desktop, request)
            elif request.get("open"):
                response = open_kept(desktop, request)
            elif request.get("close"):
                close_kept()
                response = {"id": request.get("id"), "closed": True}
            elif "set" in request:
                response = set_and_recalculate(request)
            else:
                response = handle(desktop, request)
        except Exception:
            response = {
                "id": request.get("id"),
                "error": traceback.format_exc(limit=8),
            }
        _emit(response)
    return 0


def _emit(response):
    """One JSON object per stdout line — stdout *is* the protocol."""
    sys.stdout.write(json.dumps(response) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    sys.exit(main())
