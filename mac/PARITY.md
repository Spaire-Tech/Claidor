# The Mac in Swift: everything the Electron app does

The founder, 9 October 2026: "bring the whole electron mac in swift.
literally everything … make sure literally everything we have on the
electron to be on swift. and more importantly, take apple design again."

This is the list that "everything" means. It was read from the Electron
app's code, not remembered: the window's patch and the iPhone's comparison
with it, the 131 commands the cloud computer answers, everything the
Mac-side processes do, and the build. Each line says what the Electron app
does, where that lives, where it goes in Swift, and whether the iPhone
already has it, so the work can reuse the iPhone's code instead of starting
over.

The Swift app replaces the Electron one when every line here is done and
seen working on the founder's Mac (`README.md`).

**Legend.** "Phone" says what the iPhone app has: **yes** (its code is
reused, laid out for the Mac), **partly** (what is missing is named), **no**
(new Swift code). "Mac" is this app's state: blank until its code is
written; **written** (the code is there, not yet built on a Mac); **part:**
what is there, when only some of it is; then **built** (it compiles) and
**checked** (seen working on the founder's Mac). Slices 1 (the window) and
2 (the chat) are written: nothing is built or checked yet. What slice 2
added is shared with the iPhone, so its "Phone" column says yes too; the
iPhone app is built again with it.

Sources: "patch" is `desktop/scripts/lib/router-renderer-patch.mjs`;
"main" is `desktop/source/electron-main/`; "coordinator" is
`desktop/source/node-agent-coordinator/`; "host" is `desktop/source/host/`;
"phone" files are in `ios/Simeon/` or `ios/SimeonCore/Sources/SimeonCore/`.

---

## At a glance

| | Electron | The iPhone has |
|---|---|---|
| Commands to the cloud computer | 131 on the host (`host/gateway-protocol.ts`), 115 of them sent by the Mac | 45 |
| Event kinds from the cloud computer | 19 (`host/sand-host.ts`) | 7 |
| What the window asks the Mac for (`window.desktop`) | about 120 methods (`desktop/source/electron-preload/preload.ts`, answered in main `main-edge.ts`) | the ones that make sense on a phone |
| Processes on the Mac | 4: main, the coordinator, the local-exec daemon, the security-key signer (plus the call banner's window) | 1 (the app) |
| Lines in this list (§2–§10) | about 250 | 88 whole and 45 in part; about 120 are new Swift, many of them the Mac's alone |

The Swift app is one process. It talks to the cloud computer itself, as the
iPhone does, so the coordinator's relaying goes away; its other duties
become parts of the app (§5).

---

## 1. The design

Apple's macOS 26 parts, the same family as the iPhone app (the butterfly,
`Ink` colours, the type, the sign-in screen):

| Electron | Swift on the Mac |
|---|---|
| The window: the sidebar of agents (folding to a rail, ⌘B), the chat, the agent pane on the right (Profile · Routines · Computer, 480 wide) | `NavigationSplitView`: the sidebar (glass, folding with ⌘B as today), the chat as the detail, an `.inspector` on the right with the same three tabs |
| The chat header: the butterfly, the name in a pill, Call | The window's toolbar: the butterfly and name in the middle, Call and the agent pane as glass buttons |
| The full-size computer over the window | A window of its own, so it can sit on another screen |
| Settings as a dialog with General and Usage & Billing | A `Settings` window (⌘,) with those tabs, as every Mac app |
| Connect apps (⇧⌘M) as a dialog | A window of its own with Marketplace and Yours |
| The search palette (⌘K) | The palette as a floating panel on ⌘K; ⇧⌘F into the sidebar's search |
| The application menu (main `application-menu.ts`) and the window's own keys (§2.3) | `.commands`: the same menus and every key the window has, plus each row-menu action in the Agent menu |
| Right-click menus drawn by the page | Native context menus, in the Mac's order (the iPhone's long-press menus already carry it) |
| The call banner: a floating window at the top right | A floating panel: on every Space, above other windows, not taking focus |
| Mac notifications and the Dock badge | `UserNotifications` and the Dock tile, with the same rules (§6) |
| Window size and place kept between launches | SwiftUI keeps them itself |

New, not in the Electron app (the founder decides): a menu bar icon
showing which agents are at work, and opening at login.

---

## 2. The window, screen by screen

What the window shows today. It was read from the window people run
(the patched bundle, `clients/apps/web/public/app/assets/index-UbX-y3il.js`,
Settings in `index-BlqerJhg.js`), the patch, and the readable copy of the
window's parts ("recovered" is `desktop/frontend/src/recovered/features/`,
"production" is `desktop/frontend/src/production/`). Items behind a gate
that is off say so; the gates' values are in
`desktop/source/shared/node/experiments/simeon-gate-defaults.ts`.

### 2.1 Sign-in, the account, access

| What | Where | Phone | Mac |
|---|---|---|---|
| The sign-in screen. Since 9 October the iPhone's (logo, "SimeonLabs", Continue with Apple, Continue with Google, the legal line), as the founder asked "same for everything"; the Mac window still has the older one | phone `SimeonApp.swift` `SignInScreen` | yes | written |
| "Finish signing in from your browser" with Cancel, while the browser is open | recovered `settings/overlay/panels.tsx` | yes | written |
| The account in Settings: picture or initials, name, email with Copy | recovered `settings/overlay/panels.tsx` | partly (initials only) | written (initials) |
| Edit your name from the account menu | recovered `account/session/menu.tsx` | no (the first run only) | |
| "What should your agents call you?" for an account with no name, Not now and Continue | patch 427-459 | partly (the first run only) | |
| The account menu at the sidebar's foot: Settings, the week's usage (Included, On-demand, spend this cycle, Change limit, "Resets in N days"), About, Sign out | recovered `account/session/menu.tsx` | partly (Settings rows) | part: Settings, Connect Apps, Sign Out |
| The access cover: start a trial, a plan is needed, a team admin's states, privacy; Check Access, Request Access, Start Trial, Get Ultra (to the billing page) | recovered `access/cover/` | no | |
| "Update Privacy Mode", Open Privacy Settings, Sign out | recovered `roster/privacy-blocked.tsx` | no | |

### 2.2 The first run

| What | Where | Phone | Mac |
|---|---|---|---|
| Landing, Meet Simeon, Chief of Staff (six agents and the curves), Connect (the logos behind glass), the computer (1.45×, Simeon as the cursor), your name | patch 1027-1308, 1856-1899 | yes (`OnboardingFlow`, `Onboarding.swift`) | written |
| The hand-off: "Waking your computer…", "Setting up your Simeon…", "Getting your team ready…", then Simeon, Chief of Staff, is created and says hello; "Simeon couldn't finish setting up" with Try again | patch 1214-1231 | yes (`HandOffStep`) | written |
| Whether to show it: `hasSeenOnboarding`, else `countAgents` | `desktop/web/backend.ts` | yes (`FirstRun`) | written |
| The boot screen: "Setting up …'s computer" in a moving light | patch 1399 | partly (the turning butterfly) | part: the turning butterfly |
| The Chief of Staff's title and description cannot be edited | patch 1224-1230 | yes (`AgentPage.swift` `isChief`) | written |

