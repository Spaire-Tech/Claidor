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

## Where we start

Five exist, one is half-built, five are to build, and three are to re-decide
once the computer is designed. All fourteen are in scope.

| # | Grok Bot family | Caisra today | Where |
|---|---|---|---|
| 1 | Choice card | **Exists** | `ThreadItemKind.Choice`, `AskUserQuestion` |
| 2 | Secret request | **Exists**, merged into #4 | `ThreadItemKind.Secret`, `askInputMcpServer.ts` |
| 3 | 1Password fill | **Equivalent, different vault** | `shared/browserCredentials/`, `lobsterBrowserMcpServer.ts` |
| 4 | In-chat form | **Partial** | `shared/askInput/constants.ts` |
| 5 | Box handoff | **Missing** | — |
| 6 | Draft composer | **Missing** | — |
| 7 | 1Password connect | **To re-decide** | a vault connect card, if we adopt one |
| 8 | SCM connect | **To re-decide** | only if cloud agents exist here |
| 9 | Cloud agent card | **To re-decide** | Cursor-specific as written |
| 10 | Permission / auto-review | **Exists** | `ThreadItemKind.Auth`, `flagged` + reason |
| 11 | Cookie-origin approval | **Missing** | — |
| 12 | Connector auth | **Exists** | `ThreadItemKind.Connector`, `propose_connector` |
| 13 | Spend / virtual card | **Missing** | — |
| 14 | Routine confirm | **Missing** | Routines is drawn and does nothing |

The thread currently has **nine** message kinds
(`renderer/design/thread/types.ts`), and that list is closed: adding one is a
decision the founder makes, each time.

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

Two things to settle in that design, because they decide the card rules:

- **Does the person's own file go to it?** §10's sentence survives if the box is
  a place work *happens* and not a place files *live*. A handoff for a captcha
  costs nothing; copying a workbook there costs the sentence.
- **Is it one machine or a registry?** §10 struck "which computer" as a design
  mistake. If the box is a second machine, "which computer" comes back, and with
  it every card and setting that names one.

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

- Which of the five missing families we want at all. #13 (spend) and #11
  (cookies) carry real risk and may not belong in v1.
- Whether #14 (routine confirm) comes before Routines does anything.
- The order. The founder's design leads.
