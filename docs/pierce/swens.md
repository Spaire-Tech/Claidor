# Swens — the product, in the founder's words

**This is the document of record.** The founder wrote it; it is
reproduced verbatim below. Where anything in this repository
disagrees with it — a plan, a screen, a docstring, an opinion of
mine — this wins.

It supersedes the name in the older files (Antford → Ances → Ambre →
**Swens**) and the product definition inside `ambre-plan.md`, whose
tracks and method still stand but whose name and framing do not.

**Read this before answering any question about what Swens is, what
it does, what it sells, or what a screen should contain.** Today
(23 August 2026) I answered several such questions from memory
while this document and the code both sat unopened, and told the
founder things that were not true. That is what this file exists to
stop.

---

## Swens

Swens is a model review platform for finance. It reads the financial
model behind a deal, finds what is wrong with it, and keeps that
picture current as the model and the documents around it change.

## 1. The whole thing in one sentence

Every deal in finance rests on a spreadsheet. Swens reads that
spreadsheet properly — not as a grid of numbers but as a structure,
with its time axis, its sections, its debt schedule and its carries —
finds the defects a professional model auditor is paid to find,
checks the model's typed inputs back against the contracts they came
from, checks the decks and memos built on top of it, and checks its
assumptions against the outside world. Then it watches all of that as
the model changes.

The key word is review. Swens never builds the model and never writes
the deliverable. That is the point, not a limitation.

## 2. The problem Swens attacks

A financial model is the most important document in a transaction and
the least examined. It decides the price, the debt, the returns and
whether the deal happens. It is built under time pressure by junior
people, revised dozens of times, and read end to end by almost
nobody.

What goes wrong, in the order it hurts:

* **Mechanical defects.** A formula gets typed over with a number. A
  sum misses a row. A link breaks and freezes. These are invisible in
  a file with half a million cells, and they are common enough to
  measure: across sixteen regulated company models revised over one
  cycle, eighty-four new mechanical defects appeared, and ten of the
  sixteen gained at least one. In a published financing model for a
  £213m hospital, a hundred and seven frozen reference errors —
  several of them sitting on the model's own audit sheet.
* **Unit confusion.** A monthly figure used where an annual one
  belongs. A percentage treated as a decimal. Dollars added to
  pounds. Thousands mixed with millions. These are the quiet ones,
  because the formula looks perfectly correct and every consistency
  check passes. Only the meaning is wrong.
* **Wrong inputs.** The spreadsheet can be flawless and still be
  wrong, because someone typed the wrong rate, or used a draft
  figure, or copied from a superseded term sheet. Nothing inside the
  file can catch this.
* **Documents drifting from the model.** Numbers get copied into a
  deck, a credit paper, an information memorandum. Then the model
  changes and the documents do not. The client receives the old
  number.
* **Nobody watching the changes.** Models are revised constantly.
  Every revision can introduce a defect, repair one, or quietly
  change a methodology. Today the only record of what changed between
  version 8 and version 12 is somebody's memory.

The last one deserves a harder look, because it is where the
profession's habits are weakest. When someone sends a revised model
and says they only changed the tax rate, there are two ways to check
them today. Compare the text of the two files, which tells you which
cells look different — but a cell can look identical and behave
differently because something upstream moved, and a cell can look
different and behave identically because a formula was rewritten to
say the same thing. Or compare the numbers, which tells you about one
scenario: the one the model happens to be sitting in right now.

The pressure is rising from another direction too. AI now drafts
models, decks and memos faster than ever, on the stated principle
that the machine drafts and a person signs off. More documents,
produced faster, with the checking still assigned to someone who does
not have time. Every improvement in generation increases the amount
of work waiting at the review step. And machine-written work fails
differently from human work: it does not leave a broken link behind,
because it never had a link. It fills the gap instead of admitting
it. Which makes untraceable a defect class in its own right, and a
growing one.

### Where Swens sits next to the model audit

