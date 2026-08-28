# Lead handoff — start here if you are the lead and remember nothing

For the lead session (or its successor). Read `notes.md` first — the
canon table — then this file. Never answer a question of record from
memory; these files exist so you don't have to.

> **28 August 2026 — the team below no longer exists.** The founder
> stood the lanes down (« we are going to kill the agents… you and i
> will do piece by piece »). Ledger builds every piece, one at a time,
> from **`pieces.md`** — the working list. One verifier agent remains
> and runs only when the founder asks, after a piece is complete, to
> hunt for bugs and gaps; it never builds. The section below is kept
> because its operational lessons and record pointers are still true;
> its team shape and its 25 Aug state snapshot are not.

## Who you are, and the shape of the team

You are **Ledger**, the lead/integrator for the Swens build, working for the
founder (they/them; address them plainly, never mislead them —
their standing rules are in `notes.md` and they are absolute).
Five lane agents ran as their own web sessions, created 25 Aug 2026
and stood down 28 Aug:
**Sentinel** (engine findings — sole owner of `audit.py` and the
golden-master baseline), **Dynamo** (recalculator, part-blocked on
the Track B machine), **Prism** (the Watch), **Scribe** (the Chain),
**Atelier** (product & delivery). Their constitution is `lanes.md`
(ownership, frozen interfaces, the one hard rule, YOUR integration
loop); their charters are `lane-prompts.md`. You cannot message
their containers — coordination is via their branches
(`swens/<name>`), their logs (`docs/pierce/logs/<name>.md`), and the
founder. No lane merges itself; you merge, one lane at a time, tests
plus the full gate every time.

## The integration branch

`claude/pierce-phase-6-writing-mjkaj6` — all of 23–25 Aug's work,
all lane branches based on its tip. The founder merges to main.

## State snapshot (25 Aug 2026, evening)

- **Done, measured, certified:** Track F (writer + changeset + the
  marked-up model, verified on the real 27-file corpus); A2 except
  ExceLint (scorer validated, replicated digit-for-digit); A3's
  mining (five candidates, four refusals — `custodes-mining.md`);
  A7 normalizations adopted (two self-refusals on the way, two true
  findings recovered — `a7-normalization-protocol.md`); A1 rounds
  1–2 (parse caching; ~2× audit; gate-clean corpus-wide —
  `a1-performance.md`).
- **In lanes' hands now:** A3 candidates loop + A4 + A1 next round
  (Sentinel); B-track prep (Dynamo); C1–C2 (Prism); D1–D2 (Scribe);
  posture doc + demo kit + markup endpoint test (Atelier).
- **Blocked on the founder:** ExceLint repo approval (task #55; the
  add_repo request may still be pending); the Track B machine
  (LibreOffice ≥ 25.8 + python-uno — Dynamo writes the exact spec);
  the chat-mechanism discussion; AER files (need a human browser);
  A1's stopwatch claim (needs a quiet machine — this box is ±30%).
- **None of the plan's four completion proofs has started.**

## Operational lessons already paid for

- Heavy workbook jobs run **alone** — a concurrent pair OOM-killed a
  sweep on this 15GB box.
- Single timings on this box mean nothing; back-to-back A/Bs and
  per-file sweep comparisons only.
- `create_session` from inside a session is approval-gated and the
  founder's clicks never reached it (five refusals) — sessions get
  created by hand from `lane-prompts.md`.
- Run corpus scripts as modules from `server/` (`uv run python -m
  scripts.X`); tests without services use `--noconftest` (the 99
  fixture errors are pre-existing, verified by stash).

## Where every record lives

`notes.md` (canon) · `swens.md` (product, wins over everything) ·
`swens-plan.md` (the plan + amendments) · `lanes.md` (team rules) ·
`worklog.md` (what happened, newest last) · per-topic protocol docs
(`a1-performance.md`, `a7-normalization-protocol.md`,
`custodes-benchmark.md`, `custodes-mining.md`) · lane logs under
`logs/`. If a thing matters and is not in one of these files, write
it into one before doing anything else — that rule is why this file
exists.
