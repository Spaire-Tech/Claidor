"""The worker pool (B1), behind an interface the machine can fill in later.

The researched architecture (`ambre-toolbox.md` §2): a pool of
long-lived soffice workers, UNO socket each, one document per process,
recycled every N files because soffice leaks. None of that is
buildable in this container — the audit in `docs/pierce/logs/dynamo.md`
records exactly why (no Calc, LibreOffice 24.2 < 25.8, a venv that
cannot import uno) — so the pool is built against a `Calculator`
interface instead, exercised by a fake. When the machine exists, the
real UNO wiring is one adapter class (a driver script run under the
LibreOffice-matched interpreter, spoken to over a pipe) and nothing
above this interface changes.

**No result from this module is a recalculation.** The fake exists to
prove the pool's mechanics — dispatch, recycling, crash replacement,
retry — and nothing else.

Discipline the pool encodes:

- One document per worker at a time, by construction: each worker
  owns one calculator and works serially.
- A worker is stopped and rebuilt after `recycle_after` documents.
- A calculator that dies mid-document is replaced, and the document
  is retried exactly once on a fresh worker — a leaked process must
  not damn a file, and an actually poisonous file must not loop.
"""

import queue
import threading
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class RecalcResult:
    """One file's recalculated values, ref (`Sheet!A1`) to value."""

    values: Mapping[str, float | str | None]
    #: Which engine produced this — named in every downstream report,
    #: so a fake can never be mistaken for a machine result.
    engine: str


class CalculatorError(Exception):
    """The calculator failed on this document — the engine's fault."""


class Calculator(Protocol):
    """What a calculation engine must offer the pool.

    The contract mirrors the UNO reality it will wrap: `start` brings
    a process up (soffice + socket), `recalculate` opens one document,
    pushes the file's own `calcPr`, calls `calculateAll()`, reads the
    values back and closes the document; `stop` tears the process
    down. `alive` says whether the process is still worth talking to.
    """

    def start(self) -> None: ...

    def stop(self) -> None: ...

    def recalculate(self, path: str) -> RecalcResult: ...

    @property
    def alive(self) -> bool: ...


CalculatorFactory = Callable[[], Calculator]


class FakeCalculator:
    """A scriptable stand-in: canned results, scheduled deaths, a journal.

    `results` maps path → `RecalcResult` to return, or an `Exception`
    to raise (a scheduled death). The shared `journal` records every
    lifecycle event as `(worker_id, event, detail)` so tests can prove
    recycling and replacement actually happened.
    """

    _made = 0

    def __init__(
        self,
        results: Mapping[str, RecalcResult | Exception],
        journal: list[tuple[int, str, str]],
    ) -> None:
        FakeCalculator._made += 1
        self.id = FakeCalculator._made
        self.results = results
        self.journal = journal
        self._alive = False

    @classmethod
    def factory(
        cls,
        results: Mapping[str, RecalcResult | Exception],
        journal: list[tuple[int, str, str]],
    ) -> CalculatorFactory:
        return lambda: cls(results, journal)

    def start(self) -> None:
        self._alive = True
        self.journal.append((self.id, "start", ""))

    def stop(self) -> None:
        self._alive = False
        self.journal.append((self.id, "stop", ""))

    def recalculate(self, path: str) -> RecalcResult:
        self.journal.append((self.id, "recalculate", path))
        outcome = self.results.get(path)
        if outcome is None:
            raise CalculatorError(f"no scripted result for {path}")
        if isinstance(outcome, Exception):
            self._alive = False
            raise outcome
        return outcome

    @property
    def alive(self) -> bool:
        return self._alive


@dataclass
class _Job:
    path: str
    attempt: int = 1


@dataclass
class PoolReport:
    """What happened to every path given to the pool. Nothing is dropped."""

    results: dict[str, RecalcResult] = field(default_factory=dict)
    failures: dict[str, str] = field(default_factory=dict)


class WorkerPool:
    """Long-lived workers over a shared queue of documents.

    `size` workers, each owning one `Calculator` built from `factory`;
    a worker's calculator is stopped and rebuilt after `recycle_after`
    documents. A calculator that raises or dies is replaced; the
    document goes back on the queue once, then fails for good with
    the error named.
    """

    def __init__(
        self,
        factory: CalculatorFactory,
        *,
        size: int = 2,
        recycle_after: int = 25,
    ) -> None:
        if size < 1:
            raise ValueError("a pool needs at least one worker")
        if recycle_after < 1:
            raise ValueError("recycle_after must be at least one document")
        self.factory = factory
        self.size = size
        self.recycle_after = recycle_after

    def recalculate_many(self, paths: Iterable[str]) -> PoolReport:
        report = PoolReport()
        jobs: queue.Queue[_Job | None] = queue.Queue()
        pending = 0
        for path in paths:
            jobs.put(_Job(path))
            pending += 1
        if pending == 0:
            return report

        lock = threading.Lock()
        done = threading.Event()

        def finish_one() -> None:
            nonlocal pending
            pending -= 1
            if pending == 0:
                done.set()

        def give_up_or_retry(job: _Job, error: Exception) -> None:
            with lock:
                if job.attempt == 1:
                    jobs.put(_Job(job.path, attempt=2))
                else:
                    report.failures[job.path] = f"{type(error).__name__}: {error}"
                    finish_one()

        def work() -> None:
            calculator: Calculator | None = None
            documents = 0
            try:
                while True:
                    job = jobs.get()
                    if job is None:
                        return
                    if calculator is None:
                        try:
                            calculator = self.factory()
                            calculator.start()
                            documents = 0
                        except Exception as error:
                            calculator = None
                            give_up_or_retry(job, error)
                            continue
                    try:
                        result = calculator.recalculate(job.path)
                    except Exception as error:
                        self._discard(calculator)
                        calculator = None
                        give_up_or_retry(job, error)
                        continue
                    documents += 1
                    with lock:
                        report.results[job.path] = result
                        finish_one()
                    if not calculator.alive or documents >= self.recycle_after:
                        self._discard(calculator)
                        calculator = None
            finally:
                if calculator is not None:
                    self._discard(calculator)

        workers = [
            threading.Thread(target=work, name=f"recalc-worker-{i}", daemon=True)
            for i in range(self.size)
        ]
        for worker in workers:
            worker.start()
        done.wait()
        for _ in workers:
            jobs.put(None)
        for worker in workers:
            worker.join()
        return report

    @staticmethod
    def _discard(calculator: Calculator) -> None:
        try:
            calculator.stop()
        except Exception:
            pass