On some transactions — project finance, structured deals, anywhere a
lender requires it — an external firm performs a formal model audit:
roughly £35,000, four to five weeks, ending in a signed opinion
letter carrying millions of pounds of that firm's own liability.
Lenders do not buy the letter for its findings. They buy it because a
deep-pocketed institution has put its name behind the model. No
software can sell that, and Swens does not try to. The opinion letter
stays exactly where it is.

Two things follow, and they matter more than they first appear.

On audited deals, Swens is bought by the people who have to survive
the audit, not by the people who commission it. A model that enters
audit carrying forty defects comes back with forty comments. Each one
is a fix, a re-issue and a re-review. Audit cycles are the schedule
risk in a financing, and schedule risk is expensive in ways that are
easy to count. Arriving at audit clean is worth real money to a
sponsor with a closing date.

On most transactions there is no model audit at all. Corporate M&A,
the majority of private equity work, internal committee models,
treasury and forecasting models — nobody signs an opinion letter on
any of them. The model carries the decision and no external party
ever reads it. That is the larger population, and there Swens is not
sitting beside anything.

There is also a lighter product the audit firms sell themselves — a
pre-audit review, faster and cheaper, explicitly without a liability
cap, findings only. They drew that line, and findings are what
software produces better than people: faster, cheaper, on every
version instead of once, and without a person having to read half a
million cells.

Because Swens never competes for the opinion letter, the firms that
sell it are potential customers rather than only competitors. Their
margin improves when the findings arrive before their people start
reading.

## 3. The product, part by part

Six parts: the Engine, the Chain, the Watch, the Grid, Chat, and the
Excel panel.

### a) The Engine — reading the model properly

Everything else rests on this. Swens reads an Excel workbook the way
a model auditor reads it, not the way a parser reads it.

It maps the structure first: the time axis, including models that run
monthly through construction and semi-annually through operations;
the sections the model's own sums declare; every opening and closing
balance carry; where the balance sheet and the debt schedule live. It
cites the evidence for each of these and stays silent when it cannot
tell.

Then it runs its checks over that structure. There are four kinds,
and they find different things.

**Structural checks** look at how the model is built. Typed-over
formulas, hardcoded numbers buried in formula tails, sums that skip
rows, broken and frozen references, skipped cells, error values. Plus
the model's own check rows, read and reported rather than ignored.

**Financial checks** ask whether the model obeys the rules of
accounting and finance. Does the balance sheet balance. Does every
cash carry hold. Does the debt repay to zero on the tranches that
actually amortise. These are conservation laws: quantities that must
hold no matter what the inputs are.

**Unit checks** ask what each number actually measures. Swens reads
the row and column labels to work out whether a figure is monthly or
annual, a percentage or a decimal, pounds or dollars, thousands or
millions — then checks that every formula combines compatible things.
This catches the class of error that survives everything else,
because a formula that adds a monthly figure to an annual one is a
perfectly valid formula. It is only wrong in meaning. Financial
models are unusually good ground for this: the time axis runs across
the top and the labelled line items run down the side, which is
exactly the regular structure the method needs.

**Behavioural checks** test the model by running it, not by reading
it. Every model must obey certain laws of its own arithmetic. Set
volume to zero and revenue must be exactly zero — if it is not, there
is a constant hiding inside the revenue line. Double every price and
revenue must double. Express the whole model in cents instead of
pounds and every ratio and return must be unchanged. Sum the segments
and they must equal the consolidation. When one of these
relationships breaks, there is a defect, guaranteed — even though
Swens never needed to know what the right answer was supposed to be.
This is how a hardcode buried in the tail of an otherwise correct
formula gets caught.

These run against a recalculation engine that Swens validates before
it trusts. Swens runs the unmodified model through it first, and only
proceeds if it reproduces what Excel itself stored. An engine that
cannot reproduce the base case is not permitted to judge the
transformed one.

Four principles keep all of it trustworthy, and they are not
negotiable:

