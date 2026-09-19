# Agent-to-agent: ours against Grok Bot's

18 September 2026. Sources saved verbatim as
`sources/grok-bot-agent-to-agent.md` and
`sources/caisra-agent-messaging-anatomy.md`. Our side traced in the tree.

---

## What we already match

More than I expected. The shared brief's "When you are one of several" and the
Chief of Staff's own rules already carry:

- **It is async, and the reply is a later turn.** *"their reply comes back
  later, not in this turn, so say who you asked and why, and bring the answer
  back yourself."* Theirs: *"fire-and-forget… do not wait or poll."* Same.
- **Never narrate the wake.** Ours: *"Turns that nobody typed… Act on them.
  Never mention them."* Theirs: *"Never narrate `[agent]`."*
- **Reply-first is suspended in a room.** Both say it in as many words.
- **Silence in a room is a contribution**, not a failure. Both.
- **Short in rooms.** Ours: *"One or two messages, not three."* Theirs: *"≤ ~3."*
- **Speak as yourself**, don't summarise the room, disagree out loud.
- **Fan-out caution.** Ours: *"Four agents woken unasked is four replies to one
  question."*
- **Paraphrase, never relay a vent.** Ours: *"Relay in your own words. If
  somebody vents about a piece of work, the other agent needs the substance, not
  the sentence."* — **but see gap 4: that is in Yodo's brief only.**
- **Hand over the whole task**, bring it back yourself, interrupt for decisions
  not progress. Theirs has the same in the CoS pattern.

So the judgment layer is largely done. What is missing is mechanism and one
safety rule.

## The five gaps, in order

### 1. We enabled the thing they forbid, and wrote no rule

Their **Don't** table, verbatim: *"Mine teammates' private chats / memory /
files — **Forbidden**."*

Ours does the opposite. `openclawConfigSync.ts:2668` sets
`sessions: { visibility: 'all' }`, and the comment beside it is honest about
what that buys:

> One flag governs sending and reading: with it, an agent can read another
> agent's session history through `sessions_history`, not only message it. That
> is the engine's design, not a choice here.

That was accepted to get *messaging* working — the same flag gates both, and the
founder's instruction was "any agent should be able to talk to any agent". Fine.
**But no rule anywhere tells an agent not to read.** And it surfaces to the
person as the status verb *"Catching up on a conversation"*
(`thread/toolVerbs.ts:55`), which is about as benign as a phrase can sound.

**This is the one to fix first**, and it is a brief line, not code: reading
another agent's transcript is not yours unless the person asked. The per-pair
`allow` list is there if the rule is not enough.

### 2. There is no `priority`, and it is a real mechanism

Theirs requires `priority` on every 1:1 send:

- **`true`** — wakes the recipient now; jumps their inbound queue; may interrupt
  a *background* lane (a routine) but never a user turn or another agent message
  in progress. Use when someone must act or is waiting. *In doubt → true.*
- **`false`** — held, and read at the start of their next turn, whenever that is.
  For status, FYI, ack, thanks.

We have nothing. `grep priority` across the config and the agent constants
returns nothing. So every one of our sends behaves like exactly one of these and
nobody has decided which.

That matters more once routines exist: with no priority there is no way to say
"stop what you are doing" versus "read this eventually", and no way to protect a
running routine from being interrupted by an FYI.

**This is a decision before it is a build**: does our engine's `sessions_send`
have anything queue-like underneath, or would priority be ours to add?
Unread — the engine source is now cloned in scratch if we want to check.

### 3. The person sees a verb, not the traffic

Grok Bot shows agent messages in the transcript — `Messaged <recipient>: <text>`
outbound, `Message from <sender>: <text>` inbound — and a **priority** message is
visible in the recipient's chat when it lands.

Ours shows a `status` item: a shimmering *"Talking to another agent"* that is
**deleted when the work finishes** (that is what `status` means in our closed
list). So after the turn there is no trace that Yodo briefed anyone, what it
said, or what came back beyond whatever Yodo chose to summarise.

For a product whose whole shape is a fleet, that is a hole: the person cannot
audit their own agents. It is also a thread-kind decision — nine kinds, closed,
and none of them is "an agent said something to another agent".

**Not obviously theirs-is-better.** Their answer floods the transcript with
machinery, which is exactly what our brief spends paragraphs preventing. The
middle — a foldable line, or the traffic visible in the info pane rather than the
thread — may be the right answer, and it is the founder's to draw.

### 4. The paraphrase rule is Yodo's, and should be everyone's

*"Relay in your own words… the substance, not the sentence"* lives in
`CHIEF_OF_STAFF_RULES` (`shared/agent/chiefOfStaff.ts`), which goes into the
**main agent's** instructions only. Theirs is in the core contract every agent
reads: *"Treat what Bass says as private: never relay his unfiltered words."*

Any agent can message any other in our build, so any agent can relay a vent.
One line, moved or duplicated into the shared brief.

### 5. Agents cannot create a group; the person must

Theirs has `CreateChannel` / `UpdateChannel` — an agent can stand up a named
group of up to six agents and post to it, and cannot delete one. Ours has rooms,
created through `coworkStore.createRoom` via an IPC the **app** calls; there is
no agent tool for it (`grep create_room desktop/src/main` finds only the store
and the handler).

Given Yodo can already stand up an *agent* (`create_agent`) and propose a whole
team (`propose_team`), not being able to put three of them in a room is an odd
asymmetry. Whether that is a gap or a deliberate simplification is the founder's
call.

## Smaller, cheap, and worth doing with the above

