# The terms table — the shape, proposed before anything is built

Piece 7 in the queue (`pieces.md` § 4). Written 31 August 2026, for
the founder to agree, amend, or refuse **before** a line of product
code exists. The mandate is one sentence of `swens.md` § 3d, quoted
whole because it is the entire specification on record:

> The Grid also holds the second use of extraction: pulling the terms
> out of the contracts, term sheets and quotes into a structured
> table, so the model's inputs can be tested against them at scale
> rather than one at a time.

Nothing below adds to that sentence's authority; everything below is
a proposal for how to honour it, and this file exists so any
deviation from it later is visible.

## What was verified before writing this

Opened this session, per `notes.md`: `swens.md` § 3 whole,
`swens-plan.md`, `pieces.md`, `research-brief.md` (problem 4),
`research-2026-08-28.md`, and the Chain package itself
(`server/polar/tieout/chain/` — all eight files read).

1. **The sentence is in `swens.md` § 3d, verbatim, and in no track of
   `swens-plan.md`.** Track D (D1–D7) covers extraction, the fact
   store, per-cell link proposal, confirm-once, the unsourced-number
   finding, deliverables and the outward checks — no terms table.
   It **is** scheduled: `pieces.md` § 4 queues it as Piece 7. (The
   § 1b/§ 1d tables of `pieces.md` still call it « Piece 10 » — a
   stale number from before the § 4 renumbering, noted here rather
   than silently edited, since `pieces.md` is the lead's file.)
2. **Nothing of it is built.** No terms-table code exists anywhere in
   `server/` or `clients/` (searched by name and by shape).
3. **The machinery to build on exists and is measured.** D1
   (`chain/extract.py`) produces every printed number with its page,
   its highlight box, the printed line it sits in (the row's label
   neighborhood) and the column header above it — hardened over
   twenty-four registered sweeps. D2 (`chain/store.py`) persists
   those facts with deterministic ids and stores refusals alongside,
   so coverage stays answerable. D4 (`chain/link.py`) holds the
   confirm-once contract: a person vouches, then re-checking is
   arithmetic forever, values stored to report and never to locate.
   The terms table should be a **curation layer over D1/D2 plus the
   D4 mechanic applied table-wise** — new tables, no new extraction
   and no new matching cleverness.
4. **The founder has already drawn the finding this table feeds.**
   The workspace export (`design-swens/`) contains: « The margin
   ratchet was typed from the superseded term sheet, not the amended
   agreement. Inputs!D19 · agreement p.112 ». That is a terms-table
   row disagreeing with a model input, cited to a page — the drawn
   proof of what this piece is for.

## The lead's guess, tested — and partly refused

The routing note (and `pieces.md` Piece 7 itself) calls this
« probably the real fix for the Chain's scale problem ». Tested
against the record, that is **half right, and the half that is wrong
matters**:

- The Chain's six failed rounds did **not** fail on scale. The round
  8 diagnosis (`worklog.md`, twenty-ninth sweep) is evidence
  insufficiency — on 11 of 15 rows the truth line cannot outscore
  some other line — and page geometry: labels printed on the facing
  page of a two-page spread, which the 28 Aug research confirmed no
  published method survives (PubTables-v2: 0.000 exact-match content
  accuracy on split tables, all seven models). The same research
  explicitly closed record-linkage blocking as « not our problem » —
  4,900 candidates is not a scale problem.
- A terms table does not repair any of that. A figure whose name is
  on the other page extracts as a bare number whether it lands in a
  table or not.

What the terms table genuinely changes is **the direction of the work
and the unit of human effort**, and that is worth building on its own
merits:

- **Document-side first.** Instead of one model cell searching 4,900
  numbers, the document's terms are laid out once, as a table a
  person can read, correct and confirm — per document version, not
  per cell.
- **The matching that remains is against dozens of named terms**, not
  thousands of raw numbers, with a person having already vouched for
  the document side.
- **It creates the one place a person can supply what geometry
  withholds.** When the spread-table case defeats extraction, a
  person types the term in, citing the page — the per-cell matcher
  has no slot for that; the table is that slot.
- **It yields the coverage sentence the per-cell flow can never
  say**: « the term sheet states 18 terms; 15 are tested against the
  model; these 3 are not. » A denominator, per § 3a's fourth
  principle.

So: **not a fix for D3's diagnosed failures — a route that stops the
product depending on them.** Piece 6 (page geometry) remains its own
necessary work and this piece neither blocks nor is blocked by it.

## The shape

One row per **term of the deal**. A term is a named quantity a banker
would recognise from the term sheet: a margin, a facility amount, a
tenor, a cover-ratio covenant, a fee, a tax rate. Columns, with who
supplies each:

| Column | What it holds | Supplied by |
| --- | --- | --- |
| **Term** | The name **as printed** — the fact's line, plus its column header where tabular (« Margin — Tranche A »). Editable; never invented by inference | Extraction proposes; a person may correct |
| **Value** | The token exactly as printed (« 4.35% », « £213,000,000 ») and its parsed magnitude. Printed text is authoritative | Extraction |
| **Source** | Document, version, page, highlight box — one click to the page, through the existing D2 viewer contract (`fact_id`) | Extraction; or a person citing a page when extraction refused |
| **Stated** | Whether extraction read it or a person typed it; who confirmed and when | The record |
| **Model input** | The cell that should hold this term — anchored by the cell's **name** (labels), exactly as D4 anchors, never by coordinates and never by value | A person confirms; proposal may assist |
| **State** | untested · confirmed-and-agrees · **disagrees** (both values shown, and which side moved since confirmation) · not in the model · superseded | Arithmetic, after confirmation |
| **Scale / basis / note** | document value × scale = model value; the basis; what the next reader should know. **Stated by the person at confirmation, never inferred** — Track E's boundary, kept | A person |

Rules carried over unchanged, because they are the product: never
matched by value; abstention with its reason in words; refused pages
visible on the face of the table; nothing confirmed by a machine.

**Term selection is a person's act, assisted — not an inference.**
The table starts from extraction's candidates (ranked so tabular,
labelled figures surface first) and a person picks what is a term.
An automatic « this looks like a term » classifier would be a new
inference with a new false-positive budget, and quietness is the
product; it can be earned later through the normal loop if picking
proves too slow. This is the founder's first decision point below.

