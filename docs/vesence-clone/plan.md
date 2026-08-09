# Vesence clone — how it would actually get built

Decision of 2026-08-09: stop building Claidor's OHADA product, stop the
registry, build a working clone of Vesence — AI agents that live inside
Microsoft Office for law firms. Selling comes after there is something to
look at.

This document answers one question: **do we need another tech stack?**

Short answer: **no.** We need a new *client layer*. The backend we already
have is most of the server side of this product, and the part that is
genuinely new is new no matter what language it is written in.

---

## What I could and could not verify

`vesence.com` is blocked by this environment's network egress proxy, so I
could not read their site, docs, or FAQ directly. Everything below about
*their* product comes from search-result summaries and press coverage of
the October 2025 $9M seed round, not from reading the source. Treat the
feature list as **[research]**, not **[verified]**.

That has one consequence worth stating plainly: I cannot clone behaviour I
cannot observe. "Exact clone" will mean *the same feature surface, my
implementation of it*. If you want closer than that, the highest-value
thing you can send me is their site copy, support docs, and a demo
recording — screen by screen, that is what turns a feature list into a
specification.

## What the product appears to be — [research]

**In Word.** A quality and risk review of the open document: style guide,
formatting, cross-references, defined terms, plus agentic checks for
miscalculations and logical inconsistencies. Drafting too. Every edit it
makes lands as **native Word tracked changes** — not a chat diff, not a
summary — which the lawyer accepts or rejects one at a time.

**In Outlook.** A pre-send check: verifies language, recipients and
attachments. Catches files mentioned in the email but not attached,
attachments that do not match what the email says they are, and the wrong
document or the wrong version. Reads long threads.

**Across documents.** Consistency of key figures between cap tables, term
sheets and share purchase agreements.

**Firm standards.** Learns the firm's style guide, clause numbering and
boilerplate, and enforces it across every document, lawyer and matter.

**Integrations.** iManage and NetDocuments appear in the attachment menu —
pull documents in as source, save work back. SharePoint and OneDrive too.

**The technical core**, in their own framing: an engine that understands
the full OOXML specification — styles, numbering, tables, cross-references,
tracked changes, headers, footers.

The shape of the thing is worth noticing. It is not a generation product.
It is a *review* product — a supervisor over work the lawyer already did.
That is a much lower bar for being useful and a much lower blast radius
when it is wrong, and it is almost certainly why a firm-wide rollout got
90% weekly active use.

---

## The stack question

### What transfers unchanged from this repo — [verified]

Measured line counts of modules that carry over as-is or nearly so:

| Module | Lines | Why it transfers |
|---|---:|---|
| `organization` | 3,647 | Firms. Multi-tenant already. |
| `kit` | 3,140 | DB session, pagination, schemas, routing |
| `worker` | 1,444 | Dramatiq + Redis background jobs |
| `email` | 1,274 | Transactional mail |
| `dossier` | 1,213 | **Matters.** Already a per-matter workspace with documents and members. |
| `member` | 1,166 | Firm users, invitations, roles |
| `auth` | 1,042 | Sessions, tokens, scopes, OAuth2 |
| `user`, `user_organization` | 1,085 | Identity ↔ firm |
| `file` | 852 | S3/Minio uploads, multipart |
| `librarian` | 1,590 | Anthropic streaming, tool use, retrieval |
| `lecteur` | 946 | Reads an uploaded document and checks claims in it |
| **Total** | **~21,300** | |

Plus FastAPI, SQLAlchemy 2.0 async, Alembic, Postgres, pgvector, structlog,
Sentry, and a deployed Render + Vercel pipeline that works today.

Two of those deserve emphasis. `dossier` is already the matter container
this product needs — documents, members, invitations, deletion, all built
and tested. And `lecteur` is already *the shape of the Word review agent*:
take a document, extract its claims, check each against a source, return
findings with locations. The subject matter changes; the machinery does
not.

`librarian/service.py:595` already streams from Anthropic with tool use.
The agent loop exists.

### What has to go — [verified]

We inherited Polar's payments platform. It is **~34,900 lines** across 24
modules: `benefit`, `subscription`, `checkout`, `order`, `transaction`,
`product`, `customer_seat`, `tax`, `client_invoice`, `license_key`,
`discount`, `payout`, `checkout_link`, `refund`, `invoice`, `dispute`,
`wallet`, `pledge`, `billing_entry`, `storefront`, `account_credit`,
`held_balance`, `processor_transaction`, `campaign`.

None of it is used. All of it is attack surface, Stripe credentials, and
questions to answer in a firm's security review. **Delete it before the
first firm asks, not after.** It is roughly a day of work and it makes
every subsequent conversation easier.

### What is genuinely new

1. **Office add-ins.** One web app per host (Word, Outlook, later Excel and
   PowerPoint), each with a manifest, loaded in an iframe by Office.
   TypeScript + React — *the same stack as `clients/apps/web`*. What is new
   is the manifest, the Office.js runtime, sideloading for development, and
   AppSource submission for distribution. Not a stack change.

2. **The OOXML engine.** The hard part, and stack-independent. See below.

3. **Model-agnostic routing.** A thin provider interface over Anthropic,
   OpenAI and Google so a firm can choose. Small — a day or two.

