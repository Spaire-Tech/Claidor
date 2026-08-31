# The D3 answer key — construction protocol

*Registered by Scribe, 28 August 2026, **before the first link is
logged**, as the orders require. Nothing below may be changed once a
link exists; changes are struck through and dated, never rewritten.*

## Why this exists

Seven rounds went into finding a public document→model pair. The
reckoning's verdict is that they measured what governments publish, not
what the software does. **We make the key ourselves** — the method used
everywhere else in this codebase (37 planted frauds, seeded defects in a
real close model) and never once applied to the document link.

## The objection, and the precise reason it fails

*« We typed the numbers in, so of course they match. »*

**All the difficulty lives on the document side.** Table shapes, text
runs split by a scanner, "Issued share capital" against "Equity",
rounding, units, a figure printed once in a sentence and again in a
schedule. **None of that gets easier because we built the model.** The
document stays exactly as hard as it was.

What is genuinely lost is the unknown author. That is real, it is not
waved away, and it is bounded below.

## What is controlled, and what is admitted

**Controlled — the three rules that make the key honest:**

1. **The model's labels are written from the deal's meaning, never
   copied from the document's wording.** If a row's name is a
   copy-paste of the sentence it came from, the round is void. Where
   the natural modeller's word *is* the document's word, that is
   recorded as such (see the difficulty register) rather than avoided —
   avoiding it would be its own bias.
2. **Two passes, separated.** Pass one builds the model and logs links,
   looking only at the document. Pass two runs the matcher. The link
   log is **committed before the matcher is ever pointed at the
   document**, exactly as every round in this lane has been.
3. **The matcher is not consulted during construction.** No candidate
   list is generated, no score is looked at, no page is searched with
   the matcher's tokenizer while the model is being built.

**Admitted, and not mitigated away:**

- **One author builds the model and runs the matcher.** The orders
  offer two weakenings — a separate build pass, or a model built
  earlier for another purpose. Only the first is available to this lane
  today, and it is used. The second is not, and I am not going to claim
  it is.
- A model built from a document is **more complete** than a real one: a
  banker would leave things out. Recorded, not corrected — correcting it
  by hand would be re-cutting the sample.

**Therefore this key measures the document-side search under a known
author.** That is a weaker claim than an external key and a much
stronger one than another no-show. It is written this way in every
result that cites it.

## The document

**Family:** a real, executed, public credit agreement or facilities
agreement — the document class the product's buyer actually holds. Not
a template, not a redacted extract, not a government consultation.

**Selection rule, frozen:** the first document meeting **all** of —

- executed and public, with a named borrower;
- a financial-covenant or pricing schedule containing **at least 15
  numeric terms** (margins, ratios, caps, baskets, dates);
- available as a **native PDF**, not a scan, verified by bytes;
- not previously read by this lane in any round.

The first document meeting the rule is taken. **No second look, no
"try another one if it goes badly"** — that is re-cutting a sample.

## The link log

One row per link, written as the model is built:

| field | meaning |
|---|---|
| `cell` | the model cell (sheet!ref) |
| `cell_label` | the row label as written by the modeller |
| `doc_page` | printed page of the document |
| `doc_line` | the printed line, quoted verbatim |
| `value` | the number as typed into the model |
| `printed` | the number as printed in the document |

## The difficulty register — what makes this diagnostic rather than pass/fail

Every link is tagged with the document-side features it carries, **at
the time it is logged**, before any score exists:

| tag | meaning |
|---|---|
| `verbatim` | the modeller's label and the document's wording share the key noun |
| `synonym` | they do not — "Issued share capital" / "Equity" |
| `in-table` | the figure sits in a table, not a sentence |
| `in-prose` | the figure sits in running text |
| `split-run` | the document's text run is broken across the figure |
| `rounded` | the model rounds or rescales what the document prints |
| `unit-shift` | percent-to-decimal, thousands, millions |
| `repeated` | the same figure is printed elsewhere in the document |

A result is reported **per tag**, not only in total. A key that says
"9 of 20" teaches nothing; one that says "6 of 6 `verbatim`, 1 of 7
`synonym`, 0 of 4 `split-run`" names what to build next.

## The two halves, scored apart

The orders split the task, and this key scores both:

- **Half (a) — document search.** Given the document and the
  `cell_label` list, find the printed number. This is the Finch failure
  and the real engineering problem.
- **Half (b) — model search.** Given the printed number and its
  sentence, find the cell. Measured at **5 of 6** by the earlier linker
  implementation on a real Ofgem pair.

Each half is scored on its own and neither number is folded into the
other.

## Kill criteria, stated in advance

1. **If the matcher scores worse on `verbatim` links than on `synonym`
   links, the harness is broken, not the matcher** — that ordering is
   impossible on a sound instrument — and no score is published until
   it is found.
2. **If any `cell_label` is found to be a copy of its document line**,
   that link is struck from the key and the strike is reported. If more
   than a fifth are struck, the whole key is void and rebuilt from a new
   document under a new registration.

## A concern, recorded before the work rather than after

The binding constraint measured last turn is **page selection**: given
the right page, the row label already resolves 9 of 15 on the FERC pair,
against 0 across the whole document. A key built now and searched with
the current finder will very likely fail for that reason and teach only
what is already known.

**So the key is built to isolate it**: the difficulty register above
turns a pass/fail into a per-feature diagnosis, and `doc_page` makes the
page-selection half separable from the row-matching half at scoring
time. That is why the register is part of the protocol and not an
afterthought.
