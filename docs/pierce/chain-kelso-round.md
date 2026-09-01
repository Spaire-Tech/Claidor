# D3 round 4 — Kelso runs at last. Amendments named before the sheet phase.

*31 August 2026. Piece 6. Round 4 was registered in the Scribe log on
26 August — the deal team's own 73-row « clause → term → figure » tab
as the answer sheet, every row scored, blindness structural — and
never ran, blocked on bytes. The bytes exist now. This document names
what is different from the registration, before the judging sheet is
produced, and will carry the results after.*

## The bytes, verified

- **Model:** the founder's upload, `kelso-high-school-model.xlsm`,
  4,231,503 bytes, sha256 `e35ec98254a8…` — **byte-identical to the
  public bucket copy** the committed fetcher reaches (fetched and
  compared this session), so this half was never private and needs no
  upload in future.
- **Contract:** the signed Kelso High School **Project Agreement**,
  from the founder's own public bucket
  (`spaire-production-files-public…/kelso-high-school-project-agreement.pdf`),
  7,702,131 bytes, `%PDF-1.7`, `%%EOF` present, sha256
  `78ac5bff9b76…`. Neither file is committed — the corpus directories
  are git-ignored, as the standing rule requires.

## Amendments to the registration, each named before any judging

1. **The answer tab is named, not guessed.** The harness's guesser
   picks `calcAccountingSA` on the real file — a calculation sheet
   that happens to contain the guess-words — which is exactly the
   failure its own docstring warns about, and why it prints its
   choice. The round runs with `--provenance-sheet "Gaps List"`: the
   73-row tab whose columns read « No. · Clause No. · Information
   Required · Information from Model · Description of Document ».
2. **Blindness is widened to the whole answer class.** The model
   carries two sibling hand-written extract tabs — `Credit Agreement
   Gaps` and `DBFM Gaps` (« Gap · Value · Reference », with document
   references like « Schedule Part 14, Appendix 1 »). They are the
   same class of content as the answer sheet: cells that exist only
   because a person already did the linking by hand. Both are
   excluded from the model side alongside `Gaps List`. Direction
   stated: this can only *remove* material from the matcher, never
   help it.
3. **Versions.** The registration froze « matcher v3 »; the shipping
   `propose.py` is v3 in behaviour (rounds 6 and 7's additions died
   by their own criteria and are recorded, inert). The extractor is
   the shipping **v5** — round V's baseline repair, registered and
   measured in its own rounds — where the registration predates it.
   Stated rather than silent: this round measures the shipping code.
4. **A prediction, added now because the original registration made
   none.** The matcher's lifetime record on the sourced case is 0
   correct; the Credit Facility rows cite Schedule 1/7/12 of the
   **Credit Agreement**, which was never published and is not this
   document, so a block of `unreachable-unpublished` is expected; a
   signed-and-scanned agreement risks `unreachable-ocr`. **I predict
   0–2 true proposals, at most 2 false, and a majority of the rows
   ending in abstention or a named unreachable condition.** If the
   result is better, the prediction was wrong and I will say so.

## Order of operations, per the registered discipline

Sheet phase (no matcher output on it) → the judge records truth and
condition per row, committed → score phase → the registered verdict
table, per condition, with the extractor's coverage and refusals for
the contract printed beside it.

---

# Measured. Reachable rows: **0 of 50.** The answer key is real and the published pair cannot carry it.

*Truth judged from the rendered pages and committed before the score
phase (`scribe-d3-kelso-truth.json`); score run once, as registered.
Contract intake: 303 pages, 3,892 numbers extracted, **1 page
refused** (a genuine scan) — the document is text-native, not the
photocopy the registration feared.*

| condition | rows | what it is |
|---|---|---|
| `unreachable-unpublished` | **31** | the row cites the Credit Agreement, the Noteholder Support Agreement, three loan agreements, the two Loan Note Instruments, or the Construction Contract — none of which was ever published. The Project Agreement is one document of a close set |
| `no-figure-in-row` | **10** | the deal row's own entry is a date, « Various », or « Attached at Appendix E » — no number exists to link. (The harness had silently substituted the row's index number; caught at judging, named, new condition) |
| `redacted` | **6** | the value sits in this document behind a **black bar**: « "Base Case IRR" means ▮ %; » (p115), « "Project IRR" means ▮ %; » (p133), « "Subordinated Debt Rate" means ▮ %; » (p138), and a full redaction block over Schedule Part 21's loan-stock details (p283). Each verified by eye on the rendered page |
| `unreachable-ocr` | **3** | the value is **on the page, handwritten into the executed copy, and readable by a human** — « 21.85 % » (p193), « 21.85 % » (p198), « £1,901,275.00 » (p206) — and the scan's text layer shredded or dropped every one, so no fact exists for the extractor to serve |
| **reachable (`ok`)** | **0** | — |

**The registered verdict table is empty: 0 true, 0 false, 0
abstentions, 0 missed, on 0 reachable rows.** The matcher was never
tested, and that is the finding, not a failure of the harness.

## What this settles, and it settles a lot

1. **The Dumfries redaction finding replicates, with far stronger
   evidence.** Dumfries showed ten readable pound-figures in 359
   pages. Kelso shows it against the deal team's own 73-row answer
   key: **every one of the 50 figure-bearing rows is unpublished,
   redacted, OCR-destroyed, or figure-less.** The redaction regime
   deletes precisely what a model holds — now proven row-by-row by
   the people who built the model.
2. **A new corpus fact with product weight: executed close documents
   carry their commercial numbers *handwritten*.** All three values
   this document genuinely states are ink on the signature copy. A
   human reads them instantly; a text layer never will. Any future
   claim that a public PFI/hub pair can test document→model linking
   dies here.
3. **The best test this track owns is confirmed and still unplayable
   in public.** The Gaps List is exactly the external truth the
   registration hoped — and it names, row by row, the papers the
   product would need *inside a deal room*: the Credit Agreement and
   the funding documents, unredacted. This is the reckoning's
   conclusion (« the full product belongs inside live deals, not
   public archives ») reached a third time, from a third direction.
4. **My registered prediction was directionally right and still
   wrong.** I predicted « a majority » of rows in abstention or a
   named unreachable condition; the truth is **all fifty** and the
   matcher never got a turn. I did not predict zero reachable rows.

Two housekeeping notes: the harness's printed condition list predates
the two new names (`redacted`, `no-figure-in-row`) so its stdout
shows only the registered pair — the committed truth and this table
carry all four; and the two new conditions are offered to the
permanent vocabulary on the same grounds as
`indeterminate-line-granularity`: a number that cannot be honestly
produced is not produced.
