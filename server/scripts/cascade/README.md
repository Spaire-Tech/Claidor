# Cascade Industrial Holdings - test pair

A sell-side pitchbook and the model behind it. The structure is real; the numbers are invented.
Built so you can test deck-to-model reconciliation against known ground truth.

## Files

| File | What it is |
|---|---|
| `cascade_model.xlsx` | The operating model, DCF, comps and outputs. 228 formulas, recalculated clean. |
| `cascade_deck.pptx` | The pitchbook. Nine slides. Every figure ties to the model. |
| `cascade_deck_broken.pptx` | The same deck with four documented errors injected. |
| `linkage_map.csv` | Every figure on every slide, mapped to the cell it came from. |

## The model

Five tabs.

- **Assumptions** - every input in its own labelled cell, blue, yellow-filled, with a source note.
- **Model** - revenue build, P&L, reported EBITDA, the adjustments block, adjusted EBITDA, unlevered free cash flow. FY2023A to FY2030E.
- **DCF** - discounting, terminal value, the bridge from enterprise value to value per share.
- **Comps** - six peers with EV/revenue, EV/EBITDA and margin, plus mean, median, low and high.
- **Outputs** - twenty-three rows. Each is one figure that appears in the deck, with its source cell and the basis it is presented on.

The Outputs tab is the interface. If your checker reconciles the deck against anything, reconcile it against that.

## Why the adjustments block matters

Rows 20-23 of the Model tab hold four EBITDA adjustments: a one-time legal settlement, ERP
implementation costs, owner compensation normalisation, and run-rate synergies from a bolt-on.

FY2025A reported EBITDA is $41.2mm. Adjusted EBITDA is $48.9mm. Both appear in the deck,
on different slides, correctly.

This is the false-positive trap. A naive checker that matches numbers will flag the $48.9mm
on slide 2 as disagreeing with the $41.2mm in the accounts. It is not an error - it is a
different basis. The `basis` column in Outputs and in the linkage map is what a checker
needs to read to tell the difference.

## The four injected breaks

`cascade_deck_broken.pptx` differs from the clean deck in exactly four places.

| # | Slide | What is wrong | Should be | Type |
|---|---|---|---|---|
| 1 | 2 | Adjusted EBITDA tile reads $49.6mm | $48.9mm | Stale figure - deck not updated after a model revision |
| 2 | 6 | Peer median reads 10.4x in the table footer | 9.9x | Figure inconsistent with the table above it |
| 3 | 6 | Implied enterprise value reads $502mm | $484mm | Downstream of break 2 - a wrong input carried into a calculation |
| 4 | 2 | Revenue CAGR tile reads 10.4% | 9.3% | Overstated metric that does not follow from the figures shown |

Break 3 is the interesting one: it is arithmetically consistent with break 2, so a checker that
only tests internal consistency will pass it. Only reconciling against the model catches it.

Slide 8 still prints 9.9x in the methodology text, so break 2 also creates a same-document
contradiction between slide 6 and slide 8.

## Suggested test sequence

1. Run the clean deck. Target: zero findings. Anything raised is a false positive, and the
   adjustments block is where they will come from.
2. Run the broken deck. Target: four findings, correctly located.
3. Break something yourself in the model - change one assumption on the Assumptions tab and
   recalculate. Every downstream figure moves and the deck goes stale in dozens of places at
   once. That is the realistic case: not one typo, but a model revision the deck has not caught up with.
4. Measure precision, not just recall. A checker that flags thirty things to catch four is
   not usable.

## Rebuilding

```
python3 build_model.py
python3 /mnt/skills/public/xlsx/scripts/recalc.py cascade_model.xlsx
node build_deck.js
node build_deck.js --broken
```

Edit the `B` object at the top of `build_deck.js` to change which breaks are injected.

---

## Note on this copy

Vendored into the repository so the tie-out eval and its tests are
reproducible without an upload. Unmodified except for this section.

**One correction, from the files rather than the prose.** The table above
says four breaks and that « slide 8 still prints 9.9x in the methodology
text ». The deck that shipped has *five* changed figures: the 9.9x → 10.4x
replacement hit slide 8 as well, so slide 8 reads 10.4x too. There is no
same-document contradiction between slide 6 and slide 8, because both were
changed together.

`scripts/tieout_eval.py` therefore derives its ground truth by diffing the
two decks rather than by reading this file. Scoring against the prose
marked a correct finding as a false positive and reported 80% precision on
a run that had made no mistakes.
