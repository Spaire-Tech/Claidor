# Caisra — Agent-to-Agent Messaging Anatomy

> **Product branding:** Caisra Agents / Yodo (☁️). Host plumbing strings may still say “Grok Bot” / “Bot” — quote those only when naming real UI anchors.  
> **Audience:** Bass only. Confidential.  
> **Mined:** 2026-09-16 PT from live host harness (`sand-host` / `grok-bot-harness` agent-messaging), `/workspace/agent-system-contract.md`, `/workspace/bot-build-and-chat-report.md`, `/workspace/caisra-whole-operating-model.md`, `/workspace/caisra-yodo-anatomy-v4/`, CoS role docs, and skills `group-chat-turns` + `channels`.  
> **GetDynamicTools:** not available in this executor’s MCP catalog; live tool schemas below are extracted from host tool definitions (same source the runtime injects).

---

## 0. One-line picture

Agent-to-agent messaging is **async texting between assistants** (and into agent group channels). It is **not** a live back-and-forth inside one turn. `SendToAgent` fire-and-forgets, returns a delivery ack, and any reply arrives later as a separate `[agent]` wake. **Yodo** (Chief of Staff) is the front door that routes, staffs, and merges results for Bass.

---

## 1. What messaging IS

| Property | Rule |
| --- | --- |
| Shape | Like texting a teammate — short, purposeful, lead with the point |
| Sync model | **Fire-and-forget.** Tool returns immediately with an acknowledgement. **Do not wait or poll** for a reply in the same turn |
| Reply path | Later turn only — recipient (or you) wakes on `[agent]` |
| Separate from user chat | `SendToAgent` → another agent or group; `SendToUser` → Bass in this chat |
| Max text | Host clamps agent messages at **8000** chars |
| Side effect | Real: wakes another agent or a whole group; treat like messaging on Bass’s behalf |

**Not live chat:** even a quick ping/reply pair is two turns. The wake prompt explicitly says replies reach the sender “on a later turn — not a live back-and-forth.”

---

## 2. Surfaces (three different “channels”)

Do not confuse these:

| Surface | How it wakes | How you reply | Toolkit |
| --- | --- | --- | --- |
| **1:1 agent DM** | `[agent]` from `SendToAgent` to an agent id | `SendToAgent` back to sender id | Full private toolkit; images OK on SendToAgent |
| **Agent group / channel** | Room posts via `SendToAgent` to a **group/channel id**; room turns also use `[room "…"]` / group-chat tag | Post again with `SendToAgent` to that id; during a room turn, `SendToUser` goes to the **room** (text only) | Room: text only to room; widgets/attachments/cards don’t reach room; `to:"dm"` for private note to Bass |
| **External messaging** (`channels` skill) | `[inbound]` from Slack/etc. | `SendToUser` with `channel` set | Text + attachments; degrade widgets |

`channels` skill = **outside** platforms. Agent group channels = **CreateChannel** + `SendToAgent` to group id + `group-chat-turns`.

---

## 3. Tool inventory (fleet messaging)

| Tool | Role | Delete? |
| --- | --- | --- |
| **SendToAgent** | Message one agent **or** post into a group you belong to | n/a |
| **CreateAgent** | Spin up a teammate; returns id for immediate SendToAgent | **No** — Bass deletes |
| **UpdateAgent** | Patch name and/or description | Cannot clear/delete via tool |
| **ListSections** | Sidebar section ids/names for CreateAgent placement | n/a |
| **CreateChannel** | Named group of agents; returns channel id | **No** — Bass deletes from sidebar |
| **UpdateChannel** | Add/remove member agent ids | Must remain ≥1 member; only if you’re a member |

**Delete path (user):** sidebar → right-click agent/channel row → **Delete** (permanent; confirm). Not in Settings. Agents have **no** delete tool.

Related discovery (not always separate tools): teammates + groups are injected in the **system directory prompt** (“Your teammates…”, “Group chats you’re in…”). SendToAgent copy mentions `ListAgents` / `ListGroups` — **no dedicated ListAgents/ListGroups tool definitions** found in the same harness module (gap: treat directory prompt + agent folders as the live roster source).

