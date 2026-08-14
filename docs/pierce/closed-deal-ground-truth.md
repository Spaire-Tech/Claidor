# Ground truth: Dumfries & Galloway Royal Infirmary PA ↔ financial-close model

Built by hand from the redacted Project Agreement (`dgri_redacted_pa_final_me.pdf`,
359 pages, financial close March 2015, Dumfries and Galloway Health Board ↔
High Wood Health (Project Co) Limited) **before the crosscheck has run** —
the commit timestamp is the proof, per `closed-deal-test-protocol.md`.

## The corpus-shape finding, recorded first

The full readable pound-figure inventory of this 359-page deal contract is
ten values, and **not one decimal rate survives redaction**. The redaction
regime removes precisely the figures a financial model holds: every
performance-deduction sum reads « the sum of £ [blank], index linked », the
Annual Service Payment percentage in the default clause reads « % percent »,
the refinancing gain shares read « a % share », and no interest rate,
margin, or indexation rate is readable anywhere. What survives is legal
process thresholds and the corporate structure. A published SFT pair can
therefore test the grounding leg only on the surviving overlap — a live
(unredacted) deal would test all of it. That asymmetry is itself a market
finding: the numbers everyone redacts are the numbers this product checks.

## Targets — plausibly present in the model (the recall denominator,
## pending absence verification)

| # | Figure | What the contract says | Where |
|---|--------|------------------------|-------|
| 1 | 999 × £1 | Project Co issued share capital: 999 non-dividend 'A' Shares of £1 each | p332–333 (Schedule Part 21 §1) |
| 2 | £1 | 1 non-dividend 'B' Share of £1, held by the Board | p332–333, p179 |
| 3 | 51,000 × £1 | Hold Co issued share capital: 51,000 ordinary shares of £1 | p334 (Schedule Part 21 §2) |
| 4 | 25,500 | Laing O'Rourke plc holding: 25,500 ordinary shares (£25,500 paid up) | p334 |
| 5 | 25,500 | Aberdeen Infrastructure Investments (No 5): 25,500 ordinary shares | p335 |
| 6 | 50,000 × £1 | Issuer (Finance Co plc) share capital: 50,000 ordinary shares | p336 (Schedule Part 21 §3) |

Prediction, stated before the run: some or all of these may genuinely not
exist as labelled cells (a model may carry share capital as one £1k line or
not at all). Absence must be verified by search, and named.

## Thresholds — readable but predicted absent from the model, and
## derivative-shaped besides

£200,000 non-payment default trigger (p88); £250,000 insurance excess
(p117); £100,000 High Value Change line (p243); £5,000 Low Value Change
line (p244); £50,000 due-diligence caps (p116, p274, p336 is share capital
not a cap); 2% over LIBOR default interest (p148); Additional Permitted
Borrowings ladder 10% / 50% / 5% (p140); change-protocol thresholds 1%
(p259), 2% (p243), 3% (p274). These are legal machinery, not model
quantities; each will be searched for in the model and its absence (or
surprising presence) recorded. Note they are threshold/cap figures — the
engine's own derivative gate treats such prose as corroborate-only, which
is the correct posture and will be observed in action.

## Redacted — cannot be targets, listed so nobody pretends otherwise

Annual Service Payment amounts; Monthly Service Payment deduction sums
(Minor/Medium/Major); refinancing gain shares; senior debt margins; all
interest and indexation rates; Deductions percentage in Clause 40.1.8.

## What the drift leg tests here

With ~200,000 candidate cells against a 359-page legal document whose
model-shaped figures are redacted, the dominant correct answer is
**silence**. Every drift the engine claims will be adjudicated by hand;
the pre-registered protocol's D criterion (no false drifts) is the test
that matters most on this pair.
