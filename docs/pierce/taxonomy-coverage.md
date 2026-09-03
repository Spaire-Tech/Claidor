# The accountants' dictionary — registration, before any code

2 September 2026. The second of the four rounds the meaning-layer
research left open, chosen by the founder after the modern-Excel
round closed. The engine understands the shape of a formula and
nothing of what its row means. The accounting standard-setters
publish a machine-readable dictionary of every line in a set of
accounts — which way it points (debit or credit), whether it is a
balance at a date or a movement over a period, and its names. This
round loads that dictionary and **counts how many rows of our own
models it can name**. The count decides whether the vocabulary
reaches the working rows of a project-finance model or stops at the
statements. Nothing is built on top of it in this round.

## What is loaded (fetched and counted 2 September, `materials-intake.md`)

| Source | Money concepts | With an English label | Carries |
| --- | --- | --- | --- |
| US GAAP 2026 (FASB) | 7,485 | 7,485 | balance, period type, standard / total / terse labels |
| UK FRC core 2025 | 2,850 | 468 | balance, period type; the other concepts are named by their CamelCase concept name split into words |
| SEC Financial Statement Data Sets, 2026 Q2, `pre.txt` | — | 16,918 distinct (filer label → concept) pairs seen on three or more statement lines, mapped to a money concept | how real filers wrote each line, with the sign-flip flag |

The distilled files are committed under `server/polar/tieout/meaning/data/`
(gzipped JSON, about 0.6 MB together) with FASB's Authorized Uses
notice beside them. The raw taxonomies and the 600 MB SEC quarter are
not committed.

## The mapping, fixed now

A row label maps to a concept in one of three ways, or not at all.
**No fuzzy matching in this round**: a near miss is a guess, and the
engine does not guess.

1. **Exact** — the label, normalised, equals a taxonomy label
   (standard, total or terse), or a concept name split into words.
2. **Filers** — the label, normalised, equals a label real filers
   used, and the concept most of them tagged it as is taken, with
   the count of filers who agreed and disagreed.
3. **None** — the row is not named. That is an honest answer.

Normalisation: lower case; punctuation to spaces; a trailing
parenthetical qualifier such as `(WR)` or `(ADDN2)` removed; the
suffixes ` - nominal`, ` - real`, ` - control` removed; years and
currency units removed; whitespace collapsed. The removed parts are
kept as the row's qualifiers, never used for matching.

## Measures, fixed now

1. **Coverage on the sixteen PR24 draft-determination models.** A
   *money row* is a labelled row that carries at least one number on
   a sheet the measure reads. Sheets are classed by name: statements
   (`FinStat *`, `Exec Summary`, `Dashboard`), calculations (every
   other sheet except the lookup and plumbing sheets: `Cover`, `Map
   & Key`, `FAST`, `Contents`, `Dictionary`, `Report lookups`,
   `PowerBi table`, `OBXValues`, `Output*`, `F_Inputs`, `F_Outputs`,
   `InpS`, `Active inputs`, `Model Checks and Alerts`). Reported: the
   share of money rows mapped at exact or filers, by sheet class,
   per file and pooled.
2. **Precision.** Sixty mapped rows sampled with seed 20260902,
   stratified thirty exact and thirty filers, judged from the label
   and its sheet by the lead: A (right concept), B (right family,
   wrong specific), C (wrong). Written before any fix.
3. **A second corpus:** the founder's model and the 22 close models,
   pooled, same classes where the names allow, otherwise all
   labelled money rows.
4. **Cost:** the mapping of one file's labels runs under one second
   after the read.
5. **Audit golden master:** untouched by construction (no audit file
   changes); confirmed by the diff.

## Predictions, registered

- Statements: at least 40% of money rows mapped.
- Calculations: under 15%.
- All read sheets pooled: under 20%.
- Exact-tier precision A+B at or above 90%; filers-tier at or above
  75%.
- The project-finance corpus: under 15% overall. Debt schedules
  (drawdown, repayment, DSCR) will be the rows the dictionary cannot
  name.
- The UK dictionary adds fewer than five percentage points over the
  US one alone on these models: the FRC labels are sparse and the
  models' vocabulary is Ofwat's, not the FRC's.

## What this round does not do, named

- No finding uses the mapping yet. The sign, period and add-up
  checks the vocabulary makes possible are their own rounds, each
  registered on this count.
- No multiplication patterns: the taxonomies know add and subtract
  only. That is the third of the four rounds.
- No fuzzy or learned matching.

