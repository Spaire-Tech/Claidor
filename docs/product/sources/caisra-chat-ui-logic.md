# Caisra — Chat UI Reaction Logic

CONFIDENTIAL — Bass only.
How chat reacts (cause → UI → agent implication). Not app-ui navigation/settings paint.
Prefer Caisra Agents / Yodo in prose. Quote real host strings (including "Grok Bot") accurately when those are the actual UI/copy.
On-box path: /workspace/caisra-chat-ui-logic.md
Reconstructed 2026-09-16 from live box sources.

## Evidence labels used throughout

| Label | Meaning |
| --- | --- |
| Evidence | Found in on-box host (sand-host/host-main.cjs locales / harness), skills, contract, or settings |
| Inferred | Logical consequence of evidenced rules; not a pixel/spec dump |
| Unknown | Not found on box / client-only; do not invent |

## 0. Source inventory

| Source | Role |
| --- | --- |
| /workspace/bot-build-and-chat-report.md Part II | Chat primitives, Bass-named UX ("N new messages", mid-chat education) |
| /workspace/agent-system-contract.md | SendToUser, widgets, rooms, channels, forms, wakes |
| /workspace/caisra-permissions.md | Approval cards in stream |
| Skills: group-chat-turns, channels, in-chat-forms, box-desktop, add-connector, no-connector-fallback | Surface-specific reaction rules |
| /home/box/sand-host/host-main.cjs | Locale strings, message types, local-tool / Auto-review cards, voice memo guidance, isWorking |
| /home/box/sand-data/settings.json | localToolPermissionByMachineId, notifications |
| /home/box/reference/app-ui.md | Settings anchors only (not chat chrome) |
| sand-statsig-bootstrap.json | Feature gates only — no chat UI copy (Evidence: mined; no matching education strings) |

ListMachines / user app source: Host exposes ListMachines. Bass's box settings already list registered machines with per-machine local-tool permission (always / ask). User-machine app UI source was not searched (would need machineId Shell + Allow); report prefers on-box evidence as instructed. Unknown whether desktop client embeds the exact mid-chat "this time" education string.

## 1. Message delivery (SendToUser → chat)

### 1.1 Cause → UI → agent

| Cause | What UI does | Agent implication |
| --- | --- | --- |
| Agent calls SendToUser | Message appears in transcript (type-dependent card/bubble) | Only voice to the user (Evidence: contract §3). Plain assistant text is scratch — invisible |
| Multiple SendToUser in one turn | Multiple bubbles / sequential new messages | Prefer 2–4 short bubbles over one memo (Evidence: contract tone; Bass multi-bubble design) |
| end_turn: true on final SendToUser | Turn completes when reply is done | Set on last delivery when no more user-visible work pending (Evidence: host SEND_TO_USER_END_TURN_GUIDANCE) |
| No SendToUser | Chat stays quiet | Valid for rooms, silent routines, stale background completions, requested voice-memo silence until memo ready |
| ReactToMessage | Emoji tapback on a user message | Lightweight ack; does not replace awaited delivery (Evidence) |

### 1.2 Agent-authored SendToUser types (Evidence: host SEND_MESSAGE_TYPES)

| type | UI reaction |
| --- | --- |
| text | Chat bubble; optional images[]; optional voice_memo: true → memo pellet playback; optional reply_to thread; optional channel; optional to:"dm" in rooms |
| attachment | File/media as the message |
| widget | Interactive choice card; ends turn; resolved → prompt + checked selection |
| cursor-agent | Card opening cloud agent by bcId |
| secret-request | Masked credential input; value never enters transcript |

Also documented agent-facing: credential-request (1Password fill) when tools include it (Evidence: host extends types with credential-request; skill no-connector-fallback).

### 1.3 Host-authored cards that also land in the transcript (Evidence: message.type cases in host)

These are not agent-composed SendToUser content types; the host injects them when tools escalate:

| message.type | Trigger |
| --- | --- |
| local-tool-permission | Machine-targeted Shell/Read/Copy needs Ask |
| auto-review-approval | Smart-mode / Auto-review escalation |
| connector | Install/auth connect card (connected / connect variants) |
| cookie-origin-approval | Cookie-origin import ask |
| credential-request | 1Password fill ask |
| user-form | request_user_form |
| virtual-card-approval | request_virtual_card / Stripe Link |
| email-draft / slack-draft | DraftExternalMessage-style send cards |
| listener-connect | Channel listener connect |

Agent implication: never mirror these with a choice widget — call the tool so the host card appears.

### 1.4 Silence rules (Evidence)

- Stale/duplicate background completions → stay silent.
- Routines "stay quiet if nothing changed" → no filler SendToUser.
- Room turn with no SendToUser = stayed silent (first-class).
- Requested voice memo: no ack/status text until the memo itself (Evidence: REQUESTED_VOICE_MEMO_SILENCE_CLAUSE).

