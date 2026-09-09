# Ofgem's RIIO-3 errata tracker as a label source — registration and first reading

4 September 2026. The research brief's first item was regulator
correction logs: errors a regulator found in its own determination
and corrected in public, each with the wrong text, the right text and
the document it sits in. We hold one (`corpus_regulator/RIIO3-errata-tracker.xlsx`,
Ofgem's « Errata Tracker — RIIO-3 Final Determinations »), unmined
since it arrived. This round reads it and records what it can and
cannot give the engine.

## What the tracker holds, read on 4 September

| | |
| --- | --- |
| Entries | 250 |
| Marked « Error » | 226; « Addition » 13; unmarked 11 |
| Naming a model or a model tab in the document or page column | **2** |
| Everything else | tables and paragraphs in the determination documents: annex tables re-run after the cost models changed, unit costs, allowance figures, dates, wording |

The two model-level entries:

1. **Capitalisation rates.** « Capitalisation rates for most network
   companies have changed since the publication of Final
   Determinations due to revisions in totex figures. These updated
   capitalisation rates were published in the PCFMs published on 3
   February 2026. This affects all downstream calculations within
   the BPFM/PCFM. » An input revised; every downstream figure moved.
2. **The risk-free rate.** « PCFMs published on 3rd February 2026
   contained incorrect BPI and tax trigger deadband values … The
   nature of the error was that the Risk Free Rate informing the Cost
   of Equity allowance was incorrectly updated to November 2025
   out-turn data, when it should have been only updated to October
   2025 out-turn data. » Corrected in « FD Errata BPFMs », on the
   LicenseeInput tabs. A wrong input value: the right formula fed the
   wrong month.

Our held RIIO-3 finals are the 3 February 2026 publication, so they
carry the second error as published. The corrected « FD Errata »
BPFMs and PCFMs are on Ofgem's site; this machine cannot list that
page (the site answers non-browser requests with a shell), so they
are to be downloaded by hand and dropped beside the finals.

## What this decides, before any measurement

- **The tracker labels input and document errors, not construction
  errors.** Neither model entry is a formula defect. A rule that
  reads one file cannot see that an input holds November's number
  instead of October's; that is the class the registration of the
  previous-version round called « a decision the rule cannot see ».
  Recall of the construction rules on these two labels is **zero by
  construction**, and is recorded as such rather than measured as if
  it could have been otherwise.
- **What can see them is the Watch.** The 3 February file against
  the errata file is a before/after pair in which the regulator has
  named the changed cells' meaning. The previous-version rule will
  not fire (a value became a value); the Watch's « moved assumption »
  item should list the risk-free rate and the capitalisation rates,
  and the delta report's material-output items should show what
  moved downstream. That is the measurement, once the files are held:
  do the moved assumptions the Watch lists include the two the
  regulator named, and how many others does it list beside them.
- **Two independent-real labels join the registry** now, class
  `wrong-input`, cells to be resolved to addresses when the errata
  files arrive: the LicenseeInput risk-free rate and the
  capitalisation rates per company.

## Predictions, registered for the pair

- The Watch lists the risk-free rate among its moved assumptions on
  each of the three BPFM pairs, and the capitalisation rates on each
  company's inputs.
- Moved assumptions beside them: between 5 and 60 per pair (totex
  revisions touch many inputs).
- The previous-version rule: zero findings on the pair, as it should.

## Out of scope, named

- The 248 document entries are not model labels. They are candidates
  for the tie-out side (a printed table that disagrees with the model
  it was built from), which is the Chain's measurement, not the
  audit's, and is not attempted here.
- Ofwat's published question-and-answer log for PR24, the other
  correction source the brief named, could not be fetched from this
  machine either; it is the next file to hand over.
