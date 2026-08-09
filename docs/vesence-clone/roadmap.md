# The road to a complete clone — revised

Revised 2026-08-09 after verifying three components claimed to exist.
Supersedes the first version, which assumed the add-in and the OOXML
engine both had to be written from nothing.

Estimates are **[estimate]** unless marked. The further down, the wider.

---

## What was verified, and what it is worth

| Claimed | Verified | What it actually is |
|---|---|---|
| Claude for Word / Excel / PowerPoint | **Real.** GA 7 May 2026 | A finished competing product. No API, no fork. **Worth nothing to our build.** |
| `claude-for-legal` | **Real.** Apache 2.0, 90+ agents | Markdown prompts. Domain content, not an app. |
| Vaquill statutes API | **Real.** 4.8M sections | A supplier, if we ever need US law. Not yet. |
| `@ansonlai/docx-redline-js` | **Real.** MIT, v0.2.1 | Host-independent OOXML engine with tracked changes. One dependency. **Young — six releases.** |
| `yuch85/office-word-diff` | **Real.** | Word-level diffs through Office.js with tracked changes, cascading fallback. |
| **`Vaquill-AI/ms-word-addin`** | **Real. Apache 2.0** — confirmed from the LICENSE file, which `package.json` omits | **Source for the add-in we are building.** |

That last row is the finding. Everything above it shaves weeks; this one
changes what we do next.

### What is in it

Vite + React 18 + TypeScript task pane, Office.js, Supabase auth through
the Office Dialog API with PKCE — the same architecture chosen here
independently. Four tabs:

- **Assistant** — grounded chat over the open contract, plus an Edit mode
  turning plain English into tracked changes
- **Review** — contract-type detection, severity-flagged redlines against
  a playbook, change triage, document comparison, citation verification
- **Draft** — agreements from a brief, with template constraints
- **Tools** — clean copy, **defined-term checking, cross-reference
  validation**, send-ready verification

That last tab is what was built here today, in Python, deterministically.

A **community build** runs standalone on your own key across six
providers, with no backend at all.

---

## The decision, made

**Forked**, 9 August 2026. The hour of reading happened; the account is in
`worklog.md` and the licence obligation in
`clients/apps/word-addin/FORK.md`.

The four questions, answered:

1. **Deterministic**, not a model call — 188 lines of client-side regex
   covering three defects. Not a duplicate of ours, a much shallower
   version of the same idea. Ours replaces it; the panel is what we adopt.
2. **Coupling is one function.** The community build routes every call
   through a local shim, so `request` has a branch in it and nothing else
   is bound to their server. Our routes go through the same function.
3. **Worth living in**, with one caveat: 40,000 lines, 30 feature areas,
   **zero tests**. The Office.js layer is careful in the way that only
   comes from having run into the problems.
4. **Notice, licence, statement of changes.** Done, and it was the
   cheapest hour in the project.

Two things reading found that a demo would not have: their cross-reference
check reads Word's computed `listString`, so it sees numbering on an
auto-numbered contract that the server cannot see at all; and their
occurrence search is whole-word where our index counts substrings, which
diverges silently. Both are in the worklog.

---

## Where we are

**Phase 1, roughly 75% done.** Up from 60%, because playbooks landed and
the engine question resolved.

### Built and measured

| | State |
|---|---|
| 10 mechanical checks | 43.6 → 20.3 findings per real agreement, on 30 SEC filings |
| 2 judgement checks | Every quote verified, every sum recomputed; 3 of 4 model proposals rejected |
| Playbooks | Three-layer model, two verification gates, 16 tests |
| Terms index | 22 terms per agreement in 0.02s, with the linked-term graph |
| .docx engine core | Round-trip verified on real Word files, tracked replacement across real run boundaries |
| `/check`, `/judge`, `/terms`, `/fix/document` | Authenticated, nothing persisted |
| Word panel | Built, typechecked, bundles — **never run in Word** |
| Tests | 274 redline, 25 add-in, 379 across neighbouring modules |

---

## Phase 1 — Word, the Check surface  *(85%)*

