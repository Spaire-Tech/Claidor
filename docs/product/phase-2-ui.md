# Phase 2: the interface

**What Phase 2 is.** Rakazo's machine keeps running; Caisra's face goes on it.
`apps/caisra` is added as a sibling of `apps/web`, and `apps/web` is left alone
so upstream merges stay close to clean. Nothing in this document proposes new
backend work: everything below already exists in `rakazo/` and is unreachable
only because no Caisra screen renders it.

Everything here was read from `rakazo/` on 17 September. Where a number appears
it was counted, not estimated.

---

## 1. The render matrix, which is the real gap

`rakazo/packages/contracts/src/events.ts:91` declares `MessageBlock` as a
discriminated union of **22 kinds**. The founder's direction names five message
kinds. A thread that cannot draw a kind does not degrade — the block is simply
not rendered, and the person sees a gap where the agent spoke.

Two corrections to the first version of this section, both found by writing the
mapping rather than by reading harder. It is 22, not 21: `chart` joins the union
by name rather than as a literal, so counting `kind: z.literal` misses it. And
"nine kinds have no rendering" was true of Caisra and false of the repository —
`apps/web/src/pages/Shell.tsx:5774` onward draws every one of them. Their
renderings are reference material, not a blank page, which makes this a port.

`packages/core/src/caisra-thread.ts` is where the two vocabularies meet, and the
mapping is exhaustive by construction: the closing `never` assignment turns a
kind added upstream into a build failure, and `caisra-thread.test.ts` reads the
kinds off the schema so it fails there too. A silently dropped block has cost
this project once already.

| Kind | What it is | Ours today |
| --- | --- | --- |
| `text` | prose | yes |
| `card` | key/value lines | yes |
| `ask` | a question awaiting an answer | yes (question card) |
| `choice` | lettered options, answered once | yes (roster/choice card) |
| `app_connect` | connect this app, flips to connected | partly (Apps screens) |
| `connect` | a connection prompt | partly |
| `computer` | the agent used the computer | yes (computer panel) |
| `meta` | a quiet system line | yes (rename line) |
| `progress` | a short live update during long work | **no** |
| `steps` | an ordered plan | deliberately not drawn |
| `subagent` | a helper running inside this turn | **no** |
| `child_bot` | a bot this bot created | **no** |
| `cloud_agent` | a cloud agent's run, status and PR link | **no** |
| `skill_draft` | a taught skill awaiting save | **no** |
| `mcp_approval` | authorise an MCP server | **no** |
| `image` | an image | yes |
| `file` | a file the agent made | yes (file cards) |
| `handoff` | a stage passed to another bot | **no** |
| `channel_message` | a message from Slack, iMessage, etc. | **no** |
| `bot_message_sent` | this bot messaged a teammate | **no** |
| `bot_message_received` | a teammate messaged this bot | **no** |

**Nine kinds have no Caisra rendering at all**, and six of those are the team
behaviour the founder asked for on 17 September: every agent posting its own
results into the shared conversation is `handoff`, `bot_message_sent`,
`bot_message_received`, `child_bot` and `subagent`. `progress` is the other
decision of that day — progress updates are in.

**`steps` stays undrawn on purpose.** It is the tool lifecycle, and the rule
against showing it has not changed.

---

## 2. Routines

### The contract

`rpc.ts:403`. Five calls and no more: `list(botId)`, `create`, `update`,
`remove`, and `testRun({ routineId, clientNonce? })`, which returns a `runId`.
A test run is a real run that appears in the thread, not a simulation.

### The object

`domain.ts:352`, fourteen fields: `id`, `botId`, `name`, `prompt`,
`crons: string[]`, `timezone`, `active`, `notify`, `webhookEnabled`,
`githubEnabled`, `messageProvider`, `lastRunAt`, `nextRunAt`, `createdAt`.

A routine is **a name, an instruction, and at least one trigger**. Their VISION
is explicit that it stays that: *"Routines remain scheduled prompts rather than
becoming a visual workflow language."* No flow editor.

Creation is refused with no trigger, and the message is the one to show:
*"Add a schedule, webhook, GitHub, or message trigger"*.

### Eight triggers

From the editor's **Add trigger** menu: on a schedule, Slack message, Teams
message, Linear issue, Sentry alert, PagerDuty incident, Git event, webhook.
Unavailable ones are shown disabled with the reason on them (`Slack not
enabled`, `Coming soon`) rather than hidden.

### Schedules for people who do not know cron

`core/src/cron.ts`, 265 lines, no dependencies. Seven presets — Every hour,
Every day, Weekdays, Every week, Every month, Interval, Advanced — and it
converts **both ways**, so an arbitrary cron read from the database comes back
into the picker when it fits one of those shapes. `formatCron("0 9 * * 1-5")`
is `"Weekdays at 9:00 AM"`.

A one-shot is the fake cron `@once`, so "remind me in ten minutes" and "every
morning at seven" are one object in one list. `formatCron` renders it
`"One-time"`.

A routine carries **several** crons, and the list row joins its triggers with a
middot: `Every day at 9:00 AM · Slack message · Git event`, or `No trigger`, or
`Paused`.

### What our existing screen has to change

`desktop/harness/shots/agent-routines.png` was designed against the old backend.
Against this one it needs: several schedules per routine rather than one, the
seven-preset picker, the eight-trigger menu with disabled entries and reasons,
**Test run**, run history, and the `notify` toggle.