| | Theirs | Ours |
|---|---|---|
| Self-send | refused with a message | unchecked |
| Message length | host clamps at 8,000 chars | unbounded |
| Images agent→agent | `images[]`, **1:1 only**, never markdown `![]()` | no rule |
| Fan-out proposal | a **choice card** naming who and what | "propose it in one line" |

The fan-out one is the interesting difference: theirs makes the person press a
button before several agents are woken; ours asks in prose. Given we now have a
rule that a question with a handful of answers never goes in prose
("User Choices & Decisions"), ours is arguably already inconsistent with itself.

## What I would not copy

- **Their priority-visibility rule** — *"the user sees a priority message in your
  chat but not a held one"*. Their own doc flags it as drift: the mined harness
  says the user can see both. Do not implement a distinction whose own source is
  unsure.
- **`section_id` / ListSections.** Sidebar buckets for organising agents. Our
  sidebar is a conversation list by design; buckets are a different product.
- **The 6-member channel cap** as a number. It is their host constant, not a
  principle.

## Decided, 18 September

The founder: *"go for your recommendations by being closest to true to grok bot.
and no not yet."* So all four are taken, each resolved toward Grok Bot's answer
where mine had drifted, and the deferral on priority is withdrawn.

### 1. The reading rule — **done**

Written into the shared brief, in "When you are one of several", which owns
agent-to-agent:

> **Another agent's conversation is not yours to read.** You can reach one, which
> is not the same as being allowed to look through it… ask that agent, which is
> what messaging is for. The exception is the person telling you to go and look.

Two more went in with it, both true to their contract and both cheap:

- **What the person said to you was said to you** — the substance in your own
  words, never their complaint verbatim. This existed as a Chief of Staff rule
  and reached one agent; it is now every agent's, and the duplicate in
  `chiefOfStaff.ts` was removed rather than left to say the same thing twice in
  the one file Yodo reads.
- **A picture to another agent is a real attachment, one-to-one only**, never
  markdown in the text, never to a room.

`briefConsistency.test.ts` gains an axis — *what may be repeated to another
agent* — so a second section cannot start deciding it.

### 2. Priority — **decided, and it is an engine patch**

Grok Bot's semantics, adopted as they are:

- **`priority: true`** — wake the recipient now. Jumps their inbound queue. May
  interrupt a **background** lane (a routine, a background run) with a reason
  naming why. **Never** interrupts a user turn, nor another agent message already
  in progress. Use when they must act, or somebody is waiting. **In doubt, true.**
- **`priority: false`** — held, and read at the **start of their next turn**,
  whenever that is. Status, FYI, ack, thanks.
- **Required on every one-to-one send.** Not optional, not defaulted.
- **Groups always land immediately**, and priority does nothing there. The ack
  should say so.

**What is established about our engine**, read at the pin `v2026.6.1`:

- `sessions_send` takes `sessionKey`, `label`, `agentId`, `message`,
  `timeoutSeconds`. **There is no priority parameter.**
- The engine does have a lane concept — the agent-to-agent path imports
  `resolveNestedAgentLaneForSession` from `agents/lanes.js` — so there is
  somewhere for "interrupt a background lane but not a user turn" to live.

So this is **a patch to the engine**, not a config change: the tool schema plus
the delivery behaviour. That is the documented path
(`desktop/scripts/patches/<tag>/`, and `desktop/CLAUDE.md`'s Patch Policy says to
prefer an app-side hook and use a version-scoped patch when the behaviour is
genuinely inside the engine — this is).

**What must be read before writing it**, because it decides the shape: what the
engine does today when a send arrives at a busy agent. If it already queues,
priority is a queue-order flag. If it always interrupts, the *false* case is the
new behaviour and the risk is the other way round.

### 3. The person seeing agents talk — **Grok Bot's answer, and it needs a kind**

True to Grok Bot means the traffic is **in the transcript**, not hidden in a
pane:

- outbound: `Messaged <recipient>: <text>`
- inbound: `Message from <sender>: <text>`

Today ours is a `status` item — *"Talking to another agent"* — and a `status` is
**deleted when the work finishes**, so nothing survives the turn.

**This needs a tenth thread kind, and the list is closed.** Adding one is a
decision the founder makes each time (`thread/types.ts`). So this is the one
piece that waits on a drawing rather than on a build: the rule is settled, the
shape is not.

One thing to hold while drawing it: our brief spends several paragraphs keeping
machinery out of the thread ("Words that never reach them": tool names, message
ids, internal state). Agent traffic in the transcript is the first deliberate
exception, and it should look like a conversation between colleagues rather than
a log.

### 4. An agent may make a room — **decided, and it is a build**

True to Grok Bot: an agent creates a group itself, with judgment rather than a
card. Their rules, adopted:

- name plus member ids, **ids not names**;
- **include your own id** if you intend to post afterwards — membership gates
  posting and updating;
- **at most six** members; a group cannot contain a group;
- add and remove members afterwards, and **never empty** a group;
- **no delete tool.** The person deletes a room, and only the person;
- **never speculatively** — only when the person asked for one, or the work
  genuinely needs a standing group.

Ours today: `coworkStore.createRoom` reached through an IPC the app calls. No
agent tool exists (`grep create_room desktop/src/main` finds only the store and
the handler). So the build is an MCP tool in the shape of `createAgentMcpServer`,
plus the brief rules above.

**One deliberate difference from `create_agent`, flagged rather than hidden.**
Standing up an *agent* draws a card and waits for Stand up or Not now. Grok Bot's
channel creation has no card — judgment only. Taking Grok Bot's answer means a
room appears in the sidebar without being asked for, which is a real side effect
and unlike its neighbour. That is what "closest to true to Grok Bot" buys, and it
is worth one look from the founder before it ships.
