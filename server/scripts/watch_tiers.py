"""C4's ladder over a real version pair — the runner.

    uv run python -m scripts.watch_tiers pair OLD.xlsx NEW.xlsx OUT.json
    uv run python -m scripts.watch_tiers cost FILE.xlsx
    uv run python -m scripts.watch_tiers domain OLD.xlsx NEW.xlsx OUT.json
    uv run python -m scripts.watch_tiers oracle OLD.xlsx NEW.xlsx OUT.json [SHEET] [zeros]
    uv run python -m scripts.watch_tiers control FILE.xlsx OUT.json [SHEET] [zeros]

`pair` assigns every cell of the new version exactly one verdict and
checks the five registered gates (`docs/pierce/logs/prism.md`, « The
tier ladder — one verdict per cell », with its two amendments). It
runs **without a tier-2 oracle**: tiers 0 and 3 and the raw
evidence, which need no calculation host. Every cell that reaches
tier 2's rung comes back `not_offered_to_tier2` — the refusal that
stops a cheap run from reading like a complete one.

`oracle` is the same assignment with tier 2 answering: the model's
matched, non-categorical literals are perturbed identically in both
files — keyed by the new ref and applied to the old one through C2's
alignment, because the rows moved — both versions are recalculated
five times, and a cell is supported only when it agreed on every
trial *and* moved at least once. `control` runs one file against
itself through that identical pipeline; a single divergence there
means the instrument is noisy and no pair result may be read. A
trailing SHEET argument forces the model's own `CHOOSE` index onto
that sheet's branch for every trial — round D's intervention,
declared in the report and never silent — because « dead » in a
selector model usually means *unselected*.

A trailing `zeros` wakes the literals the file holds at zero, which
the categorical rule otherwise holds as flags; a disagreement found
that way is `tier2_divergence_latent` — a difference on a branch the
model does not take, never the revision's own change.

Both write a `.verdicts.jsonl` beside the report: one line per cell,
so where the refusals live is a question of reading rather than of
re-running.

`cost` measures what the pair oracle will cost before anything
depends on it: one openpyxl load-and-save of the file, and one
LibreOffice recalculation of it. The oracle needs
`2 x (1 + TIER2_TRIALS)` of each.

The environment and volatile cones are computed here, not in the
ladder: they are facts about the file that the pure module takes as
given (`polar.tieout.watch.tiers` drives nothing).
"""

import json
import sys
import tempfile
import time
from collections.abc import Callable, Mapping
from pathlib import Path

from polar.tieout.watch import read_raw
from polar.tieout.watch.tiers import (
    CHANGED,
    PROVED,
    REFUSAL_DEGENERATE,
    REFUSAL_ENVIRONMENT,
    REFUSAL_LATENT,
    REFUSAL_NOT_READ,
    REFUSAL_VOLATILE,
    REFUSED,
    SOURCE_TIER2_DIVERGENCE,
    SUPPORTED,
    Tier2Answer,
    build_ladder,
    gate_violations,
)
from polar.tieout.watch.trace import proved_unchanged
from polar.tieout.workbook import read_workbook
from scripts.watch_stealth import (
    TIER2_SEED,
    TIER2_TRIALS,
    _environment_cone,
    _is_categorical,
)


def _ineligible(path: str) -> tuple[dict[str, str], dict[str, int]]:
    """New-version refs the differential oracle may not be asked
    about, each with its named reason."""
    from polar.tieout.recalc import volatile_cone

    book = read_workbook(path)
    raw, _ = read_raw(path)
    _, volatile = volatile_cone(book.cells)
    _, environment = _environment_cone(raw, book.cells)
    named = {ref: REFUSAL_VOLATILE for ref in volatile if ref in book.cells}
    for ref in environment:
        if ref in book.cells:
            named[ref] = REFUSAL_ENVIRONMENT
    return named, {"volatile": len(volatile), "environment": len(environment)}


