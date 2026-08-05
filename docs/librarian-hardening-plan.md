# Librarian hardening plan (founder direction, 2026-08-06)

Five items. The unifying principle: **trust properties are enforced in code,
never delegated to the system prompt** — the model can't be talked out of a
code branch, and a computed number can never be more confident than the data.

## 1. Authority line: computed, scoped, auditable

- The « Autorité : … » line is REMOVED from the model's instructions. The
  service computes it from verified `court_decision_article_links` over the
  articles actually cited in the answer.
- Copy names its own scope: « … dans le corpus chargé ».
- Label from fixed thresholds, in code:
  - 0 decisions → « texte seul — aucune décision dans le corpus chargé »
  - 1 → « autorité limitée — décision unique dans le corpus chargé »
  - 2–3 → « plusieurs décisions (N) dans le corpus chargé »
  - 4+ AND spanning ≥ 3 distinct years → « ligne jurisprudentielle
    constante — N décisions dans le corpus chargé »
  - 4+ but narrow span → « plusieurs décisions (N) dans le corpus chargé »
- Emitted as a structured SSE `authority` event: {label, count, decisions:
  [{number, decided_on, id}]}. UI renders the pill from the EVENT (not from
  answer text) and lists the underlying decisions on click — the number is
  always auditable.

## 2. Version gate: mandatory clarification, in code

- Pre-answer step (cheap model, strict JSON): classify
  {version_dependent: bool, date_present: bool, anchor_date: date|null}.
- Branch in code:
  - version_dependent && !date_present → DO NOT answer. Emit a
    `clarification` event: « À quelle date la procédure a-t-elle été
    engagée ? (L'acte applicable dépend de cette date — bascule au
    16 février 2024.) »
  - Caller may resend with `answer_both_versions: true` (user declined to
    give a date) → answer under both acts side by side, labeled.
  - date present → answer under the act in force at that date; the other
    act mentioned only as context.
- Every answer carries structured metadata (`versions_used: ["1998"|"2023"]`)
  in the `done` event — not just prose.

## 3. Graded eval (separate from pytest, one command)

- Fixture: `server/evals/librarian_fixtures.json` — 25 in-scope questions
  with hand-verified expected anchors (articles, version, key holdings) +
  10 out-of-slice traps (bail commercial/AUDCG, droit des sociétés/AUSCGIE,
  arbitrage/AUA…). Composition: ~15 substantive, 5 version-dependent (mix
  of dated and deliberately undated to test the gate), 5 thin-corpus edges.
- Command: `uv run task librarian_eval` → three numbers + diff vs previous
  run (results archived under `server/evals/runs/`):
  1. Citation precision — each cited article/decision must support the
     attached claim, judged against source text.
  2. Refusal rate on traps — target 100%; ANY fabricated citation on a trap
     is a hard failure of the run, not a deduction.
  3. Version accuracy — right act chosen, or correctly asked for the date.
- Never reported together with the software test suite: pytest counts say
  nothing about legal accuracy.

## 4. Treatment labels: model proposes, human accepts, rate recorded

- `DecisionArticleLink.treatment` gains an explicit unverified default
  (`treatment_status: unverified|proposed|accepted|corrected|rejected`).
- Model pass proposes a label (applique / distingue / interprète /
  mentionne) WITH a short supporting quote from the decision.
- Minimal backoffice screen: article, decision, proposed label, quote,
  accept / correct / reject.
- Hand-review ≈30 links; the agreement rate is the published treatment
  accuracy number ("who verified them" → this).
- Until accepted, the UI shows the citation WITHOUT a treatment claim.

## 5. Old↔new equivalence map (right after #2 — same feature, two views)

- Populate `legal_article_equivalences` for the slice; used by the version
  gate's both-versions answers and by the reader's « Ce qui a changé » view.

Status: plan committed 2026-08-06; execution begins with #1 and #2.
