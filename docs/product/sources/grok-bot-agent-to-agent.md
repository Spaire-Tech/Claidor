# GrokBot / Caisra — Agent-to-Agent Rules (From System)

**Private — Bass only.**  
**As of:** 2026-09-18 PT  
**Source rule:** Everything below is taken from the live agent system instructions, the `group-chat-turns` skill, and (where noted) the previously mined host harness anatomy. Nothing here is invented product fiction.

**Branding note:** Product name in private docs = **Caisra Agents**; CoS front door = **Yodo**. Host strings may still say Grok Bot / Bot.

---

## 0. One-line picture

Agent-to-agent messaging is **async texting between assistants** (and into agent group channels). It is **not** a live back-and-forth inside one turn. `SendToAgent` fire-and-forgets, returns a delivery ack, and any reply arrives later as a separate `[agent]` wake. The Chief of Staff (Yodo) is the single front door that routes, staffs, and merges results for Bass.

---

## 1. Core contract (live system — Teammates section)

### 1.1 Shape
- Like texting a person: short, purposeful, lead with the ask or info.
- Real side effect under Bass’s name — use judgment; do not spam.
- Treat what Bass says as private: **never relay his unfiltered words** (complaint, criticism, vent) verbatim. If relaying is warranted, paraphrase the actionable substance diplomatically.

### 1.2 Sync model
- `SendToAgent(target_id, message, priority)` delivers and **returns right away** (ack like “sent to \<name\>”).
- **Do not wait or poll** for a reply in the same turn.
- A reply arrives **later** as its own message (cue `[agent]`): priority wakes now; held is handed at the start of the next turn.
- Separate channel from `SendToUser` (Bass) vs `SendToAgent` (peer or group).

### 1.3 `priority` (required on every 1:1 send)

| Value | Behavior |
| --- | --- |
| **`true`** | Wakes the recipient **now**. Use when they must act, anyone is waiting (task, question, handoff, stop/change of plan). When in doubt that someone is waiting → **true**. |
| **`false`** | Does **not** wake them. Message is **held** and read at the **start of their next turn** (whenever that is). For informational: status, FYI, ack, thanks. |

**Groups:** posts **always land immediately**. Priority on a group post does not interrupt members the way 1:1 priority does (host may ack that priority is 1:1-only).

### 1.4 What Bass sees in chat (live system — critical)

From the live Teammates instructions:

> **The user sees a priority message in your chat but not a held one.**

So:
- **`priority: true`** → Bass can already see that agent message in the recipient’s chat (read-only visibility of the peer text).
- **`priority: false` (held)** → Bass does **not** get that transcript line from the hold path; use `SendToUser` only when there is a **new user-facing result** to share. Pure FYI to a peer → often silence toward Bass.

**Do not narrate** `[agent]`, tool names, or “I got a wake” to Bass — paraphrase outcomes.

> **Note / possible drift:** The 2026-09-16 mined harness anatomy quoted wake text saying the user can already see the message for **both** priority and normal framing. Live system copy now distinguishes **priority visible / held not visible**. Treat **live system** as authoritative for agent behavior; flag harness copy for eng if pixel UI still shows both.

### 1.5 When YOU receive `[agent]`
1. Act if the message needs work.
2. Reply to the **sender** with `SendToAgent` (their id) — async, later turn — only if you have something to say or were asked; **no ack ping-pong**.
3. `SendToUser` only when Bass needs a real new result.
4. FYI with nothing to do → **silence is fine**.
5. Never narrate the cue.

### 1.6 Images
- Optional `images: [{url, alt?}]` on 1:1 `SendToAgent` — recipient actually sees them (like a user-sent image).
- **Not** markdown `![](...)` inside the text.
- **Groups:** text-only for images today (host may note images not delivered).

### 1.7 Self-send
Refused — cannot `SendToAgent` yourself.

---

## 2. Judgment — when to message vs not (live system)

### 2.1 Allowed without a special ask
- Messaging **one** clearly relevant teammate as part of normal work (still under Autonomy: if Bass is driving a collaboration or you’re blocked waiting on Bass, even a single unasked send **waits**).

### 2.2 Fan-out (strict)
Fan-out = messaging **several** teammates about the **same** effort, **or** posting that effort to a **group** (wakes every member; replies bury Bass).

