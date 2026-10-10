# The Mac app in Swift, step by step

The founder, 10 October 2026: "what i want is a literal copy of the app we
have there. same behavior. same chat behavior, same layout, same layout
rules, same EVERYTHING." Then: "native controls, same layout. i want the app
as the actual version right now that is merged."

So this app copies the Electron Mac app on `main` (`desktop/`), screen by
screen. Its layout (sizes, spacing, type, colours, rules) is measured from
the Electron window's own code. Its controls are Apple's: buttons, menus,
spinners, the glass. Nothing comes from the iPhone app's screens. The shared
core (`ios/SimeonCore`: sign-in, the connection to the person's computer,
the agents and their chats) stays, and each step checks its behaviour
against the Electron app's code.

**The reference** is the gallery of the Electron app, every screen and state
numbered: https://claude.ai/artifact/RtDSfrD5c49vuEX97nfgai. The founder
checked it for completeness on 10 October 2026.

## How a step goes

1. A step is written and pushed, with what it covers and which reference
   pictures to compare against.
2. The founder builds it on their Mac and sends a screenshot next to the
   reference picture.
3. Every difference is fixed before the next step starts.
4. A crash, or a button that should work and does not, stops everything
   until it is fixed.

Until its step comes, a button whose screen is copied later is there, in its
place, and does nothing. Each step's notes list those buttons and the step
that brings them. None of them closes or crashes the app.

