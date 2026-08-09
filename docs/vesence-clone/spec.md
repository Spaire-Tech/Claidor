# What the product is — read from the source

Read from vesence.com on 2026-08-09. The pages are checked in verbatim
under `product/` so this file can be audited against them and so a later
change to their site is visible as a diff rather than an argument.

This supersedes the `[research]` feature list in `plan.md`, which was
assembled from press coverage while the site was unreachable. Several
things in it were wrong. Those are marked **[was wrong]** below.

---

## The shape

*One agent. Five surfaces.* A web app plus four Office add-ins — Word,
Outlook, Excel, PowerPoint — sharing one agent, one workspace and one set
of tracked changes.

The web app is for matter-level, multi-file work. Each add-in is for work
that belongs inside one document, workbook, deck or message.

## Identity — **[was wrong]**

> *"No. Vesence uses single sign-on with your Microsoft work account
> (Microsoft Entra ID), the same login you already use for Microsoft 365 —
> there is no separate Vesence password."*

There is no account system of their own. This **removes** work — no
registration, no password reset, no email verification — and **moves Entra
ID from a phase-4 nicety to a week-one dependency**. `decisions.md` had
bearer tokens now and Entra later; the correct order is Entra from the
start, because it is the only way in.

## Where files live — **[was wrong]**

This is the biggest correction, and it changes the architecture.

> *"Workspace files are stored locally in your browser rather than on a
> Vesence server, unless you connect external sources."*
>
> *"Each chat has a controlled local working environment, the virtual
> computer, that Vesence uses to process files, run scripts, and create
> outputs. The Workspace is the storage inside it."*
>
> *"Your chats exist in your local Vesence working environment rather than
> in a separate Vesence-hosted database."*

So it is not *"documents are processed in memory on the server"*. Documents
**never reach their server at all**. A per-chat sandbox runs in the
browser; the agent reads, edits and writes files inside it; only the
content needed for a given step is sent to the model.

Two consequences:

1. It explains the three-entity subprocessor list. There is very little to
   disclose because there is very little stored.
2. It is the most likely home of the OOXML engine. *"The same engine powers
   both the add-in and the web app"* is easy if the engine is compiled to
   WebAssembly and runs client-side in both. **[assumption]** — they do not
   say this, and it is the single most consequential open question in the
   whole clone.

## Office support — **[was wrong]**

> *"A Microsoft 365 work account and a current, supported build of Office
> on the web, Windows, or Mac. Very old perpetual 2016 or 2019 builds may
> not support the add-in."*

I spent two documents worrying about volume-licensed perpetual Office.
They do not solve it — **they exclude it**. That is a legitimate answer and
it deletes a class of work.

## Mobile — **[was wrong]**

> *"The Word, Excel, PowerPoint, and Outlook add-ins are desktop-only and
> do not appear in the mobile Office apps."*

There is no mobile app. Mobile is the web app in a phone browser, with a
responsive layout where chat and document preview take turns rather than
sitting side by side. "Desktop and mobile" in the overview meant this.

## Deployment

Admin deploys from the Microsoft 365 Admin Center → Integrated apps, from
AppSource, to the organisation or to named users and groups. Rollout takes
up to 24 hours. A manifest file is the alternative. Both paths, as
`decisions.md` describes.

---

## Word — the surface to build first

Five actions on the page: **Create, Draft, Review, Check, Format.** The FAQ
names the buttons as **Assist, Check, Setup Check**, so the five are
capabilities rather than five separate controls.

| | What it does, in their words |
|---|---|
| **Create** | *"Generate a first draft from a template, aligned with your firm's styles and the matter context."* |
| **Draft** | *"Apply complex edits inline while keeping terminology consistent and the document coherent end-to-end."* |
| **Review** | *"Review against playbooks, checklists, or custom instructions. Get precise, inline recommendations."* |
| **Check** | *"Run quality checks for cross-references, defined terms, formatting, and logical inconsistencies."* |
| **Format** | *"Fix headings, numbering, and styles to match your firm's formatting rules."* |

### Check — the exact taxonomy

Their own screenshot, reproduced faithfully because it is the closest thing
to a specification on the whole site:

```
Definitions            2 critical | 2 warning | 1 to review

Critical (2)     Undefined term        Completion
                 Undefined term        New Shares
Warning (2)      Unused definition     Bank Account
                 Multiple definitions  Claim
To review (1)    Unordered definitions Definitions not alphabetically ordered
Ignored (0)
```

Four severities — **Critical, Warning, To review, Ignored** — and findings
can be dismissed into *Ignored*, which means the state is per-document and
persists.

Against what `polar/redline/terms.py` already does:

| Theirs | Severity | Ours |
|---|---|---|
| Undefined term | Critical | **Not built.** Task #35, and now plainly the most important one. |
| Unused definition | Warning | `defined_never_used` ✅ |
| Multiple definitions | Warning | `defined_twice` ✅ |
| Unordered definitions | To review | Not built. Trivial — alphabetical order of the definitions block. |
| — | — | `case_mismatch` — ours, not theirs. Probably lands under "language". |
| — | — | `used_before_defined` — ours, not theirs. **They are right to omit it**; the recital false positives showed why. Candidate for deletion. |

