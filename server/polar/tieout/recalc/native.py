"""The two native calculators, behind the same gate as LibreOffice.

Measured on 2 September 2026 on the founder's own model (6,014
formula cells) before either was wired:

* **IronCalc** matched Excel's stored values on 5,991 cells; the 23
  others differ by floating-point dust. Full recalculation in 13 ms.
  It has no dependency graph and did not finish loading a 17 MB
  regulator model in 25 minutes.
* **Formualizer** matched 4,866; six legacy array formulas
  (`=TRANSPOSE(E20:X20)` entered over a block the old way) came back
  as spill errors and 1,135 downstream cells inherited them. It
  refused the 17 MB model outright. It is the one engine that exposes
  the graph — precedents, dependents, a trace, an evaluation plan.

So neither is trusted on its own. Each runs behind :func:`gate_file`,
which compares every formula cell against what Excel itself saved,
and only an engine that passes the gate is believed for that file.
LibreOffice stays the fallback for the files they cannot do.

Two guards, registered here rather than tuned later:

* `NATIVE_MAX_BYTES` — files above it go straight to LibreOffice.
  IronCalc hung on the 17 MB file; a hang per upload is not a cost we
  pay to save twenty seconds.
* `NATIVE_TIMEOUT` — each native engine runs in its own forked process
  and is killed at the limit, so a pathological file costs a bounded
  wait and never takes the worker down.
"""

from __future__ import annotations

import multiprocessing as mp
import os
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any

from openpyxl.utils import column_index_from_string

from .constructs import ConstructScan
from .gate import CalcSettings, FileFidelity, gate_file
from .pool import CalculatorError, RecalcResult

#: Above this the native engines are not tried. 8 MB is under the
#: smallest file that hung (17 MB) and above every project-finance
#: close model we hold.
NATIVE_MAX_BYTES = 8 * 1024 * 1024
#: Seconds a native engine may take on one file before it is killed.
NATIVE_TIMEOUT = 120.0

#: Formualizer's error kinds, as Excel spells them. The gate compares
#: errors by spelling, so the mapping is the fidelity of error cells.
_FORMUALIZER_ERRORS = {
    "Value": "#VALUE!",
    "Div0": "#DIV/0!",
    "Div": "#DIV/0!",
    "Ref": "#REF!",
    "Name": "#NAME?",
    "Num": "#NUM!",
    "Na": "#N/A",
    "NA": "#N/A",
    "Null": "#NULL!",
    "Spill": "#SPILL!",
    "Calc": "#CALC!",
    "Circ": "#CIRC!",
}


def _split(ref: str) -> tuple[str, int, int]:
    sheet, _, cell = ref.rpartition("!")
    sheet = sheet.strip("'")
    letters = "".join(ch for ch in cell if ch.isalpha())
    digits = "".join(ch for ch in cell if ch.isdigit())
    return sheet, int(digits), column_index_from_string(letters)


def _plain(value: Any) -> float | str | None:
    """A native engine's value in the gate's vocabulary."""
    if value is None:
        return None
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, dict):
        if value.get("type") == "Error":
            kind = str(value.get("kind", ""))
            return _FORMUALIZER_ERRORS.get(kind, f"#{kind.upper()}!")
        return str(value)
    return str(value)


class IronCalcCalculator:
    """IronCalc, in process. Values for the formula cells it is asked for."""

    engine = "IronCalc"

    def __init__(self, refs: Iterable[str]) -> None:
        self.refs = list(refs)
        self._alive = True

    def start(self) -> None:
        self._alive = True

    def stop(self) -> None:
        self._alive = False

    @property
    def alive(self) -> bool:
        return self._alive

    def recalculate(self, path: str) -> RecalcResult:
        try:
            import ironcalc
        except ImportError as problem:  # pragma: no cover — dependency
            raise CalculatorError("ironcalc is not installed") from problem
        try:
            model = ironcalc.load_from_xlsx(path, "en", "UTC")
            model.evaluate()
            names = [
                one["name"] if isinstance(one, dict) else getattr(one, "name", one)
                for one in model.get_worksheets_properties()
            ]
        except Exception as problem:
            raise CalculatorError(
                f"IronCalc could not open the file: {problem}"
            ) from problem
        values: dict[str, float | str | None] = {}
        for ref in self.refs:
            sheet, row, column = _split(ref)
            if sheet not in names:
                continue
            try:
                values[ref] = _plain(
                    model.get_cell_value(names.index(sheet), row, column)
                )
            except Exception:
                continue
        return RecalcResult(
            values=values, engine=f"{self.engine} {ironcalc.__version__}"
        )