### 2.3 The window's keys and states

| What | Where | Phone | Mac |
|---|---|---|---|
| ⌘N New Agent, ⌘K jump to, ⌘, Settings, ⇧⌘M Connect apps, ⌘I or ⌘L to the composer, ⇧⌘F search agents, ⌥↑ ⌥↓ the previous or next agent, ⌘[ ⌘] back and forward, ⌘1–9 a sidebar agent, ⌘B the compact sidebar, ⌘F find in the chat, Esc close | recovered `window-chrome/global-keyboard-shortcuts.ts` | no | part: all but ⇧⌘F and ⌘[ ⌘] |
| The connection's badge: Connected, Connecting, Disconnected | recovered `window-chrome/status-badge.tsx` | no | |
| "Something went wrong" with Reload and Copy error | recovered `error-boundary/` | partly (an alert) | part: an alert |

The menus, zoom and full screen are in §9.

### 2.4 The sidebar

| What | Where | Phone | Mac |
|---|---|---|---|
| Search and create as glass discs; "Connect apps" at the foot with the Gmail, Calendar and Drive tiles | patch 2123-2226, 1538-1578 | yes (in the phone's layout) | written (the sidebar's search field, New in the toolbar, Connect Apps in the account menu) |
| The "…" menu: Join shared room…, New shared room…, Show Hidden Agents | bundle | partly (Hidden Agents) | part: Show Hidden Agents (View menu) |
| The Agent network button (the org chart, §2.20) | recovered `org-chart/` | no | |
| Pins: tiles, dragged to reorder, the host's `pinnedAgentIds` (shared with the phone) | production `sidebar-model.ts` | yes (`PinGrid`) | written |
| Sections: create, rename, move up or down, delete ("Its agents move to Unassigned"), fold, "Drag chats here", drag rows in, Move to, Move to new section; the host's `sidebarSections` | recovered `sidebar-sections-state.ts`, production `AgentRowActions.tsx` | no | |
| Several rows at once: N selected, Move to section, New section, Delete selected, Clear | recovered `conversation/workspace/sidebar.tsx` | no | |
| A row: the butterfly (moving while it works), name, title in blue, the last line ("Draft: …", "Voice chat · …"), time, the status (unread, needs attention, working) | recovered `sidebar-agent-status.ts` | yes (`AgentRow`, `StatusDot`) | written |
| On hover, a preview: the status, Pinned, recent messages, "2 PDFs", "No messages yet" | recovered `sidebar-agent-preview-*.tsx` | yes (the long-press preview, `ChatPeek`) | |
| The row's menu: Edit Profile, Show full conversation, Show async tasks, Move to…, Pin, Mark as Read or Unread, Duplicate, Copy conversation ID, Hide from sidebar, Delete | production `agent-row-actions-model.ts` | partly (no full conversation, async tasks or Move to) | part: no full conversation, async tasks, Move to |
| Delete asks first, with a group's own words ("…The Agents in it are not deleted") | production `AgentDeleteConfirmation.tsx` | partly (an agent's words only) | written |
| Rename in the row: Enter saves, Esc cancels | production `AgentNameEditor.tsx` | partly (in Profile) | |
| Hidden Agents with Unhide; "All bots are hidden" with Show Hidden Agents | recovered `hidden-chats/` | yes (`HiddenAgentsSheet`) | written |
| The compact rail (⌘B, and while the agent pane is open); the sidebar's width dragged | recovered `sidebar-collapse-state.ts`, patch 717-719 | n/a | part: ⌘B and ⌃⌘S hide the sidebar |
| "Connecting to your computer…", "Can't reach your computer" with Retry, "Reconnecting to your computer…" | recovered `roster/status.tsx`, `reconnect-notice.tsx` | partly ("No saved agents yet." only) | |

### 2.5 Search and the ⌘K palette

| What | Where | Phone | Mac |
|---|---|---|---|
| Tabs All, Messages, Agents, Groups, Files, Links, Routines, Actions; arrows between tabs; Current and Hidden badges; a result opens at its line | production `CommandPalette.tsx`, `command-palette-*-provider.ts` | yes (`SearchResults`, `Search.swift`) | written (⌘K) |
| Actions: Org Chart, Open Hidden Agents, Members, Channels, Chat Settings, Settings › General and Usage & Billing, Connect apps, Theme, Update Simeon's Computer, Join or New shared room | production `command-palette-root-commands.ts` | partly (New Agent, New Group Chat, Hidden Agents, Settings, Theme) | part: the phone's |

### 2.6 New agents and groups

| What | Where | Phone | Mac |
|---|---|---|---|
| The new chat (⌘N): a "To:" line to search or create agents ("Create “name”"); several make a group named after them; a new agent introduces itself | bundle, `desktop/demo/backend.ts` | partly (New Agent and New Group Chat sheets) | part: the phone's two sheets |
| The 12 colours; the shape picker hidden | patch 1901-1938 | yes | written |
| Duplicate | production `agent-row-actions-model.ts` | yes | written |

### 2.7 The chat's header