def run_pair(old_path: str, new_path: str, out_path: str) -> int:
    started = time.monotonic()
    old_book = read_workbook(old_path)
    new_book = read_workbook(new_path)
    old_raw, _ = read_raw(old_path)
    new_raw, _ = read_raw(new_path)
    read_at = time.monotonic()

    ineligible, cone_sizes = _ineligible(new_path)
    proof = proved_unchanged(old_book, new_book)
    ladder = build_ladder(
        old_book,
        new_book,
        old_raw,
        new_raw,
        proof=proof,
        oracle=None,
        ineligible=ineligible,
    )
    violations = gate_violations(ladder, new_book, old_raw, new_raw, proof)

    total = len(ladder.verdicts)
    payload = {
        "old": old_path,
        "new": new_path,
        "cells": total,
        "old_only": ladder.old_only,
        "seconds": {
            "read": round(read_at - started, 1),
            "total": round(time.monotonic() - started, 1),
        },
        "counts": ladder.counts,
        "shares": {
            verdict: round(ladder.fraction(verdict), 4) for verdict in ladder.counts
        },
        "tier0_overruled_by_raw": ladder.tier0_overruled_by_raw,
        "tier1_would_have_been_asked": ladder.tier1_would_have_been_asked,
        "tier0_blockage_census": ladder.blockage_census,
        "verdict_by_blockage": ladder.verdict_by_blockage,
        "reason_census": ladder.reason_census,
        "cone_sizes": cone_sizes,
        "proof_proved": len(proof.proved),
        "proof_fraction": round(proof.proved_fraction, 4),
        "gate_violations": violations[:20],
        "gate_violation_count": len(violations),
        "examples": {
            verdict: sorted(ladder.by_verdict(verdict))[:5]
            for verdict in (PROVED, CHANGED, SUPPORTED, REFUSED)
        },
    }
    Path(out_path).write_text(json.dumps(payload, indent=1))
    print(json.dumps(payload, indent=1))
    return 0 if not violations else 1


def run_cost(path: str) -> int:
    """What one trial of the pair oracle costs on this file."""
    import tempfile

    import openpyxl

    from polar.tieout.recalc.uno_calc import UnoCalculator

    numbers: dict[str, float] = {}
    with tempfile.TemporaryDirectory() as scratch:
        target = Path(scratch) / "built.xlsx"
        started = time.monotonic()
        working = openpyxl.load_workbook(path)
        numbers["openpyxl_load"] = round(time.monotonic() - started, 1)
        started = time.monotonic()
        working.save(target)
        numbers["openpyxl_save"] = round(time.monotonic() - started, 1)

        calc = UnoCalculator()
        calc.start()
        try:
            started = time.monotonic()
            values = calc.recalculate(str(target))
            numbers["uno_recalculate"] = round(time.monotonic() - started, 1)
            numbers["cells_read"] = len(values.values)
        finally:
            calc.stop()

    one_trial = numbers["openpyxl_load"] + numbers["openpyxl_save"]
    one_trial += numbers["uno_recalculate"]
    numbers["one_build_and_recalculation"] = round(one_trial, 1)
    #: The pair oracle: both files, a baseline and TIER2_TRIALS trials.
    numbers["projected_oracle_minutes"] = round(one_trial * 2 * 6 / 60, 1)
    print(json.dumps(numbers, indent=1))
    return 0


