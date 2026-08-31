# House rules, demonstrated — Piece 13 (registration first)

Written 31 August 2026, on the branch for piece 13. `pieces.md` § 4
row 13 says the mechanism is « built and wired, never demonstrated ».
This document is the demonstration: the audit of what a firm can
actually switch off today, the criteria registered **before** the
demonstration was run, and then the two reports.

## 1. The audit — what a firm can switch off today, end to end

Read this session from the files named, per `notes.md`.

**The mechanism is where the lead believed** and it holds together:

- Storage and screens: `polar/tieout/endpoints.py` — `_house_rules`
  serves the catalogue with each rule's on/off state,
  `get_house_rules` / `put_house_rules` read and write the firm's row,
  and the update refuses any key that is not in the catalogue
  (`RULE_NAMES` ∪ `ANALYTIC_RULE_NAMES`), whole, with a 422.
- The report obeys: `polar/tieout/service.py` `_audit_one` drops every
  finding whose rule is in the firm's `rules_off`, **before** the
  error/smell counters are taken (the counters are properties over the
  filtered list), keeps only the surviving analytical rules' pass
  tallies and abstentions, and the run summary names the switched-off
  rules under `rules_off` — a rule off is a decision on the record,
  never a silence. The version-scoped read (`audit_of_version`) is the
  same computation with a second caller.
- The Settings screen (`clients/apps/web/.../screens/Settings.tsx`)
  renders the rule list **only** from the API's catalogue — it never
  invents a row — and its five route tests pass here
  (`tests/tieout/test_routes.py::TestHouseRules`, run 31 Aug, 5 passed).
  The three greyed rows (« Cross-references », « Defined terms »,
  « House style ») are marked « Not available yet », which is honest.

**The known gap, confirmed — and half of it is not a gap.** The lead
recorded five rules the engine emits but the catalogues miss:
`gapped-test`, `typed-over-beat`, `broken-name`, `currency-mismatch`,
`scale-mismatch`. Opening `audit.py` § `audit()`:

- `typed-over-beat`, `currency-mismatch`, `scale-mismatch` are
  implemented and unit-tested but **deliberately not wired** — their
  registered verdicts (`a3-beat-families.md`: no corpus that can
  measure the beat check; `e3a-unit-mismatch.md`: 103 findings, every
  one a false alarm) took them out of the run. The engine does **not**
  emit them, so their absence from the settings catalogue is correct:
  listing them would put a switch on the screen wired to nothing,
  which is the defect in the other direction.
- `gapped-test` (a check formula that walks cells one by one and skips
  a live block) and `broken-name` (defined names storing #REF! or
  pointing into another workbook) **are emitted on every audit run** —
  the conscience test pins both on the founder's own pre-app model —
  and are in neither `RULE_NAMES` nor `HEADLINES`. Consequences, each
  confirmed in code this session: a firm cannot switch them off (the
  PUT refuses the key as « not a rule the audit runs », which is
  false); the Settings screen never lists them; and their findings
  carry an empty headline in the report evidence. The web side had
  already noticed and said so (`files.ts`, « reported to the lead »).

So the audit's answer: **19 of the 21 rules the engine runs can be
switched off end to end; the 2 that cannot are `gapped-test` and
`broken-name`, and that is the defect this piece fixes.**

## 2. The registration — frozen before the demonstration was run

**The model.** One workbook, both firms:
`server/scripts/cascade/example_preapp_model.xlsx` — the founder's
real file, the audit's conscience. Its full report under default rules
is already pinned by `test_the_example_preapp_model_reports_the_defensible_seven`
and was re-measured cold this session before these criteria were
frozen: 12 mechanical findings (4 errors, 8 smells), no analytical
finding, 4 analytical abstentions (no balance sheet, no opening/closing
pairs, no debt schedule twice), and one passing check row
(`model-own-check`, 1 of 1 clean).

**The two firms.** Two organizations, each holding a deal with the
same model bytes:

- **Firm A** — shipped defaults. Touches nothing; every rule on.
- **Firm B** — its house rules switch off five rules, spanning both
  families and all three layers of the report:
  `broken-name`, `gapped-test`, `long-formula` (mechanical — the first
  two being the newly adopted rules, `long-formula` proving the
  mechanism is not special-cased to them), `model-own-check` (whose
  pass row must disappear), `balance-sheet` (whose abstention must
  disappear).

**Pass criteria — all of them, and nothing else may differ:**

1. Before the catalogue fix, Firm B's PUT is refused with 422 naming
   `broken-name` and `gapped-test` — the defect, on the record.
2. After the fix, the same PUT succeeds, and both firms' GET
   house-rules serves all 21 rules the engine runs — 15 + the 2
   adopted mechanical rules + 6 analytical (via their two catalogue
   families) — Firm A all on, Firm B with exactly the five off.
3. Firm A's audit report: the 12 findings above; summary
   `errors=4, smells=8`, `rules_off=[]`, 4 abstentions, the
   `model-own-check` pass tally present.
4. Firm B's audit report on the same bytes: exactly the 12 minus the
   6 findings under the off rules (`broken-name` ×2, `gapped-test` ×1,
   `long-formula` ×3) = 6 findings; summary `errors=3, smells=3`,
   `rules_off` names exactly the five, sorted; 3 abstentions
   (`balance-sheet`'s gone, the other three word-for-word Firm A's);
   no pass tally.
5. Every finding Firm B keeps is **identical** to Firm A's counterpart
   in rule, location, title, detail and severity — switching rules off
   must not reword, reorder within a rule, or re-grade what remains.
6. The demonstration runs through the real HTTP surface — the same
   PUT the Settings screen sends, the same check-run POST, the same
   findings GET the Grid reads — not through the engine bypassing the
   stored row.

Anything outside these six — a finding that moves, a counter that
disagrees, an abstention that survives a switched-off rule — fails the
demonstration.

## 3. The results

*(Registered empty; filled only after the run.)*