4. **Microsoft Graph connectors** (SharePoint, OneDrive, Teams) and **DMS
   connectors** (iManage, NetDocuments). Entra ID app registration, OAuth,
   admin consent. More political than technical: each one needs a firm's IT
   to approve it.

5. **SAML / Entra SSO.** Real work. Required to sell to a firm. Not
   required to have something to look at.

---

## The one thing that decides whether this works

**Editing a Word document without breaking it.**

A `.docx` is a zip of XML. The text lives in `word/document.xml`, but
styles live in `styles.xml`, list numbering in `numbering.xml`,
cross-references are field codes and bookmarks, and tracked changes are
`w:ins` / `w:del` revision marks wrapped around runs. Tools that read the
visible text and write it back destroy everything they did not model —
numbering restarts, styles flatten, existing tracked changes and comments
vanish. For a law firm that is not a bug, it is the end of the trial.

There are **two editing paths and we need both**:

**Path A — the document is open in Word.** Office.js on the live document.
`context.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll`,
then ordinary range edits, and Word itself produces native tracked changes.
Word owns the formatting; we never touch the XML. This is the easy path and
it is the demo path.

Verified against Microsoft's docs on 2026-08-09: `changeTrackingMode` is
**WordApi 1.4** — Word on the web, Windows M365 2208+, volume-licensed
Office 2024, Mac, iPad. But `WordApiDesktop 1.1–1.5` is **desktop-only and
unavailable on volume-licensed perpetual/LTSC Office**, and law firms run
perpetual Office more than most industries do. Every advanced call needs
`Office.context.requirements.isSetSupported()` and a working fallback. This
is not defensive programming; it is the difference between working at a
firm and not.

**Path B — the document came from iManage, NetDocuments or SharePoint and
is not open.** Now we hold bytes, and we need a real OOXML engine:
`lxml` over the package parts, inserting `w:ins`/`w:del` around targeted
runs, leaving every part we did not touch byte-identical. Python fits the
existing backend and the language barely matters for XML tree surgery.
`python-docx` is not sufficient — it does not model revisions.

The sequencing insight: **Path B is not needed for a review-only v1.**
Reporting a finding needs no engine, and substitution-class fixes — a
defined term, a party name, a cross-reference number — are range edits that
Word turns into tracked changes by itself.

> **Corrected 2026-08-09.** This originally read "not needed for a demo …
> Office.js does everything", which was too strong. Vesence's own
> disclosure says the same OOXML engine powers both their add-in and their
> web app, so add-in edits likely round-trip through it. Anything that
> rewrites a clause's structure needs the engine on day one of drafting —
> earlier than this section first claimed. See `decisions.md`.

---

## Build order

Follow their own history: review before drafting. Review is read-mostly,
its failures are visible and cheap, and it is where the 90% weekly-active
number came from.

**Phase 1 — Word review (weeks 1–6).**
- Add-in skeleton, manifest, sideload, task pane in our design system
- Auth handshake into the existing session layer
- Read-only checks over the live document via Office.js: defined terms
  used-but-undefined and defined-but-unused, cross-reference integrity,
  numbering consistency, style-guide conformance. All mechanically
  checkable — Office.js exposes font weight, size, colour and case on live
  ranges, so *conspicuousness* is checkable in-document, not guessed at.
- Then the agentic checks: internal contradictions, arithmetic that does
  not add up
- Then writes, as tracked changes, accept/reject per finding

**Phase 2 — the web workspace (weeks 7–8).** Matters, documents, chat,
firm settings. Mostly `dossier` + `librarian` with a new skin.

That is the demoable product: **6–8 weeks.**

**Phase 3 — Outlook.** Pre-send check. Different host, same architecture.
**Phase 4 — the OOXML engine and DMS connectors.** Needed the moment a
document arrives from a system rather than being open on screen.
**Phase 5 — Excel, PowerPoint, SSO, mobile.**

Full five-surface parity is **8–12 months**. Both numbers are
**[estimate]**, from module counts and the shape of the work, not from
anything measured. Treat them as the honest midpoint of a wide range.

---

## Open questions

- ~~The stack you are researching.~~ **Answered** — see `stack.md` and
  `decisions.md`. The prior held: nothing changes on the server, and the
  client is TypeScript/React either way because Office.js gives no choice.
  What did change is hosting posture, auth, and the model layer.
- **A name.** "Vesence clone" is fine in a repo and not fine on a manifest.
- **Repo.** I would build in this one — the 21,300 reusable lines are worth
  more than a clean slate — and delete the payments modules first.
- **Their actual product.** Site copy, support docs, a demo recording.

## Assumption ledger

| # | Assumption | Basis | How it gets falsified |
|---|---|---|---|
| 1 | Feature list above matches the real product | [research] press + search summaries; site was unreachable | Reading their site |
| 2 | Office.js alone is enough for a Word demo | [verified] WordApi 1.4 supports tracked changes broadly | Building phase 1 |
| 3 | Target firms run Office versions supporting WordApi 1.4 | [estimate] — perpetual/LTSC is common in legal | Asking one firm what they run |
| 4 | `dossier` maps onto "matter" without a rewrite | [verified] it is already per-matter with docs + members | Phase 2 |
| 5 | 6–8 weeks to demoable | [estimate] | Week 6 |

---

*Status: plan only. Nothing built. The registry is archived — see
`docs/registry/ARCHIVED.md`.*