def _assignments(
    old_book: object,
    new_book: object,
    pairing: dict[str, str],
    wake_zeros: bool = False,
) -> tuple[list[dict[str, float]], dict[str, str]]:
    """The five trial assignments, keyed by the new ref, and the map
    that lands each on the matching old cell.

    Only literals matched in both versions are perturbed, and only
    non-categorical ones: an integral literal of magnitude at most
    `CATEGORICAL_LIMIT` is a flag, a month or a licensee index, and
    scaling it deadens the branch it selects in both files at once.
    """
    import random

    old_cells = old_book.cells  # type: ignore[attr-defined]
    new_cells = new_book.cells  # type: ignore[attr-defined]
    inputs: dict[str, float] = {}
    zeros: dict[str, float] = {}
    landing: dict[str, str] = {}
    for ref, old_ref in pairing.items():
        new_cell, old_cell = new_cells[ref], old_cells[old_ref]
        if new_cell.formula is not None or old_cell.formula is not None:
            continue
        if new_cell.value is None or old_cell.value is None:
            continue
        value = float(new_cell.value)
        if _is_categorical(value):
            #: The zero round: a zero literal is integral and small, so
            #: the categorical rule holds it as though it were a flag —
            #: and a zero *quantity* pins every branch it multiplies.
            #: Woken only when the run says so, never silently.
            if wake_zeros and value == 0:
                zeros[ref] = value
                landing[ref] = old_ref
            continue
        inputs[ref] = value
        landing[ref] = old_ref

    #: Two streams, so waking the zeros cannot move the draws the
    #: non-zero literals already received (the amendment). Without it,
    #: a divergence in the zero round would be attributable to
    #: « different numbers everywhere » rather than to the zeros.
    rng = random.Random(TIER2_SEED)
    zero_rng = random.Random(TIER2_SEED + 1)
    trials: list[dict[str, float]] = []
    for _ in range(TIER2_TRIALS):
        assignment: dict[str, float] = {}
        for ref in sorted(inputs):
            current = inputs[ref]
            if current == 0:
                #: Unreachable as the rule stands, and left visible
                #: rather than deleted: `_is_categorical(0.0)` is true
                #: (integral, magnitude ≤ 12), so every zero literal is
                #: filtered out above before it can be assigned. The
                #: forced-selector round found that this is why 198
                #: disturbed cells never moved — a zero *quantity* is
                #: held as though it were a flag. Changing it is a
                #: registered round, not a tidy-up.
                assignment[ref] = rng.uniform(-1.0, 1.0)
            else:
                assignment[ref] = current * rng.uniform(0.5, 1.5)
        for ref in sorted(zeros):
            assignment[ref] = zero_rng.uniform(-1.0, 1.0)
        trials.append(assignment)
    return trials, landing


def _split(ref: str) -> tuple[str, str]:
    sheet, coordinate = ref.rsplit("!", 1)
    return sheet.strip("'"), coordinate


def _recalculate_trials(
    path: str,
    trials: list[dict[str, float]],
    key: Callable[[str], str],
    calc: object,
    scratch: Path,
    label: str,
    forcing: tuple[str, int] | None = None,
) -> list[Mapping[str, object]]:
    """One file, five perturbed copies, five recalculations.

    The workbook is reloaded for **every** trial. The first draft
    loaded it once and saved five times, which is 63 s cheaper and
    does not work: an ED2 model carries embedded images, openpyxl
    holds them as file handles, and the handles are closed by the
    first save — the second raises « I/O operation on closed file »
    from deep inside PIL. Recorded in the lane log as an instrument
    abort before any result, not patched in silence.
    """
    import openpyxl

    readings: list[Mapping[str, object]] = []
    for index, assignment in enumerate(trials):
        working = openpyxl.load_workbook(path)
        if forcing is not None:
            index_sheet, index_cell = _split(forcing[0])
            working[index_sheet][index_cell] = forcing[1]
        for ref, value in assignment.items():
            sheet, coordinate = _split(key(ref))
            working[sheet][coordinate] = value
        target = scratch / f"{label}_{index}.xlsx"
        working.save(target)
        started = time.monotonic()
        readings.append(calc.recalculate(str(target)).values)  # type: ignore[attr-defined]
        print(f"[{label}] trial {index}: {time.monotonic() - started:.0f}s")
        target.unlink()
    return readings


