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

## Phase 1 — Word, the Check surface  *(built, unverified)*

**The percentage was retired on 10 August**, because it had stopped
measuring anything. Phase 1 is roughly 90% *built* and 0% *verified*, and
those are not points on one scale. A panel that has never run in Word is
not 90% of a working panel; it is a complete panel with an unknown number
of defects, and no amount of further building changes the number.

Verification is deferred. Sideloading is switched off on the tenant
available to us, which is the normal posture for a company Microsoft
account. The self-test is built and deployed and waiting at
`claidor-selftest.vercel.app`; it does not expire.

| Work | State |
|---|---|
| Read the Vaquill add-in and decide | **Done.** Forked |
| Wire the Check panel to `/v1/redline/*` | **Done.** Four buckets, dismissals in the .docx |
| Build the self-test | **Done.** Deployed, never run |
| **Let the pane authenticate at all** | **Open, and mine.** The check routes accept only a browser session cookie, which an add-in iframe cannot send |
| Verify in Word | **Deferred.** Needs a Word without tenant restrictions — a desktop Word or a personal account |
| Microsoft Entra SSO | **Dropped.** Google stays; revisit when a firm asks |
| Deploy the panel itself | Behind the API being deployed |
| Panel polish — empty, error, too-much states | Deferred to after the backend, by decision |
| Pass Word's `listString` numbering to the server | Open, code only |

**What this changes:** Phase 1 does not close, so it stops being the
priority. Finish the auth — which makes the panel *complete and ready to
test the moment a Word exists* — and then go to Phase 2, where everything
can be verified here.

**What it must not become:** a reason to start Phase 3. Word's writing
surface is more Office.js on top of Office.js that has never run. Building
it now would multiply one unverified layer by another, and every defect
found later would be found in twice as much code.

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

| | Before | Now |
|---|---|---|
| Phase 1 built | 4 weeks | **Done** |
| Phase 1 *verified* | — | **Unknown.** Waiting on a Word without tenant restrictions |
| **Something that demonstrates the product** | 5–7 weeks | **5–7 weeks** |
| Word fully complete | ~4 months | **~2.5 months**, plus whatever verification finds |
| All five surfaces, parity | 8–11 months | **7–9 months** |

Two of these numbers are honest and one is not. « Built » is a fact.
« Verified » has no number because it depends on somebody else's Word, and
writing an estimate against it would be inventing one.

The demo figure no longer includes Phase 1, because Phase 1 is built. It is
now just Phase 2 plus the auth: matters, files, chat and a document
preview, with the checks already behind them. A panel with no product
behind it was never a demonstration, which is why the web workspace sits
inside this number rather than after it.

---

## What is needed from you

| | When | Why |
|---|---|---|
| **A lawyer, for one hour** | **Now.** Ahead of everything else | Nobody has judged whether 20 findings per agreement is useful or noise. This needs no Word: hand them a printout of the findings on an agreement they know |
| **10 minutes of an unrestricted Word** | Whenever convenient | Desktop Word needs no IT approval, and a free personal Microsoft account is its own tenant. Deferred, not abandoned |
| ~~A Microsoft Entra app registration~~ | — | Dropped. Google stays |
| ~~A name~~ | — | Claidor |
| **The panel designs** | After the backend, by decision | Six screens, four states each |

---

## Risks, ranked

**The checks are noise.** Still first. 20 findings per agreement is
measured; whether they are worth reading is not. One lawyer, one
afternoon.

**Word behaves differently from the documentation.** Promoted, because
deferring it is what promoted it. Four Office.js assumptions are
unresolved and the test that resolves them is built, deployed and
unrunnable on the Word available to us. It was the cheapest risk on this
list while it could be retired in ten minutes; a deferred cheap risk is
just a risk, and it accrues interest in the shape of every line written on
top of it. The one thing that must not happen is Phase 3 starting first.

**A fork we regret.** Adopting somebody's add-in is a marriage. The hour
of reading is spent and the answer was favourable, so this is now a slow
risk rather than a live one: upstream ships no tests, so anything of
theirs we come to depend on gets tests of ours or gets replaced.

**Scope by imitation.** Vesence has five surfaces, custom agents,
sub-agents, a sandbox and six connectors. The phase order above is
deliberately a sequence of things useful on their own.

---

## Superseded — 10 August 2026

The vertical changed from law to investment banking. See
`docs/pierce/plan.md`.

This document is kept because most of what it describes was built and is
being carried over: the Word add-in, the redline engine, the cross-document
check, the agent, the workspace. About fifty lines of the engine were
actually about law.

What is retired with it: parity with Vesence as a goal. Pierce is not a
clone of anything — the reconciliation chain, which is its whole product,
is not something anyone has shipped well.