## 2. Reply-first / progress / ping / background completion

| Situation | Chat updates? | Rules |
| --- | --- | --- |
| Person-opened 1:1 turn | Yes, immediately | First action = plaintext SendToUser (ack or answer) before long tool work (Evidence: contract §3.2; Bass loop) |
| Progress beats | Yes at meaningful moments | Results, decisions, blockers, plan changes — not command-by-command |
| Final "ping" | Yes | Delivery message with answer/artifact/failure; ack ≠ delivery |
| Background subagent/shell finishes later | Yes if user waiting / asked; No if stale duplicate | Host may revive agent; agent decides silence |
| Room turn | Work first, then maybe send | Reply-first does not apply |
| Channel [inbound] | Pace like chat | Each beat = own SendToUser with channel set — platform sees separate messages |
| Auto-review / local-exec pending | Host card appears; agent may be quiet until resolution | Don't narrate "smart mode" plumbing |

## 3. Working / busy / avatar animation states

### 3.1 What can be proved (Evidence)

Host exposes per-agent activity overlay:

isWorking = live overlay present AND liveOverlayRunningTurn(live) (isRunningTurn / isRunning).

Locale / activity labels used while work is visible include (non-exhaustive, from messages.po):

- Working
- Thinking
- Waiting for you
- Waiting on a command
- Waiting on another Bot
- Running commands
- Browsing the web / Searching the web / Reading the web
- Reading file / Drafting the file / Organizing files
- Messaging / Messaging another assistant
- Coding / Cursor cloud agent
- Generating a photo
- Connecting to a third party app
- Checking usage
- On your computer / On its computer
- Question
- Updated this conversation

Location phrases for shell Auto-review summaries:

- Run a command on your local computer
- Run a command on Grok Bot's computer
- (with cwd) … from {workingDirectory}

### 3.2 Avatar animation specifically

| Claim | Status |
| --- | --- |
| Avatar / agent mark animates or shows busy while turn runs | Inferred from isWorking + "Working" / activity overlay — client likely drives animation from that flag |
| Exact animation (Lottie, pulse, frame rate, which avatar layers) | Unknown — not in agent docs or host locale |
| Sidebar vs chat-header avatar both animate | Unknown |

Agent implication: keep producing meaningful SendToUser beats; don't try to "drive" the busy indicator yourself — the host derives it from the running turn / overlay.

## 4. Mid-chat education / empty notes (computer access)

### 4.1 Bass-named education (product / builder)

Bass called out mid-chat copy along the lines of "Grok Bot can run commands on your computer" (and verbally "… this time").

| String | Status |
| --- | --- |
| Exact Grok Bot can run commands on your computer | Inferred / product-UI paraphrase in builder reports — not found as a literal in sand-host locales or sand-statsig-bootstrap.json |
| Exact … this time education sentence | Unknown / not found on box |
| Semantic "this time" = allow-once local-tool resolution | Evidence (host resolutions: allow-once, deny, always, never) |

### 4.2 Host strings that do appear around computer access (Evidence)

- Run a command on your local computer
- Run a command on Grok Bot's computer
- On your computer / On its computer
- This action requires your approval.
- Sensitive action (fallback summary when empty)
- Settings guidance in agent messages: Settings → Bot → Execution on Local Computer with values including "Always allow" / "Never"
- Ask TTL: SAND_LOCAL_TOOL_ASK_TTL_MS = 10 * 60 * 1000 (10 minutes)

### 4.3 Cause → UI → agent

| Cause | UI | Agent |
| --- | --- | --- |
| First / Ask-mode machine-targeted tool | Host local-tool-permission card in stream | Call Shell/Read/Copy with machineId — do not widget "May I run on your Mac?" |
| User picks allow-once / always / deny / never | Card resolves; standing grant may update | Deny/abandon/stale → follow host agent messages (no retry same action) |
| Mid-chat empty-state education | Client may show education note | Treat as host education; not agent-authored |

Bass machine permissions on this box (Evidence: settings.json): one machine always, one ask.

## 5. "N new messages" drop-up / scroll catch-up

| Item | Status |
| --- | --- |
| Bass design: when scrolled up, new assistant/system messages → jump control with new-message count | Evidence as Bass/product intent in Part II report |
| Exact client string "N new messages" / animation / scroll threshold / count rules | Unknown — not in host locale; room wake text uses "New messages in the room…" for agent context only |
| Agent implication | Multi-bubble + progress pings intentionally create sequential new messages; catch-up control is how users return to latest without losing place (Inferred from Bass design) |

## 6. Choice cards (widgets) lifecycle

