# The build map: every screen, and the fork module behind it

> **Archived 18 September 2026, and corrected the same day.** The founder ended
> the Caisra-on-Rakazo build the day this was written. The banner used to say the
> repository would "keep only the complete fork of Rakazo" — that held for part of
> one day; `rakazo/` was then deleted outright and is in history only. **Every
> `rakazo/...` and `packages/...` path in this document is a path at commit
> `4118ac0f` (or the subtree merge `34325164`), not a path in the tree.** Read it
> with `git show`. **Part 1 — what Rakazo ships —
> is still true and still the reason to read this file. Part 3 is a plan that
> was never carried out.**

**This is the reference. Look things up here. Do not reason about what exists.**

Written 18 September 2026 after the founder said, correctly, that I keep
reasoning forward instead of reading their code. Every line below was read out
of the fork with `grep` and `wc -l` on that date. Nothing here is recalled.

The founder's governing rule, and the test for every row in this document:

> "Their engine + their infrastructure + their connectors + their computers +
> Caisra's product/UI/brand/business layer." — "They already built most of the
> machine. Let's use the machine and change what the customer sees."

So the only thing Caisra should own is **what it looks like**. Every rule, every
decision, every piece of state is theirs unless there is a written reason.

---

## Part 1 — What Rakazo actually ships

Counted 18 September, source lines, tests excluded.

### Packages

| Package | Lines | What it is |
|---|---|---|
| `db` | 141,142 | Prisma schema, repos, migrations |
| `adapters` | 38,681 | Pi runtime, sandboxes, connectors, voice providers, model providers |
| `core` | 9,255 | **The rules. Pure, testable, no React.** |
| `contracts` | 2,833 | The oRPC contract and every zod schema |
| `ui-web` | 2,831 | shadcn/Base UI components (30 exports) |
| `adapter-kit` | 1,441 | The interfaces a sandbox/provider implements |
| `logging`, `auth`, `chat-ui`, `memory`, `ui-tokens` | < 900 each | |

### Apps

| App | Lines | |
|---|---|---|
| `web` | 23,886 | Their full product. `Shell.tsx` alone is 6,157 |
| `api` | 14,567 | The server |
| `mobile` | 10,293 | Expo |
| **`caisra`** | **5,693** | **Ours** |
| `desktop` | 3,456 | Electron: `main.ts`, `ipcMain`, `preload.cjs` |
| `www`, `worker` | | |

### `packages/core` — the modules that are rules, by name

`action-approval` `agent-skill` `ai-consent` `answerable-ask`
`approval-effect-key` `async` `attachments` `avatar-motion` `avatar-shape`
`bot-messages` `bot-sections` `cloud-agent` `compose-update`
`composer-mention-picker` `composer-mentions` `composer-slash`
`computer-updates` `cron` `events` `featured-connectors` `group-mentions`
`http-response` `mcp` `message-pages` `message-reactions` `message-visibility`
`messaging-commands` `messaging-prompts` `model-oauth` `model-probe`
`model-providers` `response-bytes` `run-state` `sandbox-command` `screen-lease`
`search` `secrets-guard` `self-update` `signup-policy` `speech-text`
`teach-playbook` `teach-recording` `text-direction` `thread-message-updates`
`thread-subscription` `tool-activity`

### The contract, `packages/contracts/src/rpc.ts`

33 routers: `aiConsent` `preferences` `spaces` `deployment` `updater` `models`
`bots` `groups` `botSections` `threads` `computer` `memory` `routines`
`scratchpad` `skills` `agentSkills` `capabilities` `mcp` `onboarding`
`integrationSetup` `connections` `messaging` `approvalRules` `autoReview`
`artifacts` `usage` `export` `notifications` `search` `runs` `voice`
`externalConversations` `agentSecrets`

---

## Part 2 — What I got wrong

Each one is a fault of the same kind: I wrote code without searching for the
code that already did it.

### A. Logic I rebuilt that they already had

**A1. `caisraWorking` / `caisraWaiting` — and mine is wrong, not just duplicated.**
`packages/core/src/caisra-live.ts:148` checks `status === "running"`.
`packages/core/src/run-state.ts:3` says an active run is any of
`queued`, `leased`, `running`, `waiting_input`, `waiting_takeover`, and exports
`isActive()` and `isTerminal()` for exactly this.
**The consequence:** press send, and while the run is `queued` or `leased` the
header shows nothing and the sidebar does not say "Working". The agent is
working. The app says it is idle.

**A2. My message upsert.** `caisra-live.ts:117` hand-rolls a findIndex/map.
`packages/core/src/message-pages.ts:70` is `upsertMessageById()`, and the same
file has `mergeThreadHistory`, `prependThreadHistoryPage`, `mergeMessagePages`,
`mergeMessagesById` for the pagination I have not built yet.

**A3. The reducer.** I wrote `caisraApplyEvent` and argued against their
`reduceThreadSnapshot` (`apps/web/src/lib/thread-events.ts:261`, 639 lines)
because it sits in their app and would widen the merge surface. The argument is
sound; the conclusion was lazy. The right move is to ask them to move it into
`packages/core` — it is pure and belongs there — or to lift it once with the
reason written down, not to write a thinner one from scratch.

### B. UI I drew with no behaviour behind it

Every one of these is a control that does nothing, which is the exact fault the
founder has objected to since the first build.

