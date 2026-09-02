# The British source — registration, before any code

2 September 2026. The dictionary round (`taxonomy-coverage.md`) ended
with a count: the vocabulary names American statement lines well and
British ones badly, because its filers' tier is the SEC's. The founder
said « do the British source ». This round builds the UK equivalent
of the SEC pairs from Companies House's free daily bulk of accounts
filed as inline XBRL, adds it as a tier, and re-counts.

## The material

Companies House publishes every day a zip of the accounts filed
electronically that day (`download.companieshouse.gov.uk/en_accountsdata.html`):
« The Accounts Data Product is a free downloadable ZIP file, which
contains the individual data files (instance documents) of company
accounts filed electronically. » « Each data file is provided free of
charge and is not supported. » Fetched today: the 2 September 2026
zip, 77.5 MB, **10,295 accounts**. The three latest daily zips are
used (2 September, 1 September, 29 August).

Each account is an HTML page where every tagged number is an
`ix:nonFraction` element carrying the concept name (`uk-core:
Creditors`, `c:FixedAssets`, prefixes vary by filing software) and,
when the number is printed with the opposite sign to the concept, a
`sign="-"` attribute. Read on three files today: the printed row
label is the first cell of the table row the number sits in.

## The extraction, fixed now

For every `ix:nonFraction` in every account:

1. **Concept**: the `name` attribute with its prefix removed. Kept
   only if the concept is one of the 2,850 FRC money concepts already
   loaded; other prefixes and non-money concepts are dropped and
   counted.
2. **Label**: the text of the first cell in the enclosing table row
   that contains a letter and is not the number's own cell; rows with
   no such cell are dropped and counted.
3. **Sign**: `sign="-"` present or not.
4. Pairs are keyed on the normalised label (the vocabulary's own
   `normalise`, so both sides agree) and counted per concept, with
   the sign-flipped count, exactly as the SEC pairs are.
5. Pairs seen on fewer than three lines are dropped, as for the SEC.

The distilled file goes beside the SEC one:
`server/polar/tieout/meaning/data/uk_filer_labels.json.gz`, with the
Companies House terms quoted in `NOTICE.md`. The raw zips are not
committed.

## The matching, fixed now

A fourth tier, and a dialect order. The vocabulary takes a
`dialect`: `"uk"` or `"us"`.

- `uk`: exact → **UK filers** → US filers → none.
- `us`: exact → US filers → UK filers → none.

Within a filers' tier the rule is unchanged: the concept most lines
were tagged as, by majority, else « split », else none. The match
records which tier answered. The coverage script passes `uk` for our
corpora, which are all British; the product will pass the dialect it
reads from the file (a later round — not decided here).

## Measures, fixed now

1. **The pairs themselves**: accounts read, facts read, facts dropped
   by reason, distinct labels kept, and the ten commonest labels for
   `TurnoverRevenue`, `OperatingProfitLoss` and `ProfitLossBeforeTax`
   — so the reader can see what British filers actually write.
2. **Coverage on the sixteen PR24 models**, same script, same sheet
   classes, dialect `uk`, against the second-run numbers of the
   dictionary round (statements 9.1%, calculations 3.1%, pooled 3.3%).
