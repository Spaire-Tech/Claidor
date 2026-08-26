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


def read_formula_cells(document):
    values = {}
    sheets = document.Sheets
    for i in range(sheets.Count):
        sheet = sheets.getByIndex(i)
        name = sheet.Name
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
            break
        try:
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