### The one thing the page cannot fix

Routines fire from a Postgres job queue in the API process. **They run with the
laptop shut only because the backend is hosted.** A routines page on a local
stack is a page of promises that come due when the machine happens to be awake.

---

## 3. A bot is never created into an empty chat

The founder's memory is right, and the mechanism is more careful than the claim.

`bots.create` takes no prompt — `CreateBotInput` is name, title, description,
instructions, notifyOnFinish, color, computerMode, spawnKey. On its own it would
leave an empty thread. It never does, because two separate things follow it:

- **`onboarding.start`** — *"Seed the first-run greeting into the bot's thread
  (focus card is separate)."*
- **`onboarding.promptFocus`** — *"Post the focus choice card when the thread is
  still idle."*

The card is a `choice` block asking, verbatim:

> **What do you want me on first?**

with four lettered options (`apps/api/src/onboarding.ts:33`):

| | | |
| --- | --- | --- |
| A | Day-to-day work | Slack, calendar, email |
| B | Inbox & email | email and calendar |
| C | Research & writing | the web, notes, docs |
| D | A bit of everything | Slack, calendar, email |

Answering with **`onboarding.choose`** *"posts the app cards. Does not rename the
bot."* Authorising an app then flips that card through
**`onboarding.appConnected`**. Leaving it is **`onboarding.dismissFocus`**.

### Three details worth copying exactly

**The first bot is asked immediately; a later bot waits ten seconds.**
`FOCUS_PROMPT_DELAY_MS = 10_000`, and the comment says why: *"First bot shows
immediately; later bots wait so the user can type freely."* Someone who already
knows what they want is not interrupted.

**Asking is abandoned the moment the person engages.** The scheduled prompt is
aborted when they send a message, dismiss it, or leave the thread.

**The insert is transactional, and the guard is the interesting part.**
`promptFocus` takes `SELECT id FROM threads WHERE id = … FOR UPDATE`, then
refuses to post if the thread already holds any user message or any choice
block. Two concurrent callers cannot double-post the card, and a message the
person sent at the same moment wins. Their comment: *"Check + insert + event in
one transaction so concurrent promptFocus calls cannot duplicate cards, and a
concurrent user send cannot publish first."*

### What this means for Caisra

The founder's design has Yodo standing agents up during onboarding, and
`spawn_bot` exists for that. Manual creation from the **+** button is the other
path, and it is the one this machinery serves. Caisra's version of the focus
card should ask what the founder's roster asks rather than what Rakazo's four
options ask — but the **lifecycle** (greet, ask once, back off if they type,
never duplicate) is already built and should not be rewritten.

---

## 4. Screens, from the surface backwards

`rpc.ts` declares **31 route groups**. Each is a capability that either has a
Caisra screen or does not.

**Have a Caisra screen already** (102 harness shots): bots and their panel,
threads, instructions, memory, skills, integrations/apps, artifacts, account and
spend, settings, onboarding, search, routines (needs the rework above).

**No Caisra screen yet, and each is a shipped backend capability:**

| Group | What it does | Why it matters |
| --- | --- | --- |
| `computer` | boot, observe, take control, update, recover | the virtual computer the founder wants |
| `groups` | group rooms with members | the team, several agents in one room |
| `botSections` | named sections in the bot list | ordering a roster that grows |
| `scratchpad` | open work that outlives a turn | not reminders; those are routines |
| `skills` (taught) | record, draft, save a taught skill | teaching by doing |
| `capabilities` | what this deployment can do | drives progressive disclosure |
| `mcp` | add a server, authorise it | the founder's 17 self-published servers |
| `connections` | Composio and Pipedream catalogues | five featured tiles, search for the rest |
| `messaging` | Slack, iMessage, WhatsApp, Telegram, Lark | agents reachable where people already are |
| `approvalRules` | always-allow and require-approval rules | the permission model |
| `autoReview` | the model judge that escalates to ask | already ours in spirit |
| `usage` | tokens and cost | the meter behind our billing |
| `export` | take your data out | ownership |
| `notifications` | push | the phone |
| `voice` | speak, dictate, call a bot | voice-first |
| `externalConversations` | threads that began outside the app | inbound |
| `agentSecrets` | named credentials, never shown to the model | `secret_request` |
| `runs` | a run's state | what "working" means |
| `aiConsent`, `preferences`, `spaces`, `deployment`, `updater` | account and deployment | settings |

---

## 5. What stays ours

Not up for reuse, because Rakazo has no equivalent: the Messages design, the
onboarding script, Yodo, the 23 strongs, the roster card, the OpenUI answer
cards and artifacts (their `chat-ui` package is 358 lines of markdown), the
cloud-blob avatars, and the Caisra brand.

---

## 6. The order I would build in

1. **The thread.** Nine unrendered block kinds, `progress` and the five team
   kinds first, because those are the 17 September decisions.
2. **Routines**, reworked against the real model.
3. **Groups**, which is what "have a team" means on screen.
4. **The computer panel**, against their lifecycle rather than ours.
5. **Connections**, five featured tiles and search.
6. Everything in the table above that is still missing.

Onboarding, the roster and the cards come across from `desktop/` rather than
being designed again; they are already the founder's.