**One authoring situation, one finding.** A formula dragged across
four hundred cells is one decision by one person, not four hundred
problems. A deliberate financing circularity is one loop, not
twenty-two thousand circular cells. Getting this wrong is the
difference between a report someone reads to the end and a wall of
noise.

**Never match on values.** A number is found by what it is called —
the row label and the column header — never by searching for the
number itself. Matching on value is circular: it proves a figure
equals itself.

**Never guess between two candidates.** When two cells could both be
the answer and the scores are close, Swens abstains and says so. A
wrong confident answer costs more than an admitted gap.

**Always show coverage.** Every report says what was checked and what
was not, and why. "102 checked, 26 not, here is the reason" is a
professional statement. A number with no denominator is not.

Speed matters more than it sounds. A model of six hundred thousand
cells reads in under a minute, and a full check run finishes in
seconds. That is what lets review happen on every material version
instead of once at the end.

### b) The Chain — where every number actually comes from

A model has three kinds of number, and each needs a different check.

**Calculated numbers** come from formulas. The Engine handles those.

**Typed numbers** came from somewhere outside — a contract, a term
sheet, a supplier quote, a tax opinion. Swens links each one back to
the page it came from. Ask where 4.35% comes from and the answer is a
page of the credit agreement, one click away.

The mechanic that makes this hold: Swens proposes the links it is
confident about, and a person confirms them. A confirmed link stops
being a guess. From then on, re-checking it forever is pure
arithmetic. That confirmed map is the asset that accumulates — and
once it exists, the underlying files are no longer needed. Keep the
chain, drop the documents.

It also produces a finding class of its own. A typed number with no
confirmable source is not merely undocumented; it is a number nobody
can defend. Swens flags it as such. That check earns its keep today
against a lazy paste, and it will earn more as more models are
drafted by machines that never had a source to point at.

**Numbers in the documents** are the third kind. Every figure that
leaves the model for a deck, a memo or a credit paper gets matched
back to its source cell — by label and column, never by value,
compared at whatever precision the document chose. Rounding-only
differences are ranked last and labelled as rounding, so a real error
never hides behind forty trivial ones.

Then there is the fourth direction, **outward**. With connectors into
filings, market data and company records, Swens asks the question no
internal check can: does this model agree with the world? The model
says last year's revenue was 412 and the filing says 409. The
benchmark rate in the model is thirty basis points stale. The share
count does not match the latest quarterly filing. None of these is a
spreadsheet error. Every one of them is a wrong answer.

The outward checks are built in order of what they cost and what they
catch. Public and regulatory sources come first — company filings,
regulator publications, central bank and administrator rate sources —
because they are free and they carry the hardest checks: historicals
against filed accounts, and assumptions against published rates. Paid
market data follows, read through the firm's own subscription under
their own entitlement, once the check class has proven itself and the
vendor terms are settled.

### c) The Watch — what changed, and what it broke

Models do not sit still. They are revised through the deal and, on
large financings, for decades after — the contracts themselves
anticipate the model being adjusted and re-agreed across the life of
the asset.

Swens re-checks on every material version, not every save, and
reports the delta in the language that matters: which defects are
new, which were repaired, which assumptions moved, whether a
methodology changed, and what became materially different.

This surfaces things a single-version review cannot see. A revision
can repair a typed-over cell by restoring its formula, then hardcode
a late adjustment into the tail of that same formula — the defect
does not die, it changes class. Only a comparison across versions
catches that.

And it answers the harder question underneath. Beyond listing what
changed, Swens establishes what did not — that outside the cells you
were told about, the new version computes the same answer as the old
one for every possible set of inputs, not merely for the scenario the
model is sitting in today. This is tractable precisely because almost
every cell is untouched between two versions: the unchanged region
can be set aside, leaving only the changed cells and whatever flows
downstream of them to reason about. The work stays small even in a
very large workbook.

