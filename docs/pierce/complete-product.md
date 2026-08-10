# The complete product

Written 10 August 2026. Not an MVP plan and not a v1 scope — this is what
the whole thing is, what exists of it, and what order the rest gets built
in.

---

## What the measurement changed about the design

The engine finds **56%** of the defects it is shown and invents nothing.
That number decides what the product can promise, and it rules one promise
out entirely.

**It cannot promise « we find your mistakes ».** Nothing that misses four
in ten can say that, and no competitor's engine can either — the best
published detector on this problem sits near 62%.

**It can promise « nothing you have confirmed can go stale without you
being told », and keep that promise at 100%.** That is the design the plan
already called the decision the whole product rests on, and the accuracy
work turns it from a nice architecture into the only honest one:

> A link is **proposed** by the engine and **confirmed** by a banker. After
> that it is data. Re-checking is arithmetic — fetch the cell, apply the
> recorded transformation, compare at the printed precision. No model is
> involved, the answer is the same every time, and it is right or it is a
> bug.

So the product splits cleanly in two, and the two halves have different
guarantees:

| | Guarantee | Today |
|---|---|---|
| **Discovery** — proposing links, finding defects nobody flagged | Probabilistic. Improves; never reaches 100% | 56% recall, 0 invented |
| **Maintenance** — re-checking what is already confirmed | **Deterministic. 100%, permanently** | Engine built, nothing persisted |

Everything below is arranged so the deterministic half carries the product
and the probabilistic half assists it. A banker who confirms forty links on
a deal gets forty figures that can never silently drift, plus a machine that
volunteers more.

---

## The spine: the chain, persisted

Nothing is persisted today. The engine is a library that reads two files and
returns findings. **This is the single largest gap between what exists and
what the product is**, and everything else waits behind it.

### The object model

```
Deal
 └─ Artifact                    a model, a deck, a memo, a source document
     └─ ArtifactVersion         every upload; the chain is versioned or it is a snapshot
         ├─ Figure              a number printed in a deliverable: label, location, precision
         ├─ Cell                a named cell in a model: row label, period, formula, precedents
         └─ Extract             a figure lifted from a PDF, with page and bounding box

Link        Figure ── Cell ── Extract
            + transformation   identity, sum over a range, margin, growth, unit conversion
            + basis            reported / adjusted / pro forma / run-rate / pre-IFRS-16, and the period
            + confirmed_by, confirmed_at, superseded_by

Finding     drift · audit defect · contradiction · staleness
            + state            open / accepted / dismissed / fixed
            + evidence         the chain, rendered

CheckRun    what was checked, against which versions, by which engine build
```

Two fields carry more weight than the rest. **`basis`** is what stops
$41.2mm reported being compared against $48.9mm adjusted, and the Cascade
pair exists to prove that trap is real. **`confirmed_by`** is what converts
a guess into a fact, and it is why a 56% engine can back a 100% promise.

### What has to be true of it

- **A confirmed link survives a new version of either file.** The model
  gains a row, the deck is re-exported, and the link still points at the
  figure it was confirmed against — matched by label and position, not by
  cell address, because the Cascade Outputs tab already proved cell
  addresses go stale.
- **A change propagates.** A cell moves and every figure downstream of it
  is marked stale, in one query, without re-running anything.
- **The chain is the record and the documents are not.** Figures, sources,
  transformations, bases and versions are retained; the deck and the model
  are processed and dropped. That is the security posture the plan
  commits to and it must be true in the schema, not in a policy document.

**6–8 weeks.** [estimate] Migrations, repositories, services, endpoints,
background extraction, staleness propagation, and the confirm workflow.

---

## Layer by layer, with what exists

### 1. Ingestion

| | State |
|---|---|
| `.xlsx` | **Built.** Cells, labels, formulas, precedents |
| `.xls` | **Built.** 99.2% of 1,590 files, formulas decompiled from the binary |
| `.pptx` | **Built.** Text, tables, metric tiles, chart series |
| `.docx` | **Partly.** The redline engine reads and edits it; no figure extraction |
| **`.pdf`** | **Not started.** Audited accounts, IC papers, data-room documents |
| Connectors | Not started. SharePoint, OneDrive, Teams, iManage, NetDocuments, the data room |

PDF is the one that completes the *chain*. Today it runs model →
deliverable. The product's claim is source → model → deliverable, and the
source is almost always a PDF of audited accounts. Layout-aware table
extraction with page and position kept, so a finding can say « page 47 ».

**PDF: 4–6 weeks.** **Connectors: 4–6 weeks**, slow for political reasons
rather than technical ones — each needs a firm's IT to approve it.

### 2. Extraction and linking

| | State |
|---|---|
| Figures from a deck, with the words that name them | **Built** |
| Cells from a model, named from row and column labels | **Built** |
| Link proposal, on words and never on values | **Built.** 102 of ~115 Cascade figures |
| **Transformations** | **Not built.** Only identity today |
| **Confirmation and persistence** | **Not built.** The core gap |

**Transformations** are what let a deck figure link to something the model
does not hold as a single cell: a sum over a range, a margin, a growth
rate, a CAGR, a unit conversion, a currency translation. Cascade's revenue
CAGR is computed on the Outputs tab and exists in no cell; on a model
without an Outputs tab it would be unreachable. Each transformation is a
named, deterministic function stored on the link, so re-checking stays
arithmetic.

**3–4 weeks** on top of the spine.

### 3. Checking

