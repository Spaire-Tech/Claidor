"""B1's mechanics without B1's machine: the pool against fakes.

Everything proved here is about dispatch, recycling, crash replacement
and retry — the pool's plumbing. Nothing here recalculates anything;
the `engine` field on every fake result says so on its face.
"""

from polar.tieout.recalc.pool import (
    CalculatorError,
    FakeCalculator,
    RecalcResult,
    WorkerPool,
)


def fake_result(path: str) -> RecalcResult:
    return RecalcResult(values={"M!B2": 1.0}, engine=f"fake({path})")


def test_every_path_gets_an_answer() -> None:
    journal: list[tuple[int, str, str]] = []
    paths = [f"model-{i}.xlsx" for i in range(7)]
    results = {p: fake_result(p) for p in paths}
    pool = WorkerPool(FakeCalculator.factory(results, journal), size=3)
    report = pool.recalculate_many(paths)
    assert set(report.results) == set(paths)
    assert report.failures == {}


def test_workers_are_recycled_after_n_documents() -> None:
    journal: list[tuple[int, str, str]] = []
    paths = [f"model-{i}.xlsx" for i in range(5)]
    results = {p: fake_result(p) for p in paths}
    pool = WorkerPool(FakeCalculator.factory(results, journal), size=1, recycle_after=2)
    report = pool.recalculate_many(paths)
    assert set(report.results) == set(paths)
    # One worker, five documents, recycled every two: three calculators
    # lived, each stopped, none doing more than two documents.
    starts = [entry for entry in journal if entry[1] == "start"]
    stops = [entry for entry in journal if entry[1] == "stop"]
    assert len(starts) == 3
    assert len(stops) == 3
    per_calculator: dict[int, int] = {}
    for worker_id, event, _ in journal:
        if event == "recalculate":
            per_calculator[worker_id] = per_calculator.get(worker_id, 0) + 1
    assert all(count <= 2 for count in per_calculator.values())


def test_a_poisonous_file_fails_after_exactly_two_attempts() -> None:
    journal: list[tuple[int, str, str]] = []
    results: dict[str, RecalcResult | Exception] = {
        "good.xlsx": fake_result("good.xlsx"),
        "poison.xlsx": CalculatorError("engine died on open"),
    }
    pool = WorkerPool(FakeCalculator.factory(results, journal), size=1)
    report = pool.recalculate_many(["good.xlsx", "poison.xlsx"])
    assert "good.xlsx" in report.results
    assert "engine died on open" in report.failures["poison.xlsx"]
    attempts = [e for e in journal if e[1] == "recalculate" and e[2] == "poison.xlsx"]
    assert len(attempts) == 2
    # The two attempts ran on different calculators: the dead one was
    # replaced, not reused.
    assert attempts[0][0] != attempts[1][0]


def test_a_crash_costs_the_worker_but_not_the_file() -> None:
    # A calculator that dies once, on one file, on its first try: the
    # retry lands on a fresh calculator and succeeds. Implemented as
    # its own fake — the Calculator surface is a Protocol, and this is
    # the proof a second implementation fits it.
    journal: list[tuple[int, str, str]] = []
    made = 0

    class DiesOnceCalculator:
        def __init__(self) -> None:
            nonlocal made
            made += 1
            self.id = made
            self._alive = False

        def start(self) -> None:
            self._alive = True
            journal.append((self.id, "start", ""))

        def stop(self) -> None:
            self._alive = False
            journal.append((self.id, "stop", ""))

        def recalculate(self, path: str) -> RecalcResult:
            journal.append((self.id, "recalculate", path))
            if path == "flaky.xlsx" and self.id == 1:
                self._alive = False
                raise CalculatorError("soffice lost the socket")
            return fake_result(path)

        @property
        def alive(self) -> bool:
            return self._alive

    pool = WorkerPool(DiesOnceCalculator, size=1)
    report = pool.recalculate_many(["flaky.xlsx"])
    assert report.failures == {}
    assert report.results["flaky.xlsx"].engine == "fake(flaky.xlsx)"
    attempts = [e for e in journal if e[1] == "recalculate"]
    assert [e[0] for e in attempts] == [1, 2]


def test_a_dead_calculator_is_not_reused_even_after_success() -> None:
    # `alive` going false after a successful document (the leak case)
    # forces a rebuild before the next document.
    made = 0

    class DiesAfterEachDocument:
        def __init__(self) -> None:
            nonlocal made
            made += 1
            self._alive = False

        def start(self) -> None:
            self._alive = True

        def stop(self) -> None:
            self._alive = False

        def recalculate(self, path: str) -> RecalcResult:
            self._alive = False
            return fake_result(path)

        @property
        def alive(self) -> bool:
            return self._alive

    pool = WorkerPool(DiesAfterEachDocument, size=1, recycle_after=100)
    report = pool.recalculate_many(["a.xlsx", "b.xlsx", "c.xlsx"])
    assert set(report.results) == {"a.xlsx", "b.xlsx", "c.xlsx"}
    assert made == 3


def test_empty_input_is_an_empty_report() -> None:
    journal: list[tuple[int, str, str]] = []
    pool = WorkerPool(FakeCalculator.factory({}, journal), size=2)
    report = pool.recalculate_many([])
    assert report.results == {}
    assert report.failures == {}
    assert journal == []
