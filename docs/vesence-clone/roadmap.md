# The road to a complete clone

Written 2026-08-09, after the first build day. Measured against `spec.md`,
which was read from vesence.com rather than inferred.

Estimates are **[estimate]** unless marked otherwise. They come from the
shape of the work and from what one day actually produced, not from
anything measured. The further down the page, the wider the range.

---

## Where we are

**Phase 1 of 8. Roughly 60% of Phase 1, roughly 8% of the product.**

That second number looks harsh next to a day that produced eleven checks,
four API routes, an add-in and 299 tests. It is honest anyway: Check is
one of five Word actions, Word is one of five surfaces, and the hardest
single component — the engine that edits a `.docx` without breaking it —
has not been started.

### Built and measured

| | State |
|---|---|
| **Check** — 9 mechanical checks | Working. 43.6 → 20.3 findings per real agreement, measured on 30 SEC filings |
| **Check** — 2 judgement checks | Working. Every quote verified, every sum recomputed; 3 of 4 model proposals rejected on real documents |
| **Format** — house style | Working. 1.1 findings per real agreement across dates, currency, quotes, numbering |
| **Terms index** | Working. 22 terms per agreement in 0.02s, with linked-term graph |
| API: `/check`, `/check/document`, `/judge`, `/terms` | Working, authenticated, nothing persisted |
| Word add-in panel | Built, typechecked, bundles — **never run in Word** |
| Tests | 194 backend, 25 add-in, 299 across neighbouring modules |

### The two things that are true and uncomfortable

**Nothing has run inside Word.** Every Office.js call is written and
unproven. This is the single cheapest risk to retire and it needs ten
minutes of somebody's real Word.

**No lawyer has seen a finding.** The checks are measured against
documents, not against judgement. 20 findings per agreement is a number,
not a verdict; whether those 20 are worth a partner's time is unknown.

---

## Phase 1 — Word, the Check surface  *(60% done)*

What remains before this phase is finished:

| Work | Estimate | Blocked on |
|---|---|---|
| **Verify in Word** — the README checklist, seven steps | 1 day | 10 minutes of a real Word |
| **Microsoft Entra SSO** | 4–6 days | An Entra app registration |
| **Deploy the add-in** to public HTTPS | 1 day | A host decision |
| **Review against playbooks** | 2 weeks | A real playbook to test against |
| Panel polish — empty states, errors, keyboard | 3 days | — |

**Entra SSO is not optional and not deferrable.** Their FAQ: *"there is no
separate Vesence password."* Microsoft sign-in is the only door. The
bearer-token layer already built is the right shape; what changes is where
the token comes from.

**Playbooks** are the last read-only action. A playbook is an
organisation-level checklist — their page names seven: Buy-Side SPA
(Locked Box), Buy-Side SPA (Closing Accounts), Sell-Side SPA,
Shareholders' Agreement, Due Diligence Report, LMA Loan, Merger Agreement.
The work is storage, upload, and a model pass held to the same discipline
as the judgement checks: **every finding quotes the document and quotes
the playbook clause it fails.** Both verifiable in code.

**Phase 1 complete: ~4 weeks.**

---

## Phase 2 — The OOXML engine  *(not started; the gate on everything that writes)*

A `.docx` is a zip of XML. Text in `document.xml`, styles in `styles.xml`,
list numbering in `numbering.xml`, cross-references as field codes and
bookmarks, tracked changes as `w:ins` / `w:del` marks around runs. Tools
that read visible text and write it back destroy everything they did not
model.

Vesence built this from scratch and says so. Harvey shipped their own in
September 2025. Two well-funded teams independently concluded it could not
be bought — that is the strongest evidence available about how hard it is.

What it has to do, in order:

1. **Round-trip.** Open and re-save a real agreement byte-identically for
   every part not touched. This is the whole foundation and it is testable
   against the 30 filings already in hand.
2. **Replace text as a revision.** `w:ins` and `w:del` around targeted
   runs, preserving run properties.
3. **Preserve numbering and styles** through an edit.
4. **Update cross-references** when a clause moves or is renumbered.
5. **Preserve existing tracked changes and comments** — a document already
   under review must survive.

Their own example of what "done" means: rename *Locked Box* to *Closing
Accounts*, update 23 cross-references, resequence clauses 4.2–4.9, break
nothing.

**Estimate: 6–10 weeks.** The widest range on this page, and the item most
likely to overrun. Python with `lxml`, in the existing backend —
`python-docx` does not model revisions and is not a starting point.

**What it unlocks:** every writing action, plus checking documents that
arrive from a filing system rather than being open in Word.

---

## Phase 3 — Word, the writing surface  *(after Phase 2)*

- **Draft** — *"apply complex edits inline while keeping terminology
  consistent and the document coherent end-to-end"*
- **Create** — generate a first draft from a firm template with matter
  context