| Work | Estimate | Blocked on |
|---|---|---|
| ~~Read the Vaquill add-in and decide~~ | — | **Done. Forked.** |
| ~~Wire the Check panel to `/v1/redline/*`~~ | — | **Done.** Four buckets, dismissals stored in the .docx |
| **Verify in Word** | 1 day | 10 minutes of a real Word |
| **Microsoft Entra SSO** | 4–6 days | An Entra app registration |
| **Deploy** | 1 day | A name |
| Panel polish — empty, error, too-much states | 3 days | Your designs |
| Pass Word's `listString` numbering to the server | 2 days | — |

**~1.5 weeks**, all of it blocked on you rather than on code.

---

## Phase 2 — The web workspace

Promoted from Phase 4. It was behind the OOXML engine; it no longer is.

Matters, files, chat, document preview, firm settings. `dossier` already
holds matters with documents, members, invitations and deletion, tested —
which is why this is weeks rather than months.

**4–6 weeks.** At the end of this, there is a product to look at.

---

## Phase 3 — Word, the writing surface

Draft and Create. The agent loop exists; what is new is the tool surface —
read a range, replace a clause, insert a section, rename a term
everywhere, each landing as a revision.

`office-word-diff` covers word-level diffing through Office.js and is
worth evaluating here rather than writing our own.

**3–4 weeks.**

---

## Phase 4 — Outlook

The pre-send check: language, recipients, attachments, subject,
consistency against the thread. Different host, same architecture.

**3–4 weeks.**

---

## Phase 5 — Excel and PowerPoint

Thinner than Word and Outlook, and both reuse the panel.

**3 weeks each.**

---

## Phase 6 — Bulk review, and the rest of the .docx engine

The point at which server-side editing is actually needed: reviewing
hundreds of files without opening Word, and the All Tracked Changes view
across documents.

The core is built. What remains is numbering preservation,
cross-reference updating and structural edits — and
`@ansonlai/docx-redline-js` (MIT) is a candidate to replace rather than
extend it. At v0.2.1 it is young, so that is a build-or-adopt call made on
evidence at the time, not now.

**4–8 weeks**, down from 6–10, and no longer blocking anything.

---

## Phase 7 — Connectors

SharePoint, OneDrive, Teams via Graph; iManage and NetDocuments. MCP
connectors for several of these already exist in `claude-for-legal`.

Slow for political reasons — each needs a firm's IT to approve it.

**3–5 weeks**, down from 4–6.

---

## Phase 8 — The workspace sandbox and the agent

Browser-local files, a per-chat sandbox, sub-agents, custom agents. The
least understood part and the least reliable number.

**6–8 weeks.**

---

## Totals

| | Before | Revised |
|---|---|---|
| Phase 1 complete | 4 weeks | **2 weeks** (1 if the fork lands) |
| **Something that demonstrates the product** | 5–7 weeks | **6–8 weeks** |
| Word fully complete | ~4 months | **~2.5 months** |
| All five surfaces, parity | 8–11 months | **7–9 months** |

The demo number moved *later* by a week despite everything getting
shorter, and that is deliberate: the web workspace is now inside it. A
panel with no product behind it is not a demonstration.

---

## What is needed from you

| | When | Why |
|---|---|---|
| **10 minutes of a real Word** | Now | Retires the biggest cheap risk |
| **A Microsoft Entra app registration** | Before Phase 1 ends | Free; it is the only sign-in there is |
| **A name** | Before deploying | Goes in the manifest and on the sign-in screen |
| **The panel designs** | Phase 1 | Six screens, four states each |
| **A lawyer, for one hour** | As soon as the panel runs | Nobody has judged whether 20 findings per agreement is useful or noise |

---

## Risks, ranked

**The checks are noise.** Still first. 20 findings per agreement is
measured; whether they are worth reading is not. One lawyer, one
afternoon.

**A fork we regret.** Adopting somebody's add-in is a marriage, and the
hour of reading is what decides it. Doing it on the strength of a README
would be the same mistake as reasoning about Vesence from press coverage.

**Word behaves differently from the documentation.** Four Office.js
assumptions still unresolved. Cheap now, expensive in month three.

**Scope by imitation.** Vesence has five surfaces, custom agents,
sub-agents, a sandbox and six connectors. The phase order above is
deliberately a sequence of things useful on their own.
