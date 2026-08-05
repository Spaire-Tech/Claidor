# Claidor corpus — Phase 1 source acquisition record

Everything below is public domain or openly licensed; provenance is recorded
per row in the database (`provenance` JSONB on articles and decisions).

## The two acts (AUPSRVE)

### 2023 act — in force 16 February 2024

- Adopted 17 October 2023 (Kinshasa); published J.O. OHADA, special issue,
  15 November 2023; in force 16 February 2024 (art. 338 / art. 9 revised
  Treaty); 17 member states.
- **Authority (gazette PDF):**
  `https://www.ohada.com/uploads/actualite/7010/J.O._special_AUVE_15.11.2023.pdf`
- **Structured copy (the important one):** SenLII publishes the act in
  Akoma Ntoso under FRBR URI
  `/akn/aa-ohada/act/2023/organisation-des-procédures-simplifiées-de-recouvrement-et-des-voies-d-exécution/fra@2024-07-02`
  (PDF rendering at `…/source.pdf`; try `.xml`/`.html` forms first — if only
  PDF is exposed, request the XML from Laws.Africa). CC BY 4.0 / no copyright
  claimed in legislative content. If the XML is retrievable, the article-level
  chunker is largely pre-built, in the exact standard our identifiers adopt
  (`legal_acts.akn_work_uri`, `legal_act_versions.akn_expression_uri`,
  `legal_articles.akn_eid`).
- **Cross-check only (never authority):**
  `https://droitguineen.com/ohada/aupsrve-procedures-recouvrement`

### 1998 act — still governs proceedings started before 2024-02-16

- Adopted 10 April 1998. Repealed prospectively only: proceedings and
  enforcement measures commenced before 16 February 2024 remain governed by
  the 1998 text (this is the `transitional_rule` on the version row).
- Source: `https://www.ohada.com/textes-ohada/actes-uniformes.html`
  (canonical list with gazette references). Lexbase `A0099YTT` as backup.

## CCJA decisions

- **Juricaf (primary harvest):** `https://juricaf.org`, free. Deterministic
  URLs: `https://juricaf.org/arret/OHADA-COURCOMMUNEDEJUSTICEETDARBITRAGE-{YYYYMMDD}-{NNNYYYY}`.
  Each record carries country/chamber/number/date, a URN:LEX
  (`urn:lex;ohada;cour.commune.justice.arbitrage;arret;…`), and a keyword
  header naming the articles applied — the human-written seed of the citation
  graph. We store the header verbatim (`court_decisions.keyword_header`),
  seed `court_decision_article_links` rows from it with
  `seed_source='juricaf_header'` and `status='proposed'`, then verify each
  edge against the decision body before it may surface
  (`status='verified'`). Search: `https://juricaf.org/recherche/{query}/facet_pays:OHADA`.
- **Ohadata (ohada.com/UNIDA):** J-codes (`Ohadata J-YY-NNN`) stored as
  `ohadata_code` — practitioners cite them, search must match them.
- **IDEF:** `https://www.institut-idef.org/ohada/la-jurisprudence-ohada/` —
  cross-check for slice membership and grouping conventions.

## The Phase 1 slice — saisie-attribution des créances

- **1998 articles:** 153, 156, 157 (incl. 157-1, 157-3), 158, 160, 164, 166,
  168, 169, 170, 171, 172, plus 49 (general enforcement-judge provision —
  CCJA settled that 172 displaces it for saisie-attribution appeals:
  arrêts 003/2005 and 054/2005) and 335–337 (transitional/final).
- **2023 articles:** same subject matter, renumbered (act runs to 338).
  Build the old↔new equivalence map while loading
  (`legal_article_equivalences`) — the thing practitioners test first.
- **Seed decisions** (verify + expand from Juricaf; nearly all interpret the
  1998 text — exactly why version tagging carries the demo):
  see `server/scripts/corpus_slice_seed.py`.

## Order of work

1. Pull the JO PDF and the SenLII AKN version of the 2023 act; test whether
   structured XML is retrievable from the FRBR URI.
2. Pull the 1998 act from ohada.com.
3. Extract the slice articles from both; build the equivalence map.
4. Harvest CCJA decisions from Juricaf by keyword (`saisie-attribution` +
   each article number), keeping URN:LEX and Ohadata J-codes.
5. Seed article↔decision links from Juricaf headers; verify each against the
   decision body before it enters the graph.
6. Diff the JO text against a second source on a sample of articles — one
   wrong article number poisons the graph in a way no code catches.

## Environment note

The Claude Code environment's network policy must allow these hosts before
harvesting can run from sessions: `www.ohada.com`, `senlii.org`,
`juricaf.org`, `droitguineen.com`, `www.institut-idef.org`.
