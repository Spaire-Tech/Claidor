# Claidor — the plan of record

Updated 7 August 2026, before the overnight shift. One page: where we have
been, where we stand tonight, what comes next and in what order.

---

## Phase A — the substance (DONE)

The part that makes Claidor real rather than a demo:

- **Corpus at scale**: 11 actes uniformes, 17 versions (including the
  acquired 1997/1998/1999 texts and AUDCIF 2017), 5,094 articles; the full
  Juricaf CCJA collection, 1,268 decisions; ~4,200 citation links, every
  one machine-verified against the source text.
- **Librarian with guarantees in code, not prompts**: literal-quote
  verification, the version gate (undated version-dependent questions get a
  clarification, not a guess), authority computed from verified links.
- **Graded eval**: precision 0.494 → 0.648, traps 100%, versions 100%.
- **Dossiers backend**: matters, pièces with extraction, members,
  journalized questions, citations labelled fact vs law.
- **Search backend**: exact article/decision landings (all versions,
  padding-insensitive), French full-text with strict→loose fallback,
  chamber/date filters.
- **Old↔new equivalence map** for the AUPSRVE slice.

## Phase B — production (DONE, one step open)

- Render API + worker live, `api.claidor.com` healthy, DB migrated.
- Vercel frontend live at `app.claidor.com`, Google sign-in working.
- Onboarding funnel off; a first sign-in auto-provisions the workspace.
- **OPEN — the one blocking step: load the corpus into the production
  database.** Needs the external connection string (Render →
  claidor-postgres → Connect → External Connection). Until then the
  assistant truthfully answers that the library is empty.

## Update — 8 August, morning

Phase B's open step closed: the corpus is LOADED in production (5,094
articles, 1,268 decisions, 4,167 verified links, 14 equivalences), and the
app flipped live. Four review cycles on real answers produced structural
guarantees: deadlines computed in code (CCJA method, injected as fait
foi), authority anchored to the first-cited article with a named
denominator, corpus PDF word-breaks repaired, answer form contract
(answer-first, one synthesis table), smooth word-level streaming, source
dedupe + longer quotes, system labels hidden with a code-owned badge.
The mentor's verdict on answer four: fit to put in front of a lawyer.

## Phase C — the design IS the product (CURRENT)

Decision of record (founder, 7 Aug): **exact design first, features
wired second.** No interpretation, no placeholders invented by me — the
designed file is the product's face.

- C1. DONE — the design ships byte-for-byte at the dashboard root behind
  auth. CSP fixed (`blob:` scripts/fonts) — the deployed bytes were
  verified rendering headlessly under the deployed policy, zero errors.
- C2. IN PROGRESS — **native port**: the design's markup+logic
  (docs/design/) converted to real JSX in the app, pixel-identical,
  verified against the original. This replaces the framed file with code
  we can wire.
- C3. Wire screens to real data, one at a time, without moving a pixel.
  Order, chosen so each step uses backend that already exists:
  1. **Assistant** → librarian SSE (stream, citations, authority, version
     gate). Scripted answers out, real corpus in.
  2. **Recherche** → search API (filters map to chamber/date/act).
  3. **Bibliothèque** → corpus acts/versions/articles.
  4. **Dossiers** → real matters: list, detail, pièces, per-matter ask
     with fact/law split, journalized record. Browser upload UI added.
  5. **Historique** → journalized questions (add persistence for
     non-dossier asks — small backend addition).
  6. **Analyses** → endpoints over what exists: autorité (verified
     links), historique (versions), citations (graph); **comparer** needs
     the word-level diff engine (new).
  7. **Panel extras** → decision summaries (argué/jugé/articles) and
     similar decisions (citation overlap) — new backend, precomputed.
  8. **Veilles** → new backend: watch model + signal feed on corpus
     updates; email later.
  9. **Lecteur** → new backend: extract citations from an uploaded
     document, verify each against the corpus (the machinery — quote
     verification, version gate, authority lines — already exists; the
     assembly is new).

Design-content rule for C3: scripted content in a screen survives until
that screen's real wiring lands, then it is replaced wholesale. The nine
screens keep working at every commit.

## Phase D — after parity

- Settings/équipe surfaced inside the design's own chrome; invites.
- Resend email (login codes from claidor.com), veille emails.
- Treatment-label review session (~30 links at /corpus-links → agreement
  rate). Gazette cross-checks (needs the founder's ohada.com account).
- Own Anthropic key when customers arrive; measurement of citation
  precision continues each corpus reload.

## Standing constraints

- Fidelity: the reference is `clients/apps/web/public/design/claidor-v1.html`
  (same artifact unpacked in `docs/design/`). Native screens are diffed
  against it; divergences are defects.
- Trust: no invented law, ever, in anything wired. Quotes verified
  literally; authority computed, not asserted; versions gated by date.
- Secrets never in the repo. The Anthropic key lives in git-ignored env.