| What I drew | The rule they already ship |
|---|---|
| Choice card buttons | `core/answerable-ask.ts` → `latestAnswerableAskMessageId()`, `selectedAskActionLabel()`; `web/pages/shell/message-cards.tsx:13` `ChoiceCard`; `threads.answer` |
| Approval card | `core/action-approval.ts` (245 lines): `toolRequiresApproval`, `toolRequiresExplicitApproval`, `unattendedTriggerToolRequiresApproval`; `message-cards.tsx:292` `McpApprovalCard` |
| Connector card | `message-cards.tsx:105` `AppConnectCard`; `connections.begin` / `revoke` |
| Composer | `core/composer-mentions.ts` (283 lines — @bot @group @routine @connector @everyone), `composer-slash.ts`, `composer-mention-picker.ts` |
| Sidebar list | `core/bot-sections.ts:10` `groupBotsForSidebar()`, `reorderBotTo()` |
| My `Chart.tsx` | `message-cards.tsx:204` `ChartCanvas`, `:386` `ChartBlockView` |
| Ask/secret card | `web/components/AskCard.tsx` (203 lines) |

**And one I did not draw at all, which is a fault by omission:**
`core/message-visibility.ts:31` `userVisibleMessages()` and `:24`
`isPeerReceiptBlocks()` decide what a person is meant to see. My thread renders
every message in the snapshot. Caisra would show internal peer traffic in the
conversation.

### C. Things I told the founder were "not started" that they already ship

**C1. Voice.** I said "not started". They ship, today:

| | Lines |
|---|---|
| `core/speech-text.ts` — `speakable`, `toUtterances`, `speechFromBlocks`, `narrateTool`, `spokenDecision` | 231 |
| `web/lib/tts.ts` | 293 |
| `web/lib/dictation.ts` | 430 |
| `web/pages/CallView.tsx` — the whole call screen | 298 |
| `api/src/voice.ts` + the `voice` router (catalog, status, credentials, connect, setVoice, voices, prepare) | |

That is roughly 1,250 lines of working voice. This is the same failure as the
onboarding Mac tasks, one day later.

**C2. The onboarding Mac tasks.** Told the founder there was "genuinely nothing
behind them". `desktop/src/main/onboarding/macTasks.ts` is 178 lines of working
AppleScript with 107 lines of tests, which the founder had run many times.

### D. The structural mistake underneath all of them

I built `apps/caisra` as a new app that renders fixtures, and reached for the
fork only when I happened to remember something existed. The founder's rule is
the opposite: start from their machine and change what the customer sees. The
app should have been their behaviour wearing our chrome from the first line.
Everything in Part 2 is a symptom of that one inversion.

---

## Part 3 — The plan, in order, with the reference for each step

Each step names the module it must call. If a step needs a rule that is not
named here, the first action is to search for it, not to write it.

### Step 1 — Correct what is already wrong (before adding anything)

1. `caisra-live.ts`: replace `caisraWorking`/`caisraWaiting` with
   `isActive`/`isTerminal` from `run-state.ts`, treating `waiting_input` and
   `waiting_takeover` as waiting and the rest of `ACTIVE_RUN_STATUSES` as
   working. Test that a `queued` run reads as working.
2. `caisra-live.ts`: use `upsertMessageById` from `message-pages.ts`.
3. Thread: filter through `userVisibleMessages()` before drawing.

### Step 2 — Chat on live data

- Sidebar: `bots.list` + `groupBotsForSidebar()` (`bot-sections.ts`).
- Thread: `threads.get` + `threads.subscribe` + `runThreadSubscription`
  (`thread-subscription.ts`), through the corrected reducer.
- Send: `threads.send`. Stop: `threads.stop`.
- Choice card: `latestAnswerableAskMessageId()` decides which is live;
  `threads.answer` answers it.
- Composer: `composer-mentions.ts` + `composer-slash.ts` +
  `composer-mention-picker.ts`.

### Step 3 — The screens on live data

- Apps: `connections.catalog` / `list` / `begin` / `revoke`, with
  `featured-connectors.ts` (already used).
- Routines: `routines.list` / `create` / `update`, with `cron.ts` for the
  presets and the schedule words.
- Settings: `preferences`, `computer.status`, `usage`, `deployment`.
- Account menu: `usage`.

### Step 4 — Voice, from their pipeline

`speech-text.ts` for what gets spoken, `tts.ts` for speaking it,
`dictation.ts` for hearing, the `voice` router for the provider. Caisra's Voice
tab is `CallView`'s behaviour with the founder's face-without-a-circle.

### Step 5 — Onboarding's Mac tasks

Move `desktop/src/main/onboarding/macTasks.ts` (178 lines) and its handlers (42)
into `apps/desktop/src`, register the three channels on their `ipcMain`, expose
them on `preload.cjs`, pass the bridge into `Onboarding`. A port; the AppleScript
does not change and its tests come with it.

### Step 6 — The rest

`CHIEF_OF_STAFF_RULES` for the new topology; direct connectors; groups
(`groups.*`, `group-mentions.ts`); memory (`memory.*`); skills (`agent-skill.ts`,
525 lines).

---

## The rule this document exists to enforce

Before writing any behaviour, find the module in Part 1 that already decides it.
Before saying anything is missing, search. `docs/product/what-exists.md` is the
same rule pointed at `desktop/`; this one is pointed at `rakazo/`.