---

# Results

*(appended after the round; nothing above this line changes)*

## Result — 2 September 2026, first measurement (before any fix)

Every number here is from the run as registered; the judgements were
written before any rule changed. The fixes and the second
measurement follow in their own section.

### Measure 1 — coverage on the sixteen PR24 models

| Sheet class | Money rows | Named | Share |
| --- | --- | --- | --- |
| statements | 8,272 | 0 | **0.0%** |
| calculations | 189,267 | 5,280 | 2.8% |
| pooled | 197,539 | 5,280 | 2.7% |

Every one of the sixteen models scores 2.7%: they share one
template, so the count is one model's count sixteen times.

**Why the statements scored zero.** Their labels carry the entity in
the middle — `Revenue - Appointee - nominal`, `Operating profit -
Appointee - nominal`. The normaliser strips ` - nominal` and stops;
`revenue appointee` is nobody's label. The registration named the
suffixes it would strip and « Appointee », « Wholesale », « Retail »
were not among them. So the sheets the dictionary was built for
scored nothing for a reason that has nothing to do with the
dictionary.

### Measure 3 — the second corpus (the founder's model and 16 close models)

89,969 money rows, 3,057 named (3.4%); the founder's model alone
22.9%, the close models 1.8% to 10.4%. Dominated by generic words:
« Opening Balance » (648 rows) and « Closing balance » (341) were
named `StockholdersEquity`, because that is how US filers tag the
opening and closing lines of their statement of changes in equity.
In a project-finance schedule an opening balance is any balance.

### Measure 2 — precision, sixty PR24 rows (seed 20260902), judged from the label and its sheet

**Exact tier, 30 rows: 17 A, 0 B, 13 C — 57% A+B.** The thirteen C
are one label: « Operating income », named the US concept
`OperatingIncomeLoss` (operating *profit*). In Ofwat's model the
line sits between Revenue and Opex, above Operating profit: it is
income, in the British sense, not profit. The taxonomy's label is
« Operating Income (Loss) »; the normaliser stripped « (Loss) » as if
it were a qualifier code, and the two meanings collided. The
remaining seventeen — retained earnings, total liabilities, net
assets, current tax liabilities, total operating income (the FRC
concept, income in the British sense) — are right.

**Filers tier, 30 rows: 30 A — 100% A+B.** Tax paid, total
non-current assets, net increase in cash, total current assets,
total equity: every one right.

**An extra, not registered: thirty rows from the second corpus,
same seed: 14 A, 9 B, 7 C — 77% A+B.** The C are « Opening
Balance », « Closing balance » and « Subtotal » named as equity and
as cash-flow adjustments. The B are family-right, specific-wrong:
« Senior Debt » as senior notes, « Interest » in a construction
schedule as interest paid, « Insurance » as general insurance
expense.

### Measure 4 — cost

Matching one file's labels takes under 0.7 s after the read; the
read itself is 41 s a model.

### Predictions, scored on the first measurement

- Statements at least 40% — **wrong, badly**: zero, for the
  normaliser reason above.
- Calculations under 15% — holds (2.8%).
- Pooled under 20% — holds (2.7%).
- Exact-tier precision at or above 90% — **wrong** (57%), one
  collision. Filers-tier at or above 75% — holds (100%).
- Project-finance corpus under 15% — holds (3.4%), and the named rows
  there are mostly the wrong ones.
- The UK dictionary adds under five points — holds; it named the
  « total operating income », « total liabilities », « current tax
  liabilities », « equity », « debtors » lines and little else.

### What the first measurement says

The dictionary is real and the filers' tier is precise. Three things
between the model and the dictionary are ours to fix, and none of
them is the dictionary: the entity words a regulator hangs in the
middle of a label; a parenthetical that is part of a name being
stripped as if it were a code; and generic balance words that mean
« whatever this schedule holds ». The fixes are registered below and
measured again.

## Fixes, registered before the second measurement

Three rules, each aimed at one cause named above. Nothing else
changes.

1. **A parenthetical comes off only when it is a code.** `(WR)`,
   `(ADDN2)`, `(BR)` — short upper-case tokens — and the known
   qualifier words (nominal, real, control, POS) are qualifiers.
   `(Loss)`, `(Benefit)`, `(incl. 3rd party income)` are part of the
   name and stay. Applied to model labels and taxonomy labels alike.
