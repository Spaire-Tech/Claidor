# Build order: the product first, the accuracy forever

Decided 10 August 2026. Supersedes the sequencing in
`complete-product.md`; the layer inventory there still stands.

## The decision

Build the whole product — every surface, every screen — before doing more
work on how accurate the engine is. Improve accuracy continuously
afterwards, forever, because it never finishes.

## Why this is right, and not just nicer

It would be a bad plan if it meant screens with nothing behind them. It
does not, and the reason is that **the engine is already accurate enough
to make every screen show true things.**

- It reconciles 102 of ~115 printed figures in a real deck.
- It has **never once invented a finding** — 0 false positives across two
  decks, 150 planted defects, and 1,577 real spreadsheets.
- The nine findings it reports on the Cascade « clean » deck are all real.
  Nobody knew they were there, including the person who built the pair.

So a deal page built today shows real drift on real files. It is not a
prototype pretending. It is the product, with an engine that will keep
getting better underneath it — which is exactly what the founder said and
is a description of every good product that has ever shipped.

The inverse plan — perfect the engine, then build — has a failure mode
this one does not: **it optimises against a guess about what matters.**
Nobody has yet judged whether these findings are useful. Screens in front
of a banker answer that in an afternoon; another month of recall tuning
does not.

## The one thing that cannot be retrofitted

**The shape of the data.** Screens can be restyled, rewritten, thrown
away. A schema that cannot hold versions, confirmations, bases or the
chain means rebuilding everything above it.

So week one is invisible, and it is the only invisible week. What has to
be right, not complete, on day one:

- Every artifact is **versioned**. Not « the model », but « the model as
  of Tuesday ».
- A link carries **basis** and **who confirmed it, and when**. Even before
  anything reads those fields.
- A finding has **state** — open, accepted, dismissed, fixed — because a
  dismissed finding that comes back is the fastest way to lose a user.
- Everything points at **labels, not cell addresses.** Cascade's own
  Outputs tab already went stale by one row; addresses are not identity.

Get that shape right and every screen after it is additive.

## Every surface read-only, before any surface writes

The insight that makes the whole product reachable quickly:

> **A panel that shows findings is days of work. A panel that changes the
> document is weeks.**

Writing is where the hard parts live — the proposal layer standing in for
tracked changes PowerPoint has never had, the `.pptx` splice engine, the
reversibility. Reading is the same panel four times over against four
hosts.

So: all five surfaces exist and show real findings **before** any of them
can apply a fix. The product is *there*, complete in shape, and then it
grows teeth.

## The cadence

What is visible, and when. [estimate] throughout.

| | What appears | When |
|---|---|---|
| **1** | *(invisible)* Schema, upload, extraction pipeline, check runs | Week 1 |
| **2** | **The deal page.** Drop in a model and a deck, get a findings list against real files | Week 2 |
| **3** | **The chain.** Click a finding → the slide → the cell → the formula → what it is built from | Week 3 |
| **4** | **Confirm.** Proposed links accepted or rejected; state persists; re-check is deterministic from here | Week 4 |
| **5** | **The figure map.** Every number in the deck, coloured: agreeing, drifting, unchecked. Coverage made visible | Weeks 5–6 |
| **6** | **The model page.** The audit, the chain, the version history, what moved since Tuesday | Weeks 5–6 |
| **7** | **Four Office panels, read-only.** Word (exists), PowerPoint, Excel, Outlook — the same panel, four hosts | Weeks 7–10 |
| **8** | **Writing.** The proposal layer, apply-on-accept, reversible. Tracked changes in Word | Weeks 11–16 |
| **9** | PDF sources, the firm layer, connectors | Months 5–8 |
| **10** | Accuracy | Forever, starting now, never blocking |

**Something real on screen: two weeks. The whole web product: six. All
five surfaces: ten.**

## The honesty mechanism

A product that looks finished invites the belief that it is. The engine
misses roughly four defects in ten and that must never be hidden by good
design.

**So the coverage number lives in the interface, not in a document.**

> *« 102 of 115 figures reconciled · 13 not checked, and why »*

On the deal page, always. It does three things at once: it tells the truth,
it makes the unchecked figures clickable rather than invisible, and — the
part that matters for morale — **it turns accuracy work into visible
progress.** When recall improves, that number moves on a screen he looks at
every morning. The invisible half of the work stops being invisible.

## What this does not change

- The confirm step stays mandatory. A 56% engine backs a 100% promise only
  because a human signs the link. Never make it optional to save a click.
- « Nothing leaves the firm without a banker accepting it » still needs the
  proposal layer built, and it is still weeks.
- One banker, one hour, a printout. Still the top risk, still unaddressed,
  and now cheaper than ever to retire — because in two weeks there will be
  a screen to point at.
