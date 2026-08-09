# Direction — August 2026

A record of what was killed, why, and what replaced it. Written so the
reasoning survives the decisions, and so the next idea gets tested against
the same bar rather than the same hopes.

**Provenance matters in this document.** Claims are marked:

- **[verified]** — checked directly during this work, with the method stated
- **[research]** — from the founder's market research; not independently
  re-checked here
- **[estimate]** — reasoned inference, not measured

---

## Where we landed

Build a contract-checking product that lives inside Microsoft Word, whose
differentiator is a **registry of contract clauses that courts have refused
to enforce**, built from published judgments.

The product is deliberately modelled on Vesence (vesence.com) — an agent
platform across Word, Outlook, Excel, PowerPoint and a web workspace,
selling to law firms, banks and investors, with named Swedish law-firm
case studies. **[verified — fetched vesence.com 2026-08-09]**

The registry is the part Vesence does not have, and is the reason to exist.

One line:

> Vesence checks a document against a firm's own house preferences.
> We check it against clauses that have failed in court, with the case
> attached.

The Claidor repository, domains and infrastructure are kept as the base.
Claidor as a *business* is dead; Claidor as an *engine* is the foundation.

---

## What was killed, and why

### 1. Pierce (M&A deal-document precision checking)

Killed by the founder. No network, no route to buyers, and the public-data
"moat" turned out to be a market benchmark rather than a defensible asset.

Founder's own verdict, and the reason the later kills were quick:

> *"which vertical gets you ten file-opening conversations this month —
> none. I've no knowledge, network whatsoever with any."*

### 2. Pierce (regulatory change intelligence for West African banks)

Scored 2.5–3/10 in research. **[research]**

- No evidence any bank in the region pays for regulatory-change software.
  Desk research cannot prove absence — but the *inverse* finding is solid:
  no vendor is visibly selling into this market.
- The money goes to AML/sanctions screening and to regulatory *reporting*,
  both of which have clear cost savings. Change monitoring does not.
- REGAFRIK offers something similar, free, across the eight WAEMU markets.
- ~40–50 possible customers, ~$1M/year ceiling. **[research]**

One argument in that research does **not** hold and should not be reused:
*"banks must have their own compliance team, so they hire rather than
buy."* Every bank on earth has a mandatory compliance function with a
named accountable officer, and those same banks buy enormous amounts of
compliance software. The real version of the point is about labour cost:
where a compliance analyst is inexpensive, a tool must replace several
people to pay for itself.

Independently estimated ceiling before the research ran: $1–3M. The
research agreed. **[estimate]**

### 3. Claidor (OHADA legal research for francophone African lawyers)

Scored 2.5/10. **[research]**

- No evidence that law firms in OHADA countries pay for legal research
  subscriptions.
- **Maathis** — 24 countries, ~550,000 documents, citing AI, alerts,
  launched around April 2025 — occupies the same position, and is
  registered as a French non-profit, so it may never need to charge. A
  well-funded free competitor is worse to compete with than a paid one.
- Paris firms (Gide, Jeantet) work through African correspondent networks;
  they do not do the OHADA research themselves, so the fallback buyer
  isn't the buyer.
- ~200–250 realistic payers, €100–300k/year.
- UEMOA card-payment rules make billing a euro subscription genuinely
  hard.

Confirmed independently: the production workspace held nine questions, all
asked by the founder. **Zero users after months of building.**
**[verified — production API, 2026-08-09]**

### The pattern worth carrying forward

Three ideas, one failure mode: each was designed and built to a high
standard *before* anyone who felt the pain was consulted, and each was
scoped to a market capped by geography rather than by a problem.

The capability built — verified legal corpora, citation-grounded answers
that refuse to invent, deterministic extraction, computed deadlines — is
not geographically bound. The market selection was the defect, not the
engineering.

---

## Why the registry is a different bet

It is the first idea in this sequence where **the binding constraint does
not block step one.** No customers, no network and no regional TAM cap are
needed to start; the raw material is public and free.

It also has outcomes in it. An earlier version of the moat thesis was to
learn from lawyers accepting or rejecting flags in the product. That was
rejected, correctly: accept/reject measures *agreement*, not *failure* —
there is no outcome anywhere in that loop, the data rights are contestable
inside client documents, and it requires the distribution we don't have. A
judgment, by contrast, records what a court actually did.

### What is honestly claimable

> *This wording has been litigated. Here is the court, the clause, and
> what the court did with it.*

And nothing more. Specifically **not** a risk score: the litigated set is
a biased sample (most contracts never litigate, most disputes settle, and
what reaches judgment skews toward *contestable* rather than *bad*
clauses). Silence must read as "no litigated precedent found", never as
"safe".

---

## Verified facts the plan rests on

### Court data is free and legally clean

- US judicial opinions are not copyrightable (government edicts doctrine).
- **Thomson Reuters v. Ross Intelligence** (D. Del., Feb 2025) concerned
  West's *headnotes* — 2,243 of them — not opinion text. Build on raw
  opinions and the registry sits outside that risk. **[research]**
- The Caselaw Access Project released all restrictions in March 2024.
  **[research]**
- England & Wales: the Open Justice Licence permits commercial reuse but
  **excludes computational analysis** without a separate (free)
  application. **An LLM extraction pipeline is computational analysis.**
  This is a gating item before any E&W work. **[research]**

### CourtListener's API is open — real counts