The difference in what a reviewer can then say is not small. "We
found three changes" is a report of what was noticed. "Three cells
changed and nothing else in the model behaves differently" is a
statement about what is not there — the thing a partner actually
wants before signing.

This is ordinary practice in industries where being wrong is
expensive. When a chip is revised, the new design must be proved to
compute the same function as the old one before it goes to
manufacture; it has been a required sign-off step for about
twenty-five years. The chip in a phone clears that bar. The model
deciding a billion-pound financing currently clears a text
comparison.

The Watch extends to documents too. If the model moved and the deck
did not, that is a finding, not a formatting note.

### d) The Grid — findings as a workspace

A large model produces a lot of findings. The Grid is where they
live: every finding with its rule, its sheet, its cell, its evidence
and its severity, sortable and filterable.

Severity is not decoration. A fifty-pence rounding drift and a
seven-hundred-thousand-pound timing slip must never read the same.
Materiality thresholds, rounding tolerance and range formatting are
the firm's own settings.

False positives are treated as a first-class defect in Swens itself,
not an acceptable cost of thoroughness. A reviewer who stops trusting
the list stops reading it, and a tool that produces a thousand flags
to find fifty real ones has made the work harder rather than easier.
Every check is measured on how many wrong flags it produces, and a
check that cannot be made quiet does not ship.

The Grid also holds the second use of extraction: pulling the terms
out of the contracts, term sheets and quotes into a structured table,
so the model's inputs can be tested against them at scale rather than
one at a time.

### e) Chat — about this model, not about the world

Chat in Swens is anchored to the model in front of you. It answers
questions that need the structure map: why did the debt service cover
ratio fall between these two versions, which cells feed equity IRR,
where does this number come from, show me every hardcoded value in
the debt schedule above materiality.

It is deliberately not a general research assistant. A chat that
knows nothing about the file you are looking at is a worse version of
tools that are already free.

### f) The Excel panel — findings beside the cell, and corrections that follow from them

The reviewer works in Excel, so the findings appear there: select a
cell, see what Swens found, see the chain behind the number, mark a
finding accepted or explained on the record.

Many findings carry their own answer, and where they do, Swens
supplies it.

The rule is that a correction must be **determined**, not inferred.
Swens proposes a fix when the right value follows from something it
can already point at, and reports without proposing when supplying
one would mean guessing what somebody meant.

Determined covers more ground than it sounds like:

* A figure in a deck disagrees with the model. The correct value is
  not a guess — it is the model's own number, and Swens says so.
* A cell has been typed over inside a block whose own pattern
  declares what belongs there. Restoring the formula is not
  invention; it is putting back what the surrounding model already
  states.
* A sum has skipped a row inside a range the model's own structure
  defines. The corrected range follows from the structure.
* A unit mismatch where the labels determine the conversion. Monthly
  to annual is arithmetic.
* A stale figure where the source is confirmed and the source has
  moved. The new value is in the document Swens is already linked to.

Inferred is the other side of the line, and Swens stops there. A
formula that simply looks unusual, with nothing in the model
declaring what it should have been, produces a finding and nothing
more. A proposal that would be right most of the time is still a
guess dressed as an answer, and the whole product rests on not doing
that.

Where a correction is proposed, Swens produces a real new version of
the file with the figure fixed — reversible, held in Swens's custody,
and released only when a person accepts it. Swens never writes into
the customer's own file store or mailbox, and never applies a change
on its own authority.

## 4. How Swens gets the files

**By hand, at first.** The firm sends the model and its versions the
way it sends them to any external reviewer today. Secure transfer, an
existing approved route, nothing new touching the network. This is
deliberate: it means a first engagement requires no integration, no
security review and no new access — the work starts the week it is
agreed.

**By connection, once the relationship exists.** A firm tired of
sending files can point Swens at its own document store, read through
the firm's identity and permissions. A deal points at a folder, files
are re-read only when their content changes, and the designated model
is the counterparty — working copies are deliberately ignored. This
is a convenience upgrade sold to an existing customer, not a
condition of the first sale.

