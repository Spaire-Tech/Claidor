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