3. **The second corpus**, same (2.0% pooled, founder's model 20.5%).
4. **Precision**: thirty rows named at the UK filers' tier on PR24,
   sampled with seed 20260902 and *kept by row*, judged A/B/C from
   the label and its sheet.
5. **The dialect collision**: what the UK filers say « Operating
   income » is, with the count, and what the PR24 rows now map to.

## Predictions, registered

- One day holds mostly micro and small companies: at least 80% of
  facts are balance-sheet concepts; `TurnoverRevenue` appears in
  fewer than a quarter of accounts.
- PR24 statements: at least 30% named (from 9.1%). Calculations
  under 15%; pooled under 20%.
- Second corpus pooled: between 2% and 6%.
- UK filers' tier precision A+B at or above 85%.
- « Operating income »: fewer than 50 UK lines say it; the UK tier
  does not name it and the US tier still does — the collision is not
  resolved by this source alone, and the honest fix is then to let
  the FRC exact tier and the UK tier *outrank* a US-filer answer only
  when they answer, which is what the dialect order already does.
  Prediction: the label stays named the American way on a `uk` file,
  and that is said.

## Out of scope, named

- No finding uses the mapping.
- Reading the dialect off a file is not decided here.
- Only three days of accounts; a month would be better and is a
  standing job, not this round.

---

# Results

*(appended after the round; nothing above this line changes)*

## Result — 2 September 2026

### Measure 1 — the pairs

| | |
| --- | --- |
| Accounts read | 61,486 (three daily zips, 432 MB) |
| Tagged numbers read | 1,718,630 |
| Dropped: no printed row label in the number's row | 399,127 |
| Dropped: not an FRC money concept we hold | 156,358 |
| Dropped: pair seen under three times | 3,688 |
| Distinct normalised labels kept | **1,846**, in 3,511 (label, concept) pairs |
| Lines behind them | 1,156,855 — **93.3% balance-sheet concepts** (instant), 6.7% movements |

What British filers write, by concept (lines):

- `TurnoverRevenue` (1,444): turnover 1,197 · revenue 15 · sales 14, and
  segment rows (« united kingdom », « europe ») that are the same
  number split by region.
- `OperatingProfitLoss` (1,090): operating profit or loss 486 ·
  operating profit 369 · operating loss 94 · profit from operations 4.
- `ProfitLossBeforeTax` (52): profit before taxation 33 · profit on
  ordinary activities before taxation 4.
- `Creditors` (117,476): creditors: amounts falling due within one year
  63,300 · after more than one year 27,063.
- `NetCurrentAssetsLiabilities` (83,421): net current assets
  (liabilities) 43,161 · net current assets 24,432 · net current
  liabilities 13,743.
- `Equity` (many): capital and reserves 53,428 · called up share
  capital 29,316 · profit and loss account 19,444 · shareholders funds
  12,873 · retained earnings 8,917 — small companies tag every line of
  the equity table as `Equity` with a member; the label-to-concept
  pair loses the member. A B-grade answer by construction, named.

### Measure 2 — coverage on the sixteen PR24 models (dialect `uk`)

| Sheet class | Money rows | Named | Share | Before this round | Of which UK tier |
| --- | --- | --- | --- | --- | --- |
| statements | 8,272 | 912 | **11.0%** | 9.1% | 448 |
| calculations | 189,267 | 7,104 | 3.8% | 3.1% | 3,744 |
| pooled | 197,539 | 8,016 | 4.1% | 3.3% | 4,192 |

The British lines now name — `Revenue → TurnoverRevenue`, `Operating
profit`, `Profit before tax`, `Tax paid`, `Net profit`, `Total current
assets`, `Dividend` — and the statements still sit near one in nine,
because Ofwat's remaining lines are Ofwat's: « Opex », « Capex »,
« Current tax charge », « Movement in deferred tax provision », « Index
linked debt indexation », « Retained cash balance », « Fixed Assets
balance ». No filer of statutory accounts writes those, so no filer
source will name them. That is the multiplication-pattern round's
territory, not this one's.

### Measure 3 — the second corpus

2.7% pooled (was 2.0%); statements 18.7%; the founder's model 20.5%
(unchanged — its named rows were already exact or American).

### Measure 4 — precision, the UK filers' tier

The thirty-row filers stratum of the fresh sample (seed 20260902,
kept by row this time) held **19 UK-tier rows** and 11 US-tier ones;
the nineteen judged from the label and its sheet: **12 A, 7 B, 0 C —
100% A+B.** The seven B: « Capital allowances » on the tax sheets
named as the *tax effect* of capital allowances in a reconciliation
(right family, the model's row is the allowance itself), and
« Dividend » named as the *final* dividend. The A: tax paid, revenue,
total equity, total current assets, net profit.

### Measure 5 — the dialect collision

No UK filer writes « Operating income » (zero pairs). Under dialect
`uk` the UK tier is silent and the US tier still names it operating
profit, 897 of 897 — as predicted, and said. The row stays wrong on a
British file until a rule can read the sheet's order (revenue above
it, profit below it), which is a different kind of evidence and a
different round.

### Predictions, scored

- One day is mostly small companies; 80%+ balance-sheet facts;
  turnover in under a quarter of accounts — **holds** (93.3%;
  turnover on about 720 of 61,486 accounts).
- PR24 statements at least 30% — **wrong** (11.0%), for the reason
  above: the remaining lines are the regulator's own words.
- Calculations under 15%, pooled under 20% — hold.
- Second corpus between 2% and 6% — holds (2.7%).
- UK-tier precision at or above 85% — holds (100% A+B on 19 rows).
- « Operating income » unresolved by this source — holds.

### What a customer sees differently

Nothing yet, by design: no finding reads the mapping. What changed is
what the engine *knows*: a British model's revenue, operating profit,
profit before tax, tax paid, creditors, net current assets and cash
lines now carry a meaning with a sign and a period type, backed by
how tens of thousands of UK companies filed the same line. The next
round that reads the mapping — the sign check, or the period check —
has something to read on a UK file.