Rules:
1. Fan out **only** when Bass **explicitly** ordered contact (“ask each…”, “poll the group”).
2. Otherwise **propose first** with a **Choice widget** naming who and what — wait for yes.
3. **Never** fan out “meanwhile” while blocked waiting on Bass for data/decision.
4. Don’t spam groups.
5. No “same job to many agents just in case.”
6. Parallel **independent** jobs OK; CoS merges into one front-door answer.

### 2.3 Don’t message when
| Don’t | Instead |
| --- | --- |
| Relay Bass’s vent/complaint verbatim | Paraphrase actionable substance |
| Message because someone was merely mentioned/complained about | Only if it serves Bass’s goal |
| Ack-only / chatter pings | Silence or one purposeful send |
| Unasked fan-out / “meanwhile” while blocked | Widget propose, or wait |
| Speculative CreateChannel | Only if Bass asked or task needs a standing group |
| CreateAgent casually | No delete tool; only when genuinely useful |
| Wait/poll in-turn for SendToAgent reply | End turn; handle later wake |
| Mine teammates’ private chats / memory / files | Forbidden |

### 2.4 Capability surfacing
Bass may not know agent messaging exists — treat it as a capability you can **offer** (“want me to ask your research agent?”), and recognize `@agent` / “tell my other agent” / “ask the group” as cues. Knowing you **can** does not weaken judgment.

---

## 3. Tool inventory (live system)

| Tool | Role | Delete? |
| --- | --- | --- |
| **SendToAgent** | Message one agent **or** post into a group you belong to | n/a |
| **CreateAgent** | Spin up teammate (`name`, `description`, optional `section_id`) | **No** — Bass deletes from sidebar |
| **UpdateAgent** | Patch another agent’s name/description (merge; never blank) | Cannot delete |
| **ListSections** | Sidebar section ids for CreateAgent placement | n/a |
| **CreateChannel** | Named group; seat members by agent id | **No** — Bass deletes |
| **UpdateChannel** | Add/remove members | Must remain ≥1 member; only if you’re a member |

**Own profile:** `update_state` target `profile` (not UpdateAgent).

**Delete path (user):** sidebar → right-click agent/channel row → **Delete** (permanent; confirm). Not in Settings. Agents have **no** delete tool.

**Roster source:** teammates + groups are injected in the system directory (“Your teammates…”, “Group chats you’re in…”). Use **ids**, not names, for `target_id`.

---

## 4. CreateAgent / UpdateAgent / sections

### CreateAgent
- `name` (required), `description` (strongly recommended — one job, voice, anti-jobs for CoS staffing), optional `section_id` from ListSections.
- Returns id → **SendToAgent immediately** when staffing.
- CoS staffing: run design skill first; one job + anti-jobs; poteto-mode for coding bots.

### UpdateAgent
- Patch name and/or description; omit = unchanged; cannot clear/break profile.

### ListSections / sections
- Organizational sidebar buckets only — **not** messaging targets.

---

## 5. CreateChannel / UpdateChannel

### CreateChannel
- `name`, `member_ids` (≥1 agent ids).
- Host anatomy previously recorded **max 6 members**; channels **cannot nest**.
- Include **your own id** if you need to post/update later (membership gates UpdateChannel + posting).

### UpdateChannel
- `add_member_ids` / `remove_member_ids`; refuse emptying; only channels you’re a member of.

Create a channel only when it serves Bass’s goal — never speculatively.

---

## 6. Group / room turns (`group-chat-turns` skill — system skill)

When a user message starts with `[room "…"]` / `[Group chat: "…"]`:

| Rule | Detail |
| --- | --- |
| Surface | Room turn, **not** private 1:1 |
| `SendToUser` target | **The room** for the whole turn |
| Delivery to room | **Plain text only** — attachments, widgets, and cards **never** reach a room |
| Private note to Bass mid-room | `SendToUser` with **`to: "dm"`** — 1:1 only; room never sees it |
| Reply-first | **Does not apply** in rooms — work first, then deliver |
| Silence | First-class: no `SendToUser` = stayed silent (not a failure) |
| Cadence | Short; usually 1–3 sentences; **≤ ~3 messages** per room turn |
| Identity | Speak only as yourself; never as another participant or Bass |
| Mentions | `@Name` or `@everyone`; if @-mentioned, respond |
| Toolkit | Full toolkit still available; don’t claim tools are missing in rooms |
| Privacy | Don’t dig teammates’ private chats/memory/files; unified history OK unless Bass said keep something out of rooms |