The agent loop exists (`librarian/service.py` already streams with tool
use). What is new is the tool surface: read a range, replace a clause,
insert a section, rename a term everywhere — each landing as a revision.

**Estimate: 3–4 weeks after the engine.**

---

## Phase 4 — The web app

Their web surface: matters, files, chat, bulk review across hundreds of
files, an **All Tracked Changes** view, admin.

Most of this exists. `dossier` is already a per-matter workspace with
documents, members and invitations, tested. What is new is the bulk-review
view and the tracked-changes review across documents.

**Estimate: 4–6 weeks.**

---

## Phase 5 — Outlook

Four capabilities; the pre-send **Check** is the flagship and their own
example is precise: a misspelling, *"Hi John"* to a recipient named Jon, a
file referenced in the body but not attached, and two version
contradictions against earlier messages in the thread.

Different host, same architecture. The new work is reading a thread and
its attachments, and editing an email body as a tracked change.

**Estimate: 3–4 weeks.**

---

## Phase 6 — Excel and PowerPoint

**Excel** — Check, Format Sheet, Explain: explain a formula, find workbook
issues, cross-check figures against source documents.
**PowerPoint** — Assist: slide wording, layout, consistency.

Both are thinner than Word and Outlook, and both reuse the panel wholesale.

**Estimate: 3 weeks each.**

---

## Phase 7 — Connectors

SharePoint, OneDrive, Teams via Microsoft Graph; iManage and NetDocuments
as optional per-organisation integrations in the attach menu. Nothing is
written back without review — changes are staged.

Technically a few days each. What makes it slow is that every one needs a
firm's IT to approve it, and that clock is not ours.

**Estimate: 4–6 weeks.**

---

## Phase 8 — The workspace and the agent

The part of their architecture I understand least, and the part that
explains their three-supplier disclosure.

- **Files stay in the browser.** *"Workspace files are stored locally in
  your browser rather than on a Vesence server."*
- **Each chat gets a "virtual computer"** — a sandbox where the agent runs
  code and edits files.
- **The agent writes and runs code**, and delegates to sub-agents in
  parallel.
- **Custom agents** — private or organisation-wide, with their own system
  prompt, optionally bound to specific folders and surfaces.

**Estimate: 6–8 weeks**, and the least reliable number here. It is also
where the OOXML engine may need to be compiled to WebAssembly, since
theirs powers both the add-in and the web app.

---

## Totals

| | |
|---|---|
| **Phase 1 complete** | ~4 weeks |
| **Something that demonstrates the product** — Phase 1 + a minimal web workspace | **5–7 weeks** |
| **Word fully complete** — through Phase 3 | ~4 months |
| **All five surfaces, feature parity** | **8–11 months** |

The middle row is the one that matters for *"at least I'll get something
to look at."*

---

## The critical path, in order

1. **Verify in Word.** Ten minutes of yours. Everything else assumes the
   panel works.
2. **Entra SSO.** It is the only login there is.
3. **Deploy.** An add-in on `localhost` is a demo for one machine.
4. **Playbooks.** Finishes the read-only surface.
5. **The OOXML engine.** Start early; it is the long pole and everything
   that writes waits behind it.
6. **The web workspace.** Turns an add-in into a product.

Everything after that is repetition of a known shape.

---

## What is needed from you, and when

| | When | Why |
|---|---|---|
| **10 minutes of a real Word** | Now | Retires the biggest cheap risk |
| **A Microsoft Entra app registration** | Before Phase 1 ends | Free; it is the only sign-in |
| **A name** | Before deploying | It goes in the manifest and on the sign-in screen |
| **One real playbook** | Phase 1 | A checklist the check can be measured against |
| **A lawyer, for one hour** | As soon as the panel runs | Nobody has judged whether 20 findings per agreement is useful or noise |
| **A hosting decision** | Before deploying | Render and Vercel work today; Azure is the alternative and is not urgent |

---

## Risks, ranked by what they would cost

**The OOXML engine overruns.** The widest estimate here, and everything
that writes is behind it. Mitigation: start it in parallel with Phase 1
rather than after, and make round-trip fidelity the first milestone — if a
real agreement cannot be opened and re-saved unchanged, nothing later
matters.

**The checks are noise.** 20 findings per agreement is measured; whether
they are worth reading is not. One lawyer and one afternoon settles it,
and settling it late means tuning against the wrong target for months.

**Word behaves differently from the documentation.** Four assumptions in
the ledger are unresolved and all of them are Office.js. Cheap to retire,
expensive to discover in month three.

**Scope by imitation.** Vesence has five surfaces, custom agents,
sub-agents, a code sandbox and six connectors. Building all of it before
anyone uses any of it is the most likely way this ends up nowhere. The
phase order above is deliberately a sequence of things that are useful on
their own.
