# The card families: the plan, and where we start from

18 September 2026. The founder designs each card; I implement the rules.

The rules are `sources/grok-bot-cards.md` — Grok Bot's own operating rules for
its fourteen in-chat card families, saved verbatim. **That file is a source, not
a specification.** Where Grok Bot's architecture differs from ours the rule
needs translating rather than copying, and every place that happens is named
below.

Nothing in here is built from this document yet. This is the starting line,
measured on 18 September.

> **All fourteen are in scope, and a computer is coming.** The founder, later
> the same day: *"we'll do it just like them. we'll soon design a computer too.
> so everything there should be."* So the three families marked N/A below are
> **not** settled as N/A — they were marked that way on the assumption that we
> would never have a machine of our own, and that assumption is being reversed.
> Re-decide each one when the computer is designed. What this changes in the
> product's own record is set out in "The computer is coming" below.

---

## The two locked decisions

The founder, 18 September, after the computer decision:

> "Both questions are load-bearing… Until those are fixed, every screen/file/
> permission card will keep thrashing."

**Both are now locked**, decided by the founder the same day:

> **A — file custody: explicit import.**
> **B — machine model: registry (box + N user machines).**

Which is Grok Bot's shape, and what *"we'll do it just like them"* meant. The
reasoning for each is below; what they oblige us to change is at the end of this
section. Every screen, file and permission card is an expression of these two,
so a card that contradicts them is wrong even if it looks right.

### Decision A — file custody

Three possible answers:

| | What it means |
|---|---|
| **Box-ephemeral** | Files exist on the box only for the job, then go |
| **User-home** | Files never leave the person's machine; the agent reaches in |
| **Explicit import** | Files live on the person's machine; moving one to the box is a deliberate copy, never ambient |

**Locked: explicit import.** In the founder's words: *"no, not by default. The
box is where I work (browser, desktop, shell). Bass's files live on his Mac (or
another registered machine). Moving a workbook onto the box is an explicit copy
(CopyToBox / chat attach), not ambient."*

And the consequence they drew, which is the important part for us:

> Captcha / SSO / passkey handoff → cheap. It's "take over my screen," not "put
> your stuff here." Box-handoff card stays light.
>
> "Edit this spreadsheet" / "sign this PDF on disk" → expensive. That either
> stays on his machine (machine-scoped tools + approvals) or pays a copy onto
> the box.

**So: control handoff and file custody are two different card families, and
must not be merged.** Box handoff means "take my screen". It must never come to
mean "your Documents are here now". The cost of touching a file shows up in a
card about *which files*, not a card about *which site*.

This is also the answer to whether `direction.md` §10's sentence survives a box.
It does, under explicit import: the box is where work happens, not where files
live.

### Decision B — the machine model

| | What it means | What it costs |
|---|---|---|
| **Box only** | The agent's machine is the only workspace | Handoff and captcha stay simple; file cards must import/export; no "which computer" picker — **but laptop-closed and local-app work dies** |
| **Registry** (box + N user machines) | Grok Bot's current shape | "Which computer" returns for file, shell and UI automation; box handoff stays box-scoped; needs a **separate** user-machine handoff card |
| **User machine only** | No box at all — today's Caisra | Handoff becomes "take my Mac"; captcha couples to their desktop; **no isolated agent browser** |

**Locked: registry.** The box is the agent's computer; the person's Mac, and
any other machine, are registered. The founder's correction to §10, which I had
wrong: *"'Which computer?' was struck as a mistake only if you pretend there's a
single workspace. The moment the box is a second machine, 'which computer'
returns."*

And what it infects, named:

- every card that implies a screen (box handoff is box-only today);
- every card that implies files (a form filling the box browser is not a file on
  the Mac);
- Settings — Computers, local execution, Update / Reset Computer, which is the
  box;
- auto-review and permission surfaces — Shell on the box is not Shell on the Mac.

That last one is the sharpest for us: our approval card today says *"Allow
Perrin to continue — running commands on your computer?"* with one device id on
it. Under a registry that sentence has to name **which** computer, and the
`## Command Execution & User Interaction Policy` section of the brief — built
entirely around "their computer asks once" — is written for a world with one.

### What the lock obliges us to change

Caisra is **user-machine-only** today, by construction and by `direction.md`
§10. Registry plus explicit import is a real change, and these are the places it
lands. None of them is done.

1. **`direction.md` §10 is retired and must be rewritten.** It is marked under
   revision. Its *thesis* survives the lock — under explicit import the box is
   where work happens and not where files live, so "we open the file where it
   lives" is still true of the person's own documents. What does not survive is
   "there is no 'which computer'".

2. **The approval card has to name a machine.** Today it carries one device id
   and reads *"Allow Perrin to continue — running commands on your computer?"*
   (`thread/fromEngine.ts`, `authQuestion`). Under a registry, "your computer"
   is ambiguous and Shell-on-the-box is not Shell-on-the-Mac. This is a change
   to a card the founder has already designed, so it needs their eye.