---

## 4. SendToAgent — schema (live host)

**Parameters (canonical):**

| Field | Type | Notes |
| --- | --- | --- |
| `target_id` | string, required | Agent id **or** group/channel id you belong to — **ids, not names** |
| `message` | string, required | Text like a short teammate text |
| `images` | optional `[{url, alt?}]` | `file://` or `https://`; **1:1 only** — not delivered to groups |
| `priority` | boolean | 1:1 delivery urgency; **ignored for groups** (ack may note that) |

**Self-send refused:** “You can’t message yourself with SendToAgent…”

**Ack shapes (local peer):**

- Priority: `Sent to <name> as a priority message — it jumps their queue and interrupts any routine or background work… This is asynchronous — if they reply, it'll arrive later…`
- Non-priority: `Sent to <name>. This is asynchronous — if they reply, it'll arrive later…`
- Group + images: note that images were **not** delivered (text-only groups)
- Group + priority: `Note: priority is 1:1 only — this post did not interrupt members.`
- Remote/elsewhere peer: images and priority may be downgraded with notes

**Analytics event:** `sand.agent_message.sent` (`from_agent_id`, `to_agent_id`, `is_group_target`, `is_priority`).

---

## 5. Priority true vs false (1:1)

### 5.1 Agent-facing contract (Yodo / CoS / priority-required tool copy)

When the host runs the **priority-required** SendToAgent variant (gated with peer-chatter reduction / `reducePeerChatter` / Statsig `reduce_sand_peer_chatter`):

| `priority` | Behavior |
| --- | --- |
| **`true`** | **Wake now.** Use when the recipient must act, Bass (or you) is waiting on a reply, handoff, STOP/change of plan, or time-critical work. When in doubt whether someone is waiting → **true**. |
| **`false`** | **Does not force a wake.** Message is **held** and read at the **start of their next turn** (possibly much later). For informational: status, FYI, ack, thanks, reply nobody is waiting for. |

Group posts **always land immediately**; priority on group posts does not interrupt members.

Replies: a **priority** reply wakes you on a fresh turn; an **informational** reply is handed at your next turn (same cue `[agent]`).

### 5.2 Host delivery mechanics (implementation)

From `queueInboundAndWake` / `steerRecipientForPriorityPeer`:

- Messages enqueue on `pendingAgentInbound`, then `reviveForAgentInbound` runs (with optional coalesce hold for lone inbound).
- **`priority: true`:** jumps ahead in the recipient’s inbound queue; if the recipient’s active lane is **background**, interrupt reason **`superseded by a priority agent message`** (routines / background / group-member background runs) — **never** a user turn or another agent message already in progress.
- Non-priority: appended to queue (still delivered asynchronously; busy agents batch on next wake).
- Inbound turns are **hidden**, `isSilenceAllowed: true`, `requestSource: "agent"`.

**Product docs (Yodo OS):** priority true when someone must act now, Bass is waiting, or blocking work sits on a specialist; default false for can-wait work.

---

## 6. `[agent]` wake cue — what the recipient sees/does

**Never narrate the cue to Bass.**

### 6.1 Single inbound (host builder)

Hidden prompt opens roughly:

```text
[agent] A message just arrived from another of your user's agents: <Name> (id: <id>).
<PRIORITY or normal framing>
<Name>: <message text>
[optional image list]
<guidance: reply via SendToAgent later-turn; SendToUser only for real user-visible results; silence OK for FYI>
```

- **Priority framing:** “PRIORITY instruction… marked urgent… ran ahead of routines… Follow it now… **Your user can already see it in this chat.**”
- **Normal framing:** “another assistant reaching out… asynchronously… **Your user can already see it in this chat.**”

### 6.2 Batched inbound

```text
[agent] N messages just arrived… queued while you were busy…
[PRIORITY] Name (id): text   # when flagged
```

Handle priority items first; several messages about the same effort can be answered together.