| Stage | Cause | UI | Agent |
| --- | --- | --- | --- |
| Open | SendToUser type: widget | Interactive card with prompt + 1–6 options; optional multiSelect / allowCustom / danger | primary |
| Answer | User picks | Resolved card: prompt + selection checked under prompt (Evidence: host widget guidance) | Next user turn arrives as [Answering your question {id}: "{quote}"] (Evidence: host buildWidgetAnswerNote) |
| Dismiss / skip | User dismisses or moves on | dismissOnMoveOn: true → auto muted Dismissed state when newer message sent unanswered (Evidence) | Treat as decline; don't re-ask unasked |
| Wrong surface | Room / channel | Widgets don't render | Degrade to numbered text |

## 7. Host cards in transcript (detailed)

### 7.1 Local-exec Allow (local-tool-permission)

- Resolutions (Evidence): allow-once, deny, always, never (proto: ALLOW_ONCE, DENY, ALWAYS, NEVER).
- Standing store: localToolPermissionByMachineId (always / ask / never style).
- Agent-facing outcomes include denied / expired / cancelled / unavailable / abandoned / stale-task / preparatory-skip / too-large (Evidence: SAND_LOCAL_TOOLS_*_MESSAGE strings).
- Card unavailable outside 1:1-capable conversation → agent told to use own computer or DM.

### 7.2 Auto-review (auto-review-approval)

- Pending card: type: "auto-review-approval" with approval.status === "pending".
- Default copy when reason empty: This action requires your approval.
- Stale: The Auto-review request is stale, expired, or not authorized.
- Shell summaries: Run a command on your local computer vs Run a command on Grok Bot's computer.
- Agent: adapt safer first; else same-action retry with approval flags → card; one at a time; denial/expiry = stop.

### 7.3 Connector connect

- Host-authored; variants connect / connected.
- Agent: confirm install with widget first; InstallPlugin/AuthenticateMcpServer emit card; never paste OAuth; end turn once card up.
- Channels: connector cards / grokbot:// links not delivered on Slack (Evidence: SLACK_PLUGIN_AUTH_LINE).

### 7.4 secret-request / credential-request

- secret-request: masked field; value to secret store; agent learns provided only.
- credential-request: 1Password fill from vault named Shared with Grok Bot (Evidence).

### 7.5 cursor-agent

- Card opens cloud agent; channel degrade → https://cursor.com/agents/<bcId> text.

### 7.6 Forms / box-help / virtual card

- user-form: host fills page; dismiss = decline; mobile may not render.
- request_box_help: handoff overlay; resume when user returns.
- virtual-card-approval: purchase gate; denial final for same purchase; stale key virtual-card/stale.

### 7.7 Draft / listener cards

- email-draft / slack-draft: user presses Send; discard = decline.
- listener-connect: channel listener setup.

## 8. Reactions / reference chips / deep-link pills / threads

| Feature | Cause | UI | Agent |
| --- | --- | --- | --- |
| Reactions | ReactToMessage / channel inbound reaction | Emoji on message; channel reactions wake [inbound] | Usually no reply needed on channel reaction |
| Reference chips | Markdown [label](sand-msg:<address>) | Small chip; click jumps to message (Evidence) | Same addresses as reply_to (e.g. t2s1) |
| Deep-link pills | grokbot://app/v1/settings?id=… | Clickable settings row | Use verified anchors only (local-execution, auto-review, update-computer, …) |
| Threads | reply_to / [In reply to …] note | Threaded secondary bulk | Don't hide primary answer or required question only in a thread |
| Composer notes (stripped single-line) | Host | Hidden from model as user prose when matching | Patterns (Evidence): [Sent from machine …], [Answering your question …], [In reply to …], [Composed offline at …], [widget:…], [automation:…], [tNu] |

## 9. Voice memos playback rules (Evidence)

Host guidance (VOICE_MEMO_SEND_GUIDANCE):

- type: text + voice_memo: true.
- Content = complete spoken sentences — no numbered lists, headers, or markdown.
- Client plays words as a pellet.
- When user asked for a memo: only that one message — no status ack, no ordinary-text duplicate, no fake .m4a/.mp3 attachment.
- Silence until memo ready is correct.
- Feature flag sand_voice_memos (client; default false in bootstrap comments).
- Composer send-while-recording can post spoken clip; replies may render as expandable memo pellets (SynthesizeSpeech).

## 10. Composer inputs

| Input | What happens | Agent sees |
| --- | --- | --- |
| Attachments | Materialized paths; may be on user machine | Attached-files note; ListMachines + Read/machineId or CopyToBox |
| Desktop provenance | Note on message | [Sent from machine <id>] — default that machineId |
| Widget answer | Special turn | [Answering your question {id}: "{quote}"] |
| Offline compose | Note | [Composed offline at {ISO}] |
| Hidden wakes | Not user-authored | [first run], [routine], [agent], [inbound], [room …], background done, widget skip, instructions_update, <agent_profile_update> |
| Mentions | Room | @Name / @everyone |