Categories beyond definitions: cross-references, numbering, language,
validity, formatting, logical inconsistencies. The page claims *"hundreds
of checks"* and ranks every issue by severity.

### The three Word features that are not checks

**Traceable AI.** *"Every statement is backed by citations you can click to
jump to the exact source."*

**Hover a defined term.** *"Vesence reads every definition in the document.
Hover a defined term and its meaning, source, and linked terms appear
inline."* — Our definition extractor already produces exactly the data this
needs.

**Document Mechanics.** *"Rename a term, insert a clause, or restructure a
section. Vesence keeps every definition, cross-reference, and number in
sync."* Their example: renamed Locked Box → Closing Accounts, updated 23
cross-references, resequenced clauses 4.2–4.9, no broken links or orphaned
terms. **This is the OOXML engine's real job**, and it is the hardest thing
on the site.

### Playbooks

Organisation-level review templates, named on the page: Buy-Side SPA
(Locked Box), Buy-Side SPA (Closing Accounts), Sell-Side SPA, Shareholders'
Agreement, Due Diligence Report, Loan Agreement (LMA facility), Merger
Agreement.

---

## Outlook

Four capabilities — **Create, Review, Check, Format**; buttons named
**Check, Improve, Concise**, plus **Start Recording Tracked Changes**.

**Check** is the flagship, and their example is precise:

```
Email Check — 5 issues
Language & Grammar  "materialty" → "materiality"
Recipients          Greeting says "John" but recipient is "Jon Doe"
Attachments         Body references the "Closing Checklist" but no such file is attached
Subject Line        No issues found
Consistency         SPA described as "v5" but Next Steps references "SPA v4"
                    Escrow duration "24 months" contradicts the 18 months agreed earlier in the thread
```

Note what that requires: the whole thread, its attachments, and a
comparison of the draft against what was agreed earlier in the thread.

**Review** produces *agreed / still open / owed by you* across a thread,
with citations. **Format** applies house style — salutation, sign-off,
removing hedging openers, body font — every change a tracked change,
accepted one by one, **inside the email body**.

---

## Excel and PowerPoint

**Excel** — buttons **Check, Format Sheet, Explain**. Explain a formula,
find workbook issues, cross-check figures against source documents, format
to firm standards.

**PowerPoint** — button **Assist**. Improve slide wording, review layout,
check consistency, turn source material into slide-ready content.

Both are thinner than Word and Outlook.

---

## The agent

- *"It can break the work into focused parts and use sub-agents in
  parallel, then combine the findings into one coordinated result."*
- *"Is Vesence a coding agent? Yes. Vesence can write and run code to build
  task-specific tools."* — calculators, trackers, comparisons, checklists,
  built for the task at hand and run in the virtual computer.
- **Custom agents** — private to a user or public to the organisation, with
  their own system prompt (*"the most important field"*), optionally bound
  to specific SharePoint/OneDrive folders or matters, and assignable to
  chosen surfaces.
- Tool use is shown to the user as a trace: *Used 4 tools — Loaded
  template … Read Project_Atlas_SPA.docx … Drafted … Prepared Edits.*

## Connectors

SharePoint, OneDrive, Outlook, Teams, iManage, NetDocuments. All optional
and enabled per organisation; iManage and NetDocuments sit in the chat's
`+` attach menu. **Nothing is written back without review** — changes are
staged.

## Their own stated limits

Worth copying, not just noting. *"Vesence prepares work product, but final
judgment and approval always remain with you."* And what it should flag
rather than decide: *missing source material, conflicting versions,
unsupported assumptions, unconfirmed names, dates, or amounts, and legal or
commercial judgment calls.*

---

## What this changes in the plan

1. **Entra ID SSO moves to week one.** It is the only way in, and it
   deletes our own login work rather than adding to it.
2. **The per-chat browser sandbox becomes a real component**, and it is
   unlike anything in this repo.
3. **Perpetual Office worry deleted.** Exclude old builds, as they do.
4. **No mobile app.** Responsive web only.
5. **"Undefined term" is the top-priority check**, not a nice-to-have.
6. **Delete `used_before_defined`.** They do not have it and the false
   positives already argued against it.
7. **Add "unordered definitions"** — an afternoon.
8. **Findings need severities and an ignore state** that persists per
   document.

## Open questions the site does not answer

| # | Question | Why it matters |
|---|---|---|
| 1 | Does the OOXML engine run in the browser (WASM) or on a server? | Decides where the hardest component lives and whether one engine can serve both surfaces |
| 2 | What is the "virtual computer" built on? | A per-chat browser sandbox that runs code is a substantial build |
| 3 | How do add-ins reach the workspace if files are browser-local? | The add-in and the web app are different origins |
| 4 | Does the model see whole documents or extracts? | Cost, and how the tracked-change proposals are produced |