def _answer(
    refs: tuple[str, ...],
    landing_for: Callable[[str], str],
    old_readings: list[Mapping[str, object]],
    new_readings: list[Mapping[str, object]],
    dormant: Callable[[str], bool] = lambda _ref: False,
) -> dict[str, Tier2Answer]:
    """The per-cell verdict, under the registered rules.

    A cell that both versions store as zero or empty is **dormant**:
    the model does not take that path as it is configured, so a
    disagreement there refuses under its own name
    (`tier2_divergence_latent`) instead of calling the cell changed.
    A finding about the pair, and not the same claim as « this
    revision computes differently ». The earlier `latent` flag —
    « the zeros were woken this run » — is gone: which knob reached
    the cell was never the right question.
    """
    from scripts.watch_stealth import _diverges

    answers: dict[str, Tier2Answer] = {}
    for ref in refs:
        old_ref = landing_for(ref)
        if not all(ref in reading for reading in new_readings) or not all(
            old_ref in reading for reading in old_readings
        ):
            answers[ref] = Tier2Answer(
                "refused",
                "the recalculation returned no value on one side",
                perturbed=False,
                refusal=REFUSAL_NOT_READ,
            )
            continue
        divergence = ""
        for index, (old_reading, new_reading) in enumerate(
            zip(old_readings, new_readings, strict=True)
        ):
            if _diverges(old_reading[old_ref], new_reading[ref]):
                divergence = (
                    f"trial {index}: {old_reading[old_ref]!r} -> {new_reading[ref]!r}"
                )
                break
        if divergence:
            #: Latency is a property of the *cell*, not of which knob
            #: woke it (registered refinement). A cell both versions
            #: store as zero or empty is dormant as configured, so a
            #: divergence there is a difference on a path the model
            #: does not currently take — however the trials reached
            #: it. A cell carrying a real number in both saved files
            #: is not dormant, and its divergence is plain.
            answers[ref] = (
                Tier2Answer("refused", divergence[:200], refusal=REFUSAL_LATENT)
                if dormant(ref)
                else Tier2Answer("diverged", divergence[:200])
            )
            continue
        #: G5: support requires that the trials reached the cell.
        seen = {repr(reading[ref]) for reading in new_readings}
        if len(seen) > 1:
            answers[ref] = Tier2Answer(
                "supported", f"{TIER2_TRIALS} trials, no divergence"
            )
            continue
        #: It did not vary — and the two reasons for that are not the
        #: same claim. A cell reading `#DIV/0!` or `""` in every trial
        #: was *reached*; the perturbation drove it out of the domain
        #: where it computes, and comparing the versions there is
        #: vacuous. Saying « the trials never moved its inputs » of
        #: such a cell is false, and this harness said it for a round.
        settled = str(next(iter(new_readings))[ref])
        degenerate = settled.startswith("#") or settled == ""
        answers[ref] = Tier2Answer(
            "supported",
            (
                f"every trial reads {settled or 'an empty string'!r}"
                if degenerate
                else "the trials never moved this cell's inputs"
            ),
            perturbed=False,
            refusal=REFUSAL_DEGENERATE if degenerate else "",
        )
    return answers


#: The domain round's bands, narrowed in order. A trial is drawn at
#: the widest band that does not push the model materially further
#: out of its own domain than the untouched file already is.
DOMAIN_BANDS = ((0.5, 1.5), (0.75, 1.25), (0.9, 1.1), (0.95, 1.05), (0.99, 1.01))
#: A trial may raise the file's error count by at most this, relative.
DOMAIN_ERROR_CEILING = 0.10


def _errors(values: Mapping[str, object]) -> int:
    return sum(1 for value in values.values() if str(value).startswith("#"))


def _banded(
    inputs: Mapping[str, float], rng: object, band: tuple[float, float]
) -> dict[str, float]:
    low, high = band
    return {ref: inputs[ref] * rng.uniform(low, high) for ref in sorted(inputs)}  # type: ignore[attr-defined]


def _dormant(
    old_raw: Mapping[str, tuple[str, str]],
    new_raw: Mapping[str, tuple[str, str]],
    pairing: Mapping[str, str],
) -> Callable[[str], bool]:
    """Is the cell dormant as the model is configured — stored as zero
    or empty in **both** versions?

    A divergence in such a cell is a difference on a path the model
    does not currently take. Registered after the seven `Finance&Tax`
    cells: every one of them stores `0` in both files and computes two
    different numbers once the trials move the inputs.
    """

    def stored(raw: Mapping[str, tuple[str, str]], ref: str) -> str | None:
        entry = raw.get(ref)
        return None if entry is None else entry[1]

    def decide(ref: str) -> bool:
        old_ref = pairing.get(ref)
        if old_ref is None:
            return False
        values = (stored(old_raw, old_ref), stored(new_raw, ref))
        return all(value in ("n:0", "s:", "str:", "") for value in values)

    return decide