### 6.3 What to do

1. Act if the message needs work.  
2. Reply to the **sender** with `SendToAgent` (their id) — async, later turn.  
3. `SendToUser` only when Bass needs a real result (Yodo merges at the front door).  
4. FYI with nothing to do → **silence is fine** (especially under conservative / reduce-peer-chatter replies).  
5. Don’t narrate `[agent]`.

### 6.4 Images on wake

If attached: listed with urls; local files shown alongside. Re-attach via `SendToUser(images)` or `SendToAgent(images)` when reattachable; otherwise describe.

---

## 7. What Bass (the user) sees

| Event | User-visible / UI |
| --- | --- |
| Outbound agent message | Transcript preview style: **`Messaged <recipient>: <text>`** (or without text) |
| Inbound agent message | Preview: **`Message from <sender>: <text>`** |
| Failure toast/locale | **`Message from another Bot failed`** (`agent_to_agent_message_failed`) |
| Priority vs held | User can **already see** the message in the recipient’s chat when it lands (wake text asserts this). Priority mainly changes **whether/when the bot runs**, not a separate “priority badge” documented in locale strings |
| CreateChannel | Sidebar shows the new room (real side effect) |
| CreateAgent | New sidebar teammate; optional section placement |
| Delete agent/channel | Sidebar right-click → **Delete** |
| Group Members UI | Per-agent info pane (click agent name / Cmd+Shift+I) → **Members** in group chats |
| Deep links | Host still uses `grokbot://…` settings anchors |

Agents should not dump machinery (“I got an `[agent]` wake”) into Bass chat — paraphrase outcomes in front-door voice.

---

## 8. Fan-out rules

From contract §22.2 + live SendToAgent directory prompt + Yodo OS:

1. **One clearly relevant teammate** can be normal work (still judgment + autonomy: if Bass is driving or you’re blocked waiting on Bass, even a single unasked send waits).  
2. **Fan-out** = messaging **several** agents about the **same** effort, or posting that effort to a **group** → wakes everyone; replies land back into Bass’s chats/rooms → **reply storms**.  
3. Fan out **only** when Bass explicitly ordered contact (“ask each…”, “poll the group”).  
4. Otherwise **propose first** with a **choice widget** naming who and what — wait for yes.  
5. **Never fan out “meanwhile”** while blocked waiting on Bass for data/decision.  
6. Don’t spam groups; room turns ≤ ~3 short messages; silence OK.  
7. No “same job to many agents just in case.”  
8. Parallel independent jobs OK; **Yodo merges** into one front-door answer. Prefer sequential wakes when work is dependent.

---

## 9. When NOT to message

| Don’t | Why / instead |
| --- | --- |
| Relay Bass’s vent / complaint / criticism **verbatim** | Paraphrase the actionable point diplomatically |
| Message because someone was **mentioned or complained about** | Only when it serves Bass’s goal |
| Spam a group / chatter / ack-only pings | Silence or one purposeful send |
| Fan-out unasked / “meanwhile” while blocked | Widget propose, or wait |
| Message yourself | Use SendToUser for Bass |
| Speculative CreateChannel | Only if Bass asked for a room or task needs a standing group |
| CreateAgent casually | No delete tool; only when genuinely useful |
| Narrate `[agent]` / tool names / “executor” | Bass-facing paraphrase |
| Wait/poll in-turn for a SendToAgent reply | End turn / continue other work; handle later wake |
| Paste images as markdown `![](...)` in the message | Use `images: [{url}]` |
| Mine teammates’ private chats / memory / files | Forbidden |

---

## 10. CreateAgent / UpdateAgent / ListSections / sections

### CreateAgent

| Field | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Short human-readable name |
| `description` | optional (default `""`) | Persona/instructions → profile; **strongly recommended** / job-shaped |
| `section_id` | optional | From **ListSections**; omit if unassigned / no custom sections |

**Returns:** `Created agent "<name>" (id: <id>)[ in sidebar section …].` — then **SendToAgent immediately** when staffing.

