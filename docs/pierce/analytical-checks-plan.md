# The analytical checks — build plan

The four checks that move the engine from « is this cell built
correctly » to « does the model make sense as a financial statement »:
balance sheet balances, cash ties through, debt repays to zero, time
axis consistent. Written before any code, in the same discipline as the
linker rounds: each phase names what it claims, what it never claims,
and how it is measured before results exist.

## What already exists, and matters

The plan is cheaper than it looks because the engine already carries:

- **Cached values.** Every cell's last-computed value, as Excel wrote
  it (`workbook.py`, `Cell.value`). The analytical checks are
  arithmetic over these — no recalculation engine is needed, ever.
- **The formula graph.** Every formula tokenised with Microsoft's own
  tokenizer; precedents per cell, *with* the unresolved half tracked
  (measured: 11.7% of formulas on a real Ofgem model lose a precedent
  silently — ours don't lose it silently).
- **Period-header recognition.** The `PERIOD` regex and per-sheet
  column labels already separate time-axis rows from lookup tables —
  built for the inconsistent-row rule, reusable as the seed of the
  time-axis map.
- **The typed-history boundary.** Per-sheet actuals/forecast split,
  already measured against real models.
- **A home for abstention.** The workspace already draws « Checks that
  did not run », with a why per row. A model whose balance sheet the
  engine cannot locate is *that*, on screen — never a guess, never a
  silence.

## The order

The advisor's order is the shipping order. The build order differs in
one place: **the time axis is not the fourth check, it is the floor
under the other three.** « Does the balance sheet balance every
period » and « does closing cash meet opening cash » are meaningless
until the engine knows which columns are periods. So the time-axis
map is built first, and the consistency *check* falls out of it as a
by-product on day one.

### Phase 0 — the protocol (before any code)

A pre-registered protocol, committed first, in the pattern of
`ofgem-crosscheck-protocol.md`:

- The exact sentence each check is allowed to claim, and the exact
  sentence it says when it abstains.
- **Tolerances, fixed in advance.** A balance imbalance below the
  model's own display precision (typically £1 at unit scale) is not a
  finding. The number is written down before the first run, and moving
  it afterwards is forbidden.
- Pass criteria per phase (below), against named corpora.

### Phase 1 — the structure layer (`structure.py`)

One new module that reads a `Workbook` and answers, per sheet:

1. **The period map.** Which columns are periods, what each column *is*
   (the label, and the date where the model states one), and the
   periodicity — including legitimate changes: a project finance model
   that runs monthly through construction and semi-annually through
   operations is normal, and the map records the transition rather
   than flagging it.
2. **The section tree.** SUM ranges are the model's own statement of
   its sections — `=SUM(J58:J60)` *says* rows 58–60 are a block with a
   total. The tree of sums gives section boundaries without any
   label-reading at all; labels then name the sections.
3. **Row identity.** A row is an account over time; a single-reference
   formula (`=Cashflow!H38`) is the model's own statement that two
   rows are the same account on two sheets. Both already parsed.
4. **Block recognition.** Where the balance sheet is, where the cash
   and reserve accounts are, where the debt schedule is — from three
   anchors, in order of trust: the model's **own check rows** (FAST
   models ship a check sheet; « balance sheet check » rows name the
   statement they check), the section tree, and the standard label
   vocabulary (net assets / total equity / opening balance / closing
   balance / drawdown / repayment).

**Claim discipline:** the structure layer never guesses. Each block it
identifies carries *how* it was identified; a block it cannot identify
is reported as unlocated, which downstream checks turn into « did not
run » with the reason.

**Phase 1 pass criteria (pre-registered):** on the 32 Ofwat models and
the Scottish close models (Dumfries, Anderson, Bertha, Elgin, RHSC,
Ayrshire — files nobody here made), the period map is hand-verified
correct on every sheet of a sampled subset; the balance sheet and debt
schedule are located on ≥ 80% of models *with zero mislocations* —
abstention is a pass, a wrong block is the only failure.

### Phase 2 — time-axis consistency + the balance check

- **Time-axis check** (by-product of the map): a sheet whose period
  columns are offset against the workbook's map, or a row whose
  formula walks off its period. Claims « these sheets disagree about
  what column M is », never « this layout is wrong ».
- **Balance check:** per period, assets − liabilities − equity, *in
  the model's own sign convention* — derived per model from how its
  own totals combine, never assumed. Where the model carries its own
  check row, our computed imbalance must agree with it — the model
  grades our arithmetic before we grade the model.

**Pass criteria:** zero false « does not balance » across all 38
published models (they closed or were determined on; the presumption
is they balance — any imbalance we report gets hand-read in the cells
before it counts). Recall measured separately on seeded breaks: take a
clean model, break one carry-forward link programmatically, the check
must catch it. Seeded files are ours and are *never* cited as evidence
outside recall testing — the precision numbers only ever come from
files nobody here made.

### Phase 3 — cash tie-through

Closing balance in period *n* equals opening balance in period *n+1*,
every period, every account the structure layer identified as a
balance-carrying row (cash, reserves, debt, anything with an
opening/closing pair). This is where the invisible error lives: a
healthy-looking formula pointing at the wrong place produces no
hardcode and no `#REF!` — only a number that does not carry forward.

Same criteria shape: zero false positives on the published set,
seeded-break recall, hand-verification before anything counts.

### Phase 4 — debt-to-zero + interest self-consistency

- **Repayment:** each debt tranche's closing balance at the end of its
  term is zero within the pre-registered tolerance. The finding states
  the terminal balance and the chain of cells behind it (the chain
  endpoint already exists).
- **Interest:** *self*-consistency only. The engine derives the
  model's own convention from the periods where balance, rate and
  interest agree — opening vs average balance, the day-count — and
  flags the periods that depart from the model's own rule. It never
  checks against a textbook formula, because a false « your interest
  is wrong » said to a modelling firm is the one finding we cannot
  afford.

### What ships when

Each phase lands as its own measured round (worklog + accuracy-backlog
entries, as ever). The checks appear in the product's catalogue only
after their phase passes — they surface through the existing
machinery: rules in the audit's catalogue, findings with cells and
standards, « Checks that pass », « Checks that did not run », the
panel, the deals-list arithmetic. **No new UI is needed; the screens
were built for a growing catalogue.**

## How hard is this, honestly

Harder than any single engine build so far; easier than the linker
was, per unit of difficulty, for one reason: **the ground truth is
arithmetic.** The linker had to be measured against human judgement
about what a phrase means. A balance either sums to zero or it does
not, and the models carry their own check rows to grade us against.

Ranked by risk:

1. **Block recognition** is the hard part — it is where a wrong answer
   is possible. Mitigation is structural: abstention is always
   allowed, mislocation is the only failure, and coverage is grown
   over measured rounds exactly as linker precision was (72% → 87% →
   100% over three rounds).
2. **Periodicity transitions** are a known trap with a known answer
   (record the model's own map; flag departures from *it*).
3. **Interest conventions** are a trap avoided by construction — the
   self-consistency framing means the engine never holds an opinion a
   modelling firm can dispute.
4. **The arithmetic itself is easy.** Values are in the file; the
   graph is parsed; the sums are sums.

The bulk of the work is Phase 1. Phases 2–4 are each small once the
structure layer exists — which is the advisor's point, and it survives
contact with the code: the checks are not four features, they are one
capability wearing four sentences.