**What else Swens reads.** The deal's documents — contracts, term
sheets, quotes, opinions, and the decks and memos built on the model.
Public and regulatory sources — company filings, regulator
publications, government data, published benchmark rates, all free
and enough to carry the outward checks that matter most. And paid
market data, read through the firm's own subscriptions under their
own entitlement; that route exists and the major vendors run partner
programmes for it, but it requires an agreement with each vendor, and
the terms question is answered before the integration is built.

Swens owns no content and republishes none. What accumulates is the
confirmed link map: which cell depends on which page, which figure
was checked against which source, and who vouched for it.

## 5. Why the findings can be trusted

Four commitments, and they are what separates a review tool from a
suggestion box.

**Swens never re-derives a number to judge it.** It reads what Excel
itself calculated and stored. If a workbook was saved with
calculation set to manual, Swens refuses to reconcile against numbers
Excel does not believe, and says so, rather than quietly producing a
comparison that means nothing. The behavioural checks are the one
place a model is run rather than read, and there Swens is comparing
two runs of the same engine to each other — never a run of its own
against a figure Excel produced.

**Swens never mixes judgement with arithmetic.** Errors and judgement
calls are never summed into a single score. A frozen reference is a
fact. A questionable assumption is an opinion. They are reported as
different things.

**Every refusal says what to do about it.** An abstention is not a
shrug. It names what was missing and what would resolve it.

**Every claim carries a measured number behind it.** Swens's own
detection rate is measured the way software testing measures it:
known defects are deliberately seeded into real models, and the share
Swens catches is recorded for each class of defect separately. A
blended headline figure would collapse the first time a customer
tested it, because detection genuinely varies by defect type. Per
class, with coverage stated, it holds. No firm in this industry
publishes such a number, and the argument for automated review is
much weaker without one — the research showing that careful human
reviewers miss close to half of real errors is only half an argument
until the reviewer can be shown what the alternative catches.

The result is a report that can be handed to a partner. Every finding
cites its cell. Every typed number cites its page. Every document
figure cites the cell it should have matched. Coverage is stated on
the face of the report.

## 6. Independence is the product

There is one line Swens does not cross: **it never authors the thing
it reviews.**

No model building. No deck writing. No memo drafting. Not because
those are hard, but because the moment Swens writes a model, Swens
can no longer be the check on that model. No auditor signs off on
their own work.

A determined correction does not cross this line, and it is worth
being precise about why. When Swens restores a formula the
surrounding block already declares, or replaces a deck figure with
the model's own number, it is not deciding anything. It is carrying a
value from where the model already states it to where the model
contradicts it. Authoring is choosing what the answer should be.
Swens only ever moves an answer the model already holds — and even
then, a person accepts it before it lands.

This is the whole asset. It is why a partner would trust a Swens
finding over their own analyst's, and it is the one thing a platform
that generates deliverables structurally cannot claim about itself —
a system checking its own output is marking its own homework, not
running a control. As more of this work is drafted by machines, that
distinction stops being a philosophical nicety and becomes the reason
an independent reviewer is purchasable at all.

Every feature is measured against this line, and anything that
crosses it costs more than it adds.

## 7. How Swens is sold

**The demo is the product.** No public free checker, no self-serve. A
prospect sends their own model — ideally two versions of it — and
Swens runs against it. The version comparison shows what their own
revision introduced. Nobody argues with findings in their own file,
and nothing had to be installed for them to appear.

**What gets shown first matters.** Swens leads with what nothing else
can produce: a balance sheet that does not balance, debt that does
not clear, a monthly figure sitting in an annual line, a number
traced back to page 187 of the credit agreement, and the delta
between two of the client's own versions. The routine findings are in
the report; they are never the opening.

**Priced per deal.** A deal buys unlimited versions and unlimited
re-checks for as long as that deal runs, and every population has its
own unit: a financial close, a price review submission, an M&A
process, a refinancing. Post-close events are fresh units, because
each one puts the model back on the table.