| What | Where | Phone | Mac |
|---|---|---|---|
| Centred: the 52 pt butterfly (a group's stack), the name in a white glass pill; the avatar opens the agent pane; Call beside the name; the working dot | patch 2046-2094, 375-384 | yes (`ChatHeadline`, `ChatCallButton`) | written (the toolbar) |
| A shared room's badge and Manage shared room | recovered `agent-info/shared-room/trigger.tsx` | no | |
| A thread's header with its way back | recovered `reply-thread-controller.ts` | yes (a sheet with the thread's name and Done) | written ("‹ Back to *name*" › the thread's name; Esc goes back) |

### 2.8 Messages

| What | Where | Phone | Mac |
|---|---|---|---|
| Bubbles: the agent's Messages grey, yours flat blue (#255a93, dark #1f5087), 18 pt corners, a lone emoji at 32 pt | patch 1983-2044 | yes | written |
| Markdown: headings, lists, task lists, quotes, rules, tables, strikethrough, code with colours and Copy code | recovered `transcript.tsx` | yes (`MessageText.swift`, `Markdown.swift`) | written |
| Mermaid diagrams: in the chat once the message is written, "Couldn't render this diagram." over the code, the "Diagram preview" with Zoom Out, Zoom In, Fit to Screen and their keys (− _, + =, 0 F; a tenth to eight times) | recovered `mermaid.tsx` | yes (`Rendering.swift`, Mermaid 11.17.2) | written |
| Maths (KaTeX 0.16.45): `$$` lines and ```` ```math ```` on their own lines, `$$…$$` within a line; a lone `$` stays a dollar | recovered `math.tsx` | yes (`Rendering.swift`, `Markdown.inlineMath`) | written |
| 75 brand names with their logo and colour; agent names with their butterfly | patch 1409-1536 | yes | written |
| @name chips in a group | ios `PARITY.md` §2 | no | |
| A lone link as a card: the site's icon (a globe), the page's title (else its host), the host (else the whole address), its picture; a click opens it | recovered `transcript-card/views/link-card.tsx` | yes (`LinkCard`, LinkPresentation) | written |
| Pictures attached to an agent's message: a row 192 high, 6 apart, three at most and "+N", each its own shape (4:3 unknown), the row at most 86 % of the chat, 560 and the chat less 82; pictures alone without a bubble; a click opens Quick Look | recovered `send-message-text.ts` | yes (`ImageGallery`) | written (and Open, Copy Image, Save Image… on right click) |
| A pull request's link opens in the review app | patch 172-174, 1570 | partly (Safari) | |
| The New divider, times after 15 minutes, older lines as you scroll up, "N new messages", a jump to a line with a glow | ios `PARITY.md` §2, §10 | yes | written |
| "Couldn't load this conversation. Check your connection and try again." with Retry | recovered `transcript-load-error.tsx` | yes (`ChatLoadFailed`) | written |
| The host's notices in the chat (`kind: "notice"`, shared rooms) | recovered `cards/notice/` | yes | written |
| "This message can't be shown in this version of Simeon" | recovered `transcript-card/resolver.ts` | yes | written |

### 2.9 A message's actions

| What | Where | Phone | Mac |
|---|---|---|---|
| The menu: 👍 👎 ❤️ 😂 🎉 😮, More emoji (a picker with search), Reply, Start a thread, Copy | recovered `reaction-picker.tsx`, `emoji-picker-content.tsx`, `message-actions.tsx` | yes (the emoji keyboard for more) | written (right click; More Emoji… a picker with search, without the window's categories; Mark as Unread too) |
| Reactions under the bubble; yours toggle | | yes | written |
| Reply: the quote over the composer, in the sent bubble, a click jumps to it ("Open reply thread" when what it answers is in a thread); a quote's preview on hover | recovered `reply-preview.tsx`, `referenced-message-preview.tsx` | yes (no hover preview) | written |
| Threads: Start a thread (not inside one), "1 reply", "N replies" under the message ("View thread" on hover), the thread: its first message and its replies (`getAgentThread`), a reply sent in it stays in it (`isFork`); its replies kept out of the chat | recovered `thread-affordance.tsx`, `thread-loader.ts`, shared `transcript-threads.ts` | yes (`Chat.threadRows`, `ThreadSheet`) | written |
| Find in the chat (⌘F): every time the words appear (case and accents aside), from the newest, "3 of 12" (red when none), Return and Shift-Return, ⌘G and ⇧⌘G, Esc; inside a thread, the thread's lines | recovered `find-in-chat.tsx`, `find-in-chat-controller.ts` | no (no find on the phone) | written |
| Sending: "Waiting to send…", "Will send when reconnected" with Cancel ("This message is already sending and can't be canceled."); "Sent while offline · *date*"; "Failed to send" with Resend and Delete. Only a message held offline says when it was written (`composedAtMs`): the phone said it of every message | recovered `transcript.tsx`, `submission.ts` | yes | written |

### 2.10 The agent at work

| What | Where | Phone | Mac |
|---|---|---|---|
| The butterfly folding into dots, swaying, orbiting; what it is doing ("Searching the web", "Messaging X") and for how long, on hover | ios `PARITY.md` §3.9, §17 | yes (`TypingRow`, `ActivityLabel`) | written |
| "Theo and Iris are working…" | | yes (`GroupActivityLine`) | written |
| The spin's light trails in the agent's colours | patch 2602-2703 | yes (`LightTrails.swift`) | written |

### 2.11 The composer

| What | Where | Phone | Mac |
|---|---|---|---|
| "Message *name*", "Message group"; "Reply in thread" in a thread | bundle | partly ("Message") | written |
| +: Attach files; Teach a task (gate off) | bundle | yes (attach) | written (the file chooser) |
| Files dropped or pasted ("Drop files to add to chat") | recovered `composer.tsx` | no (the phone's + chooser) | written |
| Attachments staged, then sent with the message | `desktop/web/backend.ts` | yes | written |
| Dictation: "Listening…", "Transcribing…" | recovered `voice.tsx` | yes (Apple's dictation) | written (Apple's dictation) |
| @ for agents, @everyone in a group of two or more, routines | recovered `rich-text-editor.tsx`, `editor-suggestion-provider.ts` | yes | written |
| / for skills (`getAgentWorkflows`; the message carries the skill as the window's `workflowReference` in `richText`), # for the pull requests the chat linked (`prReference`), : for emoji (twelve, recent first, the window's rule for when a ":" starts one), connector references | recovered `rich-text-editor.tsx`, `editor-*-reference-provider.ts` | yes | part: no connector references |
| A draft kept per chat ("Draft:" in the list) | recovered `draft-state.ts` | yes | written |
| The blue Send, Enter sends, Send and the mic swap | patch 1838 | yes | written (Return sends) |

### 2.12 Cards

| What | Where | Phone | Mac |
|---|---|---|---|
| Question: rings, help, "Type your own answer", Submit, the X; answered and dismissed | recovered `views/widget.tsx`, patch 1734-1762 | yes | written |
| Connectors: logo, Team badge, reason, "N tools · Used by N teammates", Authorize, Add, Manage, Retry, "Waiting for X authorization…" with Reopen, "Authorization didn't finish.", ✓ Added, account pills, Add another account, suggestion chips, Browse more | recovered `views/connector.tsx`, `connectors.tsx` | partly (no Team badge, counts, Manage, Retry, Reopen, account pills, another account, chips) | part: the phone's |
| Connect Slack or GitHub for a routine | recovered `views/listener-connect.tsx` | yes | written |
| Email and Slack drafts: editable, Show more, Send, Discard, the states | patch 607-643 | yes | written |
| Approval: Allow once, Always allow, Deny; Allowed once, Always allowed, Denied, Expired (the gate is off, so they are rare) | recovered `views/auto-review-approval.tsx` | yes | written |
| A secret: the field, Save securely, "Stored securely, never shown to your agent." | recovered `views/secret-request.tsx` | yes | written |
| Your turn on the computer: Take over, I'm done, Skip; Done, Answered, Skipped, Open computer | patch 828-880 | yes | written |
| "Allow Simeon and all agents to run commands on your local computer?": Always allow, Allow once, Never, Deny once; the team's policy | recovered `permissions/local-tool/` | no (the Mac's only, §7) | |
| A cloud agent: Creating, Running, Done, Error, Expired; branch, PR, View PR, Open (`getCloudAgentInfo`, every 5 s while it works) | recovered `views/cloud-agent.tsx` | yes (`CloudAgentCard`) | written |
| Flights, and a flight's details | patch 882-1025 | yes (Muse's layout) | written |
| Agents talking: Messaged, Message from, N messages with, N agents ▾, the read-only exchange | ios `PARITY.md` §3.6 | yes | written |
| Routine lines | recovered `cards/timeline-event-automation.tsx` | yes | written |
| Name changed, channel connected or disconnected | recovered `cards/timeline-event.tsx` | yes | written |

### 2.13 Files

| What | Where | Phone | Mac |
|---|---|---|---|
| The file card: the real logos, name and extension, size, a Save button | patch 1418-1435, 1652-1670 | partly (no Save button) | written (Save… to a folder; a picture's right click: Open, Copy Image, Save Image…) |
| Pictures and videos in the chat, a gallery for several, audio played in place | recovered `views/attachment.tsx` | partly (pictures; video and audio in Quick Look) | part: pictures; the rest in Quick Look |
| The viewer: previous, next, arrows, Esc | recovered `media-viewer.tsx` | partly (Quick Look) | part: Quick Look |
| PDFs (pages, zoom) and spreadsheets (sheets, a cell's detail) | recovered `pdf-viewer.tsx`, `spreadsheet-viewer.tsx` | yes (Quick Look, which the Mac has too) | written (Quick Look) |

### 2.14 The agent pane (the inspector)

| What | Where | Phone | Mac |
|---|---|---|---|
| One page: the 96 pt avatar with its pencil, name, title; Profile · Routines · Computer; 480 wide; the sidebar shrinks to its rail meanwhile | patch 672-802 | yes (`AgentPageSheet`) | part: a sheet for now (the inspector is slice 3) |
| Profile: Name, Title, Description saved on leaving each; the notifications switch | recovered `agent-info/settings/view.tsx` | yes (`ProfileTab`) | written |
| The avatar editor: Agent (12 colours, the voice with play, Reset), Generate, Upload (drop, paste or Browse; crop with zoom and drag) | recovered `agent-info/avatar-editor/` | partly (no crop, zoom, drag, drop or paste) | part: the phone's |
| Members: the list, Remove with a question, Add Member | recovered `agent-info/group-members/` | yes (`GroupMembers`) | written |
| Channels: each agent's Discord and Slack bot: status, Connect, Disconnect, How to connect, Refresh, the token field | recovered `agent-info/channels/` | no | |
| A shared room: Invite people, Copy link, requests with Approve and Deny, people, your agents | recovered `agent-info/shared-room/` | no | |
| Async tasks: helpers, shells and cloud agents still running | recovered `agent-info/async-tasks/` | no | |
| Full conversation: You, Thinking, Agent, Message, each tool call with its details and result (a terminal's output) | recovered `conversation-outline-view.tsx`, `terminal/output/` | no | |

### 2.15 Routines

| What | Where | Phone | Mac |
|---|---|---|---|
| The list, Create Routine, Paused | recovered `automations/routines/view.tsx` | yes (`RoutinesTab`) | written |
| The editor: Active, Delete, Test run, Name, Instruction, When to run, Run history | recovered `automations/routines/` | yes (`RoutineEditor`) | written |
| Schedules: the presets and Advanced… | recovered `routines/schedule-editor.tsx` | yes (`SchedulePicker`) | written |
| Events: Slack (a channel; a message, mention, keyword or reaction), GitHub (repo, events, CI passed or failed, people, branch), Linear, Sentry, PagerDuty; several per routine | recovered `routines/trigger-schema.ts` | no | |

### 2.16 The computer

| What | Where | Phone | Mac |
|---|---|---|---|
| The Computer tab: the preview, Open computer, Retry, "Needs your attention" | recovered `computer/shell/view.tsx` | yes (`ComputerTab`) | written |
| Full size: the live screen, Take over, I'm done, Skip, full screen, the conversation beside it | recovered `computer/shell/view.tsx` | yes (`ComputerSheet`, `LiveScreen`) | part: its own window, Take Over, I'm Done, Skip Step |
| The strip of helpers' screens: switch between them, "Show N more screens" | recovered `computer/shell/model.ts` | no | |
| The clipboard both ways by itself; ⌘ keys sent as Ctrl | `desktop/source/electron-preload/preload-vnc.ts` | partly (by hand) | |
| "Switching to X's screen…", "Can't reach X's screen" with Retry, "Setting up the computer N %", "Booting up the computer" | recovered `computer/shell/model.ts` | partly | part |
| The rebuild banner: Starting, Recreating, Updating, Resetting, Recovering, with its progress | recovered `computer/rebuild/` | no | |
| Update or Reset Simeon's Computer: "An agent is working…", Update when done, Update anyway, Not now | recovered `computer/update/confirmation.ts` | no | |
| "Computer is low on disk space", Open Disk Saver | bundle | no | |
| Teach a task: Start recording, Stop & save, Discard (gate off) | recovered `computer/teach-recording/` | no | |

### 2.17 Calls

| What | Where | Phone | Mac |
|---|---|---|---|
| Start from the name or Agent › Call *name*; one call at a time | patch 375-384, main `application-menu.ts` | yes (the button) | written |
| The call: the rings, the avatar, the name, what the agent is doing ("Calling…", "Using Gmail…"), the waveform, Mute, Transcript, End; "Call ended · m:ss" with the hang-up; "Couldn't connect", "Calls aren't switched on yet" (503), "Out of credit for calls" (402) | `desktop/source/voice-call/` | yes (the phone's call screen; a floating banner on the Mac, §6) | part: the phone's call screen as a sheet (the banner is slice 5) |
| "Voice chat · 01:49" in the chat, opening the call | patch 403-457 | yes | written |
| The older "Voice call · m:ss" record with its recap | patch 396-402 | partly (as text) | |

### 2.18 Settings

| What | Where | Phone | Mac |
|---|---|---|---|
| General: Account, Theme (Follow System, Light, Dark), Timezone, Auto-review with its rules | recovered `settings/overlay/panels.tsx`, `auto-review.tsx` | yes | written |
| General: Execution on Local Computer (Always allow, Ask every time, Never allow) | recovered `settings/overlay/panels.tsx` | no (the Mac's only, §7) | |
| General: Security Key | same | no (the Mac's only, §8) | |
| Usage & Billing: the week's or the trial's meter and its reset, on-demand, Get more Simeon usage, Cancel Trial ("Cancel your trial?", Keep Trial), Manage Plan (Upgrade to *tier*, Manage Billing ↗) | recovered `panels.tsx`, patch 543-594 | partly (no on-demand, trial, Cancel Trial) | part: the phone's |
| Updates: hidden today | patch 8-13 | n/a | Sparkle's own |

### 2.19 Connect apps (⇧⌘M)

| What | Where | Phone | Mac |
|---|---|---|---|
| Marketplace and Yours, search, Filter (Connectors, Skills; Public, Team) | recovered `plugins/overlay/browser.tsx` | partly (no filter, no skills) | part: the phone's, in its own window |
| An app: Add, Authenticate, Enable, Disable, Remove; Connected, Authentication required, Starting, Disconnected, Error, Disabled by team admin | same | partly | part: the phone's |
| Setup values (Edit Values, Save Values) and Details | same | no | |
| Its tools, each with a switch | same | yes | written |
| Its accounts: rename, remove, Add Another Account, Authorize | same | yes | written |
| Skills: the agent's own, the editor (name, "Use when…", instructions), publish to the team, Copy link, Sync, Unpublish, Delete | same | no | |
| "Fix with agent" when an app's content needs a GitHub sign-in | recovered `plugins/overlay/github-auth-banner.tsx` | no | |

### 2.20 The org chart and shared rooms (both gates on)

| What | Where | Phone | Mac |
|---|---|---|---|
| Agent network: every agent and its state (Waiting for you, Working…, Idle); About, Last activity, Open chat | recovered `org-chart/workspace/` | no | |
| Shared rooms: New, Join from a link, invites, requests, notices in the chat | recovered `agent-info/shared-room/`, `docs/services-agents.md` | no | |

Broadcast to agents has a button but no path in the window today; it comes
over only once it does something.

### 2.21 The rest

| What | Where | Phone | Mac |
|---|---|---|---|
| Toasts: dismiss, Clear all, Copy request ID | recovered `window-chrome/notification-host.tsx` | partly (an alert) | part: an alert |
| The Deep Links page (`simeon://app/v1/info?topic=deep-links`) | recovered `deep-links/overlay/` | no | |
| About: the icon, the version, "Copyright © 2026 SimeonLabs, Inc." | recovered `about/overlay/`, patch 69 | partly (the version in Settings) | |
| The update pill, "Update required", "Restart to update" (still while updates are off) | recovered `update/` | n/a | Sparkle's own |
| The look: the 12 palettes, the butterfly and its motion, glass, blue switches, the Messages grey, blue buttons | patch 1679-2710 | yes (`Palette.swift`, `Butterfly.swift`, `MarkMotion.swift`, `Avatars.swift`, `Theme.swift`) | written |

### 2.22 From the iPhone, for the Mac too

What the phone gained that the Mac window never had. The first two follow
what the founder asked for on the phone ("same for everything"); the others
are the founder's to choose.

| What | Phone |
|---|---|
| The sign-in screen with Apple and Google | `SimeonApp.swift` `SignInScreen` |
| The question before every connector's sign-in | `ConnectConsent.swift`, `ConnectConsentSheet` |
| Show only unread; Hide Alerts in a row's menu; Mark as Unread and Select Text on a message | `HomeView.swift`, `ChatView.swift` |
| The call's time in the list while a call is on | `HomeView.swift` `CallChip` |

---

## 3. Commands to the cloud computer

The host's table is `host/gateway-protocol.ts` (`SAND_GATEWAY_COMMANDS`);
the window's allowed list is `desktop/source/shared/rpc/coordinator.ts`, and
main's is `desktop/source/shared/rpc/coordinator-main.ts`. The iPhone sends
them from `Backend.swift`, `Store.swift`, `Onboarding.swift`, `Search.swift`
and `VoiceCall.swift`. Every command the Mac sends today has a line.

| Area | Commands | Phone | Mac |
|---|---|---|---|
| Reading a chat | `openAgentTail`, `getAgentTranscriptTail` | yes | written |
| | `getAgentThread` | yes | written |
| | `getAgentTranscriptWindow` (older pages, with thread counts; the app counts threads from the lines it has) | no | |
| Sending | `sendPrompt` (with `replyToId`, `isFork`, `richText`, nonce, and `composedAtMs` for a message held offline), `appendSendMessage` | yes | written |
| | `promptAcceptanceStatus`, `appendConnectorCard` | no | |
| Cards and reactions | `respondToWidget`, `dismissWidget`, `submitSecret`, `sendDraft`, `discardDraft`, `reactToMessage` | yes | written |
| Approvals | `resolveAutoReviewApproval` | yes | written |
| | `resolveLocalToolPermission` (the Allow card for the agent's hands on this Mac) | no | |
| Agents and groups | `listAgents`, `countAgents`, `createAgent`, `kickstartAgent`, `createGroup`, `setGroupMembers`, `updateAgent`, `deleteAgents`, `duplicateAgent`, `setAgentUnread`, `setAgentNotifyOnUpdates`, `setAgentHiddenFromSidebar`, `setAgentAvatarBytes` | yes | written |
| | `setWindowFocused` (the box knows the person is looking), `getAgentAvatar`, `getSubagents`, `getAsyncTasks`, `getConversationOutline`, `broadcastToAgents`, `isAgentNetworkEnabled`, `setAgentNotificationsEnabled` | no | |
| Search | `searchAgents`, `searchMedia`, `isGlobalSearchEnabled` | yes | written |
| Routines | `getAgentAutomations`, `listAllAutomations`, `createAgentAutomation`, `updateAgentAutomation`, `setAgentAutomationEnabled`, `deleteAgentAutomation`, `runAgentAutomationNow` | yes | written |
| Workflows (no screen of their own in the window; `getAgentWorkflows` feeds "/" and "@", written) | `getAgentWorkflows`, `createAgentWorkflow`, `updateAgentWorkflow`, `setAgentWorkflowEnabled`, `deleteAgentWorkflow`, `runAgentWorkflowNow`, `importAgentWorkflowText`, `importAgentWorkflowUrl` | no | |
| Skills | `skillsCatalog`, `portAgentLocalSkills`, `syncPluginSkills`, `getPluginSyncStatus`, `getSkillPublishTargets`, `publishSkill`, `resyncPublishedSkill`, `unpublishSkill` | no | |
| Connectors | `desktopMcp`: `listServers`, `getCatalog`, `installEntry`, `vendorServerIdForPlugin`, `authenticateServer`, `removeServer`, `listServerTools`, `toggleMcpToolDisabled`, `renameAccount`, `removeAccount` | yes | written |
| | `desktopMcp`: `listEffectivePlugins`, `resolvePluginLogo`, `updatePluginInstall`, `uninstallPlugin`, `setServerCustomInstructions`; `searchPlugins`, `getPlugin`, `installPlugin`; `refreshMcp`, `listBoxMcpServers`, `completeMcpOAuth` | no | |
| Tools run from the Mac | `listRoutedMcpTools`, `executeRoutedMcpTool`, `executeRoutedAgentTool` | no | |
| Messaging channels | `getListenerIntegrations`, `getListenerConnectUrl` | yes | written |
| | `getAgentChannels`, `connectChannel`, `disconnectChannel`, `refreshChannel` | no | |
| Memory (no screen in the window today) | `getAgentMemories`, `deleteAgentMemory`, `clearAgentMemories` | no | |
| Sharing | `getSharingState`, `createRoomFromAgent`, `createRoomInvite`, `joinSharedRoom`, `respondToRoomJoinRequest`, `createSharedRoom`, `addOwnAgentToSharedRoom`, `removeOwnAgentFromSharedRoom`, `setSharedRoomTyping`, `leaveSharedRoom` | no | |
| Settings | `getHostSettings`, `setHostSettings` | yes (pins, onboarding, time zone, auto-review) | written |
| | The other fields: `sidebarSections`, `agentDefaultModel`, `computerUseModel`, `localToolPermission`, `webauthnProxyEnabled`, the connector stores, `featureFlagOverrides` | no | |
| Secrets | `setBoxSecrets`, `getBoxSecretsStatus` | no | |
| Files | `uploadAttachment`, `readAttachmentImage`, `readAttachmentChunk` | yes | written |
| | `readAttachmentText` | no | |
| Calls | `voiceCall` | yes | written |
| The computer | `ensureForeverBox`, `handBackForeverBox` | yes | written |
| | `getCloudAgentInfo` | yes | written |
| | `getForeverBoxStatus`, `updateForeverBox`, `getHostStatus`, `requestDiskSaverAudit`, `isEgressTunnelAvailable` | no | |
| Teaching (gate off) and trays (no screen in the window today) | `startTeachRecording`, `stopTeachRecording`, `getTeachRecordingStatus`, `getTrays`, `dismissTray`, `clearTrays` | no | |

A command whose screen is missing or switched off in the window comes over
with that screen, not before.

Not sent by any app today, so not part of this list: `getTranscript`,
`getAgentTranscript`, `getAgentTranscriptPage`, `openAgent`,
`openAgentWindowed`, `deleteAgent`, `resetForeverBox`, `autoUpdateBoxNow`,
`snapshotBoxStoreNow`, `getBoxStoreStatus`, `clearBoxStoreNow`,
`updateHostNow`, `setBoxMigrating`, `prepareBoxForRecreate`,
`resumeBoxAfterRecreate`, `requestWebAuthnCeremony`.

How the Mac calls them, beyond what `Gateway.swift` does now:

| Electron (coordinator `gateway/gateway-client.ts`) | Phone | Mac |
|---|---|---|
| `sendPrompt` with a 15 s deadline and a retry that the nonce makes safe | partly (Resend by hand) | |
| `listAgents` and `countAgents`: 15 s and one retry; `createAgent`: up to 3 retries (the host dedupes by nonce, `x-sand-mint-dedupe`) | no | |
| A 35 s stall watchdog on the event stream, and a forced reconnect (`forceGatewayReconnect`) | partly (45 s timeout, 1–15 s backoff) | |
| A `/health` probe with the token before reconnecting | no | |
| Reconnect on wake from sleep (`powerMonitor` resume, main `coordinator/desktop-connectivity.ts`) | no | |
| The last box address kept for 7 days, per account, so launch reconnects at once (main `box/gateway-descriptor-*.ts`) | no | |
| Slim avatars (`x-sand-slim-avatars: 1`), avatars from `GET /avatars/{agentId}` | no | |

## 4. Events from the cloud computer

| Event | What it carries | Phone | Mac |
|---|---|---|---|
| `transcript` | a chat's lines: snapshot, appended, updated, removed, cleared | yes | written |
| `agents`, `agent-upserted` | the roster | yes | written |
| `host-settings` | which settings changed | yes | written |
| `mcp-servers`, `mcp-auth` | connectors and their sign-ins | yes | written |
| `outline` | the agent's steps | partly (tool calls only) | |
| `client-side-tool-v2` | tool cards, decoded from protobuf (coordinator `client-side-tool-v2-relay.ts`) | no | |
| `subagents`, `async-tasks` | work an agent handed off | no | |
| `automations`, `workflows`, `memory`, `sharing` | changes to those | no | |
| `forever-box`, `box-disk-pressure`, `computer-action` | the computer's state, its disk, what the agent does on it | no | |
| `tray`, `teach-recording` | trays and teaching | no | |

## 5. What the coordinator did

The Electron app's second process (`desktop/source/node-agent-coordinator/`).
The Swift app does each of these itself:

| Duty | Electron | Phone | Mac |
|---|---|---|---|
| Talk to the box: commands and events | `gateway/` | yes (`Gateway.swift`, `Backend.swift`) | written |
| Turn the box's screen address into the proxy's | `gateway/box-vnc-proxy.ts` | yes (`screenSocket`) | written |
| Put the account on permission cards, so the Allow card shows | `permission-scope-stamp.ts` | no | |
| Finish a connector's sign-in on this Mac (`http://localhost:8787/callback`, then `completeMcpOAuth`) | `oauth/`, main `mcp/mcp-oauth-loopback-provider.ts` | phone uses the server's hosted callback | |
| Start, check and restart the local-exec daemon | `local-exec/` | n/a | |
| Security keys for the agent's browser | `webauthn/` | no | |
| Connector tools the box routes to the Mac | `routed-mcp-bridge.ts` | no | |
| The text-only fallback when the full agent is off (`SAND_SIMEON_FULL_AGENT=off`) | `inference-router.ts` | n/a: off by default, not ported | |

## 6. What the Mac itself does (Electron main)

`window.desktop` groups (`preload.ts`) and main's services, one line each.

| What | Electron | Phone | Mac |
|---|---|---|---|
| **Sign-in**: browser to `/loginDeepControl`, poll `/auth/poll`, refresh at `/oauth/token`, sign out at `/desktop/api/auth/logout` | main `account/account-auth.ts`, `simeon-sign-out.ts` | yes (`SignIn.swift`, `Tokens.swift`, `Session.swift`) | written |
| The name sheet after onboarding, Google's first name offered | `account.getNamePrompt`, `updateName` | yes | written |
| The account's picture | `account.getAvatar`, main `account/account-avatar.ts` | partly (initials) | |
| Usage and billing: weekly usage, summary, the billing portal | `account.getWeeklyUsage`, `getUsageSummary`, `openBillingPortal` | yes (`Settings.swift`) | written |
| Privacy mode, cancel trial, dashboard actions | `account.getPrivacyModeEnabled`, `cancelTrial`, `invokeDashboardAction` | no | |
| The access gate: granted, unavailable, payment required | `account.getSandAccess`, main `account/access.ts` | no | |
| A machine id sent with server calls | main `account/machine-id.ts` | no | |
| **Attachments**: stage, upload, read text and bytes (25 MB) | `stageAttachmentBytes`, `commitStagedAttachments`, `readAttachment*`, main `attachments/` | yes | written |
| Video and audio played from the box in 4 MiB ranges | the `sand-media` scheme, main `media/media-protocol.ts` | partly (QuickLook after a full read) | |
| Save a file: a save dialog, streamed from the box, "Couldn't save this file" | `downloadAttachment` | no | |
| Link previews, cached | `getLinkMetadata` | no | |
| The image right-click menu: Open link, Copy link, Copy image, Save image…, Copy image address | main `media/avatar-images.ts` | partly (Copy) | |
| **Avatars**: pick a file (25 MB, scaled to 1024 px), generate one (`/desktop/api/proxy/v1/images/generations`) | `pickAvatarSource`, `pickAvatarFile`, `generateAgentAvatarImage` | yes (`AgentPage.swift`) | written |
| **Dictation** through the server (`/desktop/api/proxy/v1/audio/transcriptions`) | `transcribeAudio` | partly (Apple's on-device dictation) | |
| **Calls**: availability, start, the voice picker, previews, each agent's voice | `voiceCall.*`, main `voice/` | yes (`VoiceCall.swift`, `CallViews.swift`, `AgentVoices.swift`, `CallTones.swift`) | written |
| Thumbs on a finished call (`/voice/calls/{id}/feedback`); the window draws none today | `voiceCall.rateCall` | no | |
| The call as a floating banner (360 pt, top right under the menu bar, every Space, no focus taken; leaves 1.2 s after the end, a failure stays 20 s) | `desktop/source/voice-call/`, main `voice/voice-call-window.ts` | no (a full screen on the phone) | |
| **Connectors**: the 79-connector catalog, install, accounts, custom servers by URL, tools on and off, custom instructions, team numbers, logos | `mcp.*`, main `mcp/desktop-mcp-manager.ts` | partly (no custom servers, instructions, team numbers, uninstall) | |
| `simeon://app/v1/plugin/add?id=` opens a connector to add | main `deep-link/`, `shared/deep-link.ts` | no | |
| **Secrets**: list, reveal, add, remove, pushed to the box. The window has no page for them today; the card that asks for one goes to the box itself (`submitSecret`) | `secrets.*`, main `secrets/` | yes (the card) | written |
| **Models**: the default model, the computer-use model, the list (`/desktop/api/models/available`) | `agent.get/setDefaultModel`, `get/setComputerUseModel`, `getAvailableModels` | no | |
| Sidebar sections | `agent.get/setSidebarSections` | no | |
| Pins | `agent.get/setPinnedAgents` | yes | written |
| Time zone, auto-review rules | `timeZone.*`, `autoReviewInstructions.*` | yes | written |
| Theme: system, light, dark | `theme.*`, main `prefs/theme-controller.ts` | yes | written |
| Onboarding seen, skip | `onboarding.*` | yes | written |
| **The agent's hands on this Mac** (§7) | `localToolPermission.*` | n/a | |
| **The computer**: reset it, update it keeping its data, the move's progress (backing up, creating, moving, cleaning up, done, failed) | `foreverBox.forceRecreate`, `update`, `getBoxMigrationStatus`, main `box/box-recovery.ts` | no | |
| The computer panel: clipboard both ways (every 500 ms while visible), ⌘A/C/V/X/Z sent as Ctrl, the person's presence, arrow keys | `desktop/source/electron-preload/preload-vnc.ts` | partly (`Computer.swift`: its own clipboard and keys, no presence) | |
| "Can't reach…" with the last reason after 20 s of spinner; the log at `computer-stream.log` | `computer-stream-notice.ts`, main `vnc/computer-stream-log.ts` | no | |
| Security keys for the agent's browser (§8) | `foreverBox.webauthnProxy.*` | no | |
| The egress tunnel: the box's traffic leaves through this Mac (off by default) | `foreverBox.egressTunnel.*`, `shared/node/egress-tunnel/` | no | |
| Feature gates and their defaults (`shared/node/experiments/simeon-gate-defaults.ts`) | `experiments.*` | partly (reads `isGlobalSearchEnabled`) | |
| Feedback (`/desktop/api/feedback`): hidden since 4 October | `submitFeedback` | not ported while hidden | |
| Open links outside; a connector's sign-in redirect is caught first | `openExternal` | yes | written |
| Open a cloud agent on the web (`app.simeonlabs.com/agents/<id>`) | `openCloudAgent` | no | |

## 7. The agent's hands on this Mac

The local-exec daemon (`desktop/source/local-exec-daemon/`, gated by
`host/local-exec/local-exec-daemon.ts`). The agent's tools ExternalShell,
AwaitExternalShell, ExternalRead, CopyToBox and CopyFromBox reach it.

| What | Electron | Mac |
|---|---|---|
| Run a command with its output streamed; run one in the background; read a file (with a size cap); list a folder | `production-executor.ts` | |
| Where: `SAND_LOCAL_EXEC_ROOT`, else `SAND_AGENT_PROJECT_DIR`, else the home folder; commands carry `SIMEON_AGENT=1` | same | |
| Always refused: `~/.ssh`, `.gnupg`, `.aws`, `.azure`, `.config/gcloud`, `.kube`, `.docker/config.json`, `.netrc`, `.npmrc`, `.pypirc`, `.simeon` and the earlier data folder, `.cursor`, `Library/Keychains`, `Library/Cookies`, `Application Support/Simeon`, the browsers' profiles, `/etc/shadow`, `master.passwd` | `shared/sensitive-local-paths.ts` | |
| The setting: Never, Ask (the default), Always; an admin cap from the account can lower it | `localToolPermission.get/set/ceiling` | |
| Ask: an approval covers that exact action and lasts 10 minutes (`~/.simeon/local-tool-approvals.json`); the Allow card in the chat | `recordApproval`, `clearApprovals`, `resolveLocalToolPermission` | |
| Refused when the app is not watching it (no heartbeat for 90 s) | host `local-exec/` | |
| Its credential from the server (`POST /sand-box/local-exec-daemon-credential`), its requests from the box (`/local-exec/requests`, `/local-exec/responses`) | main `box/box-host-connector.ts` | |

In Swift this is `Process` and `FileManager` inside the app, with the rules
above in a Mac-only library of the shared package (`SimeonMacCore`) so they
are tested on Linux with the rest.

## 8. Security keys for the agent's browser

When the browser in the cloud computer asks for a passkey or security key,
the Mac shows "Use your security key?" with the site, Approve and Deny, then
"Touch your security key now", a PIN field with the attempts left, and the
key's errors. The signer is a native binary taken from the upstream app
(`sand-webauthn-signer`, coordinator `webauthn/`, main
`coordinator/coordinator-executors.ts`). On by default ("Security Key" in
Settings).

| What | Mac |
|---|---|
| The request window: site, Approve, Deny, the waiting text, the PIN field | |
| Talking to the USB key (CTAP2 over HID, through IOKit), returning the credential to the box (`/webauthn/requests`, `/webauthn/responses`) | |
| The setting, mirrored to the box (`webauthnProxyEnabled`) | |

This is the one piece Apple's own passkey sheet cannot do for us: the site
belongs to the agent's browser, not to Simeon, so the app speaks to the key
itself.

## 9. The Mac around the window

| What | Electron | Phone | Mac |
|---|---|---|---|
| Menus: Simeon (About, Services, Hide, Quit), File (Close), Edit, View (Reload, Full Screen), Agent (Call *name*), Window. No Help menu (hidden on 4 October) | main `application-menu.ts` | n/a | part: no zoom |
| Zoom ⌘= ⌘- ⌘0 (0.5–3.0), Full Screen ⌃⌘F | main `host-window-chords.ts` | n/a | |
| The `simeon` scheme: `app/v1/open` (back from sign-in), `app/v1/info?topic=deep-links`, `app/v1/plugin/add?id=`; the same under `https://app.simeonlabs.com/sand/link/v1/…`; the rules (2048 characters, no `#`, only known keys) | `shared/deep-link.ts`, main `deep-link/` | partly (sign-in only) | part: `simeon-mac://app/v1/open` |
| Notifications: "*name* needs you" (the reason, or "Waiting for your input."), with sound; a finished turn (the last message, or "Open Simeon to see what it did."), silent. Not while the window is focused, for a hidden agent, with the agent's notifications off, or twice in 5 s; at most 140 characters. A click opens the agent | main `notifications/os-notification-manager.ts`, `shared/os-notification.ts` | partly (Apple push from the server) | |
| The Dock badge: agents with unread messages, not hidden | main `notifications/dock-badge-manager.ts` | partly (from the push) | |
| One copy of the app at a time; a second launch hands over its link | main `main.ts` | n/a | written (the Mac does it) |
| The window's place and size (default 1040 × 760, at least 512 × 520), on the screen it was on | main `window-state-*.ts`, `window-chrome.ts` | n/a | written (SwiftUI keeps it) |
| The window widens when a side pane opens, within the screen | `windowControls.resizeWidth` | n/a | |
| The sidebar greys when the window loses focus | main `window-chrome.ts` | n/a | written (the Mac does it) |
| "Move Simeon to the Applications folder?" | main `startup/move-to-applications-folder.ts` | n/a | |
| Tokens in the Keychain; secrets and the box address stored encrypted | main `secrets/secret-store.ts` | yes (`KeychainVault`) | written |
| The data folder `~/.simeon` | main `startup/startup-data-root-migration.ts` | n/a | |
| Logs a person can send: `computer-stream.log`, `voice-call.log`, `~/.simeon/vendor-mcp-signin.log` | main | partly (`HangWatch.swift`) | |

## 10. Build and release

| What | Electron | Swift | Mac |
|---|---|---|---|
| The project | `desktop/package.json`, `npm run package` | `mac/project.yml` (XcodeGen) | written |
| Bundle id, name, scheme, icon | `com.simeonlabs.simeon`, `simeon`, `desktop/brand/Simeon.icns` | `com.simeonlabs.simeon.mac` and `simeon-mac` while it grows, then the Electron app's (`README.md`) | written (beside the Electron app) |
| Microphone and the server addresses in the app | `NSMicrophoneUsageDescription`, `LSEnvironment` (`SIMEON_API_BASE_URL`, `SIMEON_WEBSITE_URL`) | Info.plist | part: the microphone |
| Developer ID signing, hardened runtime, notarization, a DMG with an Applications link | `npm run release:macos` (`desktop/scripts/lib/release-macos.mjs`) | an Xcode archive, `notarytool`, a DMG script in `mac/scripts/` | |
| The download link `api.simeonlabs.com/desktop/download/mac` reads `releases/darwin-arm64/latest.json` | `server/simeon/desktop/releases.py` | the same index, written by the Mac's release script | |
| Updates | Squirrel, switched off in every packaged build | Sparkle (MIT), with an appcast the server builds from the same index | |
| The host bundle: `npm run publish:host-bundle` takes `host-main.cjs` and the box's exec daemon out of the packaged Electron app | `desktop/scripts/publish-host-bundle.mjs` | builds them from `desktop/source` directly, so publishing no longer needs a packaged Electron app | |
| `npm run verify`: the app's identity, scheme, icons, signature | `desktop/scripts/verify.mjs` | a `mac/scripts/verify.sh` with the same checks | |

## 11. Not carried over, on purpose

| What | Why |
|---|---|
| Telemetry and Sentry (the 21 `telemetry.*` reports, process metrics) | Off in every packaged Electron build (`SAND_DISABLE_TELEMETRY`, `SAND_DISABLE_SENTRY`) |
| Dev controls, the dev control server, 1Password CLI, dev box rebuilds, attach to a production box | Development only |
| The local Docker box (`SAND_BOX_RUNTIME=local-docker`) | Internal testing only (`CLAUDE.md`); the Electron app stays for it |
| The text-only fallback (`inference-router.ts`) | Off by default |
| PR-review preferences, `openCloudAgent`'s upstream uses, Windows code | Upstream leftovers |
| Copying the upstream app's folder and the earlier data folder (main `startup/`) | One-time moves for earlier installs; the Swift app starts from `~/.simeon` |
| Inference routing, box runtime switch | Always the product provider and the cloud |

---

## The order

Each slice ends with a build on the founder's Mac and their screenshots.

1. **The window.** The Mac target; sign-in (the iPhone's screen at the
   Mac's size); the sidebar with pins, rows and their status, folding to
   a rail; the chat with its text, the cards the iPhone already draws, and
   the composer; the toolbar; Settings with Account and Theme; the menus
   and the window's keys (§2.3, §9); `simeon-mac://app/v1/open`.
2. **The chat, all of it.** Every card in §2.12, reactions and More
   emoji, Reply, threads, find in the chat, the right-click menu, files
   dropped and pasted, Save, Quick Look, link cards, Mermaid and maths,
   the sending states, search and the ⌘K palette.
3. **Agents.** The inspector (Profile, the avatar editor with its crop,
   the voice, Routines with events, notifications, members, full
   conversation, async tasks), the new chat with "To:", the row menus,
   sections and Move to, several rows at once, rename in the row, the
   first run.
4. **The computer.** The Computer tab and its own window, the clipboard
   by itself and the ⌘ keys, presence, the helpers' strip, reset and
   update with the rebuild banner, low disk, the "Can't reach…" notice.
5. **Calls.** The floating banner, Agent › Call, the rings and hang-up,
   the voice picker, thumbs.
6. **Settings, all of it.** Connect apps with everything in §2.19
   (Setup values, Details, filters, skills), Models, Time zone,
   Auto-review, Usage and Billing with the trial, privacy, the access
   cover.
7. **The Mac's own.** Notifications and the Dock badge, the agent's hands
   on this Mac with its setting, approvals and Allow card, connector
   sign-ins on localhost, routed tools, channels, the org chart, shared
   rooms, and what else in §3 gains a screen.
8. **Security keys** and the egress tunnel.
9. **Release.** Signing, notarization, the DMG, Sparkle, the host bundle
   built without Electron, then the switch to `com.simeonlabs.simeon`.