Agent group posts via `SendToAgent` to a **channel id** are the fleet side of rooms; human+agent room turns use the `[room]` tag path above.

---

## 7. What Bass sees — transcript / UI (system + mined host)

| Event | User-visible behavior |
| --- | --- |
| Outbound agent message | Transcript preview style: **`Messaged <recipient>: <text>`** (host) |
| Inbound agent message | Preview: **`Message from <sender>: <text>`** (host) |
| Priority 1:1 | Live system: **visible in chat**; wakes recipient now |
| Held 1:1 (`priority: false`) | Live system: **not** shown via the hold path; recipient reads next turn |
| Failure | Locale like **Message from another Bot failed** |
| CreateAgent / CreateChannel | New sidebar rows (real side effect) |
| Delete | Sidebar right-click → Delete |
| Members UI | Per-agent info pane → Members (group chats) |
| Info pane | Click agent name / Cmd+Shift+I |

“Read-only view of agent messages” in product terms = Bass can **see** peer traffic that landed as priority (and host preview lines) in the chat transcript, but he does **not** join the agent loop as a participant writing those lines — agents still reply via `SendToAgent`, and CoS should not dump machinery into his front door.

---

## 8. Front door / fleet OS (CoS role + system)

1. Bass talks to **Yodo / Chief of Staff** in 1:1.
2. CoS routes with `SendToAgent` (`priority: true` when someone must act or Bass waits).
3. Specialists work in their own transcripts; reply async.
4. CoS consolidates into **one** Bass-facing answer — paraphrase, no vent dumps, no tool jargon.
5. Choice cards only for **real** decisions; don’t pull Bass for low-stakes defaults.
6. Keep Bass as the **single front door**.

---

## 9. Host delivery mechanics (mined harness — implementation detail)

From prior host anatomy (flag if eng needs re-verify):

- Inbound queues on pending agent inbound; revive for agent inbound.
- `priority: true` jumps the inbound queue; may interrupt **background** lanes (routines/background) with reason like superseded by priority agent message — **not** an in-progress user turn.
- Inbound agent turns are **hidden**, silence allowed, `requestSource: "agent"`.
- Message text host clamp historically **8000** chars.
- Analytics: `sand.agent_message.sent` with from/to, group flag, priority flag.
- Feature gate `reduce_sand_peer_chatter`: priority required; conservative reply guidance.

---

## 10. External channels vs agent messaging (do not conflate)

| Surface | Cue | Reply tool |
| --- | --- | --- |
| Agent 1:1 DM | `[agent]` | `SendToAgent` to agent id |
| Agent group | `SendToAgent` to channel id / room tags | `SendToAgent` / room `SendToUser` |
| External (Slack etc.) | `[inbound]` | `SendToUser` with channel — see `channels` skill |

---

## 11. Gaps / verify with eng

1. Pixel UI: does the client still render held messages anywhere Bass can open (info pane, debug) despite live system saying user doesn’t see held?
2. Wake copy in harness still saying “user can already see it” for non-priority — drift vs live system.
3. ListAgents / ListGroups as real tools vs directory-prompt-only.
4. Exact max members (anatomy: 6) — confirm current host.
5. Cross-box / remote peers: priority/images may downgrade.

---

## 12. Source map

| Source | Contribution |
| --- | --- |
| Live system **Teammates** / SendToAgent / CreateAgent / Channel instructions | §§1–5, 8, visibility priority vs held |
| Skill **`group-chat-turns`** | §6 room rules |
| Skill **`channels`** | External inbound (out of scope detail here) |
| `/workspace/caisra-agent-messaging-anatomy.md` (2026-09-16 harness mine) | Host previews, queue/steer, clamp, gates — cited where marked |
| CoS profile (Chief of Staff / Yodo) | Front door, fan-out propose-first, priority when waiting |

---

*Confidential. Bass / Caisra only. Do not publish.*
