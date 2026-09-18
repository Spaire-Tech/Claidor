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

## For the founder

1. **The reading rule** (gap 1) — I would write it now; it is one line and it
   closes a real hole.
2. **Priority** — do you want "wake now" versus "read it later" at all? It only
   earns its keep once routines run.
3. **Can the person see agents talking, and where** — thread, info pane, or not
   at all (gap 3). This one is a design.
4. **Should an agent be able to make a room** (gap 5).
