"""Whether Excel believes its own stored numbers.

`swens.md` § 5, first commitment, verbatim:

    Swens never re-derives a number to judge it. It reads what Excel
    itself calculated and stored. **If a workbook was saved with
    calculation set to manual, Swens refuses to reconcile against
    numbers Excel does not believe, and says so**, rather than quietly
    producing a comparison that means nothing.

Everything in this module exists to make the bolded sentence true. It
was not, until 28 August 2026: `calcPr` was read in three places for
its *iteration* settings, and `calcMode` was read nowhere in the
codebase, so a manual-calculation workbook was reconciled silently
against values Excel itself does not stand behind.

## The distinction that matters

Excel's cached values are the product's foundation — the engine judges
what the model computed rather than recomputing it, and that is what
makes a finding checkable. The cache is trustworthy exactly when Excel
maintains it, which is what automatic calculation means: every edit
recalculates, so what is stored is what the formulas say.

Under **manual** calculation none of that holds. Excel recalculates
when somebody presses F9 and at no other time, so a stored value is
the answer to whatever the formulas said whenever that last happened.
The file cannot tell you whether an edit came after.

## What this refuses, and what it deliberately does not

**Refused: reconciliation.** Any check whose claim is « this number
disagrees with that number » — the analytical checks (the balance
identity, cash continuity, the debt terminal, interest consistency,
the model's own check rows) and the deck tie-out. Every one of them
compares stored values, and on a manual workbook a disagreement is
indistinguishable from a stale cache. Reporting it would be the
« comparison that means nothing » the commitment forbids.

**Not refused: the mechanical audit.** A typed-over formula, a sum
that skips a row, a hardcode in a formula tail, a frozen reference —
these are read from the formulas, and a formula does not go stale.
Nothing about manual calculation makes a structural finding less true,
so refusing them would be a false refusal, which costs trust in the
other direction.

## Why `calcMode` alone, and not the obvious companions

- **`fullCalcOnLoad` is not evidence.** openpyxl *defaults* it to true,
  and `polar.tieout.write.workbook` sets it deliberately on every file
  the writer produces, so a file we just corrected carries it. Treating
  it as staleness would refuse our own output.
- **`calcOnSave` is not a trigger on its own.** Under automatic
  calculation Excel is already current, so `calcOnSave="0"` there means
  nothing — and the corpus proves this is not hypothetical: one of the
  27 regulator models carries `calcOnSave="0"` with automatic
  calculation, and refusing it would have been a false refusal. Under
  *manual* calculation it is the aggravating detail, and it is said in
  the sentence rather than made into a second rule.
- **`calcCompleted="0"`** is Excel explicitly reporting that its last
  calculation did not finish. That is the same claim as manual mode,
  stated by Excel rather than inferred, so it triggers too.

## Measured before it was wired (28 August 2026)

The question registered first: how many real models would this refuse?
Read straight out of `xl/workbook.xml` on the 27-model AU-UK gate
corpus, so no library default could invent an answer:

    calcPr present        27 of 27
    calcMode manual        1  (RIIO GDT3 WACC Rates Model, draft)
    calcCompleted="0"      0
    calcOnSave="0"         1  (h7_new_debt_indexation_fp — automatic,
                              so not refused; see above)

**One file in twenty-seven.** A check that fires on 3.7% of real
regulator models is proportionate, so § 5's rule is implemented as the
founder wrote it, with nothing narrowed.

**And the one it names is interesting.** The two WACC models are also
the two files that fail the recalculation fidelity gate — ~23k numeric
divergences on their « Daily Data » sheets, recorded in
`fidelity-report.md` as « the one genuinely interesting class…
unexplained as yet ». One of those two is this manual-calculation file.
A stale cache is exactly the shape of that symptom. **This is a
hypothesis, not a result**: it explains one of the two files and the
other is on automatic calculation, so something else is happening
there as well. It is written down here so the arbiter round (B3) tests
it rather than rediscovering it.
"""

from dataclasses import dataclass
from typing import Any

#: `calcPr@calcMode` values that mean « Excel maintains the cache ».
#: `autoNoTable` recalculates everything except data tables, which does
#: not affect any value this product reconciles.
AUTOMATIC = frozenset({"auto", "autoNoTable"})

#: The value ECMA-376 gives `calcMode` when the attribute is absent.
DEFAULT_MODE = "auto"


@dataclass(frozen=True)
class Calculation:
    """A workbook's `calcPr`, in the terms this product reasons in."""

    #: `auto`, `autoNoTable` or `manual`.
    mode: str = DEFAULT_MODE
    #: `calcPr@calcOnSave` — whether Excel recalculates before saving.
    #: Only meaningful under manual calculation.
    on_save: bool = True
    #: `calcPr@calcCompleted` — false when Excel says its last
    #: calculation did not finish.
    completed: bool = True

    @property
    def trustworthy(self) -> bool:
        """True when Excel stands behind the values it stored."""
        return self.mode in AUTOMATIC and self.completed


def read_calculation(book: Any) -> Calculation:
    """The calculation settings of an open openpyxl workbook.

    Anything that does not present a `calculation` object — a legacy
    `.xls` read through :mod:`polar.tieout.legacy`, a workbook built in
    a test — is reported as automatic, which is the format's own
    default and the only safe assumption: a file that says nothing is
    not a file claiming its numbers are stale.
    """
    calc = getattr(book, "calculation", None)
    if calc is None:
        return Calculation()
    mode = getattr(calc, "calcMode", None) or DEFAULT_MODE
    on_save = getattr(calc, "calcOnSave", None)
    completed = getattr(calc, "calcCompleted", None)
    return Calculation(
        mode=str(mode),
        # `None` is « attribute absent », and ECMA-376 defaults both to
        # true. Only an explicit false is a claim.
        on_save=on_save is not False,
        completed=completed is not False,
    )


def refusal(calculation: Calculation) -> str | None:
    """Why values cannot be reconciled, or `None` when they can.

    An abstention is not a shrug (`swens.md` § 5): the sentence names
    what was missing and what would resolve it, because the person
    reading it can fix this in about four seconds and nobody else can.
    """
    if calculation.trustworthy:
        return None
    if not calculation.completed:
        return (
            "this workbook records that its last calculation did not "
            "complete, so its stored values are not what its formulas "
            "say — open it in Excel, press F9 to calculate, save, and "
            "check it again. Nothing that compares numbers is reported "
            "here; the checks that read formulas are unaffected."
        )
    saving = (
        ""
        if calculation.on_save
        else " and it does not recalculate before saving either,"
    )
    return (
        "this workbook is set to manual calculation, so Excel does not "
        f"maintain the values it stored{saving} and a disagreement "
        "between two of them cannot be told apart from a stale cache — "
        "open it in Excel, press F9 to calculate, save, and check it "
        "again. Nothing that compares numbers is reported here; the "
        "checks that read formulas are unaffected."
    )