def _forced_index(path: str, sheet: str) -> tuple[str, int] | None:
    """The model's own `CHOOSE` index for a sheet, and the argument
    position that selects it — round D's reader, reused unchanged."""
    from scripts.watch_stealth import _selector_index

    return _selector_index(read_workbook(path).cells, sheet)


def _run_oracle(
    old_path: str,
    new_path: str,
    out_path: str,
    control: bool,
    force_sheet: str = "",
    wake_zeros: bool = False,
) -> int:
    from polar.tieout.recalc.uno_calc import UnoCalculator

    started = time.monotonic()
    old_book = read_workbook(old_path)
    new_book = read_workbook(new_path)
    old_raw, _ = read_raw(old_path)
    new_raw, _ = read_raw(new_path)
    ineligible, cone_sizes = _ineligible(new_path)
    proof = proved_unchanged(old_book, new_book)
    trials, landing = _assignments(old_book, new_book, proof.pairing, wake_zeros)
    #: A declared intervention, never a silent one: the index cell is
    #: overwritten with the argument position that selects
    #: `force_sheet`, on both sides, in every trial.
    forcing: tuple[str, int] | None = None
    if force_sheet:
        forcing = _forced_index(new_path, force_sheet)
        if forcing is None:
            raise SystemExit(
                f"no CHOOSE selector names {force_sheet!r} — nothing to force"
            )
        print(f"[force] {force_sheet} = argument {forcing[1]} of {forcing[0]}")
    print(
        f"[setup] {time.monotonic() - started:.0f}s · "
        f"{len(trials[0])} literals perturbed · "
        f"{len(proof.pairing)} cells matched"
    )

    readings: dict[str, list[Mapping[str, object]]] = {}
    calc = UnoCalculator()
    calc.start()
    try:
        with tempfile.TemporaryDirectory() as scratch:
            readings["old"] = _recalculate_trials(
                old_path,
                trials,
                lambda ref: landing[ref],
                calc,
                Path(scratch),
                "old",
                forcing,
            )
            readings["new"] = _recalculate_trials(
                new_path, trials, lambda ref: ref, calc, Path(scratch), "new", forcing
            )
    finally:
        calc.stop()

    dormant = _dormant(old_raw, new_raw, proof.pairing)

    def oracle(refs: tuple[str, ...]) -> Mapping[str, Tier2Answer]:
        return _answer(
            refs,
            lambda ref: landing.get(ref, ref),
            readings["old"],
            readings["new"],
            dormant=dormant,
        )

    ladder = build_ladder(
        old_book,
        new_book,
        old_raw,
        new_raw,
        proof=proof,
        oracle=oracle,
        ineligible=ineligible,
    )
    violations = gate_violations(ladder, new_book, old_raw, new_raw, proof)
    diverged = sorted(
        ref
        for ref, item in ladder.verdicts.items()
        if item.reason == SOURCE_TIER2_DIVERGENCE
    )
    latent = sorted(
        ref for ref, item in ladder.verdicts.items() if item.reason == REFUSAL_LATENT
    )
    payload = {
        "mode": "control" if control else "oracle",
        "forced_sheet": force_sheet,
        "woke_zeros": wake_zeros,
        "forced_index": list(forcing) if forcing else None,
        "old": old_path,
        "new": new_path,
        "minutes": round((time.monotonic() - started) / 60, 1),
        "literals_perturbed": len(trials[0]),
        "cells": len(ladder.verdicts),
        "counts": ladder.counts,
        "shares": {
            verdict: round(ladder.fraction(verdict), 4) for verdict in ladder.counts
        },
        "reason_census": ladder.reason_census,
        "tier0_blockage_census": ladder.blockage_census,
        "verdict_by_blockage": ladder.verdict_by_blockage,
        "tier1_would_have_been_asked": ladder.tier1_would_have_been_asked,
        "tier0_overruled_by_raw": ladder.tier0_overruled_by_raw,
        "cone_sizes": cone_sizes,
        "diverged_by_tier2": len(diverged),
        "latent_divergences": len(latent),
        "latent_examples": [
            {"ref": ref, "detail": ladder.verdicts[ref].detail} for ref in latent[:10]
        ],
        "diverged_examples": [
            {"ref": ref, "detail": ladder.verdicts[ref].detail} for ref in diverged[:10]
        ],
        "gate_violations": violations[:20],
        "gate_violation_count": len(violations),
    }
    if control:
        #: The control's own gate: one divergence and no pair result
        #: may be read at all.
        payload["control_clean"] = not diverged and not latent and not violations
    Path(out_path).write_text(json.dumps(payload, indent=1))
    #: Every verdict, one per line, beside the report. « Where do the
    #: refused cells live » is then a question answered by reading
    #: rather than by re-running fourteen minutes of recalculation.
    dump = Path(out_path).with_suffix(".verdicts.jsonl")
    with dump.open("w") as handle:
        for ref, item in sorted(ladder.verdicts.items()):
            handle.write(
                json.dumps(
                    {
                        "ref": ref,
                        "verdict": item.verdict,
                        "reason": item.reason,
                        "blockage": item.tier0_blockage,
                        "sheet": ref.rsplit("!", 1)[0],
                    }
                )
                + "\n"
            )
    payload["verdicts_dumped_to"] = str(dump)
    print(
        json.dumps(
            {
                k: v
                for k, v in payload.items()
                if k not in ("diverged_examples", "latent_examples")
            },
            indent=1,
        )
    )
    if control:
        return 0 if payload["control_clean"] else 1
    return 0 if not violations else 1