Queried directly on 2026-08-09, no authentication required:

| Doctrine (signature phrase) | Courts | Raw hits |
|---|---|---|
| "express negligence" | TX state appellate | **291** |
| "express negligence" + conspicuous | TX state appellate | 154 |
| "express negligence" | 5th Cir + TX federal | 49 |
| anti-reliance / non-reliance | Del. + Ch. | 94 |
| "liquidated damages" + penalty | NY + App Div | 388 |
| "liquidated damages" + penalty | CA + Ct App | 434 |
| "failed of its essential purpose" | all | 445 |
| "force majeure" | all | 1,890 |
| conspicuous + "disclaimer of warranty" | all | 142 |

**[verified]** — single-phrase queries, so treat as *lower bounds*; real
coverage needs several phrasings per doctrine.

**These numbers materially correct the research's count table**, which
estimated 800–2,000 Texas indemnity decisions and 200–600 Delaware
anti-reliance. Applying the research's own 10–25% on-point yield:

- Texas express negligence: ~340 raw → **35–85 on-point**
- Delaware anti-reliance: 94 raw → **10–25 on-point**
- California liquidated damages: 434 raw → **45–110 on-point**

The last of those cross-validates the yield assumption: an empirical law
review survey hand-counted 58 California liquidated-damages cases in an
eleven-year window **[research]**, which is consistent.

**Implication for the moat.** Aggregate is plausibly **3,000–8,000**
outcome-labelled entries, not the 15,000–40,000 the research estimated.
At 15 minutes an entry that is ~1,000 lawyer-hours — which a funded
competitor with four contract lawyers completes in under three months.
The time-moat is real but measured in **months, not years**. Depth of
doctrine and editorial quality matter more than corpus size.
**[estimate]**

### Microsoft Word permits what the product needs

Checked against Microsoft's current documentation on 2026-08-09.
**[verified]**

- **Tracked changes are an API call.**
  `context.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll`
  — every subsequent edit lands as a Word revision the lawyer accepts or
  rejects. Requirement set **WordApi 1.4**.
- Supported on Word on the web, Windows Microsoft 365 (2208+),
  volume-licensed Office 2024, Mac and iPad.
- **Deployment trap:** volume-licensed perpetual Office (LTSC) tops out at
  WordApi 1.8 and gets *none* of the `WordApiDesktop` sets. Many firms run
  perpetual. Every advanced call needs
  `Office.context.requirements.isSetSupported()` with a working fallback.
- **An advantage specific to being inside Word:** several target doctrines
  turn on *conspicuousness* — caps, bold, contrasting type. Office.js
  exposes font weight, colour, size and case on the live range, so
  conspicuousness is mechanically checkable in the document. A server-side
  tool reading a PDF cannot do this nearly as well.

Sources: [Word API requirement sets](https://learn.microsoft.com/en-us/javascript/api/requirement-sets/word/word-api-requirement-sets),
[Word.ChangeTrackingMode](https://learn.microsoft.com/en-us/javascript/api/word/word.changetrackingmode),
[change-tracking sample](https://raw.githubusercontent.com/OfficeDev/office-js-snippets/prod/samples/word/50-document/manage-change-tracking.yaml).

---

## Build order, and why

The registry is built **first** — a two-week slice, not a phase — then the
Office work proceeds while the registry deepens in the background.

Building the Word product first was considered and rejected. The reason is
risk ordering: the Office work is *known* to be possible (verified above);
the registry's feasibility is *unknown* and rests on three unmeasured
numbers. Registry-last means discovering whether the only differentiator
works after a year of building an unfunded copy of a company that already
has customers. Retire the uncertain thing first.

Two secondary reasons: the moat compounds from the day it starts, and the
registry determines how a finding renders — build the task pane against a
house playbook and it gets rebuilt later.

Order:

1. **Registry** — the asset (see `docs/registry/plan.md`)
2. **The Word Check** — one task pane, one job
3. **Workspace** — matters, files, registry browser, SSO, admin
4. **Drafting in Word** — templates, house style, term sheet → draft
5. **Outlook, then Excel, then PowerPoint** — each finished before the next

Consistency checks (defined terms, cross-references, figures) fold into 2
and 4 rather than standing alone.

Explicitly dropped from the Vesence feature set: **quotes, engagement
reporting and invoice review.** Unrelated to the thesis.

---

## Open decisions

- **Who builds the gold set.** It requires a human who can read a US
  commercial judgment; a gold set graded by a model measures nothing. This
  is the only step that cannot be automated, and it is the real cost of
  the exercise. See the plan.
- **Pricing hypothesis.** Not yet stated. It determines how many customers
  the business needs, and therefore what the business is.
- **Hosting region.** US case law and US firms; the infrastructure is
  currently Frankfurt.
- **Licensing the registry to competitors** is a *fallback*, not a plan —
  correctly rejected as a starting position: nobody licenses data that
  doesn't exist, an unfunded solo sets no prices against a large
  incumbent, five possible buyers is the same concentration problem that
  killed the banking version, and a company that starts as a supplier
  stays one.

## Open loose end

The Claidor OHADA corpus exists only in the Render Postgres. The code is
in git; **the corpus is not**. Six tables hold it: `legal_acts`,
`legal_act_versions`, `legal_articles`, `legal_article_equivalences`,
`court_decisions`, `court_decision_article_links`. It is the hardest thing
built here to reproduce, and it is one `pg_dump` away from being safe.