class FormualizerCalculator:
    """Formualizer, in process. The same contract as IronCalc's."""

    engine = "Formualizer"

    def __init__(self, refs: Iterable[str]) -> None:
        self.refs = list(refs)
        self._alive = True

    def start(self) -> None:
        self._alive = True

    def stop(self) -> None:
        self._alive = False

    @property
    def alive(self) -> bool:
        return self._alive

    def recalculate(self, path: str) -> RecalcResult:
        try:
            import formualizer
        except ImportError as problem:  # pragma: no cover — dependency
            raise CalculatorError("formualizer is not installed") from problem
        try:
            book = formualizer.load_workbook(path)
            book.evaluate_all()
            names = set(book.sheet_names)
        except Exception as problem:
            raise CalculatorError(
                f"Formualizer could not calculate the file: {problem}"
            ) from problem
        values: dict[str, float | str | None] = {}
        for ref in self.refs:
            sheet, row, column = _split(ref)
            if sheet not in names:
                continue
            try:
                values[ref] = _plain(book.get_value(sheet, row, column))
            except Exception:
                continue
        version = getattr(formualizer, "__version__", "") or ""
        return RecalcResult(values=values, engine=f"{self.engine} {version}".strip())


@dataclass
class Attempt:
    """One engine's turn at a file: what it said and whether the gate believed it."""

    engine: str
    verdict: str
    compared: int = 0
    matched: int = 0
    why: str = ""


@dataclass
class NativeOutcome:
    """The first native engine the gate believed, if any, and every attempt."""

    fidelity: FileFidelity | None = None
    engine: str | None = None
    attempts: list[Attempt] = field(default_factory=list)


def _run(kind: str, path: str, refs: list[str], out: Any) -> None:
    calculator = (IronCalcCalculator if kind == "IronCalc" else FormualizerCalculator)(
        refs
    )
    try:
        result = calculator.recalculate(path)
        out.put((dict(result.values), result.engine, None))
    except Exception as problem:
        out.put((None, kind, f"{type(problem).__name__}: {str(problem)[:300]}"))


def _isolated(
    kind: str, path: str, refs: list[str]
) -> tuple[dict[str, Any] | None, str, str | None]:
    """One engine in its own process, killed at `NATIVE_TIMEOUT`."""
    context = mp.get_context("fork")
    queue: Any = context.Queue()
    process = context.Process(target=_run, args=(kind, path, refs, queue))
    process.start()
    try:
        return queue.get(timeout=NATIVE_TIMEOUT)
    except Exception:
        return None, kind, f"did not finish within {NATIVE_TIMEOUT:.0f} seconds"
    finally:
        if process.is_alive():
            process.kill()
        process.join()


def native_recalc(
    path: str,
    cells: Mapping[str, object],
    *,
    settings: CalcSettings | None = None,
    engines: tuple[str, ...] = ("IronCalc", "Formualizer"),
    isolate: bool = True,
    constructs: ConstructScan | None = None,
) -> NativeOutcome:
    """Try each native engine in order; keep the first the gate passes.

    `cells` is the reader's surface (ref → cell with `.formula`,
    `.value`, `.precedents`). Every attempt is recorded, pass or fail,
    so the mark can say which engines were tried and why the chosen
    one was chosen — never « an engine said so ».

    `constructs` is the scan of the file's bytes (modern-excel.md):
    Formualizer is not asked about a file with tables, because it
    refuses the whole workbook on one (measured 2 September 2026), and
    the attempt says so in words instead of recording a failure that
    reads like the file's fault.
    """
    outcome = NativeOutcome()
    skipped: dict[str, str] = {}
    if constructs is not None and constructs.has_tables:
        tables = constructs.count("table")
        skipped["Formualizer"] = (
            f"skipped: the file has {tables} table{'' if tables == 1 else 's'} "
            "and Formualizer refuses a workbook that carries one"
        )
    try:
        size = os.path.getsize(path)
    except OSError:
        size = 0
    if size > NATIVE_MAX_BYTES:
        outcome.attempts.append(
            Attempt(
                engine="native",
                verdict="skipped",
                why=f"file is {size / 1e6:.0f} MB, above the {NATIVE_MAX_BYTES / 1e6:.0f} MB native limit",
            )
        )
        return outcome
    refs = [
        ref for ref, cell in cells.items() if getattr(cell, "formula", None) is not None
    ]
    for kind in engines:
        if kind in skipped:
            outcome.attempts.append(
                Attempt(engine=kind, verdict="skipped", why=skipped[kind])
            )
            continue
        if isolate:
            values, engine, failure = _isolated(kind, path, refs)
        else:
            try:
                calculator = (
                    IronCalcCalculator if kind == "IronCalc" else FormualizerCalculator
                )(refs)
                result = calculator.recalculate(path)
                values, engine, failure = dict(result.values), result.engine, None
            except Exception as problem:
                values, engine, failure = (
                    None,
                    kind,
                    f"{type(problem).__name__}: {str(problem)[:300]}",
                )
        if values is None:
            outcome.attempts.append(
                Attempt(engine=engine, verdict="failed", why=failure or "")
            )
            continue
        fidelity = gate_file(cells, values, settings=settings)
        outcome.attempts.append(
            Attempt(
                engine=engine,
                verdict=fidelity.verdict,
                compared=fidelity.compared,
                matched=fidelity.matched,
                why=(
                    ""
                    if fidelity.verdict == "pass"
                    else f"{len(fidelity.mismatches)} cells disagree with what Excel saved"
                ),
            )
        )
        if fidelity.verdict == "pass":
            outcome.fidelity = fidelity
            outcome.engine = engine
            return outcome
    return outcome
