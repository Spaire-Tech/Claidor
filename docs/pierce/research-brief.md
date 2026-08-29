# Research brief — five problems we are actually stuck on

Written 28 August 2026 for the founder's research agent. Each problem
below states what we tried, how it failed, and what would count as a
useful answer. **What we do not need is a survey of spreadsheet-error
research in general** — we have one (`ambre-toolbox.md`) and a second
for the Chinese-language field (`china-os-findings.md`). What we need
is help with five specific walls.

---

## Context in four sentences

We build a model-review platform: it reads a financial model (Excel),
finds the defects a model auditor is paid to find, links typed inputs
back to the contract pages they came from, and watches all of it across
versions. It never authors anything. Findings must be quiet — a check
that cries wolf gets the whole product ignored, so every check is
measured on false alarms before it ships and refused if it cannot be
made quiet. Everything is measured against criteria registered before
results are looked at.

---

## Problem 1 — Most real close models have no formulas at all

**This is the one we would most like an outside idea on, and the one we
have seen written about least.**

Measured on our own set of project-finance models issued at financial
close:

| model | cells | cells with formulas |
| --- | --- | --- |
| RHSC DCN | 608,191 | **0** |
| Bertha Park | 389,418 | 113 |
| Dumfries & Galloway | 223,383 | 328 |
| Inverness College | 215,102 | 19,900 |

