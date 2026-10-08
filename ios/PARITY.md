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
| Flight card (§1, §3.3) | The card: title, subtitle, rows with the airline circle, times, stops, price; a row opens the details (legs, fare rules). |
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

Still missing on the phone:
- The welcome steps of a new account. A new account on the phone opens
  on an empty list.
- Threads ("Start a thread" and the thread view).

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
