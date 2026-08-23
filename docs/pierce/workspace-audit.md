# Workspace audit — the founder's build, read against the Ambre doc

23 August 2026. Source: `Ances_Workspace_1.html` (bundle → 2,233-line
app source + 380k of markup). Structure: one component, `s.view` for
the dock, `s.project` / `s.deal` / `s.pjTab` beneath it. 106 wired
click handlers, **no dead buttons** — every handler resolves. The
craft is high; what follows is what a second pair of eyes finds.

## A. Broken — things that are wrong today

1. **The Findings tab's chips contradict its own list.** It renders
   `ovChips` (All 14 · Material 5 · Significant 5 · Observation 4)
   above `fnGroups`, which holds 11 findings (5 / 5 / 1). The
   *correct* chips exist — `fdChips`, All 11 — and are never used.
2. **A whole second Findings implementation is dead code.**
   `fdGroups` / `fdChips` / `fdCols` (with `was` → `should`, a `why`
   sentence, per-row actions, and a Figure column) render nowhere.
   Two designs for the same screen, one live, one better.
3. **The model review page is unreachable.** The `hasDeal` block
   (hero, summary, trend, findings, provenance rail, documents,
   decision log) needs `s.deal`; the only things that set it —
   `open` and `clean` — are never rendered. `pjOpenModel` navigates
   to Ask instead of opening the model.
4. **Overview renders three of its six blocks.** `ovTodo` (what
   needs you), `ovFindings` (top findings), `ovActivity` and
   `goFindings` are all built and unrendered. Live Overview =
   chips + trend chart + three sentences.
5. **The whole front hall is orphaned.** `vHall`, `hallProjects`,
   `hallSummary`, `hallStarters` — the cross-project "six projects,
   two need attention" screen — is unreachable and unlinked.
6. **Coverage is never shown.** `passes` (11 checks that passed,
   each citing its standard), `coverage` (6 things that could not be
   checked, each with its reason) and `standards` are computed and
   rendered nowhere. The Ambre doc calls this non-negotiable
   ("102 checked, 26 not, here is the reason"); today it survives as
   one summary sentence and a checkbox in the export dialog.
7. **Compare workbooks has no result.** "Find differences" calls
   `this.go('assist')` — it navigates to chat. A top-level tab with
   no output.
8. **Severity colours contradict themselves.** Text colours
   (`SEVFG`): Significant = blue, Observation = purple. Dot colours
   (`HDOT`, chips): Significant = amber, Observation = blue. The
   same word is two colours depending on the shape it's in.
9. **Four severity vocabularies.** Material / Significant /
   Observation (findings) · "3 errors, 5 warnings" (project list) ·
   "two High" (hall) · "11 checks fail" (deals list).
10. **The arithmetic doesn't reconcile.** Deals list: 36 pass + 11
    fail + 5 not run = 52. Check-a-model: "Forty-one checks ran."
    `PASSES` lists 11 rows. Pick one and derive the rest.
11. **Two speed claims, neither matched to the engine.**
    `FRONT_FACTS` says 3m 41s for a 214k-formula model; the Ambre
    doc promises 600k cells in under a minute. Today's engine does
    neither reliably (perf round is Track A1).
12. **A truth claim that isn't true.** Compare's hint: "Both
    workbooks read locally. Nothing leaves the file." Files are
    uploaded; "nothing leaves the file" means nothing.

## B. Missing — measured against the Ambre doc's six parts

- **The Watch — absent.** No version comparison anywhere. Versions
  is a stub (`{{ pjTab }} — next up`). The doc's strongest claim
  ("three cells changed and nothing else behaves differently") and
  the demo opener both live here.
- **The Chain — a picture, not a mechanism.** Sources shows the
  document diagram; there is no link map, no propose→confirm flow,
  no page viewer with a highlight box, no "typed number with no
  source" list. Overview *mentions* four unsourced inputs in
  unrendered code; nothing stands behind it.
- **Deliverables — stub.** No deck or memo checked against the
  model, though the tie-out engine for it exists and is measured.
- **Record — stub.** The evidence locker exists inside the
  unreachable deal page; there is no project-level record.
- **Outward checks — nothing.** Filings, rates, "the model says 412
  and the filing says 409".
- **Unit checks — nothing.** The doc's flagship finding (a monthly
  figure in an annual line) has no finding class and no rule in
  `AUDIT_RULES`.
- **Behavioural checks — nothing**, and no state for the
  recalculation engine being validated or refused.
- **Refusals — data without a screen.** `COVERAGE` carries the
  reasons; nothing displays them.
- **Materiality threshold — never shown.** Severity has no
  denominator, so "Material" is an assertion.
- **Run provenance** — exists (`railItems`: owner, run date, version,
  standards, coverage) but only on the unreachable page.
- **Finding status** — accept-with-note exists on the unreachable
  page; the live Findings tab has no accept / explain / fixed.
- **Report** — an export *dialog* exists; no report artifact.

## C. States never drawn

Clean project (no findings) · empty documents · empty versions ·
empty deliverables · search with no results · upload failed ·
unsupported or password-protected file · file too large · model
still checking (in a project, not just Check-a-model) · engine
refused this workbook, and why · permission denied on a closed deal ·
offline / connection lost · a finding whose cell no longer exists in
the current version.

## D. The tabs question

Six is too many *now* — but not because Overview shows it all
(Overview shows almost nothing today). The right cut is four:

**Overview · Findings · Versions · Documents**

- **Versions** absorbs the Watch and stops being a stub — it is the
  differentiator, not a filing cabinet.
- **Documents** absorbs Sources *and* Deliverables: papers in and
  papers out, one tab with two sections. Two nearly-empty tabs read
  worse than one full one.
- **Record** folds into Overview (activity) and Versions (decisions
  attach to the version they were taken against). It earns its own
  tab when a customer asks for the audit trail as a deliverable.

## E. Consistency and craft notes

- Two findings data shapes: `fnGroups` (wheres[], grid, tooltips,
  sheet tabs) vs `fdGroups` (was/should, why, action). Pick one and
  delete the other; the second's *content* is better, the first's
  *evidence display* is better.
- The Findings header says "Finding · Where · Severity" while the
  unused `fdCols` defines four columns including Figure. Decide
  whether the figure is in the row or only on open.
- `COVERAGE` copy speaks in the third person about the product
  ("Ances reads formulas, not code") while the rest of the copy
  speaks plainly. Keep one voice.
- The severity dot in the deals list encodes *state* (amber =
  findings, blue = stale) while the same dot shape in findings
  encodes *severity*. Same shape, two meanings.

## F. What is genuinely strong

The voice is consistent and unusually good ("Saved 40 minutes ago,
so Friday's verdict no longer stands"). Every button is wired.
The check-a-model run has real phases. The evidence display —
spreadsheet grid with the offending cell highlighted, was/should
tooltip — is better than anything the competitors show. The
provenance rail is exactly right, and only needs to be reachable.