Three of four are paste-specials of themselves. The file a deal
actually closes on is frequently issued this way — deliberately, so
nobody can change it. Every technique that rests on the dependency
graph (precedent tracing, slicing, most defect detection, "what feeds
this number") is **structurally impossible** on such a file.

**Questions:**
- Is there literature on **recovering computational structure from
  values alone** — inferring "this column is the sum of those twelve"
  from numbers with no formulas? Program synthesis from
  input/output examples (FlashFill lineage), relational learning,
  functional dependency discovery in databases, equation discovery
  (AI Feynman, symbolic regression) all seem adjacent. Which of these
  actually survives noisy real financial data at ~500k cells?
- Anything on **spreadsheet "de-hardcoding"** or reconstructing a model
  from a values-only copy?
- Is anyone in audit/finance tooling talking about this population at
  all? If it is a known problem with a known answer, we want the name
  of it.

---

## Problem 2 — Telling a real relationship from a coincidence, at small n

We detect "this annual figure took one month instead of twelve" by
checking whether a coarse series equals the sum of a fine one. To prove
the evidence is not coincidence we **shuffle the row labels** and
require mismatched pairs to almost never match.

Three designs, three results:

| design | shuffled matches vs real |
| --- | --- |
| naive sum matching | **77%** — dead |
| + require rows to actually vary, flow/stock classification | 0.0% on one model |
| same design, across sixteen models | 0–5.6%; **fails our 5% bar on one** |

And a methodological hole we walked straight into: on two models the
denominator was **2 patterned rows**, where one mismatched row is 50%.
We registered a ratio and forgot to register a minimum sample.

**Questions:**
- What is the correct statistical framing? This smells like a
  **permutation test** and we are treating it like a ratio. What is the
  right null distribution, and how many permutations?
- How should a **minimum detectable effect / power** requirement be
  stated so a model with 2 candidate rows is reported as "cannot be
  measured" rather than as a failure or a pass?
- With hundreds of rows tested per model, this is also a **multiple
  comparisons** problem. Is per-row FDR control (Benjamini-Hochberg or
  similar) the right shape, and does anyone apply it to defect
  detection where the cost of a false alarm is reputational rather
  than statistical?
- Is there prior art on **coincidence controls for data-derived
  relations** — mined invariants, association rules, discovered
  functional dependencies — that we should be copying rather than
  inventing?

---

## Problem 3 — Is a line item a flow or a stock, and can that be read from behaviour?

Our current answer: a **flow** satisfies `coarse = sum(fine)` (revenue,
opex), a **closing balance** satisfies `coarse = last(fine)`, an
**opening balance** `coarse = first(fine)`. Each row is whichever it
obeys in more periods, and a defect is a break in the row's own
pattern.

This got us from "reports retained earnings and cash at bank as broken"
to something defensible, but it is our own invention and we suspect it
is naive.

**Questions:**
- Is there work on **inferring the semantic type of a financial line
  item** — flow vs stock vs rate vs flag — from its numerical
  behaviour rather than its label? XBRL has this distinction formally
  (`instant` vs `duration` periodType). Could an XBRL/IFRS taxonomy be
  used as a **lexicon or a prior** for spreadsheet rows?
- Anything from **time-series semantics**: level vs flow variables,
  stock-flow consistency in macroeconomic modelling (the SFC modelling
  literature), or system dynamics (Forrester stocks and flows)? That
  field has thought hard about exactly this distinction — is any of it
  operational?
- How do commercial model-audit tools handle it, if at all?

---

## Problem 4 — Carrying a table's row labels across a page break

Our contract-to-model linker has failed six rounds. Latest score:
**2 proposals, 13 abstentions, 0 correct out of 15.** The diagnosis is
not the matcher:

- On 11 of 15 rows some non-truth line scores strictly higher than the
  truth line.
- **4 rows cite a continuation page that carries no row labels at
  all** — a wide table printed as a two-page spread, where page 2 has
  the numbers and page 1 has the words.

We use docling + pdfplumber. We match by label, never by value (a rule
we will not relax — matching on value proves a number equals itself).

**Questions:**
- What is the state of the art on **multi-page table stitching** in
  PDFs — recognising that page 2's columns continue page 1's rows, and
  carrying the row headers across? TableFormer, PubTables-1M, and the
  document-AI benchmarks all seem to evaluate single-page tables.
- Is there a benchmark that **contains** the spread-table case? If the
  benchmarks exclude it, that is worth knowing.
- Separately: we match one model number against ~4,900 document
  numbers, one at a time. Is the better shape to **extract the
  document's terms into a structured table first** and then join?
  What does the record-linkage / entity-resolution literature say
  about blocking strategies at this scale where precision matters far
  more than recall?

---

## Problem 5 — Units, when the file will not say

We need to catch "a monthly figure used where an annual one belongs",
"a percentage treated as a decimal", "thousands mixed with millions".
This is the flagship finding and it is not shipping.

What we found:
- The only modern reference is **Williams, Negreanu, Gordon, Sarkar
  (Microsoft, VL/HCC 2020)** — constraint solving plus probabilistic
  unit labelling. No released tool. XeLda (ICSE'04) worked and died
  because it required manual annotation.
- Our own inference was measured against two hand-labelled keys: it
  scored "wrong on none" against the first and **24.62% wrong on
  currency** against the second, harder one. We refuse to arm a
  dimension whose test set cannot contain its failure case.
- A concrete bug we found: Excel's `[$...]` number-format bracket is
  *syntax*, so `[$€-2]` (euro) and `[$-409]` (a locale code naming no
  currency) both contain a `$` and both read as USD by substring.

**Questions:**
- Has anything appeared since Williams 2020? Any released
  implementation, in any language?
- Is the **dimensional-analysis / units-of-measure** literature from
  programming languages (F# units, Fortress, unit inference in
  scientific code) transferable, given spreadsheets have no
  declarations?
- Is there a canonical, correct parser for **ECMA-376 number format
  strings** (currency, scale, date) in any open-source project we
  could port from rather than re-derive?

---

## What a useful answer looks like

- **Named sources**: paper, authors, year, and whether code exists and
  under what licence. LGPL and AGPL are problems for us; MIT, Apache
  and MPL are fine.
- **Whether the method survives our scale** (100k–700k cells, 40-year
  monthly models) and our data (noisy, real, values-only).
- **What it does not do.** A method's stated failure mode is worth as
  much to us as its claimed accuracy.
- **Say when there is nothing.** "No one has published on this" is a
  genuinely useful answer — it tells us the work is ours and stops us
  looking. Two of our best decisions came from finding that no open
  implementation of a thing existed.
- Please **do not** re-derive that spreadsheet errors are common, that
  CUSTODES/EUSES/Enron corpora exist, or that LLMs could be applied.
  We have all three and the third has been measured and rejected for
  the audit path (FLARE, 2025).