def run_oracle(
    old_path: str,
    new_path: str,
    out_path: str,
    force_sheet: str = "",
    zeros: str = "",
) -> int:
    return _run_oracle(
        old_path,
        new_path,
        out_path,
        control=False,
        force_sheet=force_sheet,
        wake_zeros=zeros == "zeros",
    )


def run_control(
    path: str, out_path: str, force_sheet: str = "", zeros: str = ""
) -> int:
    return _run_oracle(
        path,
        path,
        out_path,
        control=True,
        force_sheet=force_sheet,
        wake_zeros=zeros == "zeros",
    )


def run_domain(old_path: str, new_path: str, out_path: str) -> int:
    """The domain round: narrow the band until the trials stop driving
    the model out of its own domain.

    Registered in the lane log (« The domain round ») with the 10%
    ceiling, the five bands and the five redraws fixed before any
    output. The previous round's finding is what this exists for: 192
    of 198 cells the oracle could not test were reading `#DIV/0!` or
    `""` in every trial — reached, and pushed past where the model
    computes.
    """
    import random

    import openpyxl

    from polar.tieout.recalc.uno_calc import UnoCalculator

    started = time.monotonic()
    old_book = read_workbook(old_path)
    new_book = read_workbook(new_path)
    old_raw, _ = read_raw(old_path)
    new_raw, _ = read_raw(new_path)
    ineligible, cone_sizes = _ineligible(new_path)
    proof = proved_unchanged(old_book, new_book)

    inputs: dict[str, float] = {}
    landing: dict[str, str] = {}
    for ref, old_ref in proof.pairing.items():
        new_cell, old_cell = new_book.cells[ref], old_book.cells[old_ref]
        if new_cell.formula is not None or old_cell.formula is not None:
            continue
        if new_cell.value is None or old_cell.value is None:
            continue
        value = float(new_cell.value)
        if _is_categorical(value):
            continue
        inputs[ref] = value
        landing[ref] = old_ref

    rng = random.Random(TIER2_SEED)
    accepted: list[dict[str, float]] = []
    new_readings: list[Mapping[str, object]] = []
    bands_used: list[dict[str, object]] = []

    calc = UnoCalculator()
    calc.start()
    try:
        with tempfile.TemporaryDirectory() as scratch:
            base = Path(scratch) / "baseline.xlsx"
            openpyxl.load_workbook(new_path).save(base)
            baseline = calc.recalculate(str(base)).values
            base.unlink()
            floor = _errors(baseline)
            ceiling = floor * (1 + DOMAIN_ERROR_CEILING)
            print(f"[domain] baseline errors {floor}, ceiling {ceiling:.0f}")

            for index in range(TIER2_TRIALS):
                chosen: dict[str, object] | None = None
                for band in DOMAIN_BANDS:
                    assignment = _banded(inputs, rng, band)
                    working = openpyxl.load_workbook(new_path)
                    for ref, value in assignment.items():
                        sheet, coordinate = _split(ref)
                        working[sheet][coordinate] = value
                    target = Path(scratch) / f"domain_new_{index}.xlsx"
                    working.save(target)
                    values = calc.recalculate(str(target)).values
                    target.unlink()
                    count = _errors(values)
                    print(f"[domain] trial {index} band {band}: {count} errors")
                    chosen = {
                        "band": list(band),
                        "errors": count,
                        "accepted": count <= ceiling,
                    }
                    if count <= ceiling:
                        accepted.append(assignment)
                        new_readings.append(values)
                        break
                else:
                    #: Registered: after the narrowest band, report what
                    #: was managed rather than pretending it passed.
                    accepted.append(assignment)
                    new_readings.append(values)
                bands_used.append(chosen or {})

            old_readings = _recalculate_trials(
                old_path,
                accepted,
                lambda ref: landing[ref],
                calc,
                Path(scratch),
                "domain_old",
            )
    finally:
        calc.stop()

    dormant = _dormant(old_raw, new_raw, proof.pairing)

    def oracle(refs: tuple[str, ...]) -> Mapping[str, Tier2Answer]:
        return _answer(
            refs,
            lambda ref: landing.get(ref, ref),
            old_readings,
            new_readings,
            dormant=dormant,
        )

    ladder = build_ladder(
        old_book,
        new_book,
        old_raw,
        new_raw,
        proof=proof,
        oracle=oracle,
        ineligible=ineligible,
    )
    violations = gate_violations(ladder, new_book, old_raw, new_raw, proof)
    diverged = sorted(
        ref
        for ref, item in ladder.verdicts.items()
        if item.reason == SOURCE_TIER2_DIVERGENCE
    )
    payload = {
        "mode": "domain",
        "old": old_path,
        "new": new_path,
        "minutes": round((time.monotonic() - started) / 60, 1),
        "literals_perturbed": len(inputs),
        "baseline_errors": floor,
        "error_ceiling": round(ceiling, 1),
        "bands": bands_used,
        "counts": ladder.counts,
        "reason_census": ladder.reason_census,
        "verdict_by_blockage": ladder.verdict_by_blockage,
        "tier0_blockage_census": ladder.blockage_census,
        "cone_sizes": cone_sizes,
        "diverged_by_tier2": len(diverged),
        "latent_divergences": sum(
            1 for item in ladder.verdicts.values() if item.reason == REFUSAL_LATENT
        ),
        "diverged_examples": [
            {"ref": ref, "detail": ladder.verdicts[ref].detail} for ref in diverged[:10]
        ],
        "latent_examples": [
            {"ref": ref, "detail": item.detail}
            for ref, item in sorted(ladder.verdicts.items())
            if item.reason == REFUSAL_LATENT
        ][:10],
        "gate_violations": violations[:20],
        "gate_violation_count": len(violations),
    }
    Path(out_path).write_text(json.dumps(payload, indent=1))
    dump = Path(out_path).with_suffix(".verdicts.jsonl")
    with dump.open("w") as handle:
        for ref, item in sorted(ladder.verdicts.items()):
            handle.write(
                json.dumps(
                    {
                        "ref": ref,
                        "verdict": item.verdict,
                        "reason": item.reason,
                        "blockage": item.tier0_blockage,
                        "sheet": ref.rsplit("!", 1)[0],
                    }
                )
                + "\n"
            )
    print(
        json.dumps(
            {k: v for k, v in payload.items() if k != "diverged_examples"}, indent=1
        )
    )
    return 0 if not violations else 1


def main() -> int:
    mode = sys.argv[1]
    if mode == "pair":
        return run_pair(*sys.argv[2:5])
    if mode == "domain":
        return run_domain(*sys.argv[2:5])
    if mode == "cost":
        return run_cost(sys.argv[2])
    if mode == "oracle":
        return run_oracle(*sys.argv[2:7])
    if mode == "control":
        return run_control(*sys.argv[2:6])
    raise SystemExit(f"unknown mode {mode!r}")


if __name__ == "__main__":
    raise SystemExit(main())