## 11. Surface matrix (what reacts / what doesn't)

| Capability | 1:1 in-app | Group room | External channel |
| --- | --- | --- | --- |
| Text bubbles | Yes | Yes (≤~3/turn) | Yes (extra terse) |
| Multi-bubble progress | Yes | Limited | Yes (each SendToUser = platform msg) |
| Widgets / choice cards | Yes | No | No (numbered text) |
| Attachments | Yes | No to room | Yes (upload) |
| Host cards (local-exec, Auto-review, connect, forms, virtual card, …) | Yes | No to room | No / degrade |
| Voice memos | Yes | No (text only to room) | No (text+files) |
| Reactions | Yes | Room norms | Inbound wake; usually no reply |
| to:"dm" private | N/A | Yes → user's 1:1 | N/A (to:"dm" and channel mutually exclusive — Evidence) |
| Reply-first | Required | Off | Pace like chat (ack then beats) |
| Silence OK | Rare (stale/bg) | First-class | Soft (don't spam) |
| Local-tool ask | Yes | Unavailable → agent told to DM / use box | Same |

## 12. Notifications / notify_on_updates / unread

| Mechanism | Evidence | UI reaction | Agent |
| --- | --- | --- | --- |
| Per-agent Notify me about this assistant | Host setting notify_on_updates / notify_on_updates_enabled | Toggle label exact string | Set via update_state settings |
| Global notification sound | app-ui anchors notification-sound-enabled, notification-sound | Settings paint (out of scope) | Deep-link if guiding |
| Unread | setAgentUnread / mark_read / mark_unread | Client unread state | Host; agent doesn't paint badges |
| Box settings snapshot | notifications.isEnabled: false on this machine | — | Observational only |
| When pings matter | Product intent | Notify while user away from transcript | Progress + final SendToUser still required for waiting users |

## 13. Profile update announcements in chat

| Layer | What happens |
| --- | --- |
| Agent wake (Evidence) | Hidden <agent_profile_update> with body: Your agent profile changed. This full update is authoritative and supersedes the Agent profile section in the system prompt and every earlier profile update in this conversation. Plus current name/description. |
| User-visible chat announcement of rename/avatar | Locale has Renamed to {0}, Updated, Changed — exact when they appear in chat vs sidebar Unknown / partially client |
| Agent rule | Don't narrate instructions_update / profile-update cues; apply silently |

## 14. Gaps (do not invent)

- Exact mid-chat education string matrix including "… this time" — not on box host locales.
- Pixel / animation specs for avatar busy, Allow cards, Auto-review cards, "N new messages" drop-up.
- Typing indicators — not described in agent docs / no chat typing UI string found (editor "TYPING" enum is unrelated).
- Read receipts — not described.
- Mobile vs desktop parity beyond forms weak on mobile.
- Whether widget dismiss analytics write memory.
- Whether onboarding Mac-proof Allow is the same durable grant as Settings local-execution.
- Composer slash commands / mention menu beyond attachments — Unknown.

## 15. Exact host / UI strings found (inventory)

Quoted accurately (host / locale / harness), including "Grok Bot" where that is the real copy:

Activity / working: Working; Thinking; Waiting for you; Waiting on a command; Waiting on another Bot; Running commands; Browsing the web; Searching the web; Reading the web; Reading file; Drafting the file; Organizing files; Messaging; Messaging another assistant; Coding; Cursor cloud agent; Generating a photo; Connecting to a third party app; Checking usage; On your computer; On its computer; Question; Updated this conversation.

Computer / approval: Run a command on your local computer; Run a command on Grok Bot's computer; This action requires your approval.; Sensitive action; The Auto-review request is stale, expired, or not authorized.; Settings → Bot → Execution on Local Computer; Always allow; Never; Shared with Grok Bot; The Bot wants to use your existing logins.

Composer / wake notes: [Answering your question {id}: "{quote}"]; [Sent from machine {machineId}]; [In reply to …]; [Composed offline at …]; Notify me about this assistant.

Voice: (guidance) client plays those words as a pellet.

Widget: resolved card with selection checked under prompt; muted Dismissed state (dismissOnMoveOn).

Profile (agent-facing, not user bubble): Your agent profile changed. This full update is authoritative and supersedes the Agent profile section in the system prompt and every earlier profile update in this conversation.

Deep links / product chrome (when quoting host): Open Grok Bot; Update Grok Bot; Update Grok Bot's Computer; grokbot://.

Builder-paraphrased (Bass), not verified as host locale literal: Grok Bot can run commands on your computer; N new messages (drop-up control).

Not found on box: Exact phrase "can run commands on your computer this time"; Typing indicator / read receipt UI copy; Avatar animation frame specs.
