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