The reason is who signs. A per-deal fee sits on the transaction
budget as a closing expense, next to legal and advisory costs, at a
size a deal team can approve. A firm-wide software contract sits on
the IT budget, where it meets procurement and a risk committee before
anyone has seen a finding. The first purchase has to be approvable by
the person who has today's problem — which is also why the first
engagement asks for no access to anything.

**Packs are the bridge.** Deal packs at a volume discount are the
second purchase, and they convert a transaction expense into a
standing arrangement without a new negotiation. A firm buying its
third pack is a firm ready to discuss a firm-wide licence and a
connection into its document store — by which point the security
conversation happens with a vendor whose findings the firm already
relies on, rather than with a stranger. Land on the deal budget.
Expand to the firm. Never in the other order.

**Two kinds of customer, and the second one compounds.** Deal
principals — sponsors, funds, lenders, corporate development teams —
buy for their own transactions. The advisory and audit practices buy
differently: they run hundreds of engagements a year, so one
relationship covers a great many models, and their economics improve
directly, because every finding Swens delivers before their people
start reading is margin. The accounting firms in particular license
tools rather than build them. A market with few buyers is a hard
market to sell into one deal at a time and an easy one to sell into a
handful of firms that touch everything.

**House rules are configuration.** Materiality thresholds, rounding
tolerance, which checks are on and which are off — set once by the
firm, applied to every model afterwards. Checks are never switched
off silently; the record shows what was disabled and by whom.
Findings are also mapped to the named modelling standards a firm
already works to, so a reviewer reads them in the vocabulary they
already use rather than in Swens's.

**Deployment answers the objections before they are raised.** Deals
are closed by default: being at the firm grants nothing, being on the
deal grants everything. Model calls route through one configurable
client so a firm can point Swens at its own cloud deployment. Where
Swens reads from a firm's document store, it writes to nothing.

## 8. The three hardest pieces

1. **Reading models properly.** Structure recognition across every
   dialect of financial model, with abstention when it cannot tell,
   and the collapse discipline that turns one authoring decision into
   one finding. This is years of work already done, and it is the
   moat.
2. **The chain through transformation.** Keeping the link intact from
   a page of a contract, into a typed cell, through the model's
   formulas, out into a figure on a slide — and having it survive
   both the model and the document being revised.
3. **Proving what did not change.** Establishing behavioural
   equivalence between two versions of a workbook, rather than
   listing textual differences. The technique is settled in other
   industries; carrying it into spreadsheets is the work.

## 9. Where to point it first

The engine reads any financial model, and the structural, unit and
behavioural checks apply to a small operating model as readily as to
a large one. But the deepest checks — the debt cascade, the covenant
tests, the multi-period carries — only earn their keep where those
structures exist. Depth and breadth pull in opposite directions, and
the first population should be chosen for depth, because depth is
what nothing else offers.

The test is three questions: are the models numerous, are they
revised on a cycle, and does someone with money care whether they are
right?

* **Regulated price reviews** score highest and are already tested.
  Every water and energy company submits models to a regulator, the
  regulator publishes both the models and its own findings, and the
  cycle repeats on a fixed schedule. Eighty-four new defects in one
  revision cycle is already measured, on real files, before anyone
  was asked to buy anything. It is also the one population where a
  defect is not an embarrassment but a regulatory problem with a date
  attached.
* **Project and infrastructure finance** is where the engine was
  proven and where the deepest checks already work — the strongest
  reference base, and the population where the audit-schedule
  argument is sharpest.
* **Corporate and M&A model review** is the largest population by
  volume and the place where no external audit exists at all, so
  Swens is not sitting beside anything. The obvious second test.

The next move is the one that worked before: run the engine cold on
ten models from the target population and see whether the findings
survive hand-verification. The market question gets answered by the
engine, not by more searching.
