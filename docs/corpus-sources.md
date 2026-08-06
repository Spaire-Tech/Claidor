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

## Acquisition log — 2026-08-05 (first harvest)

- **2023 act**: SenLII AKN HTML acquired and parsed — 448 articles, zero
  duplicates, numbering 1…338 with compound articles; loaded into the
  database with provenance. Raw XML is not exposed (`.xml` 404s); the HTML
  carries the full structure. commons.laws.africa serves PDF/EPUB renderings.
- **1998 act**: NOT yet acquired. ohada.com gates its PDFs
  (`/telechargement/actes-uniformes/AUPSRVE-1998_fr.pdf`) behind a free
  account login; droitguineen carries only the 2023 revision;
  agp.africanlii.org (which likely hosts the historical expression) is not in
  the environment's network allowlist. Options: allowlist
  `agp.africanlii.org` + `api.laws.africa`, or download via a free ohada.com
  account and drop the PDF into corpus/raw/.
- **Decisions**: 8 of 11 seeds harvested from Juricaf (raw pages in
  corpus/raw/decisions/, parsed + loaded). URL/URN quirks found: older
  records use a number-only suffix (`…-20100610-038`) and a year-less URN
  tail. Not found on Juricaf: 221/2025 (probably not yet indexed),
  054/2005 and 003/2005 (2005 coverage looks thin — try Ohadata/IDEF), and
  026/2016 — a matching saisie-attribution case exists as **026/2021**
  (25 Feb 2021, same day/month): the sheet's year may be wrong. Flagged for
  the lawyer verification pass; 026/2021 acquired in the meantime.
- Keyword headers: present on some pages (090/2018) but not all; treat as a
  bonus signal, not a guaranteed one.

## Acquisition log — 2026-08-06 (the library, at scale)

- **All SenLII works acquired**: eleven works (the revised Treaty + ten
  uniform-act expressions) downloaded from SenLII's structured AKN HTML via
  its search API and committed under `corpus/raw/acts/`. 3,272 articles
  parse cleanly across all files. Two prior expressions came with the haul:
  the **1997 AUDCG** and the current 2010 one — the first act besides the
  AUPSRVE where we hold two versions.
- **Act registry**: `server/scripts/corpus_registry.py` now declares every
  work, its temporal versions with entry-into-force dates, and the per-act
  citation-context pattern that guards edge discovery. The loader and the
  citation-graph verifier are fully registry-driven.
- **Missing from SenLII**: the accounting act (AUDCIF 2017) and most prior
  expressions (AUS 1997, AUSCGIE 1997, AUPC 1998, AUA 1999, AUCTMR has no
  prior). Decisions predating a loaded version create **no** edge for that
  act (honest gap) until those texts are acquired.
- **Juricaf full collection**: the OHADA facet holds 1,325 decision pages;
  full polite crawl (1.2 s spacing) harvested into `corpus/raw/decisions/`.
  Findings at scale:
  - ~50 pages are the same decision listed under zero-padded and bare
    numbers (035/2010 ≡ 35/2010) — deduplicated at load;
  - CCJA chambers number independently from 2009: two 010/2009 exist;
    decision identity is (number, date);
  - 3 pages (1999 avis) don't carry a parseable number/date — skipped and
    logged;
  - two source misprints found by parsing, not by eye: the 2023 AUPSRVE
    prints "Article 245 – 11" (compound number, now parsed as 245-11) and
    the 1997 AUDCG prints "Article 215" for two different provisions
    (almost certainly 215/216; first wins, flagged for gazette cross-check).

## Acquisition log — 2026-08-06 (prior versions + the accounting act)

- **AUA 1999** and **AUSCGIE 1997**: official copies filed with the WTO
  (Comoros accession series WTACCCOM12_LEG_9 / LEG_11).
- **AUS 1997**: Droit-Afrique rendering (isfad-gn.org mirror).
- **AUPC 1998**: Juriscope consolidation (leganet.cd).
- **AUDCIF 2017**: text from LegalRDC; the **J.O. OHADA numéro spécial du
  15 février 2017 itself** is also archived (its small-caps fonts defeat
  text extraction, so it serves as the authority artifact, not the text
  source).
- Extraction is gated: `scripts.corpus_extract_pdfs` refuses to save unless
  each source yields exactly the published article count (151 / 920 / 258 /
  36 / 123). The gate caught a swallowed "Article 251." (trailing period),
  page-number artifacts inside headings, and chapter-heading adjacency.
- Still missing: the pre-2017 accounting act (2000), the original 1993
  Treaty expression, and the CCJA arbitration Rules (a separate instrument
  decisions cite often — worth acquiring so its citations are never
  mistaken for AUA citations).