2. **Entity words are qualifiers.** After a dash: appointee,
   wholesale, retail, residential, business, water, wastewater, and
   the existing nominal / real / control / total / outturn /
   pre- and post-financeability list. Stripped repeatedly from the
   end, so `Revenue - Appointee - nominal` normalises to `revenue`.
3. **Generic balance words are never named.** opening balance,
   closing balance, balance, brought forward, carried forward, b/f,
   c/f, subtotal, sub-total, total, movement, movements, other,
   adjustment, adjustments, check, difference. A row whose whole
   normalised label is one of these is answered « none » with the
   reason « a schedule word, not a line ».

### Predictions for the second measurement

- Statements on PR24: at least 40% named (the first prediction,
  now with the entity words stripped).
- Calculations on PR24: still under 15%; pooled still under 20%.
- Exact-tier precision on the *same* sixty rows, re-judged under the
  new rules: the thirteen « Operating income » rows are no longer
  named exactly (the collision is gone) or are named by filers; A+B
  at or above 90% on whatever the rows now map to.
- Second corpus: coverage falls (the generic words drop out) and
  A+B on the same thirty rows rises above 85%.

## Result — 2 September 2026, second measurement (after the three fixes)

### Coverage

| Corpus | Sheet class | Money rows | Named | Share | Before |
| --- | --- | --- | --- | --- | --- |
| PR24 (16) | statements | 8,272 | 752 | **9.1%** | 0.0% |
| PR24 (16) | calculations | 189,267 | 5,792 | 3.1% | 2.8% |
| PR24 (16) | pooled | 197,539 | 6,544 | 3.3% | 2.7% |
| Second corpus (17) | statements | 961 | 136 | 14.2% | — |
| Second corpus (17) | pooled | 89,969 | 1,773 | 2.0% | 3.4% |

The founder's model alone: 20.5% (was 22.9%; the generic words came
out). The close models: 1.0% to 6.0%.

### Precision, re-judged

A procedural slip, named: the measure script re-draws its sixty-row
PR24 sample on every run, so the second run's sample is a *fresh*
sixty under the same seed, not the first sixty re-mapped. The
second-corpus thirty were kept by row and re-mapped as registered.

**PR24, exact tier, 30 rows: 30 A — 100%** (was 57%). The collision
is gone; the rows are current tax liabilities, total operating
income, total liabilities, net assets, current assets, capital
expenditure, liabilities — the UK dictionary naming most of them.

**PR24, filers tier, 30 rows: 22 A, 1 B, 7 C — 77%** (was 100%). The
seven C are again « Operating income »: no longer an exact collision,
but 897 of 897 American statement lines written that way *are*
operating profit, so the filers' tier names it the American way. That
is a true count of a different dialect, and the registered rule
(« the concept most of them tagged it as ») gives it. The B is
« Deferred tax » named as the charge where the sheet may hold the
balance.

**Second corpus, the same 30 rows: 21 named — 14 A, 7 B, 0 C —
100% A+B** (was 77%); the nine no longer named are the seven C
(opening and closing balances, subtotal) and two B.

### Predictions for the second measurement, scored

- Statements at least 40% — **wrong again** (9.1%). The entity fix
  moved them from zero, and the rest is dialect: « Opex », « Capex »,
  « Profit before tax », « Current tax charge », « Dividend » are
  British lines no American filer writes and the UK dictionary's
  sparse labels do not carry.
- Calculations under 15%, pooled under 20% — hold.
- Exact tier at or above 90% — holds (100%).
- Second corpus coverage falls and A+B rises above 85% — holds (3.4%
  → 2.0%; 77% → 100%).

### What the round decides

The count says: **the dictionary as loaded names American statement
lines well and British ones badly, and reaches almost nothing in the
working rows of a model.** Three things follow, each its own round:

1. **A British filer-label source.** The SEC pairs are what made the
   filers' tier precise; the UK equivalent is Companies House's free
   daily bulk of inline-XBRL accounts (`materials-intake.md`, item
   6), which would give « Opex », « Turnover », « Profit before tax »
   the way real UK filers tag them. That is the fix for the
   statements, and for the dialect collision on « Operating income »
   (a UK source would outvote the American one on a UK model).
2. **The working rows need the multiplication patterns** (the third
   of the four rounds): the dictionary cannot name a drawdown, a
   DSCR or an availability payment and never will.
3. **Nothing is built on the mapping yet**, as registered. The sign
   and period checks wait for a coverage number worth building on.

### Cost and the audit

Matching a file's labels: under 0.7 s. No audit file is in the diff;
the golden master stands by construction.