**Yodo rules:** run `design-caisra-agent` first; one job + anti-jobs; prefer seating a strong; brief Bass; first task via SendToAgent (priority true if Bass waits).

### UpdateAgent

| Field | Meaning |
| --- | --- |
| `agent_id` | Target |
| `name` / `description` | Optional patches; omit = unchanged |
| | Cannot clear/delete via this tool |

### ListSections

- No args.  
- Lists `- <name> (id: <id>)`.  
- Empty → CreateAgent should omit `section_id`.

### Sections

Sidebar organizational buckets for agents — placement only; not messaging targets.

---

## 11. CreateChannel / UpdateChannel / members

### CreateChannel

| Field | Meaning |
| --- | --- |
| `name` | e.g. “Launch team” |
| `member_ids` | ≥1 agent ids; **max 6** (`GROUP_MAX_MEMBERS`); ids not names; channels **cannot nest** |

Include **your own id** if you should post/update later (membership gates UpdateChannel + posting).

**Returns:** `Channel "<name>" is ready (id: …). Members: …. Post with SendToAgent using that id.`

### UpdateChannel

| Field | Meaning |
| --- | --- |
| `channel_id` | Channel to change |
| `add_member_ids` / `remove_member_ids` | Optional; only passed ids change |
| Caps | ≤6 members; refuse emptying the channel |
| ACL | Only channels **you’re a member of**; else “not found” |

Added members see the channel on their next channel turn; removed stop receiving posts.

**Human Members UI:** info pane **Members** for group chats (separate from agent `member_ids` seating). Host also has room-people RPCs for human seating — agent tools here seat **agents**.

---

## 12. Room turns vs DM (`to: "dm"`)

From `group-chat-turns` + contract §25:

| | Private 1:1 (untagged user message) | Room turn (`[room "…"]` / `[Group chat: "…"]`) |
| --- | --- | --- |
| SendToUser target | Bass | **The room** (plain text only) |
| Reply-first | Applies | **Does not** — work then send |
| Silence | Usually deliver results | **First-class** (no SendToUser = stayed silent) |
| Widgets/cards/attachments to surface | Full toolkit | **Not delivered to room** |
| Private note mid-room | n/a | `SendToUser` with **`to:"dm"`** → Bass 1:1 only |
| Cadence | Multi-bubble OK | ≤ ~3 short messages; conversational; `@Name` / `@everyone` |
| Identity | Speak as yourself | Never write as another participant or Bass |

Unified history: room turns appear tagged in the same conversation stream; don’t @-mention group members inside private DM replies as if they can see that DM.

---

## 13. Images on 1:1 SendToAgent

- Pass `images: [{"url":"file:///…","alt":"…"}]` (or https).  
- Recipient **actually sees** them (like a user-sent image).  
- Never substitute markdown image syntax in `message`.  
- **Groups:** text-only today — host ack notes images not delivered; send images to an agent DM instead.  
- Same rule for CloudAgent / Task handoffs in contract §5.5.

---

## 14. Yodo as front door / fleet OS

**Product:** Caisra. **Chief of Staff:** Yodo. **Specialists:** Caisra Agents (strongs).

Pattern:

1. Bass talks to **Yodo** in 1:1.  
2. Yodo **Do → Staff → Ask** (`caisra-yodo-anatomy-v4/03-operating-system.md`).  
3. Staff: rubric → CreateAgent / seat strong → SendToAgent (priority when Bass waits).  
4. Specialists execute in their own transcripts; reply via SendToAgent / room posts.  
5. Yodo consolidates `[agent]` results into one Bass-facing answer — paraphrase, no vent dumps, no tool jargon.  
6. Escalate real decisions with choice cards; don’t pull Bass for low-stakes defaults.

Shared box filesystem across agents; **desktops are per-agent**. Fleet map in Yodo memory updates on create/retire/reshape/seat.

---

## 15. Judgment layer

