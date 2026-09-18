# The card families: the plan, and where we start from

18 September 2026. The founder designs each card; I implement the rules.

The rules are `sources/grok-bot-cards.md` — Grok Bot's own operating rules for
its fourteen in-chat card families, saved verbatim. **That file is a source, not
a specification.** Where Grok Bot's architecture differs from ours the rule
needs translating rather than copying, and every place that happens is named
below.

Nothing in here is built from this document yet. This is the starting line,
measured on 18 September.

---

## Where we start

Five exist, one is half-built, three do not apply, five are to build.

| # | Grok Bot family | Caisra today | Where |
|---|---|---|---|
| 1 | Choice card | **Exists** | `ThreadItemKind.Choice`, `AskUserQuestion` |
| 2 | Secret request | **Exists**, merged into #4 | `ThreadItemKind.Secret`, `askInputMcpServer.ts` |
| 3 | 1Password fill | **Equivalent, different vault** | `shared/browserCredentials/`, `lobsterBrowserMcpServer.ts` |
| 4 | In-chat form | **Partial** | `shared/askInput/constants.ts` |
| 5 | Box handoff | **Missing** | — |
| 6 | Draft composer | **Missing** | — |
| 7 | 1Password connect | **N/A** | we have no 1Password |
| 8 | SCM connect | **N/A** | no Cursor cloud agents |
| 9 | Cloud agent card | **N/A** | Cursor-specific |
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

**2. There is no box.** Grok Bot's #5 hands over a cloud desktop it owns.
We have no machine of our own — that is the product thesis
(`direction.md` §10). The equivalent is handing the person **their own**
browser window, which the app already draws in the computer panel. Same
purpose, different object, and the copy must never say "my computer".

**3. No 1Password, and no key the person types.** Grok Bot's #3 and #7 assume a
1Password connection. We have our own encrypted store with
`always-ask` / `once-per-task` modes, and the founder's rule stands: *"my users
should never put a key. everything happens under the hood. not a setting."*
So #3 is ours already in role, and #7 is not a card we will ever draw.

**4. Their #2 and #4 are one card here, deliberately.** A secret request is a
form with one masked field. `askInput/constants.ts` says so and explains why:
one card, a list of fields, each of which may be secret. Do not re-split them.

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