| | State |
|---|---|
| Deck ↔ model tie-out | **Built.** 0 false positives on the Cascade pair; **recall unmeasured** |
| Model self-audit | **Built.** 56% recall, 0 collateral, 9 rules from published standards |
| Cross-document contradiction | **Built**, tuned for legal documents |
| Word redline — defined terms, cross-references, house style | **Built**, tuned for legal documents |
| **Cross-foot and three-statement articulation** | **Not built.** Does the balance sheet balance, do the flows tie |
| **Outlook pre-send** | Not started |

Re-tuning the two legal engines for banking documents — CIMs, IC papers,
engagement letters — is **2–3 weeks**, faster than the first time because
the method and the harness exist.

Cross-foot and articulation need the *statement structure* recognised, not
just the grid: which rows are the balance sheet, which is net income, which
is the cash flow. **3–4 weeks.**

### 4. Surfaces

| | State |
|---|---|
| Web deal workspace | Matters, documents, members, invitations **built**; nothing about models, decks, links or findings |
| Word add-in | **Built, never run in Word.** Forked, Apache 2.0, self-test deployed and unrun |
| **PowerPoint add-in** | Not started |
| **Excel add-in** | Not started |
| **Outlook add-in** | Not started |
| **The proposal layer** | Not started, and load-bearing |

**The proposal layer is the hardest thing on this list and the one most
easily promised by accident.** PowerPoint has never had tracked changes;
Excel's is a deprecated shared-workbook feature. « Nothing leaves the firm
without a banker accepting it » therefore has to be *built*: a change is
proposed, shown before and after, applied on accept, and reversible. It
also needs a `.pptx` splice engine written the way the `.docx` one was —
byte-level, nothing re-serialised.

**Web workspace 4–6 weeks · PowerPoint 5–7 · Excel 4–5 · Word 2–3 ·
Outlook 3–4.**

### 5. What a firm requires before it will buy

| | State |
|---|---|
| Auth, tokens, scopes | **Built** |
| Billing | **Built** — this repository is a payments platform |
| Playbooks / house standards | **Built** for legal; the shape carries over |
| **SAML SSO and directory federation** | Not started |
| **Tenant isolation, proven** | Partly — needs an explicit model and a test suite that tries to break it |
| **Retention policy, enforced in the schema** | Not started |
| **Audit trail** | Not started. Who checked what, when, against which version |
| Admin, roles, seats | Partly |

**6–8 weeks**, and it gates the first pilot rather than the first demo.

---

## The order, and why

**1. The spine.** *(6–8 weeks)* Nothing else can be built on a library that
forgets everything. This is also where the product's actual promise —
confirm once, never drift again — becomes true rather than designed.

**2. The web workspace on top of it.** *(4–6 weeks)* Upload a model and a
deck, see every figure and where it came from, confirm the links, watch the
findings. **This is the first thing that can be shown to a banker**, and it
needs no Office integration at all.

**3. Transformations, and re-tune the legal engines.** *(5–7 weeks)* The
first widens what can be linked; the second makes the Word surface about
banking documents.

**4. PowerPoint, with the proposal layer.** *(5–7 weeks)* The deliverable
surface, and the piece everything else about « nothing leaves without a
banker accepting it » depends on.

**5. Excel, then Word.** *(6–8 weeks)* The audit in place, jump to the cell
behind a figure; Word largely exists and needs verifying and re-pointing.

**6. PDF sources.** *(4–6 weeks)* Completes the chain to its actual
beginning.

**7. The firm layer.** *(6–8 weeks)* Before the first pilot, not before the
first demo.

**8. Outlook, then connectors.** *(7–10 weeks)*

**Complete: roughly 11–14 months** of focused work. [estimate], and the
further down the list the wider the range.

**Something a banker can react to: about 3 months** — the spine and the
workspace. That number is honest because it needs no Office integration,
no PDF, and no proposal layer.

---

## What « complete » means, stated as tests

Not a feeling. Each of these either passes or does not.

1. Upload a model and a deck. Every printed figure is either linked to a
   cell, or listed with a reason it was not.
2. Confirm forty links. Re-upload a revised model. Every figure downstream
   of a changed cell is marked stale, correctly, with no model involved.
3. Change one assumption on the Assumptions tab. Dozens of deck figures go
   stale at once and each one names the chain from the assumption to the
   slide. *(The Cascade README calls this the realistic case: not one typo,
   but a model revision the deck has not caught up with.)*
4. A finding opened in PowerPoint proposes a fix, shows before and after,
   applies on accept, and can be reversed.
5. A figure traces to a page and a table in the audited accounts.
6. Two decks in one deal quoting the same figure differently are reported.
7. A firm's IT runs a security review and finds SAML, tenant isolation, a
   retention policy that keeps the chain and drops the documents, and an
   audit trail.
8. Deleting a deal deletes the documents and keeps nothing that identifies
   the client.

---

## The three risks, ranked

**Nobody has judged whether the findings are useful.** Still first, still
unaddressed, and it needs one banker for one hour with a printout — not a
Word, not a screen, not a login. Every week this waits is a week of
building on an assumption.

**The proposal layer is a build, not a feature.** Several weeks, on a
capability Office does not have, underneath a promise that is easy to make
in a sentence. It is costed above; the risk is promising it before it is
costed again.

**Discovery is 56% and the product is designed around that being fine.**
It is fine — for maintenance. It is not fine if anyone ever describes the
product as catching errors, because a banker who believes that and is
wrong four times in ten is a banker who stops using it. The accuracy
backlog is in `accuracy-backlog.md`; the *design* consequence is that the
confirm step is mandatory and can never be made optional to save a click.
