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
**checked** (seen working on the founder's Mac). Slices 1 (the window),
2 (the chat), 3 (agents) and 4 (the computer) are written: nothing is
built or checked yet.
What slice 2 added is shared with the iPhone, so its "Phone" column says
yes too; the iPhone app is built again with it. Slice 3's screens are the
Mac's own (`mac/Simeon/Mac*.swift`), on rules in the shared core that the
iPhone can use later; the iPhone's screens are unchanged. Slice 4 is the
same: its rules are in the shared core (`CloudComputer.swift`,
`ComputerRebuild.swift`, `RebuildDriver.swift`, `MigrationWatch.swift`),
the lock's checked against the window's own code run in Node
(`Tests/SimeonCoreTests/Fixtures/rebuild-lock.json`); the iPhone keeps its
own computer sheet, and its hand-off card and Skip now send what the
window sends (`dismissed`).

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
| The hand-off: "Waking your computer…", "Setting up your Simeon…", "Getting your team ready…", then Simeon, Chief of Staff, is created and says hello; "Simeon couldn't finish setting up" with Try again | patch 1214-1231 | yes (`HandOffStep`) | written ("Waking your computer…" from the newest status of any agent's computer, as the window; no shipped host reports a sleeping computer, so it is not expected to show) |
| Whether to show it: `hasSeenOnboarding`, else `countAgents` | `desktop/web/backend.ts` | yes (`FirstRun`) | written |
| The boot screen: "Setting up Simeon's computer" in a moving light, while the agents are first read | bundle `C0t` | partly (the turning butterfly) | written (`MacSettingUp`) |
| The name sheet once the first run is over and no name was given: "What should your agents call you?", Not now, Continue ("Saving…"), "Couldn’t save your name. Try again." | bundle `__simeonNameSheet` | no | written (`MacNameSheet`) |
| The Chief of Staff (the oldest agent titled "Chief of Staff" or "COO"): his title and description cannot be edited; his name and avatar can | patch 1224-1230, bundle `__simeonFindCoo` | yes (`AgentPage.swift` `isChief`) | written (`Agent.chiefOfStaff`) |

### 2.3 The window's keys and states

| What | Where | Phone | Mac |
|---|---|---|---|
| ⌘N New Agent (the new chat), ⌘K jump to, ⌘, Settings, ⇧⌘M Connect apps, ⌘I or ⌘L to the composer, ⇧⌘F search agents, ⌥↑ ⌥↓ the previous or next agent, ⌘[ ⌘] back and forward, ⌘1–9 a sidebar agent (open sections only), ⌘B the compact sidebar, ⌘F find in the chat, ⇧⌘, Toggle agent settings, ⇧⌘I and ⌥⌘B Toggle details, Esc close | recovered `window-chrome/global-keyboard-shortcuts.ts`, bundle `sand.toggleAgentSettings`, `sand.toggleInfo` | no | part: all but ⇧⌘F and ⌘[ ⌘] |
| The connection's badge: Connected, Connecting, Disconnected | recovered `window-chrome/status-badge.tsx` | no | |
| "Something went wrong" with Reload and Copy error | recovered `error-boundary/` | partly (an alert) | part: an alert |

The menus, zoom and full screen are in §9.

### 2.4 The sidebar

| What | Where | Phone | Mac |
|---|---|---|---|
| Search and New chat as glass discs; "Connect apps" at the foot with the Gmail, Calendar and Drive tiles | patch 2123-2226, 1538-1578 | yes (in the phone's layout) | written (the sidebar's search field, New chat in the toolbar, Connect Apps in the account menu) |
| The list's right click on its empty space (`Qhn`): Join shared room…, New shared room…, Hidden Agents (N) | bundle | partly (Hidden Agents) | part: Hidden Agents (N), and Show Hidden Agents in the View menu (shared rooms are slice 7) |
| The Agent network button (the org chart, §2.20) | recovered `org-chart/` | no | |
| Pins: tiles, dragged to reorder, the host's `pinnedAgentIds` (shared with the phone) | production `sidebar-model.ts` | yes (`PinGrid`) | written |
| Sections: made only from Move to new section ("New section", at the top, its name open to change); Rename, Move up, Move down, Delete ("Its agents move to Unassigned. No agents are deleted.") on the header's right click; fold (kept on this Mac); "Drag chats here"; "Unassigned" last and only with agents; rows and pinned tiles dragged in, headers dragged to reorder; the host's `sidebarSections` | bundle `dZ`, `jHn`, `Cct`, `Wpn` | no | written (`SidebarSections`, `MacSidebar`) |
| Several rows at once: ⌘-click, ⇧-click a range, a plain click lets go; the toolbar's Move (to a section), Delete and Clear selection; Esc lets go, Delete asks to delete them | bundle `u0n`, `pcn` | no | written (`SidebarSelection`) |
| A row: the butterfly (moving while it works), name, title in blue, the last line ("Draft: …", "Voice chat · …"), time, the status (unread, needs attention, working) | recovered `sidebar-agent-status.ts` | yes (`AgentRow`, `StatusDot`) | written |
| A card on hover, only on pinned tiles and in the rail (after 0.3 s): the status, the title, Pinned, the time, and one line ("Waiting for you: …", "Draft: …", the last message, "No messages yet") | bundle `sdn`, `ndn` | yes (the long-press preview, `ChatPeek`) | written (`MacHoverCard`) |
| The row's menu, in groups: Pin or Unpin, Move to (not when pinned), Mark as Read or Unread · Edit Profile, Duplicate, Share agent…, Leave shared chat · Copy conversation ID, Show full conversation, Show async tasks · Hide from sidebar, Delete ("Delete 3 agents" on a row picked with others) | bundle `fcn` | partly (no Move to) | part: all but Share agent… and Leave shared chat (sharing, slice 7) and the two staff-only items (§2.14) |
| Delete asks first, for one or several, agents or groups ("Delete 3 groups"; "…The Agents in them are not deleted"), "Deleting...", and a failure in the question | bundle `I3n`, `C3n` | partly (an agent's words only) | written (`AgentDeletion`, `MacConfirmSheet`) |
| Rename in the row: a double-click; Return keeps it, Esc lets it go, leaving it keeps it; empty or unchanged is not saved | bundle `yut` | partly (in Profile) | written (`MacRenameField`) |
| Hidden Agents (520 wide) with Unhide, "No hidden bots"; "All bots are hidden" with Show Hidden Agents | bundle `view-Cbx1-ckK.js` | yes (`HiddenAgentsSheet`) | written (`MacHiddenAgents`) |
| The compact rail (while the agent pane is open: butterflies only, open sections only, no drag or rename); ⌘B; the sidebar's width dragged | bundle `Mpn`, patch 717-719 | n/a | part: the rail while the pane is open; ⌘B and ⌃⌘S hide the sidebar |
| "Can't reach your computer" with Retry and Recover computer (a reset at once, no question, as the window's sidebar), "Retrying…", "Recovering…"; "Reconnecting to your computer…" with Retry over a list already shown | bundle `tpn`, `npn`, `COn` | partly ("No saved agents yet." only) | part (`MacSidebarConnection`): Retry asks for the box again and reads the agents; "Connecting to your computer…" is the boot screen's; not the 4 s retry of a refusal with a retry hint, "Your computer isn't set up" (access blocked), nor "Simeon is Paused" (box blocked) |

### 2.5 Search and the ⌘K palette

| What | Where | Phone | Mac |
|---|---|---|---|
| Tabs All, Messages, Agents, Groups, Files, Links, Routines, Actions; arrows between tabs; Current and Hidden badges; a result opens at its line | production `CommandPalette.tsx`, `command-palette-*-provider.ts` | yes (`SearchResults`, `Search.swift`) | written (⌘K) |
| Actions: Org Chart, Open Hidden Agents, Members, Channels, Chat Settings, Settings › General and Usage & Billing, Connect apps, Theme, Update Simeon's Computer, Join or New shared room | production `command-palette-root-commands.ts` | partly (New Agent, New Group Chat, Hidden Agents, Settings, Theme) | part: the phone's (New Agent and New Group Chat open the new chat; a routine opens its agent's Routines tab, as the window does), and Update Simeon's Computer last, in the palette and after "/", while the selected agent's computer has not said it is up to date (`UOn`) |

### 2.6 New agents and groups

| What | Where | Phone | Mac |
|---|---|---|---|
| The new chat (⌘N): a "To:" line to search or create agents ("Create “name”"), chips (six at most), ↑↓ Tab , Backspace Return Esc ⌘1–9; the one agent's chat behind it; several make a group named after them; a new agent introduces itself, or takes a name that reads like a request as its first message; "50 is the maximum" | bundle `L4n`, `Bie`, `J4n`, `HDn` | partly (New Agent and New Group Chat sheets) | written (`NewChat`, `MacNewChat`) |
| The 12 colours; the shape picker hidden | patch 1901-1938 | yes | written |
| Duplicate | production `agent-row-actions-model.ts` | yes | written |

### 2.7 The chat's header

| What | Where | Phone | Mac |
|---|---|---|---|
| Centred: the 52 pt butterfly (a group's stack), the name in a white glass pill; the avatar opens or closes the agent pane ("View agent settings"); Call beside the name; the working dot; no computer button (the patch took it out) | patch 2046-2094, 375-384, bundle `aSn` | yes (`ChatHeadline`, `ChatCallButton`) | written (the toolbar) |
| A shared room's badge and Manage shared room | recovered `agent-info/shared-room/trigger.tsx` | no | |
| A thread's header with its way back: the "Thread breadcrumb", the agent's butterfly and name (back to the chat, "Back to *name*") › the thread's name (the agent's details) | bundle `Thread breadcrumb` | yes (a sheet with the thread's name and Done) | written (in the toolbar) |

### 2.8 Messages

| What | Where | Phone | Mac |
|---|---|---|---|
| Bubbles: the agent's Messages grey, yours flat blue (#255a93, dark #1f5087), 18 pt corners, a lone emoji at 32 pt | patch 1983-2044 | yes | written |
| Markdown: headings, lists, task lists, quotes, rules, tables, strikethrough, code with colours and Copy code | recovered `transcript.tsx` | yes (`MessageText.swift`, `Markdown.swift`) | written |
| Mermaid diagrams, as the window draws them (bundle `mwn`, `ewn`): only a ```` ```mermaid ```` block and only once the message is written (the code while it streams); `strict`, the chat's light or dark theme, its font; "Couldn't render this diagram." over the code when Mermaid can't read it; "Open diagram full screen" (a click on it, or its button); the preview with no title on screen, "Close diagram preview", "Zoom out", "Zoom in", "Fit to screen", opening fitted (never past its own size), ×1.4 a step from the smaller of a tenth and the fit to eight, a double click fits or zooms in twice over, keys − _ + = 0 f F and Esc | bundle | yes (`Rendering.swift`, Mermaid 11.17.2) | written (pinch and drag are the Mac's own) |
| Maths (KaTeX 0.16.45) as the window's remark-math reads it (bundle `SYt`, checked by running its tokenizer in Node): a block opened by two or more `$` alone on a line and closed by a line of at least as many, ```` ```math ````, `\[` opening a line (to a `\]` line, or `\[ … \]` on one); within a line `$$…$$` (the closing run as long as the opening), `\(…\)` and `\[…\]`; a lone `$` stays a dollar; KaTeX strict first, then forgiving, else the source in red with the error as its tooltip; an "_" in `\text{…}` escaped when only that makes it draw (`JYt`) | bundle | yes (`Rendering.swift`, `Markdown.inlineMath`) | written |
| 75 brand names with their logo and colour; agent names with their butterfly | patch 1409-1536 | yes | written |
| @name chips in a group | ios `PARITY.md` §2 | no | |
| A lone link as a card (bundle `xEn`, `cGe`): an agent's finished message with no pictures, or your own (not from a channel, not between agents), that is exactly one `https:` address or `[words](address)` (the message's document decides when it has one); the site's icon (a globe), a bar while the page is read, its title (else the host), under it the host (the whole address when nothing could be read), its picture; the address on hover; no Copy. The page is read on this device by a port of the Electron app's reader (`LinkMetadata.swift`): `https` only, no private addresses or names, redirects checked (five), 8 s, 512 KB, `og:`/`twitter:`/`<title>`, the icon from the page or the same site's /favicon.ico, sign-in pages give no card, kept a day | bundle, main `attachments.ts`, host `attachments-service.ts` | yes (`LinkCard`) | written (the reader can't pin the address it checked, as Electron's does: URLSession connects by name) |
| Pictures attached to an agent's message, laid out by the window's own planner (`Ni`, ported as `GalleryPlan` and checked against it in Node): one row, at most 192 high and at least 64, 6 apart, each its own shape (4:3 unknown); all of them when they fit, else three or two with "+N" on the last ("Open the remaining N images full screen"), else the first; at most 86 % of the chat, 560 and the chat less 82; "Image unavailable", "Couldn't load image"; a click opens the whole gallery full screen at that picture; Electron's right click: Copy image, Save image… ("image.png"…), Copy image address | bundle, main `avatar-images.ts` | yes (`ImageGallery`, `GalleryPlan`) | written (full screen is Quick Look; then the message's menu) |
| A pull request's link opens in the review app | patch 172-174, 1570 | partly (Safari) | |
| The New divider, times after 15 minutes, older lines as you scroll up, "N new messages", a jump to a line with a glow | ios `PARITY.md` §2, §10 | yes | written |
| "Couldn't load conversation", "Couldn't load this conversation. Check your connection and try again.", Retry | bundle | yes (`ChatLoadFailed`) | written |
| The host's notices in the chat (`kind: "notice"`, shared rooms) | recovered `cards/notice/` | yes | written |
| "This message can't be shown in this version of Simeon" | recovered `transcript-card/resolver.ts` | yes | written |

### 2.9 A message's actions

| What | Where | Phone | Mac |
|---|---|---|---|
| The menu (bundle `cCn`): 👍 👎 ❤️ 😂 🎉 😮 and More emoji; Reply and Start a thread (not inside a thread); Copy for words and a picture (not for a link card or another card). More emoji is the window's picker: "Search emoji", every group under its name eight to a row, skin tones included, "Results" (96, the window's order) or "No emoji found", a pick reacts (again takes it back). A link card's and a picture's own items come first (Electron's: Open link, Copy link address; Copy image, Save image…, Copy image address) | bundle, main `avatar-images.ts` | yes (the emoji keyboard for more) | written (the window's hover toolbar holds the same actions; on the Mac they are the right-click menu, as in Messages) |
| Reactions under the bubble; yours toggle | | yes | written |
| Reply (bundle `BAe`, `Kvn`, `OAe`): the quote over a bubble (96) and the pill over the composer (72) as the window writes them: Markdown out, spaces run together, cut with "…", "(empty)", "Photo" with its picture, a file's name, a link's host, "(deleted)"; a click jumps to it ("Open reply thread" when it is in a thread); no quote over a reply to the thread's first message inside the thread; no hover preview on the quote (the window has none) | bundle | yes | written |
| Threads, as the window makes them from the chat's own lines (`N_n`, `x_n`): a reply whose thread's first message is loaded is counted under it, one whose first message isn't stays in the chat unless older lines may hold it; Start a thread (not inside one), "View thread" with "N replies" under the message, the thread (its first message and its replies), a reply sent in it stays in it (`isFork`); the thread's name as the window writes it (Markdown out, 40 characters, "Photo", a file's name, "Thread"); "N replies ›" under the message, "View thread ›" in its place under the pointer; Esc leaves the thread (the first Esc leaves the composer; not while find or a sheet is open) | bundle | yes (`Chat.threadSplit`, `ThreadSheet`) | written |
| Find in the chat (⌘F), as the window's (`f_n`, `d_n`, `h_n`): every time the words appear, capitals aside (accents count), in a message's words (not agents talking to each other), a question's prompt, an email draft's subject and body, a Slack draft's body, a notice; the newest chosen as you type; "3/12", "0/0" in red; Return and Shift-Return, ⌘G and ⇧⌘G; Previous match, Next match, Close find (Esc); inside a thread, the thread's lines | bundle `Find in chat` | no (no find on the phone) | written |
| Sending, as the window's queue: a message waits while the connection is down ("Will send when reconnected") or behind another of the chat's still on its way ("Waiting to send…"), with Cancel ("This message is already sending and can't be canceled."); down the moment the stream drops; only one held while down says when it was written (`composedAtMs` from `queuedAtMs`; the phone had said it of every message); "Sent while offline · *date*"; "Failed to send" with Resend and Delete; Cancel puts what was written (words, picks, files, the reply) back in its composer when that is empty, and "This message is already sending and can't be canceled." shows in the composer for six seconds | bundle `mKe`, `isTransportDown`, `Se` | yes | written |

### 2.10 The agent at work

| What | Where | Phone | Mac |
|---|---|---|---|
| The butterfly folding into dots, swaying, orbiting; what it is doing ("Searching the web", "Messaging X") and for how long, on hover | ios `PARITY.md` §3.9, §17 | yes (`TypingRow`, `ActivityLabel`) | written |
| "Theo and Iris are working…" | | yes (`GroupActivityLine`) | written |
| The spin's light trails in the agent's colours | patch 2602-2703 | yes (`LightTrails.swift`) | written |

### 2.11 The composer

| What | Where | Phone | Mac |
|---|---|---|---|
| The placeholder (`T9n`, `x9n`): "Message *name*" (a named group's too), "Message group" for a group with no name, "Ask anything, or drop a file."; "Reply…", "Reply to attachment…", "Reply to file…", "Reply to link…" while replying; "Add a message, or hit send." with files; "Listening…" while dictating | bundle | partly ("Message", "Reply") | written |
| +: Attach files; Teach a task (gate off) | bundle | yes (attach) | written (the file chooser) |
| Files dropped or pasted ("Drop files to add to chat") | recovered `composer.tsx` | no (the phone's + chooser) | written |
| Attachments staged, then sent with the message | `desktop/web/backend.ts` | yes | written |
| Dictation: "Listening…", "Transcribing…" | recovered `voice.tsx` | yes (Apple's dictation) | written (Apple's dictation) |
| "@" as the window's (`Q5n`, `j5n`, `cAe`, checked against the helper's run of the bundle's own functions): after a space, "(" or the start, names with one space at a time, 50 at most; in a group its members and "everyone" (two or more), in a one-to-one chat the other agents and the groups this one is in; routines; connectors ("Gmail (work@x.com)", "connected", "needs auth"…); each row its icon, name, line and tag ("Agent", "Group", "Routine", "Plugin"); the window's fuzzy score, the ones picked lately first among equals (20 kept); no limit; "No matches for “…”" and "Press Esc to close"; arrows wrap, Return or Tab picks, Esc puts it away there; a pick is one piece (a mention or a chip) in the message's document | bundle | yes | written |
| "/" (`u5n`): the skills whose name holds what was typed (with what each does), then the app's actions fuzzily (eight at most, three kept for actions); "No matches for "…"", "Nothing to reference yet"; an action deletes the "/…" and runs. "#" (`D_n`, `Iyn`): the pull requests the chat named, newest first (a reference in a message's document, a cloud agent's, GitHub and review.simeonlabs.com addresses), by number or title, eight. ":" (`lft`): the window's own emoji list (emojibase, 3,944 with skin tones), twelve, "\:id\:" and the name, the ones picked lately first (50 kept). The message's document (`richText`) as the editor writes it, sent with every message: one paragraph, line breaks as `hardBreak`, mentions, `workflowReference`, `prReference` | bundle | yes | part: of the app's actions, Open Hidden Agents, Members, Chat Settings, Settings: General, Plugins and the three Themes (Org Chart, shared rooms, Usage, Channels, updates and the computer's update wait for their slices); a cloud agent's pull request counts once its card has been read; link marks are not written into the document |
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
| A cloud agent (bundle `_$n`, `view-CizPQWLy.js`): three bars while first read; "Cloud agent", "Status unavailable" when nothing could be; the name (a link to the pull request, "Open the pull request"), Creating, Running, Done, Error, Expired; what it was asked; the branch with the pull request's mark by its state and "PR #N"; what it changed; View PR, Open; asked again every 5 s while it works, every 60 s after a failure with nothing read, never once it is done or the answer is empty | bundle | yes (`CloudAgentCard`) | written |
| Flights, and a flight's details | patch 882-1025 | yes (Muse's layout) | written |
| Agents talking: Messaged, Message from, N messages with, N agents ▾, the read-only exchange | ios `PARITY.md` §3.6 | yes | written |
| Routine lines | recovered `cards/timeline-event-automation.tsx` | yes | written |
| Name changed, channel connected or disconnected | recovered `cards/timeline-event.tsx` | yes | written |

### 2.13 Files

| What | Where | Phone | Mac |
|---|---|---|---|
| The file card: the real logos, name and extension, size; Save (an icon, "Save *name*" to VoiceOver, no tooltip) on an agent's file only; a picture's right click (Copy image, Save image…) then the message's; files dropped or pasted: six at most, 25 MB each (200 MB a video), not empty, a pasted picture named "image.png", the window's lines for five seconds ("Only 6 attachments allowed — 2 weren't added.", "\"x.pdf\" is too large to attach (max 25 MB).") | patch 1418-1435, 1652-1670, bundle `j9n`, `q9n` | partly (no Save button) | written |
| Pictures and videos in the chat, a gallery for several, audio played in place | recovered `views/attachment.tsx` | partly (pictures; video and audio in Quick Look) | part: pictures; the rest in Quick Look |
| The viewer: previous, next, arrows, Esc | recovered `media-viewer.tsx` | partly (Quick Look) | part: Quick Look |
| PDFs (pages, zoom) and spreadsheets (sheets, a cell's detail) | recovered `pdf-viewer.tsx`, `spreadsheet-viewer.tsx` | yes (Quick Look, which the Mac has too) | written (Quick Look) |

### 2.14 The agent pane (the inspector)

| What | Where | Phone | Mac |
|---|---|---|---|
| One page: the 96 pt avatar with its pencil, name, title; Profile · Routines · Computer as icons; 480 wide (280 at least), kept open across launches; the sidebar shrinks to its rail meanwhile and comes back; ✕ "Close details", Esc | patch 672-802, bundle `E3n`, `p3n` | yes (`AgentPageSheet`) | written (`MacAgentPane`, an inspector) |
| Profile: Name, Title, Description saved on leaving each (Return in a one-line field, Esc puts it back, an empty name goes back); no title for a group; the Notifications switch, not for a group | bundle `h3n`, `Uwe` | yes (`ProfileTab`) | written |
| The avatar editor: Agent (12 colours, the voice with play, Reset), Generate (⌘Return), Upload (drop, paste or Browse files; the 96 pt crop with zoom 1–5 and drag; a 256 PNG) | bundle `c3n` | partly (no crop, zoom, drag, drop or paste) | written (`MacAvatarEditor`, `AvatarCrop`) |
| Members, on a group's Computer tab: each opens its chat, Remove on hover asks first, Add Member (six at most), "Create more Agents to add them here." | bundle `z2n` | yes (`GroupMembers`) | written (`MacMembers`) |
| Channels: each agent's Discord and Slack bot: status, Connect, Disconnect, How to connect, Refresh, the token field | recovered `agent-info/channels/` | no | |
| A shared room: Invite people, Copy link, requests with Approve and Deny, people, your agents | recovered `agent-info/shared-room/` | no | |
| Async tasks: helpers, shells and cloud agents still running | recovered `agent-info/async-tasks/` | no | not built: in the shipped window only staff see it (`isStaffUser`), and no account is staff |
| Full conversation: You, Thinking, Agent, Message, each tool call with its details and result (a terminal's output) | recovered `conversation-outline-view.tsx`, `terminal/output/` | no | not built: staff only, as above |

### 2.15 Routines

| What | Where | Phone | Mac |
|---|---|---|---|
| The list (active first, "Paused", a spinner while one runs), New Routine, "Routines are recurring tasks this agent runs on a schedule." and Create Routine; kept fresh by the computer's `agents-automation` | bundle `K2n`, `G2n`, `V2n` | yes (`RoutinesTab`) | written (`MacRoutineList`) |
| The editor: Active, Delete (no question), Test run ("Running…"), Name, Instruction, When to run, Run history ("Just now", "Today at 9:05 AM", Succeeded or Failed); saved as it goes, a new one made once it has a name, an instruction and a trigger; "Couldn't save this routine." | bundle `_2n` | yes (`RoutineEditor`) | written (`MacRoutineEditor`) |
| Schedules: Every hour, Every day and Weekdays at 96 times, Every week, Every month, Interval, Advanced… (months, days, times or every so often between two hours), Custom (a cron line) | bundle `P2n`, `Ugn`, `$gn` | yes (`SchedulePicker`, fewer) | written (`RoutineSchedule`, `MacScheduleFields`) |
| Events: Slack (a channel; a message, mention, keyword or reaction), GitHub (repo, events, CI passed or failed, people, branch), Teams, Linear, Sentry, PagerDuty; eight per routine | bundle `Hgn`, `Wgn`, `tQ` | no | written (`TriggerRow`, `MacTriggerFields`) |

### 2.16 The computer

| What | Where | Phone | Mac |
|---|---|---|---|
| The status of each agent's computer: read under 15 s (a late answer still taken), kept once had (so "Can't reach…" shows only before the first), started when its window opens and again on Retry, the stream's return and the window coming forward (read again at most once a minute, not during a rebuild); 32 kept | bundle `TTn`, `NTn`, `qoe`, `SVn` | no (the phone asks `ensureForeverBox` every 3 s) | written (`ComputerBook`, `StoreComputer.swift`) |
| The Computer tab (`_bn`): "Needs your attention" with Skip this step and I'm done, continue (they answer and open nothing); the screen watched only, 1280 × 800 scaled, a spinner while it connects; "Booting up the computer", "Setting up the computer" N %, "Can't reach {name}'s screen" with Retry; the bare desktop icon when there is nothing to say; "Open" on hover, a click anywhere opens the computer; the agent's pointer from `computer-action`, gliding, pressing on a click; "{name}'s screen" under it; "Screen preview unavailable" after more than three crashes a minute apart | bundle `_bn`, `$1t`, `U1t`, `Abn`, `DAe` | partly (`ComputerTab`) | written (`MacComputerPreview`); not the window's three warm screens (switching agents connects again), and it keeps showing while the computer's window is open (the window's preview hides under its full view) |
| The full view (`bbn`): "{name}'s screen", always the person's to use (no Take over), the largest 16:10 that fits; "Switching to {name}'s screen…", "Can't reach…" with Retry, "Setting up the computer" N %, "This agent runs on your machine. There's no separate desktop to stream.", "Booting up the computer"; the hand-off's banner whose Skip this step and I'm done, continue answer, close it and go back to the message field; "Exit fullscreen"; closing hands nothing back | bundle `bbn`, `pbn`, `XOn` | partly (`ComputerSheet`: the phone's own layout) | written (`MacComputerWindow`), in a window of its own as §1 has it: so selecting another agent does not close it, as it closes the window's overlay |
| The strip of helpers' screens (running computer-use subagents, in the host's order, "Subagent" untitled): the others, up to four, else three and "and N more" with its menu "More screens"; "Switch to {title}"; the focused one's title under the stage; ↑← ↓→ between them, from the window or from inside the screen. Every helper shows the agent's own screen, as the window gives each the agent's address | bundle `MTn`, `CTn`, `fbn`, `mbn`, `wbn` | no | written (`MacHelperStrip`) |
| The clipboard both ways while the full view is open: the computer's copied text onto this Mac's (not what was just sent either way), this Mac's onto the computer's on a click in it, the window coming forward or the view opening, 0.2 s apart at most, pasted as noVNC pastes, no key pressed; ⌘A ⌘C ⌘V ⌘X ⌘Z (with ⇧) sent as Ctrl after letting go of ⌘, ⌥ and Super | `preload-vnc.ts`, `box-vnc-clipboard-paste.ts` | partly (by hand) | written (`ClipboardBridge`, the page in `Computer.swift`): the computer's text arrives as noVNC hears it, not by reading every 500 ms; this Mac's clipboard is read only when it changed since (the window sends it again each time, which changes nothing, and macOS 26 can ask the person at each read); the ⌘ keys are caught in the page, to check on a Mac that the Edit menu does not take them first, and whether macOS asks before the clipboard is read |
| The person's presence on the screen | `preload-vnc.ts` `installVncUserPresenceReporter` | no | not built: the window keeps it and nothing reads it |
| The hand-off card in the chat waits while the computer says that request is pending, with the screen as the agent saw it ("Take over the computer"); Skip's own line ("Cancel this request without doing the step; the agent continues without it"); Skip sends `dismissed`, and either button settles as "Done" (the host writes `completed` for both) | bundle `Obn`, `__simeonHandoffCard`, host `box-handoff-service.ts` | partly | written (shared with the phone; before the status is read, the line's own answer decides) |
| The rebuild lock: an update, a reset or a recovery asked for, the server's own (`box-migration`), or the image being pulled; "Reconnecting" after the stream is down 2.5 s with an agent selected; when it lets go (a second after the stream is back, or the computer ready again) | bundle `Kae`, `yft`, `e6n`, `H$n` | no | written (`RebuildLock`, checked against the bundle's own code on 2,080 random steps; `RebuildDriver`) |
| The update in the background: the pill at the top with its ring and its step ("Updating Simeon's Computer"); a click brings the dialog | bundle `h8n`, `A1t` | no | written (`MacRebuildBanner`) |
| The reset and the recovery in front: a dialog that cannot be closed, its steps (Getting ready, Wiping your data, Creating…, Starting…, Cleaning up, Reconnecting), the bar and its percent (never back), Continue in Background | bundle `d8n`, `J1t` | no | written (`MacRebuildDialog`) |
| The stream away: "Reconnecting", "Checking connection", "Simeon's computer restarting"; after 120 s "Couldn't Reach Simeon's Computer" (Retry only waits again; Recover Simeon's Computer asks "Recover Simeon's Computer?") and "Taking longer than expected" (Keep waiting, Continue in Background); "Update failed", "Reset failed", "Recover failed" with Dismiss and Retry | bundle `k8n`, `j8n`, `B$n` | no | written (`MacRebuildSurfaces`) |
| While a rebuild runs: sending waits, a failed message is not sent again, the agents' list holds still and is read again after, the window coming forward reads nothing | bundle `hve`, `GOn`, `gTe` | no | written |
| Update Simeon's Computer: "Update Simeon's Computer?" (Not now), "An agent is working" / "Update while agents are working?" (Cancel, Update anyway, Update when done); "Update when done" waits for no agent at work; the sidebar's Update and Queued pills; the refusals in red | bundle `K1t`, `FAe`, `Gbn`, `zAe`, `RAe`, `nTn` | no | written (`MacUpdateConfirmSheet`, `MacUpdatePill`). Our server always says the computer is up to date, so the entry goes once that is read and the pill never shows |
| Reset and recover (`ForceRecreateSandBox`), update (`RecreateSandBox`), and the server's steps (`WatchSandBoxMigration`: read again 3 s after it ends, from where it stopped; a silent stream dropped after 30 s, twenty times) | main `box-recovery.ts`, `box-migration-watcher.ts`, `box-host-connector.ts` | no | written (`MigrationRelay`, `LiveBackend`). On our server Reset and Recover wipe the computer's files, though the Recover words say they are kept (as in the Electron app) |
| "Computer is low on disk space" (or critically) under the toolbar, "Disk Saver is auditing usage…", Go to Disk Saver ("Opening Disk Saver…"): opens the Disk Saver agent, or makes one; the automatic Disk Saver once each time the disk runs low (`requestDiskSaverAudit`, or a new Disk Saver, not opened) | bundle `D8n`, `z8n`, `$8n` | no | written (`MacDiskBanner`, `StoreRebuild.swift`) |
| Teach a task: Start recording, Stop & save, Discard | bundle `gbn`, `ybn`; gate `sand_teach_by_demonstration` | no | not built: the gate is off in what ships |

### 2.17 Calls

| What | Where | Phone | Mac |
|---|---|---|---|
| Start from the name or Agent › Call *name*; one call at a time | patch 375-384, main `application-menu.ts` | yes (the button) | written: the toolbar's Call and Agent › Call *name* ("Call Agent", greyed, with no agent open; neither while `SIMEON_VOICE_CALLS` switches calls off); during a call both bring its banner forward (`MacCallBanner.call`) |
| The call: the rings, the avatar, the name, what the agent is doing ("Calling…", "Using Gmail…"), the waveform, Mute, Transcript, End; "Call ended · m:ss" with the hang-up; "Couldn't connect", "Calls aren't switched on yet" (503), "Out of credit for calls" (402) | `desktop/source/voice-call/` | yes (the phone's call screen; a floating banner on the Mac, §6) | written (`MacCallBanner`, `CallBanner` in the core): the banner's look for each moment (`data-state`), its status line, the 46-bar waveform, the transcript in the chat's bubbles ("What you both say shows up here."), Mute or Unmute, Transcript, End, the red hang-up while it rings, Close on a failure; the rings and hang-up at the Mac banner's loudness |
| "Voice chat · 01:49" in the chat, opening the call | patch 403-457 | yes | written |
| The older "Voice call · m:ss" record with its recap | patch 396-402 | yes (`CallRecordRow`) | written (`CallRecordRow`, `CallRecord`): in the agent's bubble, the phone in its circle, "Voice call" and the length; a click opens the recap |

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
| | `getAgentTranscriptWindow`, `getAgentThread` (the window sends neither: it counts and makes threads from the lines it has) | n/a | n/a |
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
| | `sidebarSections` | no | written |
| | The other fields: `agentDefaultModel`, `computerUseModel`, `localToolPermission`, `webauthnProxyEnabled`, the connector stores, `featureFlagOverrides` | no | |
| Secrets | `setBoxSecrets`, `getBoxSecretsStatus` | no | |
| Files | `uploadAttachment`, `readAttachmentImage`, `readAttachmentChunk` | yes | written |
| | `readAttachmentText` | no | |
| Calls | `voiceCall` | yes | written |
| The computer | `ensureForeverBox`, `handBackForeverBox`, `getForeverBoxStatus`, `getSubagents`, `requestDiskSaverAudit` | yes (the first two) | written |
| | `getCloudAgentInfo` | yes | written |
| | `updateForeverBox` (the Mac's dev fallback only), `getHostStatus` (the Electron app's own idle check), `isEgressTunnelAvailable` | no | |
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
| `subagents` | an agent's helpers (their screens) | no | written |
| `async-tasks` | work an agent handed off | no | |
| `agents-automation` | an agent's routines | no | written |
| `workflows`, `memory`, `sharing` | changes to those | no | |
| `forever-box`, `box-disk-pressure`, `computer-action` | the computer's state, its disk, what the agent does on it | no | written |
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
| Thumbs on a finished call (`/voice/calls/{id}/feedback`); the window draws none today | `voiceCall.rateCall` | no | not built: the shipped window draws no thumbs, so neither does the Mac |
| The call as a floating banner (360 pt, top right under the menu bar, every Space, no focus taken; leaves 1.2 s after the end, a failure stays 20 s) | `desktop/source/voice-call/`, main `voice/voice-call-window.ts` | no (a full screen on the phone) | written (`MacCallBanner`): an `NSPanel` that never takes the keys, on every Space, at the top right of the screen under the pointer; it grows with the transcript (40 to 480 pt) from its top; a click works without bringing Simeon forward and makes it key, as the Electron panel is, so the transcript can be selected; it opens and closes with the call whichever windows are open. To check on a Mac: that the pointer over it keeps a failure up while another app is in front |
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
| **The computer**: reset it, update it keeping its data, the move's progress (backing up, creating, moving, cleaning up, done, failed) | `foreverBox.forceRecreate`, `update`, `getBoxMigrationStatus`, main `box/box-recovery.ts` | no | written (§2.16) |
| The computer panel: clipboard both ways (every 500 ms while visible), ⌘A/C/V/X/Z sent as Ctrl, the person's presence, arrow keys | `desktop/source/electron-preload/preload-vnc.ts` | partly (`Computer.swift`: its own clipboard and keys, no presence) | written (§2.16; presence not built, nothing reads it) |
| "The computer's screen isn't connecting." with the last reason after 20 s of spinner, "The computer's status could not be read." under "Can't reach…" at once, each with "Details:" and the log's place; the log at `~/Library/Application Support/Simeon/computer-stream.log`, emptied at each launch | `computer-stream-notice.ts`, `shared/computer-stream.ts`, main `vnc/computer-stream-log.ts` | no | written (`ComputerStreamLog`, `ComputerStreamReason`): the app's own noVNC writes the lines the box's page would (`[SimeonScreen] state=…`), so the same reasons come out; the network token is left out of the lines |
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
| Logs a person can send: `computer-stream.log`, `voice-call.log`, `~/.simeon/vendor-mcp-signin.log` | main | partly (`HangWatch.swift`) | part: `computer-stream.log` (`ComputerStreamLog`) and `voice-call.log` (`VoiceCallLog`: the same lines as the Electron service, "call started for agent …", "connect: token issued …", "connected: conversation …", "call ended: 43s", appended with their time in `~/Library/Application Support/Simeon`) |

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
   the voice, Routines with events, notifications, members), the new chat
   with "To:", the row menus, sections and Move to, several rows at once,
   rename in the row, the first run's boot screen and name sheet. Written.
   Full conversation and async tasks are not built: the shipped window
   shows them to staff only, and no account is staff.
4. **The computer.** The Computer tab and its own window, the clipboard
   by itself and the ⌘ keys, presence, the helpers' strip, reset and
   update with the rebuild banner, low disk, the "Can't reach…" notice.
   Written. Presence is not built (nothing in the window reads it), nor
   teaching (its gate is off), nor the telemetry the window sends.
5. **Calls.** The floating banner, Agent › Call, the rings and hang-up,
   the voice picker, thumbs. Written. The voice picker is slice 3's (the
   agent's avatar editor). Thumbs are not built: the shipped window draws
   none. "Call again" and "Open chat" are not built: the service answers
   them, but the shipped banner has no button for either.
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