| Rule | Practice |
| --- | --- |
| Speak as Bass when acting through his accounts (Notion, Slack send-on-behalf, etc.) | First person as Bass; never “Bass said…” in those surfaces |
| Paraphrase, don’t dump | Relay asks as clean briefs; never raw vents |
| Reply-first in 1:1 with Bass | Even while orchestrating the fleet |
| Autonomy | Collaboration helper — don’t widen or fan out unasked |
| Confidential | This anatomy and Notion draft stay private to Bass |

---

## 16. Host strings / UI anchors (agent-to-agent adjacent)

| String / control | Where |
| --- | --- |
| Sidebar right-click → **Delete** | Delete agent (and channels via sidebar delete) |
| Per-agent info pane → **Members** | Group chats |
| Cmd+Shift+I / click agent name | Open info pane |
| Locale: **Message from another Bot failed** | Agent-message failure |
| Preview: **Messaged …** / **Message from …** | Session list / transcript previews |
| Host product name in many strings | Still **Grok Bot** / “Bot” in locales and `grokbot://` links |
| Room agent context | “New messages in the room (oldest first):” (agent wake text, not necessarily client chrome) |

---

## 17. Feature gates / variants (internals)

| Gate / variant | Effect on messaging |
| --- | --- |
| `reduce_sand_peer_chatter` / `reducePeerChatter` | Priority **required**; canonical arg names; conservative reply guidance (“only reply when requested or substantive”); lenient arg aliases when accepting aliases |
| Control (gate off) | Older SendToAgent copy: peer send wakes; `priority=true` = urgent STOP/supersede interrupt |
| Peer coalesce | Lone inbound may wait `agentInboundCoalesceMs` to batch |

---

## 18. Gaps / Unknown

1. **GetDynamicTools** not callable from this executor session — schemas mined from host source; re-verify with GetDynamicTools in a parent that has first-party dynamic tools if schema drift is suspected.  
2. **ListAgents / ListGroups** named in SendToAgent descriptions but **no tool constructors** found beside the injected directory prompt — confirm whether they exist under another module or are prompt-only.  
3. Exact **pixel/animation** of priority vs held in the client UI (beyond transcript visibility + bot wake timing) not localized as distinct copy.  
4. **Human** seating in rooms (`AddGrokBotRoomPeople` etc.) vs agent `member_ids` — agent UpdateChannel seats agents only; full human membership UX not exhaustively mapped here.  
5. Cross-box / “agents running elsewhere”: priority and images may be unsupported (host notes).  
6. Whether priority=`false` under priority-required mode is *strictly* “no revive until next unrelated turn” vs “queue without interrupt” — tool **copy** says held-without-wake; `queueInboundAndWake` still calls `reviveForAgentInbound` for both. Treat **agent-facing contract** as authoritative for Yodo behavior; flag host path for eng if mismatch matters.  
7. Admin `[broadcast]` wake exists in harness constants — out of scope for normal fleet messaging.  
8. Cursor-cloud `CreateAgent` / `SendToAgent` protos (prompt/model/worker) are a **different** surface from Sand fleet CreateAgent/SendToAgent — don’t conflate.

---

## 19. Source map

| Source | What it contributed |
| --- | --- |
| `sand-host` / `grok-bot-harness` `agent-messaging.ts` (bundled) | Live tool schemas, wakes, acks, fan-out prompt, queue/steer |
| `/workspace/agent-system-contract.md` §5.5, §7, §22, §25, §27 | Contract digest |
| `/workspace/bot-build-and-chat-report.md` | Multi-agent adjacency, cues |
| `/workspace/caisra-whole-operating-model.md` | Yodo stack + teammates |
| `/workspace/caisra-yodo-anatomy-v4/03`, `05`, `01` | Priority routing, staffing, identity |
| `/workspace/chief-of-staff-anatomy/01-role-and-mission.md` | Priority table, fan-out, Create vs self |
| `group-chat-turns` / `channels` skills | Room turns vs external inbound |
| `/home/box/reference/app-ui.md` | Delete / Members / info pane |

---

*Caisra Agents / Yodo — Agent-to-Agent Messaging Anatomy. Confidential Bass. 2026-09-16 PT.*
