# The investigator test: can a language model, reading the cells alone, see the faults the rules miss? — registration, before any run

4 September 2026. The Enron round (`enron-errors.md`) left a number
and a question. The number: the audit names 8 of 32 outside-labelled
faults, and ten of the seventeen misses are wrong-but-consistent
formulas that nothing in a single file contradicts. The question,
the founder's: is that the limit of rules, and would a model reading
the sheet as a reviewer reads it see what the rules cannot? This
round tests the narrow form of that question on the material we
have. It does not test the product design (investigator proposes,
engine proves); it tests whether the investigator has anything to
propose.

## The investigator, fixed now

A fresh instance of the model, spawned as a sub-agent with an empty
context: it has not seen this conversation, the catalogue, the
properties files or the Enron round's documents. It receives one
sheet as a plain table — every occupied cell, its formula where it
has one, its cached value — and this brief:

> You are reviewing one worksheet from a real business spreadsheet.
> The table lists every occupied cell: address, formula (if any) and
> cached value. List the cells you believe are **actually wrong** —
> a formula that computes the wrong thing, reads the wrong cell,
> covers the wrong range, or a value that contradicts the sheet.
> At most six. For each: the cell address, one sentence saying why,
> and a confidence (high, medium, low). Style complaints — a typed
> number inside a formula, a hidden sheet, an inconsistent layout —
> do not count unless you believe the number itself is wrong. If
> you believe nothing is wrong, say so. Answer only from the table:
> do not open files, search, or use any tool.

The brief gives no hint of where the faults are and no count of how
many there are. Twenty-six sheets, one per fault-bearing worksheet,
all sent whole (the largest is 4,670 cells); no sheet is trimmed, so
nothing about a fault's location leaks through the cut.

**Contamination, named.** The 36 faults were published in 2016 and
may be in the model's training data. Recognising a specific
cell-level fault in a specific Enron trading book from a table of
addresses and formulas would be remarkable; the risk is named and
not dismissed. A sub-agent has tools and is told not to use them;
whether it obeys cannot be verified from its report, and that too is
named.

## The score, fixed now

- A **claim** is one cell the investigator lists. A claim **hits**
  when the cell is one of the labelled faulty cells of an error on
  that sheet (the properties file's cells, resolved as the Enron
  scorer resolves them).
- **Recall**: errors with at least one hitting claim, over 32.
- **Recall on the rules' misses**: of the 17 errors the audit did
  not name (`enron-errors.md`, measure 3), how many the investigator
  hits. This is the number the round exists for.
- **Precision**: every non-hitting claim is read by hand against the
  sheet and graded *real* (a genuine problem the corpus did not
  label), *arguable*, or *false*. Precision is hits plus real, over
  claims.
- **Overlap with the rules**: for each hit, whether the audit also
  named it — the investigator's added value is the hits the rules
  did not have.

## Predictions, registered

- Recall: between 4 and 8 of 32.
- Recall on the rules' 17 misses: between 2 and 5.
- Claims: between 60 and 130 across the 26 sheets; false alarms
  between 3 and 8 per sheet on average; precision under 40%.
- Most claims will be the mechanical class the rules already see
  (sums that stop short, a row that breaks pattern), not the
  wrong-but-consistent class.
- At least one sheet where the investigator says nothing is wrong
  and the sheet holds a labelled fault.

## Out of scope, named

- Business sheets, not financial models; a good result is a reason
  to build the investigator-plus-evidence design, not proof of it.
- One model, one prompt, one run per sheet. No prompt tuning after
  the results are seen; a second prompt is a second registered round.
- The engine's evidence is not handed to the investigator here. That
  is the product design and a later test; this is the investigator
  alone.
