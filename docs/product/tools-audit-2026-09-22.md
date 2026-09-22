# Grok Bot's tools on Caisra: the audit, and the decision (22 September 2026)

The founder's report: "when i ask an agent to create agents for me, it bugs.
keeps creating over and over again. cards dont appear — multiple choice,
permissions, connectors (in the chat) not appearing. and if they appear for
some reason, they're all the way up the chat, at the top for no reason. same
for things like 'renamed to x', the message in the middle of things."

Every claim below is tied to a file at `5acfad54` (the tree before this
change). The decision is at the end.

## Where a turn ran

Product turns ran on the Mac through `node-agent-coordinator/inference-router.ts`.
That router is the reconstruction's own text-only path for its alternative
providers (codex, openrouter, claude-code): 231 lines at the pristine commit
`ce9fc2d8`, a local JSON transcript beside the host's, and a concatenation of
the two on every read that was harmless because nothing wrote to the host
during a local turn. Between 19 and 21 September Grok Bot's tools were bolted
onto it (`shared/grok-bot-tools.ts`, `routed-agent-tools.ts`), and the
concatenation stopped being harmless. On 20 September the host loop was
switched on for Claidor "so CreateAgent, rename, InstallPlugin, connector
cards, and the first-run question widget actually run" (`9b1fc218`) and
switched off the same day because a box that was not ready hung the turn
(`83a6b234`).

## What was wrong, and why

**Cards and "Renamed to x" at the top.** The transcript the renderer gets is
host entries followed by every local entry, never merged by time
(`inference-router.ts:429`); the model's history does the same
(`shared/grok-bot-transcript.ts:67`). Text on the Mac path is local; widgets,
connector cards, Allow cards, the hello and timeline events are host entries.
The renderer draws array order and never sorts (`transcript.tsx:700`). Live, a
card appends at the bottom; on the next open of the agent every card and
every rename line is hoisted above the whole conversation. Writing a card for
an agent that is not the host's active session switches the host session,
which broadcasts a host-only snapshot the renderer takes as a baseline, so
the chat collapses to intro plus cards (`session-runtime.ts:206-210`,
`ensureActionTarget`). Every local bubble of a turn carries the turn's start
time (`inference-router.ts:278`) while host cards carry the time they were
written, so a sort by time would have given a second wrong order. The tail
is sliced to 200 after the join, so the host block, meaning every card, was
shaved off first as history grew.

**CreateAgent over and over.** Inside one turn the model saw the tool
result. But nothing stored it: history was rebuilt from user text and
SendMessage summaries only (`grok-bot-transcript.ts:39-52`). If a turn ended
without a SendMessage the whole turn was re-run from the original history
plus a nudge (`inference-router.ts:390-399`, `SEND_MESSAGE_PLAIN_TEXT_RETRY`,
which has no counterpart in Grok Bot), so the first run's CreateAgent ran
again. Across turns the model saw a request to create agents and no record of
having done so. Nothing deduped: no teammate directory in the Mac system
prompt, no name check, and the host's nonce ledger was bypassed because the
tool sent no nonce. CreateAgent on this path also hit the foreground create
(`agent-lifecycle.ts:41-68`), which switched the person's screen mid-turn;
stock routes the model's call to `createBackgroundAgent`. The "ask before
CreateAgent" text from `bb942712` had been removed again by `5c6122be`.

**Cards not showing at all.** The Allow card is never inline
(`transcript.tsx:708`) and the dock requires `permissionScope` and
`permissionScopeRevision` on the entry (`ProductionRenderer.tsx:1767-1781`);
no writer anywhere in `source/` stamped them, on the stock path either. A
multiple-choice widget was validated only for a prompt on the Mac path while
the renderer drops a card unless options are one to six objects with a label
(`protocol.ts:243-252`); the stock tool parses the same schema before its
body runs (`send-message-schema.ts:44`). The connector card had no fallback:
an unreachable host threw out of the tool and aborted the step.

## What Grok Bot does

One transcript per agent, ordered by insertion (`agent-db-schema.ts:15-19`,
`transcript-store.ts`), one append for text, cards, permission asks and events
(`turn-runtime.ts:717-782`). The model's conversation is a separate persisted
structure carrying every tool call and tool result into the next turn
(`packages/agent/state.ts:1483`, `agent-kv/agent-store.ts:350-380`). A turn
that ends without a SendMessage gets up to three hidden reply nudges as
continuations on the same state (`turn-runtime.ts:534-603`), never a re-run.
The system prompt carries the teammate directory with ids and the line "offer
to CreateAgent one" (`agents/agent-messaging.ts:35-81`). A model-created
agent goes to the background create; its intro runs later, on the real loop,
when the person opens it. Widgets are parsed with `sandWidgetSchema` before
the tool body. Connector cards come from a real needs-auth signal with a
per-server dedupe (`turn-agent-composition.ts:1259-1267`).

## The decision

"Use the original Grok Bot loop. i want literally everything."

Changed:

- `shared/inference-router.ts`: `routesClaidorThroughHost` is true with an
  empty environment; `SAND_CLAIDOR_FULL_AGENT=off` (or `0`, `false`, `no`)
  is the Mac-local, text-only escape hatch. Every product turn, card tap and
  transcript read now passes straight through the coordinator to the host.
- `agent-lifecycle.ts`: back to the pristine reconstruction, so the first-run
  intro runs on the real runner with the stock nudge and the stock
  introduction-pending rule.
- `node-agent-coordinator/permission-scope-stamp.ts`: the coordinator stamps
  `permissionScope` (the signed-in account's authId, else email, the slot the
  renderer computes for itself) and `permissionScopeRevision` (the
  coordinator's start time; the coordinator is launched once per signed-in
  account, so a sign-out and back in gets a strictly newer number, which is
  what the dock's gate wants) on every local-tool-permission card in a
  transcript event or read reply. The desktop answers the slot through a new
  control command, `getTranscriptAccountSlot`.
- `shared/grok-bot-tools.ts`: the hatch parses widgets with the stock
  `sandWidgetSchema`, so a malformed card is an error the model reads.

Unchanged and load-bearing: the gateway deadlines (`gateway-client.ts:40-43`;
connect, send and roster reads at 15 s) that make a cold box fail instead of
hang, and the renderer's failed-send and reconnecting states that show it.

Checked here: `tsc` on `source/` and `frontend/`, and the suite (93 tests, 91
pass, 2 pre-existing skips). Tests that pinned the Mac default now pin the
loop; `tests/permission-scope-stamp.test.mjs` covers the stamp.

## Not yet measured

A full turn on the loop on a Mac, three ways: with the box warm, with the box
cold (the turn should fail within the deadlines and the composer should show
the failed send), and with Docker off. And the Allow card itself: ask an
agent to run a command and see the dock. The console line to read if it does
not show is the entry the dock refused, which will carry no `permissionScope`
if the coordinator could not learn the slot.
