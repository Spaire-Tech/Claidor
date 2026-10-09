# The iPhone app against the Mac: every gap

On the night of 8 October 2026 the founder ran the native app on his iPhone against his
real account and sent five screenshots. His verdict: the chat "is a
complete lie in terms of design". Nothing the Mac offers came across: the
connector logos, the pickers, the coloured connector names. The call button
does not appear. The avatar is a different one. The computer view is fake.
Settings has almost nothing, with no button for connectors.

He is right. The first version ported the plumbing faithfully: sign-in, the
cloud computer, chats updating live. It drew the chat contents from memory
of the review link's screenshots instead of porting each piece from the
Mac's code.

These notes are the Mac's own behaviour, read from its code. Each item says
what the Mac does, where that lives, and what the phone does now. Fixes go
one step at a time, in the order the founder picks.

## Where each gap stands (8 October 2026, after the fixes)

Everything below was ported from the Mac's own code and measured against
the phone design. None of the screens has been compiled yet (see
`README.md`, "What has and has not been checked").

| Gap (section) | Now |
|---|---|
| Flight card (§1, §3.3) | In Muse's layout since 9 October (§22): the route and date, rows with the airline's round logo, "airline · price" and the times on a dashed line; a row opens the flight (total, a card per flight, the fare's terms). |
| Brand names in text (§2) | All 75 names, anywhere in a message, with their logos and the readable light and dark colours. |
| Agent names in text (§2) | The agent's butterfly before the name, in the Mac's colours. |
| Question card (§3.1) | Rings, help text, "Type your own answer" with Submit, the X; answered and dismissed states. |
| "N messages with" (§3.6) | The Mac's wording ("Messaged", "Message from", "N messages with", "N agents"); a tap opens the exchange read-only. |
| Call button and calls (§1, §6) | The call button by the name; real calls through ElevenLabs' iPhone kit and the Mac's call protocol. Needs a device to try. |
| The top bar (§1) | Solid, as the Mac's. |
| The butterfly (§4) | The window's smoothed outline, size and gradient; group avatars in the Mac's layouts; the default colour by the id's hash. |
| Its motion (§4) | The Mac's engine: idle sway, the lean and bob of working, the swing of searching, spins with the outline turning, the fold into three dots while thinking, the orbit while waiting, the dot flying off while messaging. A list row and the header move only while the agent works. Not drawn: the spin's light trails. The bubbles' small avatars hold still (on the Mac they sway by under a point). |
| The agent at work (§3.9) | Its butterfly at 28 pt folding into the dots (one-to-one), or a member's at 22 pt beside what the group is doing. |
| Markdown (§2) | Headings, lists (disc, circle, square; 1., a., i.), task lists, quotes, rules, tables that scroll, inline code, code blocks with Copy, links. |
| New divider, reactions (§2) | Both. |
| A message's menu (§2) | The window's reaction row (👍 👎 ❤️ 😂 🎉 😮), Reply and Copy. Reply puts the quoted line over the composer and sends `replyToId`; the sent bubble carries its quote, and a tap on it goes to the message it answers. Not on the phone: "More emoji" and "Start a thread". |
| A message's time (§2) | A sideways drag pulls your bubbles left, up to 82 pt, and shows each message's time ("9:41 AM"); it springs back on release. |
| Connectors card (§3.2) | Logo, name, reason, Add, the sign-in sheet, "Waiting for X authorization…", ✓ Added. Not yet: the Team badge, "N tools · Used by N teammates", Manage and Retry, Reopen, account pills, "Add another account", suggestion chips. |
| Connect Slack / GitHub (§3.2) | The card, Connect opening the linking page, "Slack connected" once linked. |
| Email and Slack drafts (§3.4) | Editable To, Subject and Body, Show more, Send and Discard, the states. |
| Files (§3.5) | The real file icons, images and videos inline, a tap opens the preview. |
| Voice call line (§3.7) | "Voice chat · 01:11"; a tap opens the call's lines. |
| Routines line (§3.8) | "Created routine", folded runs, a tap opens the routine. |
| Approvals, secrets, the computer hand-back (§3.10) | Allow once / Always allow / Deny; the password field and Save securely; Take over / I'm done / Skip. |
| Settings (§5) | Account, Theme, Timezone, Auto-review with its rules, Connect apps, Usage & Billing with Manage Billing. |
| Connect apps (§5) | Marketplace and Yours, Add with the sign-in sheet; an app's page with its accounts (sign in, rename, remove) and its tools, each with a switch. Not yet: Setup values and Details. |
| The agent's page (§7) | Profile saved on leaving a field, Notifications, the avatar editor (Agent with the voice picker, Generate, Upload), the routine editor with every schedule, Test run, Delete and runs, group members. Upload and Generate keep the picture's middle square rather than offering a crop. |
| The computer (§8) | Each agent's own screen, live. |
| Notifications, the +, the mic (§9) | Straight from Apple (the server needs the APNs key), photos and files uploaded to the agent's computer, the phone's own dictation. |
| New Agent, New Group Chat | Measured against the phone sheets. |
| Search | Apple's search field with the window's tabs (All, Agents, Groups, Actions). |
| The list's menu (§10) | A long press gives the Mac's row menu in its order and sections: Pin or Unpin, Mark as Read or Unread; Edit Profile, Duplicate (agents only); Copy conversation ID; Hide from sidebar, Delete. Delete asks first, in the Mac's words. |
| Pins (§10) | Pinned agents sit in a grid above the rows, as the Mac's tiles zoomed ×1.2. Pins are the host's `pinnedAgentIds`, so the Mac and the phone share them. Drag a tile onto another to reorder. |
| Hidden agents (§10) | "Hidden Agents N" at the end of the list, and in the + menu. It opens the hidden ones, each with Unhide; a tap opens its chat. |
| Status dots (§10) | Orange when an agent waits on you ("Needs attention"), blue when unread, green at the butterfly while it works. |
| Sending (§10) | Your message shows the moment you send it. If it doesn't reach the agent, it says "Failed to send" under it, with Resend and Delete. |
| The chat's motion (§10) | New lines come in with the Mac's rise (240 ms, 12 pt, from 94 %). Older lines load as you near the top. "N new messages" pills show for a "New" line out of sight above, and for what arrives below while you read further up. A quote's jump lights the message. |
| The composer (§10) | Send and the mic cross over in 200 ms. It grows a line at a time with the Mac's spring. "Reply…" shows while replying. "@" offers the agents' names. |

Still missing on the phone:
- The welcome steps of a new account. A new account on the phone opens
  on an empty list.
- Threads ("Start a thread" and the thread view).
- In the composer: "/" for skills, "#" for pull requests, ":" for emoji,
  and "More emoji" in a message's menu.
- Sections in the list ("Move to") and selecting several rows at once.

---

Sources. "patch" is `desktop/scripts/lib/router-renderer-patch.mjs` (our
changes to the Mac window). "bundle" is the built window in
`clients/apps/web/public/app/assets/` (`index-UbX-y3il.js`, the Settings
chunk `index-BlqerJhg.js`, and the card views `view-*.js`). "host" is
`desktop/source/host/` (the agents' side, in the cloud computer).

---

## 1. Seen on the phone (the founder's screenshots)

| What | The Mac | The phone now |
|---|---|---|
| Flight card | A whole message that is exactly a ```` ```simeon-flights ```` block becomes a card: title, subtitle, up to 8 rows (airline circle, times, "airline · duration · stops", layover, price, chevron). Tapping a row opens the details (price, each leg, fare rules). See patch 882-1020. | The raw JSON, in a monospace font. |
| Brand names in text | 75 names ("Stripe", "Gmail", "Linear"…), matched anywhere in a message, not only in bold. Each gets its logo and colour. See §2. | Coloured only when bold, no logo, 8 brands. "Stripe" in plain text shows nothing. |
| Agent names in text | The agent's small butterfly before the name, coloured by its palette. See §2. | The name is coloured; no butterfly; the colours are mine, not the Mac's. |
| Question card | Grey card, an 18 pt radio ring per row, "Type your own answer" with a Submit button, and an X to dismiss. Once answered, a single row with a blue check and the answer. See §3.1. | Every option greyed out, and a custom answer appended as plain text. No X, no Submit. |
| "N messages with" | "Messaged [chip]", "Message from [chip]", "N messages with [chip]", "N agents ▾" menu. A tap opens a read-only view of the two agents' exchange (avatars ⇄ avatars, bubbles). See §3.6. | "1 messages with" (wrong grammar). A tap opens a grey box with "To Leo" labels. |
| Call button | The phone icon next to the name, when calls are available. | Missing: real calls were never connected (`LiveBackend.call` is nil). See §6. |
| The top bar | A solid top: name and buttons over the page's own colour. | Messages slide under the back button, the butterfly and the name pill, and show through them. |
| The butterfly | The window's mark. See §4. | The call banner's simpler copy: straight-edged outline, about 13% smaller, gradient at the wrong angle. |

## 2. Message text

Bubble (bundle `_o={message:`; patch 1716, 1804):

| Property | Value |
|---|---|
| Width | Up to the smallest of 88%, 640 pt, and the screen minus 82 pt |
| Padding | 10 × 15 |
| Corner radius | 18; 6 on the side that touches the next bubble in a run |
| Agent bubble | `#e9e9eb` with text `#1d1d1f` light; `#262626` with `#fcfcfc` dark |
| Shadow (light) | `0 0 0 .5px rgba(20,30,60,.07), 0 1px 2px rgba(20,30,60,.04)` |
| Your bubble | `#255a93` light, `#1f5087` dark, white text |
| A lone emoji | No bubble, 32 pt |

**Brand names** (patch 1409-1474, 1545, 1581-1643):
- The list is the 72 entries in `desktop/brand/app-logos/apps.json`, plus "Microsoft Word / Excel / PowerPoint / Outlook" and "Google Calendar": 75 names.
- Matching is case-sensitive, longest name first, never inside links or code, and needs a word boundary on both sides.
- Drawing: a logo 1.05em square, then the name at weight 500 in the brand's colour.
- Colour logos are drawn as they are. One-colour logos (`si-<key>.svg`) are filled with the name's colour.
- Brand colours are darkened until readable on the light grey, or lightened until readable on `#262626`. The table of every brand's light and dark value is in the appendix at the end of this file; port it as data.
- The logos are files in `desktop/brand/app-logos/`. They go into the app's asset catalogue.

**Agent names** (patch 1476-1536):
- Every agent in the roster is matched, except the person's own name and names shorter than 2 characters.
- Drawing: the agent's butterfly, 1.44em × 1.05em and cropped to `3 30 223 163`, then the name at weight 500.
- The colour is the palette's top stop, made readable. These are the Mac's values (light / dark):

| Palette | Light | Dark |
|---|---|---|
| yellow | #7d7dd3 | #8b8bea |
| cyan | #2f6f72 | #6d9a9c |
| violet | #5d90a8 | #7cc0e0 |
| red | #bf7359 | #ff9a76 |
| green | #6f8f4f | #7d9a61 |
| brown | #877c6c | #f6e2c4 |
| magenta | #be688f | #e07aa8 |
| blue | #1f3b73 | #8493b2 |
| gray | #a07d81 | #f6c1c7 |
| black | #77859c | #8c9db8 |
| orange | #997d64 | #ffd1a6 |
| mint | #69847c | #bff0e2 |

- In group chats, `@name` chips: a 16 pt avatar and the name on a tinted background.

**Markdown** (bundle `const kPn=`, `NPn={a(`) is GitHub-flavoured:
- Headings (22, 17, 14 pt, weight 600).
- Lists: bullets go disc, circle, square; numbers go 1., a., i.
- Task lists, quotes, rules, tables (scrolling sideways), bold at weight 600, strikethrough.
- Inline code: red text on a grey tint.
- Code blocks: grey, with a Copy button and syntax colours.
- Links: `#0c64c1` light / `#459ffe` dark, opened outside the app.
- The phone only reads bold and italics.

**Also on the Mac:**
- A "New" divider (blue lines and the word "New").
- Reaction pills, 22 pt, under the bubble.
- A message's own time, revealed by a sideways swipe.
- In each message's menu: the reaction row, Reply, Start a thread and Copy.
  (There is no Delete: only a send that failed can be deleted, from the
  window's own outbox.)

## 3. Cards

Every card uses the Messages grey `#e9e9eb` (light), with no border. Buttons use the chat blue `#255a93` (patch 1716, 1795-1849). A card type the window doesn't know shows "This message can't be shown in this version of Simeon". The phone drops it silently.

1. **Question** (`widget`; `view-CIFdOvCz.js`)
   - Live: prompt, help text, and an X at the top right that sends `dismissWidget {entryId, agentId}`. Each option is a full-width row with an 18 pt ring and an optional description, rows separated by hairlines. When `allowCustom` is set, "Type your own answer" with a Submit button.
   - Answering sends `respondToWidget {entryId, value, agentId}`. The card shows the answer at once and rolls back if the host refuses.
   - Answered: one row with a blue check and the answer.
   - Dismissed: the prompt muted, plus a pill with a grey dot and "Dismissed".
2. **Connectors** (`connector`, `connectors`; `connector-card-BOH-l7tH.js`)
   - Logo 40 pt, name, a "Team" badge, the reason, and "N tools · Used by N teammates".
   - Button: Authorize, Add, Manage or Retry. Once connected, "✓ Added". While signing in, "Waiting for X authorization…" with Reopen.
   - Several accounts: account pills and "Add another account".
   - Up to 4 suggestion chips and "Browse more →".
   - Connecting: `desktopMcp {action:"authenticateServer", args:[serverId, accountKey, "connector_card"]}` returns a URL. The URL opens in the system sign-in sheet. The page comes back to `/app/connected.html`, which calls `completeMcpOAuth {stateId, code}`. The `mcp-auth` event then refreshes the card.
   - A `listener-connect` card ("Connect Slack so this routine can fire.") uses `getListenerConnectUrl {platform}`.
   - The phone shows a static line.
3. **Flights**: see §1. There is no Book button: booking isn't available.
4. **Email and Slack drafts** (`email-draft`, `slack-draft`; `view-ClhdNXKM.js`, `view-DyaeCHiE.js`)
   - Email: "New email" with a status pill. From is read-only; To, Subject and Body can be edited. A long body shows "Show more".
   - Send email (enabled only when the addresses are valid) sends `sendDraft {agentId, entryId, draft}`. Discard sends `discardDraft`.
   - States: "Ready to send", "Sending…", then "Sent to … — "subject"".
   - The Slack card has the same states, with only the body editable.
   - **The phone drops these cards: a draft never appears.**
5. **Files** (`attachment`, `user-attachment`)
   - A 36 pt icon: the real Word, Excel, PowerPoint and PDF artwork (`desktop/brand/file-icons/`). Name split into base and extension, the size, and a save button. Audio files play inline.
   - Images and videos are drawn inline, as a gallery when there are several.
   - Tapping opens a preview: image, PDF, text, table, audio.
   - Reading the file: `readAttachmentImage {path}`, `readAttachmentText {path}`, or `readAttachmentChunk {path, offset, length}` in 4 MiB chunks.
   - The phone draws SF Symbol tiles and doesn't open anything.
6. **Agents talking to each other**: see §1.
7. **Voice call line**: "Voice chat · now" while live, "Voice chat · 01:11" after. A tap opens the call's lines as bubbles (yours blue on the right, the agent's grey on the left). The phone shows the lines plainly under the line.
8. **Routines**: "Created routine [⏰ chip]". Several in a row fold into "Created routines A and B" or "N routines ▾". A tap opens the routine. Other lines: "Renamed to X", "Connected to X".
9. **The agent at work**
   - One-to-one chat: a bubble holding the agent's animated butterfly. The animation follows what the agent is doing: dots while thinking, sway while working, orbit while waiting.
   - Groups: a text line, such as "Searching the web", "Connecting to Linear" or "Messaging Scout".
   - The header: a pulsing dot.
   - Steps such as "Checking Linear" appear only in the Full conversation panel, not in the chat.
10. **Approvals and requests** (none of these exist on the phone)
    - Auto-review approval: Allow once, Always allow, Deny. Sends `resolveAutoReviewApproval`.
    - Secret request: a password field and "Save securely". Sends `submitSecret`.
    - "Your turn on the computer": Take over, I'm done, Skip. I'm done sends `handBackForeverBox`.
    - Local tool permission: Mac-only.
    - Spend guard: a question card.

## 4. The butterfly

Patch 2574-2710; bundle mark engine `$_t`, still renderer `rOt`.
- **Outline.** The 200 points are joined into a smooth curve (Catmull-Rom), not straight lines. The outline is then moved down 2.98 and scaled ×1.0389. The whole mark is drawn ×1.131, so the wings fill the avatar's full width and 72% of its height. The phone fills about 85% of the width with a straight-edged outline.
- **Gradient.** Three stops (top, mid at 0.55, bottom) on the vector (0,0)→(0.15,1), measured in the wings' own box. The bands run at about 6°; the phone's run at about 12°.
- **No lighting.** There are no highlights or shading. The grain filter blends with 50% grey, so it changes nothing; leave it out.
- **Still marks** (group members, image-only marks) use a straight vertical gradient.
- **Animations**, moved by springs stepped 120 times a second:
  - idle sway (only some places move at rest);
  - working: bob and lean;
  - searching: swing;
  - a full turn every few seconds. The outline narrows as it turns, and light trails in the agent's colours follow;
  - the morph into an orb with three dots while thinking (a wave runs across the dots every 1.4 s);
  - an orbit of five dots while waiting.
  - In the list, a row's butterfly moves only while that agent is working.
- **Group avatars**
  - List: 2 members at ⅔ size; 3 members at 5/9 size, placed at (2/9, 0), (0, 4/9) and (4/9, 4/9); each member cut out by the next one's butterfly outline.
  - Chat header: members side by side at 20 pt steps of 12.5, the stack drawn ×2.6.
  - The phone uses its own numbers.
- **Colour when an agent has none:** a hash of its id picks one of the first 10 palettes. The phone uses Ocean.

## 5. Settings (bundle `index-BlqerJhg.js`; web: `desktop/web/backend.ts`)

General has four sections. Usage & Billing is shown when the usage summary loads.

| Row | How it works | Can the phone have it? |
|---|---|---|
| Account | Picture or initials, name, email, copy | Yes (`user/profile`) |
| Theme | Follow System / Light / Dark | Yes (the phone's own) |
| Timezone | "Auto-detect (zone)", plus every zone with its current time | Yes: `setHostSettings {userTimeZone, userTimeZoneOverride}`. The web never sends it: a bug there. |
| Execution on Local Computer | Ask / Always / Never | No, Mac only |
| Auto-review | A switch, a rules table, and an add-rule box ("When Simeon wants to:" / "It should: Allow automatically / Ask first") | Yes: `getHostSettings` / `setHostSettings {autoReviewInstructions}`. Caveat: the Mac pushes its own copy back to the box on every reconnect. |
| Security Key | — | No, Mac only |
| Connect apps (phone row) | Opens the Plugins screen | Yes, see below |
| Usage & Billing | Weekly usage bar, on-demand dollars, "Get more usage", Manage Plan (Upgrade, "Manage Billing ↗") | Yes: `GET /desktop/api/user/quota`, `POST /desktop/api/billing/portal` |

**Connect apps (the Plugins screen):**
- Search, Marketplace and Yours tabs, filters.
- Each connector has a logo, a description and an Add button.
- A connector's page shows Accounts (add, rename, remove), Tools (turn each on or off), Setup values and Details.
- The catalogue is 79 connectors (`shared/node/vendor-mcp/catalog.ts`), with logos in `vendor-mcp/logo-data.ts`.
- Everything goes through the gateway's `desktopMcp {action, args}`: `listServers`, `getCatalog`, `installEntry`, `authenticateServer`, `removeServer`, `renameAccount`, `removeAccount`, `listServerTools`, `toggleMcpToolDisabled`.
- Sign-in comes back through `completeMcpOAuth`, and the `mcp-auth` event refreshes the screen.

The phone has Account, Theme, a read-only time zone, Sign Out and the butterfly.

## 6. Calls (no server change needed)

- **Server.** `POST /desktop/api/proxy/v1/voice/calls` returns `{token, conversation_id, agent_id}`. `…/voice/calls/{id}/end {seconds}` returns the summary and transcript. `GET …/voice/voices` lists the voices. All three take the phone's existing sign-in.
- **Voice.** ElevenLabs' iPhone kit (WebRTC) is started with that token. It gets the same overrides the Mac sends (`shared/voice-call/voice-call-prompt.ts`) and the two client tools, `send_task` and `recall_text_messages`.
- **The agent's side.** `voiceCall {agentId, callId, kind:"open"|"request"|"outbox"|"ended", …}` through the gateway. The phone polls the outbox every 1.2 s for the agent's answers.
- **The app needs** microphone permission, an audio session set up for voice chat, and background audio so the call survives a locked screen.
- **Banner states:**
  - Calling…
  - The timer and a 46-bar waveform.
  - The agent's work label while it works.
  - "Call ended · m:ss".
  - Failures: "Calls aren't switched on yet" (503), "Out of credit for calls" (402), "Simeon can't use the microphone".

## 7. The agent's page

**Profile:**
- Name, Title and Description, each saved on leaving the field with `updateAgent {id, profile:{name, description, title}}` (always send name and description). Title and Description are read-only for the Chief of Staff.
- Notifications switch: `setAgentNotifyOnUpdates {id, isEnabled}`. The phone's switch isn't wired.

**Avatar editor (the pencil):**
- Agent tab: the 12 colours and a voice picker with a sample button.
- Generate tab: describe it, then `POST /desktop/api/proxy/v1/images/generations`.
- Upload tab: crop. Saves with `setAgentAvatarBytes {id, pngBase64}`.

**Routines:**
- The list shows each routine's name with `triggerDescription`, or "Paused", and a clock, spinner or pause icon.
- The editor:
  - Active switch: `setAgentAutomationEnabled`.
  - Delete: `deleteAgentAutomation`.
  - Test run: `runAgentAutomationNow`.
  - Name, Instruction, and "When to run" (the schedule picker: every hour, every day at a time, weekdays, every week, every month, an interval, or custom cron).
  - Run history.
- A routine saves itself, without a Save button: `createAgentAutomation {id, spec}`, then `updateAgentAutomation`.
- The phone shows the list read-only, and shows `schedule` instead of `triggerDescription`.

**Computer:** see §8.

**For a group:** the member editor, `setGroupMembers`.

## 8. The computer

- **Each agent has its own screen.** `ensureForeverBox {id}` through the gateway returns a loopback noVNC address for that agent's window. It is turned into the proxy address on port 6081, with `token=N` and the `network_token`.
- **Every request needs that token** (a query parameter, or the `x-anyrun-network-token` header). Cookies are stripped.
- **A plain web view can't show it,** because noVNC's own files load without the token and are refused. This probably breaks the web window today too; check it.
- **Recommended for the phone:** bundle noVNC's `rfb.js` and connect straight to the WebSocket at `wss://…/p/6081/websockify?token=N&network_token=T&resume_lower_s=900&resume_upper_s=18000`, scaled to fit, view-only in the small preview.
- **The screen** is 1280 × 800. Close the connection when the view is hidden. Show "Starting" while `vncUrl` is null.
- The phone shows a blue placeholder.

## 9. Already known missing (ios/README.md)

- **Notifications:** the server sends through Expo, so it needs a path straight to Apple.
- **The composer's + (attachments):** needs `uploadAttachment`.
- **The mic:** needs dictation.
- **Brand logos:** see §2.

## 10. The founder's list (8 October 2026, evening)

He listed five problems after using the app on his iPhone, and one
complaint over all of them: the Mac's logic was left out.

| His words | Cause, from the code | Now |
|---|---|---|
| "the buttons are not responsive at all … sometimes it works other time i have to double click" | Most round buttons took a tap only on the icon itself. The back disc (46 pt) answered on its 19 pt chevron, and the call button (26 pt) on its 11 pt glyph. Several buttons showed nothing until the box answered, so a second tap undid the first: tool switches, reactions, Send on a draft, the approvals. A grey button looked the same pressed, disabled or not. | Every button takes the tap on its whole shape. Buttons that call the box wait and show it. Reactions and switches hold until the box answers. The grey button dims when pressed and fades when disabled. The strip under the chat's header lets taps through to the messages. |
| "the flight cards dont show the airlines logo" | Duffel's logos are SVG, which iOS can't draw by itself. | Fixed earlier the same day: drawn once, kept. |
| "the app is slow … i click to add a connector … then wait" | Cancel on a sign-in sheet held every Add button for about 20 seconds. Add read the apps list again first. A sign-in the box couldn't start said nothing. Several reads of the apps list raced, and an old answer turned Added back into Add. Every butterfly drew 120 times a second on the main thread. A streamed answer laid the whole chat out again every 90 ms. A failed call that had already reached the box was sent a second time. | Cancel frees the buttons after two checks. Add doesn't re-read the list (the box's events keep it current). Each sign-in that can't start says why. The apps list is read once at a time. Butterflies draw at most 60 times a second (30 at rest). A streamed answer redraws only its own row. A call is sent again only when it surely never arrived. Replies are parsed by Foundation's parser. |
| "the ai i asked a question, i dont see the answer" | The host streams lines only for the chat it has open. | Fixed earlier the same day: opening a chat opens it on the host, and a missed line fetches the chat again. |
| "a link message appears [like this](https://…)" | The list showed the last line's raw Markdown. | Fixed earlier the same day: the Mac's own preview line. |
| "no pin, no holding the chat and having the option to archive, delete etc." | Not built. | The Mac's row menu, pins, hidden agents, Delete with its question, the status dots, and swipes (above). The Mac has no Archive: "Hide from sidebar" is its way to put a chat away, and it's on the menu. |
| "no smoothness, especially with how static the composer is" | Not built. | The Mac's motion in the chat and the composer (above). |

After he ran it (the same evening: "it lags terrible … you click a chat, and
it freeze. nothing appears. cant go back"), measured on Linux: the app's own
work is not it (a 500-line chat is laid out in about 11 ms, optimised or
not). The cause is in the drawing, so the chat now draws its newest 60 rows
and more as you scroll up (it drew every message above the newest before
showing any), a row is drawn again only when it changed, the cards' and the
composer's shadows are cast by their shape and not their text, an empty chat shows a spinner while its lines
come, and a hang watch writes to Xcode's console what the app was doing
whenever the screen stands still.

Then Ava's chat froze for good as it opened ("the screen has stood still 90 s,
while drawing d36b4b67…, 12 of 12 rows"), and he had opened it before. The
code's history puts it in the 19:28 change (eb6c9826). From 11:31 a name
in a message (Simeon, Leo, Ava in Ava's chat) had its butterfly made by a
second SwiftUI render (`ImageRenderer` of a `Canvas`), run inside the chat's
own render on the main thread. Chats still opened. At 19:28 the moving
butterflies were also drawn by SwiftUI, off the main thread
(`Canvas(rendersAsynchronously:)`). The freezes were reported at 20:40.
Ava's messages go through the app's own code in a few milliseconds
(`testAvasChatIsQuickInTheCore`). Now the names' butterflies are drawn with
Core Graphics, no SwiftUI render inside another, and the moving butterflies
are drawn on the main thread again, as they were while chats opened. Also:
a quote's jump no longer redraws every bubble each time the chat's state
moves, and an avatar picture that can't be decoded isn't decoded again on
every redraw.

Checked on Linux: the list's commands, the pins shared through the host's
settings, sending and Resend, older pages, and the streamed row, each with
a test (56 tests pass). Not checked: none of the screens has run on an
iPhone yet; the taps, the motion and the pills need his hands on a device.

## 11. Messages' design (9 October 2026)

The founder: "exactly like iMessage", from screenshots of Messages,
Instagram and another app's message sheet. Built:

- **The list.** Messages' rows: the butterfly, the name with the last
  line's time and a chevron, two lines of the last message, a hairline
  between rows from the text on, the unread dot in the left margin (orange
  when an agent waits on you). The search field and the compose button
  (New Agent, New Group Chat) at the bottom. At the top, Instagram's way:
  the person's name with a menu (Settings, Appearance, Hidden Agents) in
  place of the account button. Search filters the rows by name, title,
  description and last line.
- **A long press on a row or a pinned agent** shows the chat itself above
  its menu: Pin, Mark as Read, Hide Alerts (the agent's notifications),
  Delete; then Edit Profile, Duplicate, Hide from List, Copy Conversation
  ID. The preview reads the chat's last lines without opening it on the
  host (`getAgentTranscriptTail`), so it stays unread.
- **A long press on a message** gives under the finger, then a sheet: the
  Mac's six reactions and five more, the last button opening the emoji
  keyboard for any other; Reply and Mark as Unread; Copy and Select Text.
- **The chat's top**: the call in a glass circle at the far right, as
  Messages' FaceTime button. The header and the composer are bars the
  messages scroll under.
- **The composer**: + in a glass circle, the field in glass at 17 pt, the
  mic inside it while it is empty and the blue send once there is text.
- **The call pill** is glass.
- **Back**: a swipe from the left edge goes back, the screen following
  the finger.

Not checked: none of it has run on an iPhone. The list's bottom search
(`DefaultToolbarItem(kind: .search, placement: .bottomBar)`) and the bars
(`safeAreaBar`) are iOS 26's own; if Xcode refuses either, the build says
so on the line.

## 12. Lag everywhere (9 October 2026)

"it's lagging way too bad … scrolling, buttons everything". Read in the
code, the main thread (where taps and scrolling are handled) had three
standing costs:

- **Every butterfly was a `Canvas`** that drew its gradient, rim, veins,
  border band, antennae and body again each time its view was redrawn: every
  list row, pinned tile, the chat's header, the group avatars, the bubbles'
  avatars, the pickers. A row is redrawn on every change to its agent, and
  agents change many times a second while they work. They are now images,
  drawn once per palette, look and theme (Core Graphics), and shown as
  images.
- **A working agent's butterfly moved at 30 to 60 frames a second** in the
  list, the pins and the chat, each frame drawn on the main thread. Now only
  the open chat's two move (the bar's and the typing one); the list says an
  agent works with its green dot and its line.
- **The counters added to find the freeze** ran in every view, a lock and
  a string on every redraw. They are out of the views.

And a list row is drawn again only when its own agent changes.

**Back by swiping**: the chat hid the system's navigation bar for a bar of
its own, and with the bar hidden the system's swipe does not start (the
delegate work-arounds did not make it). The chat now uses the system's bar,
as Messages does: its back button, the agent in the middle, the call at the
right, and the system's own swipe back.

Not measured on a phone. Run from Xcode, the app is a Debug build: the
app's own Swift runs unoptimised, several times slower than the App Store
build. To judge smoothness, set Product → Scheme → Edit Scheme → Run →
Build Configuration to Release.

## 13. A scroll that starts on a message (9 October 2026)

"when i scroll but my finger is on a chat, it doesnt move." Each message
had SwiftUI's long press (for its sheet), and the conversation SwiftUI's
sideways drag (for the times); on iOS 18 and later both can hold the finger
before the scroll does. Both are now UIKit's own recognizers, as Messages
has them: the long press fails as soon as the finger moves, and the pull
starts only for a drag to the left and runs alongside the scroll.

From his console: the system search placed in the list's bottom toolbar
was set up again on every redraw of the list ("Ignoring
searchBarPlacementBarButtonItem…", "_dictationButton not yet
initialized…"), and the list is redrawn whenever an agent changes; the
list's foot is now its own bar (the search field in glass with its mic,
new chat at the right). And the chat's call slot, empty for an agent that
cannot be called, made a bar button UIKit could not lay out ("Unable to
simultaneously satisfy constraints … width == 0"); it is there only when
there is a call to make.

## 14. Round of 9 October, evening

- **The list's top**: "Messages" in the middle; the account (initials) at
  the left opens Settings directly; the filter at the right, as Messages':
  Messages (all), Hidden Agents, and Filter By: Unread (Messages' "Recently
  Deleted" has no counterpart here, the host deletes for good; its place is
  the hidden agents; no "Manage Filtering").
- **Pins** are centred, rows of three: one pin sits in the middle.
- **The chat's top**: the butterfly back at 52 pt with the name in a glass
  capsule, up beside the system bar's back and call buttons.
- **The computer**: under the screen, the clipboard at the left (Paste from
  Phone pastes the phone's clipboard where the cursor is; Copy to Phone
  copies what is selected on the computer) and the keyboard at the right,
  typing into the computer key by key (return and delete too). Either takes
  over the screen, since the computer takes keys only from one in control.

## 15. The launch (9 October 2026)

"All apps open with the logo appearing with an animation … In small, simeon
turning around." The app opens on its own ground (the system's launch
screen is that colour, `Ground`, so there is no flash), with Simeon's
butterfly at 64 pt in the middle turning around its own axis, the turn the
Mac's mark makes while it works (`MarkEngine.turnNow`, a test), again each
time it comes to rest, until the app is ready: signed in with its agents,
or at the sign-in. At least one turn, never more than three seconds, then
it fades. It shows on every start, and again on coming back after a
quarter of an hour away.

## 16. The first run (9 October 2026)

"Design onboarding … with apple design." The Mac's flow as it ships (the
patch's step list `landing, meet, coo, connect, computer-demo, name`, then
the hand-off), on the phone with Apple's parts: the bold title, Continue as
a glass button at the bottom and Back under it, the name field with Return
as Continue, the apps' tile in Liquid Glass. The scenes and their motion are
the Mac's, from its numbers (`Onboarding.swift`, tested):

- Meet Simeon: the butterfly fades in large (1.2 s), grows on the slow
  spring, turns once in depth (1.4 s), then settles at his seat on the
  standard spring while the title and Continue rise in (0.8 s).
- The Chief of Staff: six agents (Inbox, Research, Travel, Finance, Sales,
  Content) 50 pt from the screen's edge, a blue curve drawn to each from
  Simeon's side (0.9 s each, 0.18 s apart), each agent brightening as its
  curve arrives; "He hires an agent for every job you hand off."
- The apps: the site's row of twelve logos sliding behind the tile one
  place every 1.6 s, the one behind the glass swelling, the far ones
  blurring, faded at both ends; Simeon on the tile.
- The computer: the Mac's little screen (its wallpaper, two windows),
  Simeon as the cursor pressing tiles, closing a window, a beat every 0.9 s.
- The name: three agents bounce in over the field, the server's suggested
  name in it; saved through `POST user/name` as the Mac saves it.
- The hand-off: "Setting up your Simeon…" under the moving light while the
  computer answers (asked every 2.5 s, a minute at most), then "Getting
  your team ready…"; Simeon is made as the Mac makes him (`createAgent` with
  the Chief of Staff's profile, `kickstartAgent`), the first run is marked
  done on the host (`hasSeenOnboarding`, the flag the Mac and the web
  window read), and his chat opens. Try Again never makes a second Simeon.

Only a new account sees it: the Mac's gate (`getHostSettings`, then
`countAgents`; an account with agents is marked done). A computer that does
not answer is asked once more, then the first run shows as on the Mac and
steps aside if agents turn up. Notifications are asked for after it, not
over its first screen. The sign-in screen has the Mac's tagline.

## 17. The Mac's motion in the chat (9 October 2026)

"I dont see the app animations from the mac, the swirling etc the 'running
command' chat animation." What the Mac draws, and the phone now too:

- The swirling: the spin's light trails (`E_t`), three to five tapered
  ribbons flung onto a tilted orbit when the butterfly turns fast, in two
  neighbouring stops of the agent's palette, half behind it and half in
  front, drawing in once the turn ends (`LightTrails.swift`, tested). A
  working agent turns every 6 to 9 s; one making a picture whirls without
  end and keeps throwing them. The launch's butterfly has them too.
- "Running commands": the Mac's table of what an agent is doing (`dse`,
  `Activity.swift`, tested: "Thinking", "Searching the web", "Reading the
  web", "Running commands", "Drafting the file", "Messaging Iris",
  "Connecting to Linear"…), beside the working butterfly at the end of the
  chat, under the Mac's moving light (2.2 s), coming in from 4 pt below as
  it changes, held at least 0.8 s, with " · 3m" after a minute. The phone
  read a `label` the host never sends, so it showed no words before. The
  Mac shows them when the pointer is over the row; a phone has no pointer,
  so they always show.
- The row comes in from 92 % (0.18 s) and goes the same way (0.14 s); the
  butterfly pops in after it (0.34 s, from 60 %).
- A group shows who is at it ("Theo and Iris are working…"), rolling up as
  it changes, held 1.2 s.
- A reaction added while its message is on screen pops in (0.3 s, from 45 %
  past 108 %).

## 18. Taps that miss, again (9 October 2026)

"Clicking the avatar dont do anything you have to touch the name … check
all buttons." What the code showed, button by button:

- The chat's butterfly is drawn 34 pt up into the bar's row, above the strip
  it belongs to; a touch there reached the bar, which does nothing with it.
  Only the strip below (mostly the name) opened the page. The bar's middle
  now takes the tap too (a clear item in the bar's title place); the drawing
  is unchanged.
- The round glass buttons made by hand (close, the composer's +, the call's
  mute, transcript and back, the computer's keyboard) wore interactive glass
  around a button: the glass handles the touch itself for its bloom, and the
  button handled it too. One style, `GlassDisc`, now draws them: the same
  glass, the whole circle takes the tap, pressed it dips. The glass behind
  the search field, the new chat and clipboard menus and the new-messages
  pill is plain glass now.
- The Hidden Agents sheet put that disc inside the bar, which draws its own
  glass button around it: glass in glass. It has the bar's own close now.
- The call screen's back took the tap on its chevron only, not its disc; a
  reply's quote on its words only; End call and a voice's play button on
  their drawing. Each takes it on its whole shape now.

Every other button was checked for the same: its whole shape takes the
tap (a list row, a bar button, or a label with its own `contentShape`).

## 19. Round of 9 October, night

- Read stays read. The host counts a chat unread when anything in it is
  newer than its last reading (`lastActivityAt > lastViewedAt`,
  `session-summaries.ts`); the phone marked a chat read only as it opened,
  so an answer that came while it was on screen made it unread again, and
  going back showed it unread. Now the chat on screen stays read as lines
  come (the host is told, one call at a time), leaving it marks it read,
  and coming back to the app with it open does too. A chat left open
  behind a locked phone is not marked (`AppStore.isForeground`). Tested.
- The list's rows: the agent's title is back beside the name, in a small
  grey tag (the system's own fill), as the founder's reference has it;
  only when it fits whole, the name never cut for it. The butterfly is
  52 pt (from 46), in proportion with the name's line and the two of the
  preview.
- The chat's text is 17 pt on 23 pt lines, the size Messages sets (it was
  15); headings, tables, code and the cards' text grew with it.
- The words beside a working agent have no picture before them ("no tool
  please").

## 20. Search, with everything the Mac's has (9 October 2026)

"Search isnt good as it disregard all that we have in mac. files routines
etc. agents." The phone's search only filtered the list by name. It is now
the Mac's search (its palette, `QFn`), drawn as Messages draws its own:
the field at the bottom of the list takes over the screen while in use,
with tabs along the top in the Mac's order (All, Messages, Agents, Groups,
Files, Links, Routines, Actions) and, on All, a few of each with See All.

- Agents and groups by name and title (the Mac's fuzzy match: each word's
  letters in order, near together, word starts first; the matched letters
  bold), the pinned first, hidden ones once something is typed, tagged.
- Messages in every chat (`searchAgents`) and files (`searchMedia`, the
  newest with nothing typed), asked 0.15 s after the last keystroke; a
  message or a file opens its chat at that line, older pages loaded until
  it is there (at most 20 pages, 30 s), and the line glows.
- Links in the chats the phone has open (the Mac lists the open chat's),
  opening in Safari; every routine of every agent (`listAllAutomations`),
  opening its editor; the app's actions (New Agent, New Group Chat, Open
  Hidden Agents, Settings, Theme).
- The index's tabs are left out when the host's search is off
  (`isGlobalSearchEnabled`); "Search unavailable" when it fails.

The search core is in `Search.swift` (tested); the old search sheet, which
only a screenshot's launch opened, is gone (`--screen=search` focuses the
field).

## 21. Before an app's sign-in, every time (9 October 2026)

"Before connecting, when they click on the connector, this appears … a
template that change slightly for each … do mention briefly composio." A
sheet now comes up before every app sign-in page opens, in our own words
(the reference was another product's; none of its text is used):

- Where: Add on a connector card in the chat, Add in Settings → Connect
  apps, and Sign in on an added app's account. Nothing else opens a
  sign-in page on the phone.
- What it says: the app's logo, name and what it does; three points (what
  the agents can reach in that app, that auto-review and Settings keep the
  person in charge, that agents can get things wrong); then the small
  print: who handles the sign-in, where what the agents read goes, and the
  app's own terms.
- Each app's part: what the agents reach is written per app (about 70, from
  the catalog; read only for Mercury and Figma, LinkedIn said its own way);
  some apps get one more line (Shopify's live store, the apps that move
  money, GitHub's repositories, the ad accounts' budgets, email sent from
  your own address, and a few more).
- Composio is named, in one line, only for the apps it serves (those the
  server reaches at `/desktop/api/apps/mcp/…` or the catalog gives a
  `composioToolkit`); for an app on its own server the line names that
  server instead. `server/simeon/desktop/apps.py` still carries the 28
  September note to keep Composio out of sight; this sheet follows the
  newer instruction.
- Connect closes the sheet, then the connecting starts exactly as it did
  before (`AppConnector.connect` / `signIn`, unchanged); Cancel or a swipe
  down starts nothing.

The text is built in `ConnectConsent.swift` (tested); the sheet is
`ConnectConsentSheet` in `Cards.swift`.

## 22. Flights in Muse's layout, and the logos (9 October 2026)

"The logo doesnt show well at all … i found an absolute better design from
muse and i want that for all flights suggestions. everything should fit."

Why the logos looked wrong, from the files themselves: Duffel's
`logo_symbol_url` is a square symbol for most airlines (Delta 74 × 60,
Southwest 80 × 80) but a long wordmark for others (Alaska 269 × 80, JetBlue
237 × 80, Spirit 290 × 80, Allegiant 159 × 80, KLM 135 × 80). The mark fit
every logo into the same 22 pt square inside a 36 pt circle, so a wordmark
came out about 6 pt tall. The SVG was also drawn by photographing a web
view placed off the screen, which WebKit need not paint at all.

- The logo is now painted onto a canvas by WebKit and read back as a PNG
  (the photograph stays only as a fallback), cut to its own edges, and
  sized in its circle by its shape (`AirlineLogo.box`): a symbol fills
  about two thirds of the circle, a wordmark runs nearly across it. A
  picture with nothing on it shows the airline's initials. Pictures kept
  by the old way are dropped (a new cache folder).
- Duffel has no symbol for some airlines: Alaska shows its wordmark, not
  the face Muse shows.
- The card: "Seattle to Los Angeles — Sat, Oct 10" as one heading (test
  results, refundable-only or more than one traveller under it), then a row
  per offer: the logo in a 40 pt white circle, "Delta Air Lines · $233.40",
  and "2:30pm ---- 2h40m ---- 5:10pm" (with "· 1 stop" when it stops; a
  round trip's way back on a second line). The card runs nearly the chat's
  width so the lines fit, and a line still too long puts the time in the
  air under the times instead of cutting anything. No chevrons or lines
  between rows, as in Muse's card.
- A row opens the flight in a sheet as tall as what it holds: the route
  with its stops and time, Total Price in green with what it covers, a card
  per flight (from and to with the airline's logo, Departing and Arriving
  with their day, the flight number and airline, the cabin, time in the
  air), the layover between two, a round trip's Outbound and Return, and
  the fare's terms in plain lines ("No refund if you cancel", "Changes for
  a $99.00 fee", "1 carry-on").
- Not copied: Muse's Book button. Booking isn't built, and the founder had
  the button taken off on 2 October.
- The server's card is unchanged; the words are rewritten on the phone
  (`Flights.swift` in SimeonCore, tested). The Mac's card is unchanged.
- The demo's Cards chat (`--gallery`) has the screenshot's four flights and
  a round trip.

## Suggested order (the founder decides)

1. The chat's look: the bubble, the top bar, markdown, brand names with logos, agent names with butterflies.
2. The butterfly, still: the right outline, size and gradient, and the group avatars.
3. Cards: questions, flights, email and Slack drafts, files, agent exchanges, routines.
4. Settings: Connect apps (Plugins), Auto-review, Timezone, Usage & Billing.
5. Calls, real.
6. The agent's page: routines editor, avatar editor, notifications.
7. The computer.
8. The butterfly's animations.

---

## Appendix: the brand names' colours and logos

As built into the Mac window (from `desktop/brand/app-logos/apps.json` through
`readableOn`, patch 1633-1643). The files are in `desktop/brand/app-logos/`.
"word" only matches "Microsoft Word". The aliases "Microsoft Excel",
"Microsoft PowerPoint", "Microsoft Outlook" and "Google Calendar" point at
their keys.

| Key | Light | Dark | Logo |
|---|---|---|---|
| gmail | #ea4335 | #ed5f53 | `gmail.webp` (colour) |
| google-calendar | #4285f4 | #4b8bf5 | `google-calendar.webp` (colour) |
| google-drive | #1d9c5e | #1fa463 | `google-drive.svg` (colour) |
| google-docs | #4285f4 | #4b8bf5 | `google-docs.svg` (colour) |
| google-sheets | #0f9d58 | #1ba260 | `google-sheets.webp` (colour) |
| google-slides | #ab7e00 | #f4b400 | `google-slides.webp` (colour) |
| google-meet | #00897b | #33a195 | `google-meet.webp` (colour) |
| outlook | #0078d4 | #3393dd | `outlook.webp` (colour) |
| zoom | #0b5cff | #548dff | `zoom.webp` (colour) |
| mailchimp | #241c15 | #ececec | `mailchimp.svg` (colour) |
| word | #185abd | #6994d4 | `word.webp` (colour) |
| excel | #107c41 | #4c9d71 | `excel.webp` (colour) |
| powerpoint | #c43e1c | #d67860 | `powerpoint.webp` (colour) |
| slack | #4a154b | #ececec | `slack.webp` (colour) |
| notion | #000000 | #ececec | `si-notion.svg` (one colour) |
| figma | #f24e1e | #f36035 | `si-figma.svg` (one colour) |
| loom | #625df5 | #8985f8 | `si-loom.svg` (one colour) |
| miro | #050038 | #ececec | `si-miro.svg` (one colour) |
| vercel | #000000 | #ececec | `si-vercel.svg` (one colour) |
| github | #181717 | #ececec | `si-github.svg` (one colour) |
| linear | #5e6ad2 | #7e88db | `si-linear.svg` (one colour) |
| stripe | #635bff | #827cff | `si-stripe.svg` (one colour) |
| dropbox | #0061ff | #4d90ff | `si-dropbox.svg` (one colour) |
| airtable | #128fbf | #18bfff | `si-airtable.svg` (one colour) |
| asana | #d85f5f | #f06a6a | `si-asana.svg` (one colour) |
| supabase | #2f9b6b | #3fcf8e | `si-supabase.svg` (one colour) |
| sentry | #362d59 | #908ca4 | `si-sentry.svg` (one colour) |
| canva | #009399 | #00c4cc | `si-canva.svg` (one colour) |
| calendly | #006bff | #4090ff | `si-calendly.svg` (one colour) |
| hubspot | #cc6247 | #ff7a59 | `si-hubspot.svg` (one colour) |
| jira | #0052cc | #598fde | `si-jira.svg` (one colour) |
| trello | #0052cc | #598fde | `si-trello.svg` (one colour) |
| discord | #5865f2 | #7984f5 | `si-discord.svg` (one colour) |
| whatsapp | #1a9447 | #25d366 | `si-whatsapp.svg` (one colour) |
| telegram | #208cc2 | #26a5e4 | `si-telegram.svg` (one colour) |
| shopify | #62914a | #7ab55c | `si-shopify.svg` (one colour) |
| intercom | #3a8b83 | #6afdef | `si-intercom.svg` (one colour) |
| zapier | #f24b00 | #ff4f00 | `si-zapier.svg` (one colour) |
| quickbooks | #2a981b | #37a527 | `si-quickbooks.svg` (one colour) |
| salesforce | #0091ca | #00a1e0 | `si-salesforce.svg` (one colour) |
| webflow | #146ef5 | #438bf7 | `si-webflow.svg` (one colour) |
| framer | #0055ff | #4d88ff | `si-framer.svg` (one colour) |
| clickup | #7b68ee | #8f7ff1 | `si-clickup.svg` (one colour) |
| todoist | #e44332 | #e9695b | `si-todoist.svg` (one colour) |
| spotify | #159743 | #1ed760 | `si-spotify.svg` (one colour) |
| youtube | #ff0000 | #ff4d4d | `si-youtube.svg` (one colour) |
| linkedin | #0a66c2 | #5394d4 | `si-linkedin.svg` (one colour) |
| instagram | #ff0069 | #ff408f | `si-instagram.svg` (one colour) |
| facebook | #0866ff | #468cff | `si-facebook.svg` (one colour) |
| paypal | #003087 | #738dbd | `si-paypal.svg` (one colour) |
| revolut | #191c1f | #ececec | `si-revolut.svg` (one colour) |
| xero | #0f91bb | #13b5ea | `si-xero.svg` (one colour) |
| typeform | #262627 | #ececec | `si-typeform.svg` (one colour) |
| wordpress | #21759b | #5998b4 | `si-wordpress.svg` (one colour) |
| substack | #e65d16 | #ff6719 | `si-substack.svg` (one colour) |
| reddit | #f24200 | #ff4e0d | `si-reddit.svg` (one colour) |
| tiktok | #000000 | #ececec | `si-tiktok.svg` (one colour) |
| airbnb | #e65156 | #ff5a5f | `si-airbnb.svg` (one colour) |
| cloudflare | #cf6d1b | #f38020 | `si-cloudflare.svg` (one colour) |
| pinterest | #bd081c | #d76b77 | `si-pinterest.svg` (one colour) |
| twilio | #f22f46 | #f5596b | `si-twilio.svg` (one colour) |
| postman | #d95c2f | #ff6c37 | `si-postman.svg` (one colour) |
| obsidian | #7c3aed | #a375f2 | `si-obsidian.svg` (one colour) |
| evernote | #009729 | #00a82d | `si-evernote.svg` (one colour) |
| zendesk | #03363d | #ececec | `si-zendesk.svg` (one colour) |
| paddle | #988520 | #fddd35 | `si-paddle.svg` (one colour) |
| gusto | #e85844 | #f45d48 | `si-gusto.svg` (one colour) |
| tableau | #d26a23 | #e97627 | `si-tableau.svg` (one colour) |
| snowflake | #2191ba | #29b5e8 | `si-snowflake.svg` (one colour) |
| databricks | #ff3621 | #ff4a37 | `si-databricks.svg` (one colour) |
| greenhouse | #209472 | #24a47f | `si-greenhouse.svg` (one colour) |
| brevo | #0b996e | #23a37d | `si-brevo.svg` (one colour) |