On 10 October 2026 the founder was away from their Mac and asked for the
steps to go on without their check ("lets assume you got it right and carry
on"). So step 2 was written on top of an unbuilt step 1; the first build on
the Mac checks both, and their differences are fixed in order.

## The steps

| Step | What | Reference |
|---|---|---|
| 1 | Sign-in, the window, the sidebar | A01–A03, B01–B09, C01 |
| 2 | The chat: header, messages, every card, the composer, the agents' motion | B02, F01–F14, G01–G11, H, HD, P01 |
| 3 | The sidebar's menus: pins, sections, picking several, renaming, hiding, deleting, unread | C02–C16 |
| 4 | Search (⌘K) | D01–D07 |
| 5 | New chat (⌘N) | E01–E07 |
| 6 | The first run | A04–A30 |
| 7 | The agent pane: Profile, Routines, the avatar editor, a group's pane | I01–I07, B09 |
| 8 | Settings | J01–J07 |
| 9 | Connect apps (Plugins) | K01–K09 |
| 10 | The account: its menu, weekly usage, About, log out | L01–L04 |
| 11 | Calls: in the chat and the call banner | M01–M19 |
| 12 | The org chart and channels | N01–N08, O01 |
| 13 | The computer, and the window's "can't reach your computer" states | I03 |
| 14 | The Mac's own: notifications, the Dock's number, Move to Applications, links, zoom, the agent's hands on this Mac | the gallery's last section |

## Step 1: sign-in, the window, the sidebar

Written 10 October 2026. **Not built yet:** this was written on a Linux
machine, which can check Swift's syntax but cannot build a Mac app. The
first build on the founder's Mac is the first real check.

### What it has

- **Sign-in** (A01): the butterfly and "Simeon" in Suravaram, the line under
  them, Sign in. Sign in opens the sign-in page in the Mac's own browser, as
  the Electron app does.
- **Continue in your browser** (A02), with Reopen link (opens the same page
  again) and Cancel (back to A01). If the sign-in does not finish, or the
  account is refused, the reason shows under Sign in, in the Electron app's
  words.
- **Setting up Simeon's computer** (A03), its light sweeping across, until
  the agents are in.
- **The window**: 1040 × 760 the first time, never smaller than 512 × 520,
  its size and place kept between launches. No title; the traffic lights at
  16 × 15 from the top left, as the Electron window puts them. It moves when
  dragged by the sidebar's top or the chat's top; a double-click there zooms
  it.
- **The sidebar** (B01): the Mac's sidebar material with the Electron
  window's paint over it, a hairline at its right edge. At its top, Search
  and New chat in Apple's glass. The rows: each agent's butterfly, its name,
  its title in blue, the time at the right, the last line under them. A
  group shows its members' butterflies. The open agent's row is the white
  card; a row under the pointer turns grey (C01). Unread is the blue dot in
  the time's place; an agent at work has the green dot on its butterfly. A
  click opens the agent (its unread clears); the app reopens on the agent
  left open. At its foot, the account's initials and Connect apps with the
  Gmail, Calendar and Drive tiles.
- **Its width** (B04–B07): drag its right edge between 240 and 400; dragged
  under 210 it folds to its rail. ⌘B folds and opens it. It folds by itself
  when the chat beside it would be narrower than 424, as at 560 × 560 (B05)
  and at the smallest size (B05b). On the rail: the butterflies only, unread
  on a butterfly's corner, and Search, New chat and the initials at the
  foot.
- **Light and dark** (B03): follows the Mac's setting.
- **The menus**: Simeon (About Simeon, Services, Hide Simeon, Hide Others,
  Show All, Quit Simeon), File (Close Window), Edit, View (Reload ⌘R, Enter
  Full Screen), Agent (Call and the open agent's name), Window. Reload reads
  the agents again from the computer.

### Buttons that do nothing yet

| Button | Its step |
|---|---|
| Search, and ⌘K | 4 |
| New chat, and ⌘N | 5 |
| The account's initials | 10 |
| Connect apps | 9 |
| Simeon › About Simeon | 10 |
| Agent › Call … | 11 |
| A row's right-click | 3 |

### Not in this step yet

- **The chat** (step 2, below).
- **Pins and sections** (step 3): pinned agents are at the top of the list
  as plain rows, not yet as the large tiles of C03; a section's heading is
  not drawn yet.
- **The butterflies' motion** (step 2): in the Electron window an agent's
  butterfly moves while it works and turns into the typing dots while it
  writes (Simeon's, on the rail in B05). Here they stand still.
- **The theme setting** (step 8): the app follows the Mac's light or dark
  setting until Settings is copied.
- **A new account's first run** (step 6): a new account comes to an empty
  window.
- **"Can't reach your computer"** (step 13).

### Where the native parts look different

These are Apple's own controls, as asked, so they will not match the
reference pixel for pixel: Search, New chat and the initials are Apple's
round glass buttons; Sign in is Apple's prominent button; the spinner is
Apple's; the search and new chat icons are Apple's (SF Symbols) in the
reference's shapes. The text is Apple's system font, as the Electron window
asks for (`-apple-system`); the reference pictures were taken on Linux,
where the browser put another font in its place, so letter widths there are
not the Mac's.

SwiftUI keeps an empty Help menu, which shows only macOS's menu search.

### What to compare

Sign in: A01, then A02 after Sign in, then A03. Signed in: B01 (light) and
B03 (dark), a row under the pointer (C01), the window at 760 × 600 (B04) and
560 × 560 (B05), the smallest window (B05b, B05c), ⌘B (B07). The Electron
app open beside it, on the same account, is the best comparison: the same
agents in both.

## Step 2: the chat

The chat is the largest screen, so it comes in six parts, each pushed on
its own:

| Part | What |
|---|---|
| 2a | The chat's frame: the head, the messages, times, the "New" line, the agents' exchanges and routines lines, files, reactions, the agent at work, the message field |
| 2b | The message text, measured: headings, lists, tables, code, maths, diagrams, links, pictures |
| 2c | Every card in the reference's H section: flights, questions, drafts, apps to connect, approvals, cloud agents, link cards, calls, the file preview |
| 2d | A message's actions: the hover bar, its menu, adding a reaction, Reply, threads, the exchanges' list, find in chat |
| 2e | The message field's lists (@, /, #, :), attaching files, dictation |
| 2f | The butterflies' motion, the typing and working lines' motion, scrolling as the window scrolls |

### 2a: the chat's frame

Written 10 October 2026, **not built yet** (as step 1). Compare with B01
(light), B03 (dark), B02 and HD (a group chat), F01.

- **The head**: the agent's butterfly (52) over its name in a glass pill,
  the call button 8 to the pill's right (none for a group), on the chat's
  ground at 78% over a blur that fades out over its last 30 points. The
  messages scroll under it. Its empty part moves the window.
- **The messages**, 16 in from each side, opening at the newest: the
  person's on the right in the window's blue (14 on 21, 18 round), an
  agent's on the left in grey with a hairline and a soft shadow, at most
  88% of the chat, 640, or the chat less 82. A message from someone other
  than the one before sits 12 lower, and a sender's messages in a row meet
  at 6-point corners (the last one too while the agent's working line is
  under it), by the window's own rules (SimeonCore's `Chat.runFlags`, tested
  against the window's own functions run on the same lines).
- **The text**: bold, italics, code, strikethrough and links inside a
  line; app names in their colour after their logo; agents' names in
  theirs after their butterfly, as the window writes them. Headings,
  lists, quotes, code blocks, tables and maths are drawn plainly until 2b.
- **A group chat**: an agent's messages 30 in, its name over the first of
  a run (it opens that agent's chat), its butterfly beside the last.
- **Times** over the messages after a quarter of an hour; **"New"** between
  blue lines before the first unread message.
- **Lines about the chat**: "Messaged Iris", "4 messages with 2 agents",
  "Created routine Monday launch check", a call as "Voice chat · 01:49",
  and the notices ("Renamed to …", "Connected to …").
- **Files**: the card with the file's kind (Word, Excel, PowerPoint, PDF,
  any other file), its name cut short before the extension, its size, and
  Save, which asks where to save it and saves it.
- **Reactions** under a message's right end; clicking one adds or takes back
  your own.
- **The agent at work**: its butterfly (28) and "Typing…" or what it is
  doing ("Searching the web", "Messaging Iris"), under the window's sweep of
  light, below the last message.
- **A message that did not send**: "Failed to send", Resend, Delete. One
  held while the computer is out of reach: "Waiting to send…" and Cancel.
- **The message field**: "Message <name>" while empty, Return sends,
  Shift-Return starts a new line, ten lines then it scrolls. What you type
  is kept per chat, as the window keeps a draft. Send is the microphone
  while empty and the arrow once there are words.

#### Buttons that do nothing yet

| Button | Its part or step |
|---|---|
| The butterfly and name in the head (View agent settings) | 7 |
| The call button in the head | 11 |
| A file's name (opens its preview) | 2c |
| The exchanges and routines chips | 2d |
| "1 reply" under a message | 2d |
| Attach file | 2e |
| The microphone | 2e |

#### Not in 2a yet

- Cards other than files show their place as "A flights card (step 2c)" and
  so on, until 2c.
- An agent's pictures, a link drawn as a card, a quoted reply above a
  message, the channel tag ("From Slack") and "Sent while offline" under a
  message: 2c and 2d.
- The hover bar, right-click menu and the time at a message's right on
  hover: 2d. So is the thread's "1 reply" joined under its message (the
  window squares the message's lower corners over it).
- An emoji on its own, drawn large without a bubble, and a one- or
  two-letter message drawn as a circle: 2b.
- The butterflies stand still, and new messages appear without the
  window's motion: 2f.
- The access notice over the field ("Your trial has ended"…) and the
  computer's notices over it: step 13.

#### Where the native parts look different

The name pill, the call button and Attach are Apple's glass. The text field
is Apple's own text view, so selection, spelling and the Edit menu are the
Mac's. The icons are SF Symbols in the window's shapes.