3. **The brief's `## Command Execution & User Interaction Policy` is written for
   one machine.** "Their computer asks once" is its spine. Under a registry the
   grant is per machine, and the cheap-because-isolated box probably should not
   ask the way the person's own Mac does.

4. **Two handoff families, not one.** Box handoff is box-scoped: "take my
   screen". Controlling the person's own machine is a different card with a
   different cost, and merging them is the specific mistake the founder named.

5. **A file card that names custody.** "Copy this onto the box" is a decision
   with a cost, and it needs to be visible as one — a card about *which files*,
   not a card about *which site*.

6. **Settings gains Computers**, and Update / Reset Computer means the box.
   `direction.md` §10 struck exactly these; they come back.

### What is safe to build now

Unblocked by the lock, and not waiting on the computer's design: **Choice**,
**Secret**, the form's **typed fields**, **draft composer**, **routine
confirm**.

Still waiting on the computer design itself: **box handoff**, **cookie-origin**,
the **permission surfaces**, and the form's **fill targets** — the last of which
also waits on the browser being run at all.

---

## Where we start

Five exist, one is half-built, five are to build, and three are to re-decide
once the computer is designed. All fourteen are in scope.

| # | Grok Bot family | Simeon today (corrected 25 September 2026) | Where |
|---|---|---|---|
| 1 | Choice card | **Exists** | SendMessage `type:widget` (`host/runner/tools/sand-widgets.ts`), drawn by the pinned renderer |
| 2 | Secret request | **Coming soon** | `secret-request` is refused: its only store is a channel credential and channels are Coming Soon (ledger `cloud-agents-channels`) |
| 3 | 1Password fill | **Not built** | the LobsterAI vault code went with that tree; Grok Bot's 1Password path is dev-only (ledger F-114) |
| 4 | In-chat form | **Not built** | no `request_user_form` tool in `desktop/source` |
| 5 | Box handoff | **Exists** (wired 25 September 2026, ledger F-076) | `request_box_help` (`host/runner/tools/box-help-tool.ts`), the session's hand-off service, `box-handoff-resume.ts` |
| 6 | Draft composer | **Wired** (25 September 2026, `docs/product/draft-composer-measured.md`) | `DraftExternalMessage` emits the `email-draft` / `slack-draft` card the pinned renderer draws; `sendDraft` / `discardDraft` on the gateway; the agent delivers on a hidden wake and reports with `MarkDraftDelivered`. The card's own Send and Discard buttons are empty in Grok Bot 0.18's chunk and need a package-time patch written on a Mac (the record has the offsets). |
| 7 | 1Password connect | **To re-decide** | a vault connect card, if we adopt one |
| 8 | SCM connect | **To re-decide** | only if cloud agents exist here |
| 9 | Cloud agent card | **Coming soon** | `cursor-agent` refused until `SAND_CLOUD_AGENTS_SERVED` (Cursor's BackgroundComposerService) |
| 10 | Permission / auto-review | **Exists** | `local-tool-permission` and `auto-review-approval` cards, drawn by the host; the reviewer enforces since 25 September |
| 11 | Cookie-origin approval | **Not built** | no `request_cookie_origin` tool in `desktop/source` |
| 12 | Connector auth | **Exists** | the `connector` card (connect / connected / propose); the agent proposes with `ProposeConnector` |
| 13 | Spend / virtual card | **Not built** | no `request_virtual_card` tool in `desktop/source` |
| 14 | Routine confirm | **Exists in the host** | `reviewSandAutomationWrite` → the `auto-review-approval` card on surface `automation_write` |

The thread's vocabulary is two lists in the shipped code, not a file
(the "nine kinds" and `renderer/design/thread/types.ts` were the LobsterAI
tree): what the model may send is `SEND_MESSAGE_TYPES` in
`host/runner/tools/send-message-schema.ts` (text, attachment, widget; two
refused as Coming Soon), and what the transport carries is the case list
of `host/runner/tools/send-message-encoding.ts`, which includes the cards
the host draws on its own. Adding a kind is a decision the founder makes,
each time.

## The four differences that change the rules

These are the places where copying Grok Bot's rule would be wrong here.

**1. A card does not end our turn the way it ends theirs.**
Grok Bot's Choice widget ends the turn; the answer arrives as the user's next
message. Ours holds the `AskUserQuestion` tool call **open** and returns the
answer as a tool result, so the turn never ended
(`design/shell/useMessagesShell.ts`). Their rule "must be the last thing sent"
is about their transport. Ours is stricter in one way and looser in another, and
the rule that matters here is already written: *"When they answer you, that is
the work starting"*.

**2. ~~There is no box.~~ Withdrawn — a computer is coming.** This said the
equivalent of Grok Bot's box handoff was handing the person their own browser
window, because we had no machine of our own. The founder is designing a
computer, so #5 becomes a real handoff of a real machine and the rule can be
taken closer to theirs. Nothing is decided until that design lands; see below.

**3. No key the person types.** Grok Bot's #3 and #7 assume a
1Password connection. We have our own encrypted store with
`always-ask` / `once-per-task` modes, and the founder's rule stands: *"my users
should never put a key. everything happens under the hood. not a setting."*
So #3 is ours already in role, and #7 is not a card we will ever draw.

**4. Their #2 and #4 are one card here, deliberately.** A secret request is a
form with one masked field. `askInput/constants.ts` says so and explains why:
one card, a list of fields, each of which may be secret. Do not re-split them.

## The computer is coming, and what it costs

The founder will design a computer. That reverses the most load-bearing
paragraph in `direction.md` §10, which is worth stating once and plainly so
nobody rediscovers it late.

§10 is titled *"There is one computer, and it is this one"*, and it struck the
second machine, the cloud machine and the egress tunnel from the design. It
called this **the product thesis, not a simplification**, and named exactly what
it buys:

> Grok Bot copies your file to its own disk and copies it back — its words,
> "my computer ≠ your disk … we copy when needed" — and we open the file where
> it lives. That shows up in spreadsheet formulas, links between workbooks,
> folder structure, and privacy. **Anything that reintroduces a machine the
> agent owns takes that sentence away from us.**

That is the cost, in the founder's own record: a machine the agent owns is the
thing §10 was written to prevent. It may well be worth paying — a box is what
makes captcha, SSO, passkeys, 3DS and a real handoff possible, and five of the
fourteen families assume one. But the decision is the founder's to make
knowingly, and when it is made, §10 is the paragraph to rewrite. It is marked
there now so that whoever reads it next does not build to a thesis that has been
retired.

Two things have to be settled in that design before any more cards are drawn.
They are decisions A and B in the preamble at the top of this file, and they are
stated there once rather than here as well.

## What #4 actually needs

The form is the one that is half-built, and it is worth being exact about the
gap. Today a field is `line`, `secret` or `block`, and the card collects what is
typed. What Grok Bot's rules assume and we do not have:

- **Typed fields** — `email`, `tel`, `otp`, `number`, `date`, `select`,
  `textarea`, `checkbox`. We have three kinds, they have nine.
- **A fill target.** Theirs lands the value on the live page by `ref`,
  `selector` or `label`, and a secret field *requires* one. Ours returns the
  value to the agent and nothing is filled.
- **Domain binding.** Theirs requires the exact host when any field is secret,
  and fills only that host. We have no such binding.
- **A per-field receipt** — `filled` / `fillFailed` / `notFilled`, with no
  values ever returned.
- **`submitAfterFill`**, for one-shot OTP only.

Three of those five are about filling a page the agent is driving, which is the
browser path — and the browser has never been run in this tree. That ordering
matters: the form's fill targets are not worth building before the browser is
known to work.

## The cross-cutting rules, and which we already keep

Grok Bot's seven cross-cutting rules, checked against our brief:

| Their rule | Ours |
|---|---|
| Decide over ask | Kept — "User Choices & Decisions" |
| Never invent UI | Kept — "Not every surface can draw a card" |
| One question card at a time | Kept — "Do not open with a wall of questions" |
| Do not double-confirm | Kept — "Do not use it to confirm a command" |
| Secrets never in chat | Kept — "Passwords, Keys And Codes" |
| Dismiss/deny is final | Kept — in both the question and the approval rules |
| Text and attachments are not cards | Kept — the closed list of nine |

All seven are already in the brief. That is the useful finding: the
cross-cutting layer is done, and what is missing is card families, not
discipline.

## How we work through it

Per card, in this order:

1. The founder designs it.
2. I write the rules into the brief — **in one section that owns the
   decision**, never restated elsewhere. `briefConsistency.test.ts` fails the
   build if two sections decide the same thing.
3. The thread kind, if it needs a new one, is a decision put to the founder on
   its own. The list is closed.
4. A test that the rule reaches the agent, and a harness screen so the card can
   be looked at.

**And the thing that would end the pattern:** none of this is measured. Every
argument in this repository about whether a brief rule works has been reasoning,
and the record shows reasoning losing repeatedly. The eval harness from the fork
(`going-back-brief.md`, "the single most valuable thing in the fork") runs the
real agent loop against a local model fixture, offline, and grades on effects.
Fourteen card families is exactly the size of problem where guessing stops
scaling.

## Not decided

- **Decisions A and B** (top of this file). Everything else waits on them.
- Which of the five missing families we want at all. #13 (spend) and #11
  (cookies) carry real risk and may not belong in v1.
- Whether #14 (routine confirm) comes before Routines does anything.
- The order. The founder's design leads.
