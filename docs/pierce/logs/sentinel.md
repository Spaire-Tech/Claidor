# Sentinel — lane log

Sentinel's running log, plain language, newest entries at the bottom.
Charter: `lanes.md`. Canon: `notes.md`. I am the only lane that may
change what the engine reports; every findings change runs the full
golden-master gate and regenerates the baseline in the same commit.

## 25 August 2026 — lane opened

- Read `notes.md`, then `lanes.md`, from the branch tip the lanes are
  based on (`claude/pierce-phase-6-writing-mjkaj6`). Created
  `swens/sentinel` from that tip, as the charter says. One note of
  record: this session was opened by the platform on an auto-named
  branch cut from `main`, which does not carry the A3/A7/A1 work; the
  charter and `lanes.md` both name the pierce branch's tip as the
  base, so that is the base. Said here so the deviation from the
  session's auto-branch is named, not silent.
- Environment: `uv sync` clean; engine imports; the 27-file AU-UK
  corpus rebuilt from the committed fetcher (all 27 fetched, sizes
  matching). Same shared 15GB container class the A1 record warns
  about: timings here are noise, findings are not.
- Started the precondition sweep of the unmodified engine (the gate
  must be green on this machine before any change lands, per the A7
  protocol's discipline). Heavy jobs run alone; nothing else heavy
  runs beside it.
- First task: A3 candidate 1, totals-row sibling disagreement.
  Registration written and committed before any result is computed:
  `a3-sibling-totals.md`, with the planting harness under
  `server/scripts/planting/`.

## 25 August 2026 — candidate 1 implemented behind its tests

- The detector (`_sibling_totals` in `audit.py`, rule
  `inconsistent-total`) implemented exactly as registered: SUM-only
  membership, coverage + surround signature, consensus of 3, deviants
  a strict minority, the four guards. Ten unit tests
  (`test_audit_sibling_totals.py`) cover the four planted shapes and
  the five silence cases; all pass. The corpus verdict — planted
  recall, false-positive price, gate diff — is still owed and comes
  next; nothing is claimed for the check yet.
- Tests, honestly: the tieout suite runs conftest-free here (the
  repo's root conftest cannot load on this container's Python 3.14
  release candidate — a pydantic `_eval_type` incompatibility). Six
  test files that import the API schemas fail at *collection* for
  the same environmental reason, unmodified tree and modified tree
  alike (verified by stashing my change and re-running). The 409
  engine-side tests that do collect — audit, shapes, structure,
  workbook, writer among them — pass with my change, plus the 10 new
  ones. `ruff` clean; `mypy` adds no new error over the two that
  pre-exist in `audit.py`.
- One case for another lane, parked here per the charter: the web
  workspace's category map (`clients/apps/web/src/components/
  Workspace/files.ts`, Atelier's) buckets rules into families and
  falls back to « Other findings » for unknown keys. If candidate 1
  is adopted, `'inconsistent-total': 'Probable formula defects'`
  belongs in that map — same family as `inconsistent-row` and
  `skipped-cell`. Nothing breaks without it; the finding just files
  under the fallback. For the lead to route when adoption lands.
