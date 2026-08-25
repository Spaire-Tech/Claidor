# Atelier — the lane log

Product and delivery (Tracks G + H). Branch `swens/atelier`, based on
`claude/pierce-phase-6-writing-mjkaj6`'s tip per `lanes.md`. Engine
modules untouched; per-finding data reaches this lane through the
`evidence` dict.

## 25 August 2026 — lane opened; the posture doc (H2)

Read `notes.md`, `lanes.md`, `swens.md`, `swens-plan.md`,
`swens-product-build.md` before touching anything. One note on
provenance: this session was started on branch
`claude/atelier-agent-onboarding-vux8pu` (the main-merge tip) rather
than the phase-6 branch the lane prompts name; `swens/atelier` was
created from the phase-6 tip as `lanes.md` requires, which strictly
contains everything the session branch had except the merge commits
themselves.

**H2, the security posture doc — written:**
`docs/pierce/security-posture.md`. Every « enforced » claim was
checked against the code today, not recalled: all 41 routes in
`server/polar/tieout/endpoints.py` audited mechanically for the
membership gate (every deal-scoped route has it; the seven that don't
are self-, owner- or organization-scoped by design and the doc names
each), the storage path and presign TTL read from
`storage.py`/`config.py`, the panel-token properties from the route
itself, the agent boundary from `tieout/agent/service.py`.

**Two things the founder should know from the audit, stated in the
doc rather than smoothed over:**

1. The team screen shows every organization member the *names* of the
   deals each person is on (`/tieout/team`, deliberately org-scoped —
   `repository.py:805` marks it deliberate). Contents stay closed, but
   « being at the firm grants nothing » has this one metadata
   exception. The doc names it plainly (§ 3). If the founder wants
   deal names hidden there too, that is a product decision I will
   implement — not one I made silently either way.
2. « One configurable client so a firm can point Swens at its own
   cloud deployment » (`swens.md` § 7) is today one construction
   point with a configurable *key*, not a configurable *endpoint*.
   The doc says « planned, not shipped » (§ 8) rather than claiming
   it.

Next, in charter order: the sales demo kit (#18).

## 25 August 2026 — the demo kit (#18), built and run end to end

`server/scripts/demo_deal.py`. What « demo kit » means was
reconstructed from the record, since #18's original task text lives in
a session tracker that is gone: `swens.md` § 7 (« the demo is the
product » — a prospect's own model, ideally two versions, flagship
findings first, the delta between their own versions, routine findings
never the opening) and H1's DONE test (« a stranger's two versions
produce the demo — findings + delta — within a day, hands off »). The
kit is that operation as one command:

    uv run python -m scripts.demo_deal --name "Project Falcon" \
        v1.xlsx v2.xlsx [--deck deck.pptx] [--memo memo.docx] [--brief out.md]

It builds the deal through the product's own ingest and checks — the
workspace, report sheet and marked-up download are live against it the
moment it finishes — and prints the demo brief in § 7's order. Honesty
rules in the script's docstring: every number is read back from the
stored rows; the version delta is findings-by-fingerprint between the
runs the kit itself performed plus the product's own cell diff, and it
is *not* called the Watch.

**Run for real, not just written.** This container had no working
backend at first: Python was 3.14.0rc2 (pydantic fails on it —
`typing._eval_type` changed between rc2 and final) and there was no
Docker, so no Postgres/Redis/Minio. Fixed locally: uv upgraded
(0.8.17 → 0.12.5) to install CPython 3.14.0 final, and the three
services installed natively (PostgreSQL 16, Redis, Minio with the
committed dev credentials from `.env.testing`). None of that is a repo
change. With services up, the full endpoint suite passes here —
`tests/tieout/test_routes.py`: **61 passed** — so the « container
cannot run the database fixtures » caveat in my charter turned out to
be avoidable, and no test is being documented instead of run.

The end-to-end proof, against a scratch database: cascade model as v1;
v2 made with the product's own writer (a constant typed over
`Model!F16`, replacing `=F10+F13+F14`); the broken deck alongside.
The kit's brief: the introduced defect found and named (« Reported
EBITDA FY2027E contains a fixed value while the rest of the row is
calculated » — Model!F16), the cell diff (56.556 → 59.056, 1 changed,
0 added, 0 removed), 113 deck figures reconciled with the four planted
drifts among the 14 drifting, and the statement checks *abstaining* on
the cascade model (no balance sheet, no debt schedule — said in
words, not skipped). The « open with these » section correctly does
not appear when no statement-check error exists: leads are printed
only when they are real.