**The table is per deal, per document version.** One deal's table
merges its term sheet, credit agreement and quotes; when a document
is revised, each term's value is re-read at its anchor (D4's
arithmetic — no model call), and a term whose document moved while
the model input did not becomes a finding. Supersession — « the
amended agreement now governs, the term sheet no longer does » — is
a person's statement, recorded, never guessed.

## The findings it produces (each a class to measure separately)

1. **A model input that disagrees with a confirmed term** — at the
   document's printed precision, rounding ranked last and labelled,
   per § 3b.
2. **A term the model does not carry** — the inverse of D5's
   unsourced number: stated in the documents, untested in the model.
3. **A term that moved while the model stood still** — the founder's
   drawn margin-ratchet case.

## The done test (registered now, measured later)

On a real deal set (the FERC pair and one project-finance close set):
a person builds the table from extraction's candidates; the count of
terms needing hand-typing versus picked is recorded (that number
prices the spread-table gap honestly); every confirmed term
re-checks against the model as pure arithmetic; the three finding
classes are measured on planted disagreements before any real claim
is made; the golden master does not move. Criteria in a registered
protocol doc before results are looked at, as always.

## The founder's decisions — ANSWERED 31 Aug 2026, all three

1. **Term selection: a person picks from candidates. Not automatic.**
   The founder's reasoning, recorded so it can be argued against on
   evidence later: quietness is the product; an automatic classifier
   is a new inference with an unmeasured false-positive budget, and
   it can be earned later through the normal loop once real documents
   have shown what a term looks like. The candidate surface is built
   so earning it later is a swap, not a rewrite: every candidate
   already carries its signals over the API, and an automatic
   selector would be a new policy over that same surface.
2. **Per-deal table with supersession: yes.** A deal is a term sheet,
   then a credit agreement, then amendments; the banker's question is
   « which one governs now », and a table that cannot answer it makes
   the work worse. Binding guard, in the founder's words: supersession
   is a person's statement, recorded, never inferred.
3. **The screen: agreed.** This piece lands tables and an API the
   Grid binds to. Nothing more.

If any of these turns out wrong once real documents are in front of
us, it is said out loud — a decision made in ignorance is not binding
on evidence (founder's own caveat, recorded with the decisions).

## Amendment — 31 Aug 2026, from D3 round 11 (named, not silent)

`chain-round11.md` measured what a generic label is worth: the
matcher's negative control scored deliberately-WRONG document
pairings at a perfect 1.0 on the one-word label « General », and the
one-shared-word truths score exactly what wrong-section garbage
scores. Generic labels are the enemy, measured.

This piece contains no matcher, but it anchors by label tokens — and
a term picked on a generic line will re-anchor across revisions to
« ambiguous » (honestly, never a guess, but uselessly). So the
candidate surface gains a fifth signal, **distinct**: the line's
label words re-find exactly one printed line in this document,
computed by counting over the exact tokenizer the anchor matches
with, so the signal predicts precisely the anchor's future behaviour.
Distinct labels rank above generic ones (after labelled and
non-reference, before tabular and unit-marked). Counting, not
inference; nothing excluded, nothing elected — the rule that a
person picks is untouched.

## Measurement order — founder's instruction, binding on round 2

The first finding class — **a model input that disagrees with a
confirmed term** — is measured alone, before the set: the other two
classes are worth less if that one cries wolf.
