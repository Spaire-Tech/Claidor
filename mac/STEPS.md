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
| Search, and ⌘K | 4 (done) |
| New chat, and ⌘N | 5 (done) |
| The account's initials | 10 |
| Connect apps | 9 |
| Simeon › About Simeon | 10 |
| Agent › Call … | 11 |
| A row's right-click | 3 (done) |

### Not in this step yet

- **The chat** (step 2, below).
- **Pins and sections** (step 3, done): pinned agents are at the top of
  the list as plain rows, not yet as the large tiles of C03; a section's
  heading is not drawn yet.
- **The butterflies' motion** (step 2): in the Electron window an agent's
  butterfly moves while it works and turns into the typing dots while it
  writes (Simeon's, on the rail in B05). Here they stand still.
- **The theme setting** (step 8): the app follows the Mac's light or dark
  setting until Settings is copied.
- **A new account's first run** (step 6, done).
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
- **The messages**, 16 in from each side, opening at the newest, and
  following new words while you are at the newest (scrolled up to read, the
  chat stays where you are): the
  person's on the right in the window's blue (14 on 21, 18 round), an
  agent's on the left in grey with a hairline and a soft shadow, at most
  88% of the chat, 640, or the chat less 82. A message from someone other
  than the one before sits 12 lower, and a sender's messages in a row meet
  at 6-point corners (the last one too while the agent's working line is
  under it), by the window's own rules (SimeonCore's `Chat.runFlags`, tested
  against the window's own functions run on the same lines).
- **The text**: bold, italics, code, strikethrough and links inside a
  line; app names in their colour after their logo; agents' names in
  theirs after their butterfly, as the window writes them. The blocks are
  2b's, below.
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
| The butterfly and name in the head (View agent settings) | 7 (done) |
| The call button in the head | 11 |
| A file's name (opens its preview) | 2c (done) |
| The exchanges' chips | 2d (done) |
| The routines' chips (open the routine) | 7c (done) |
| "1 reply" under a message | 2d (done) |
| Attach file | 2e (done) |
| The microphone | 2e (done) |

#### Not in 2a yet

- Cards other than files show their place as "A flights card (step 2c)" and
  so on, until 2c.
- An agent's pictures, a link drawn as a card, a quoted reply above a
  message, the channel tag ("From Slack") and "Sent while offline" under a
  message: 2c and 2d.
- The hover bar, right-click menu and the time at a message's right on
  hover: 2d. So is the thread's "1 reply" joined under its message (the
  window squares the message's lower corners over it).
- The butterflies stand still, and new messages appear without the
  window's motion: 2f (done).
- The access notice over the field ("Your trial has ended"…) and the
  computer's notices over it: step 13.

#### Where the native parts look different

The name pill, the call button and Attach are Apple's glass. The text field
is Apple's own text view, so selection, spelling and the Edit menu are the
Mac's. The icons are SF Symbols in the window's shapes.

A compile review of 2a (a second reader, with the Swift compiler Xcode 26
uses and stand-ins for Apple's frameworks) found one line that would not
compile, one deprecated call, and four layout points; all are fixed in
2b's push.

### 2b: the message text

Written 10 October 2026, **not built yet**. Measured from the window's
own Gallery chat (its rich message, and a second one added to the
reference with every element the first has not got). Compare with F01 to
F05 and the Gallery chat's first messages.

- **Paragraphs** 14 on 20, 10 apart. **Headings** at 600: `#` 22 on 28,
  `##` 17 on 24, `###` and smaller 14 on 20 with 8 more above.
- **Lists**: 20 in (16 for a list inside a list), items 4 apart, numbers
  and bullets at 40% (a disc, then a circle, then a square). A list with
  check boxes is 13 on 18, 4 in, its boxes 16 and 4 round: checked in the
  window's blue with a white tick, open with a 30% edge.
- **Inline code** in red on a grey wash, 0.93 em monospaced; **links** in
  the link blue with no underline; a bare address (`https://…`, `www.…`)
  made a link, as GitHub's Markdown does; **strikethrough** at 40%.
- **Quotes**: a 2-point bar at 30%, the words 10 in at 60%.
- **Code blocks**: the ground, a 10% edge, 10 round, 12 on 18
  monospaced, 10 in and 6 from top and bottom, scrolling sideways when
  wide; Copy at the top right under the pointer.
- **Tables**: 13 on 18, cells padded 8, the heading row at 500, the rest
  at 60%, a hairline under every row but the last, columns aligned as
  written; scrolling sideways when wide.
- **Maths** (`$$` lines, a ```` ```math ```` block, or `$$…$$` within a
  line) and **diagrams** (```` ```mermaid ````) drawn by the same KaTeX and
  Mermaid the window uses, in a see-through web view as tall as what they
  drew. A diagram waits for its message to finish, as in the window, and
  shows its source until then (or if Mermaid cannot read it).
- **An emoji on its own**: 32 on 38, no bubble. **One or two
  characters**: the bubble at least 36 wide, the words centred.
- The window's rule (`---`) is drawn with no width; only its line of space
  shows, here too.

#### Buttons that do nothing yet

| Button | Its part or step |
|---|---|
| A diagram (opens full screen) | 2c (done) |

#### Not in 2b yet

- The window colours a code block's words by language and draws thin
  guides at its indents; here the words are one colour.
- Pictures inside a message (`![…](…)`): 2c.

### 2c: the cards

Written 10 October 2026, **not built yet** (as step 1), measured from the
window's Gallery chat, one card at a time:

- **Questions**: the question and its help, the X that dismisses it, the
  choices lettered A, B… in one box, "Type your own answer" with Submit;
  answered, the question and the answer with a tick; dismissed, the
  question at 60% and a "Dismissed" pill.
- **Email and Slack drafts**: the title and its state ("Ready to send"),
  the fields on the ground with their hairlines, To, Subject and the words
  editable before sending; Send email or Send message, and Discard.
- **Apps to connect**: one card per app, its logo, name, the agent's reason
  or what the app does, how many tools once added; "Added" in green, or
  Add, which starts the app's sign-in in the browser.
- **"Connect Slack" / "Connect GitHub"** for routines that wake on them:
  checking, then Connect or "Connected".
- **Auto-review approvals**: the title by what the agent wants, "Approval
  needed" or the outcome, where it runs, what it does, why it was paused,
  "Show the command" unfolding it, and Allow once, Always allow, Deny.
- **Secrets**: the name and why, "Paste your …" and Save securely, the lock
  line; once saved, "Saved securely and kept private." and a "Saved" pill.
- **Pictures** under an agent's words: one row, 192 high, 12 round, 6
  apart, read from the agent's computer.
- **A message that is one link** drawn as its card (the page's icon or a
  globe, its title or address, the address), opening in the browser.
- **The line a reply answers** over it; **the channel tag** ("Discord",
  with "From Ada on Discord" as its tooltip) under a message from or to a
  channel; **"Sent while offline · Oct 9, 3:12 PM"** under one held while
  the computer was away.
- **A call's record** ("Voice call", its length, the recap opening under a
  hairline).
- **A long message of yours** folded at 160 points with Show more.

- **Flights**: the route and trip, one row per offer (the airline's mark,
  the times, airline, time in the air and stops, the price), in Apple's
  greys as the window sets them. Opening an offer shows it in the agent
  pane (7d, done).

- **"Your turn on the computer"**: the computer tile, "Waiting for you"
  with a pulsing blue dot, the agent's instruction, Take over, I'm done and
  Skip; once settled, what happened and Open computer. Take over and Open
  computer open the computer, step 13.
- **A cloud agent**: its name, state, what it was asked, its branch and
  pull request, the files and lines it changed, View PR and Open; asked
  again every five seconds while it works.

#### Opening a file, a picture or a diagram

Measured from the window's three viewers with sample files (a two-page
PDF, a CSV, Markdown, JSON and TypeScript) served to the reference window.
Each covers the whole window, sidebar included; Escape closes it.

- **A file's preview**: the window dimmed (90%, 95% on dark), the panel up
  to 1100 wide, 12 round with a deep shadow. Its head: the name, a grey
  line under it ("2 pages", "3 rows", or "Showing the start of this file"
  past 1.5 million characters), Download (the save panel in Downloads) and
  Close. A click outside the panel closes it. The name on a file card opens
  it only when the window's would: never for a kind it cannot show, and a
  text, Markdown or JSON file only once the computer has read it as text
  (SimeonCore's `FilePreview`, tested against the window's own functions).
  Pictures and videos open in the media viewer instead.
- **PDF**: the pages one under another, 16 apart, as wide as the panel
  less 32, each with its number at its foot; Zoom out, "1 / 2" and Zoom in
  in the head (a quarter a step, half to four times), + and − too. In
  Apple's PDF view, so the words can be chosen and copied.
- **Markdown**: a page at most 624 wide, 15 on 24, headings 1.55, 1.3 and
  1.13 of that, lists 24 in, tables 0.93, quotes 16 in. App and agent
  names stay plain words.
- **Code and text**: line numbers that stay while the lines scroll
  sideways, the lines never wrapping, 12.5 on 20, coloured by the window's
  own highlight.js (its copy, run in JavaScriptCore) in the window's
  palette.
- **JSON**: the tree, open two levels, names in the file's order (as
  JavaScript orders them), "{5 keys}" and "[2 items]", at most 200 entries
  then "… 12 more"; a file that is not JSON shows as text.
- **CSV and TSV**: the grid with its head row and row numbers, cells cut at
  360; a cell clicked opens its words at the foot ("Revenue · row 2").
- **Too large** (over 25 MB), **unavailable**, **"Preview not available"**
  for a kind it cannot show: the window's words, with Download.
- **A picture or a video full screen**: black at 92%; the picture as large
  as fits; the caption ("photo.png · 1 / 2"); with more than one, Previous
  and Next at the sides, the arrows going round, and the strip of squares
  under it. A click on the picture closes it; a double click zooms to 2.5
  where clicked and back; the wheel or a pinch zooms up to 4 where the
  pointer is; zoomed, a drag moves it. A video plays in Apple's player.
- **A diagram full screen**: black at 92%, the diagram on its card at its
  own size (smaller to fit), Close at the top right and Zoom out, Zoom in,
  Fit to screen at the foot; the wheel zooms where the pointer is, + − 0 F
  as in the window, a double click zooms in or back to the fit, a drag
  moves it, a click outside closes. Checked in Chromium: the page fits,
  zooms, pans and closes as the window's does.

#### Not in 2c yet

- Word documents, Excel workbooks and sounds show in Apple's Quick Look in
  the panel; the window draws them with its own readers (a Word page, a
  sheet grid with tabs, its own player).
- The row numbers of a CSV scroll away sideways with the grid; in the
  window they stay.
- More pictures than fit in a row: the window shows three and "+N" on the
  last; here the row gets smaller to fit them all.
- A picture's caption is its own words when it has them, else its name;
  the window may pass other captions.

### 2d: a message's actions

Written 10 October 2026, **not built yet** (as step 1), measured from the
reference window (the Simeon and Gallery chats; two threads were added to
the Gallery to measure them) and read from its code (`JMn` for an
exchange, `b_n` and `u_n` for find):

- **The hover bar** beside a message while the pointer is on it, 6 from
  the bubble and level with its middle: Add reaction, Reply and More (24,
  8 round), Add reaction nearest the bubble.
- **Add reaction**: a Mac menu with the window's six quick reactions in a
  row (👍 👎 ❤️ 😂 🎉 😮) and More emoji. **More**: Start a thread, Copy.
  **A right click** on a message: the reactions, then Reply, Start a
  thread, Copy. Start a thread is not offered inside a thread.
- **Reply**: the message's line over the words (its reply glyph, the line,
  Cancel reply), "Reply…" in the field, which takes the keys; Escape lets
  it go; what is sent answers that message.
- **The message field's two forms**, as the window decides them: on one
  line between the buttons (44 high, 22 round); stacked once the words wrap
  or hold a new line, or a reply is being written (18 round, the words
  across the whole width up to six lines, the buttons on a row under
  them), going back to one line only for short words that fit. With words,
  a grey microphone sits beside the blue Send. (2a had ten lines and the
  microphone or the arrow; the window has six lines and both.)
- **A quote over a reply** jumps to the message it answers and lights its
  row in the window's yellow, which fades after a second; a reply in a
  thread opens the thread instead ("Open reply thread").
- **Threads**: "2 replies" joined under its message as a chin (the bubble's
  lower corners square), or a small pill under the reactions when the
  message has some; "View thread" under the pointer. A thread opens in the
  chat's place under a breadcrumb (the chat's butterfly and name going
  back, a chevron, the thread's first message), its replies under its
  first message; what is written there goes into the thread.

#### Buttons that do nothing yet

| Button | Its part or step |
|---|---|
| More emoji | 2e (done) |
| The thread's title in its breadcrumb (View conversation details) | 7 (done) |

- **Agents' exchanges**: an exchange line's chip opens the two agents'
  messages over the chat when it names one agent; naming several, it opens
  a Mac menu of them ("Agents in this exchange", each with its butterfly,
  by name), and choosing one opens its messages. The exchange covers the
  chat and its field: its head holds the two agents (butterfly and name in
  a pill, ⇄ between them) in the middle; the messages run as in a group
  (the name over the first of a run, the butterfly beside the last), fading
  under the head and over the foot once there is more to scroll; at the
  foot, a lock, "This chat is view-only" and Close Chat. It is read only:
  under the pointer a message shows More alone, which holds Copy (a right
  click too), and a name does not open its chat. Escape closes it.
- **Find in chat** (⌘F): the bar 8 under the chat's head and 16 from the
  right (the glass, "Find in chat", the count once words are typed, a line,
  Previous match, Next match, Close find). It finds what the window finds
  (a message's words, a card's question, an email's subject and body, a
  Slack draft, a notice; not agents' messages to each other), without
  regard to capitals, in the thread while one is open. It starts at the
  newest match, "2/5"; Enter and Next go down, Shift-Enter and Previous go
  up, round at either end, bringing the match's row to the middle; the
  count is red at "0/0" and the arrows are off. Every match is lit in the
  window's yellow at 30%, the current one in the yellow itself with dark
  words, in a message's words (either side, Markdown, lists, quotes and
  tables, app and agent names, links and code in a line) and in a notice.
  ⌘F again takes the field with its words chosen; Escape or Close find
  closes it and its words go. On a thread, or back, it starts again.
- A group's author name sat 6 too far left (2a): it is padded 6 inside its
  button, as measured (the name at 12 from the column).

#### Not in 2d yet

- Find lights words only in messages and notices: the window also lights
  them in a card's text, a file's name, an event's words and an author's
  name, and counts those before a message's words when it picks the current
  one, so in a group chat its current match can sit on the author's name.
  Words inside a code block are counted but not lit.
- The exchange shows what the agent's own chat holds of the two agents'
  messages (SimeonCore's `Chat.exchangeRows`, as the iPhone does); the
  window loads the exchange on its own and can show "Couldn't load" with
  Retry, which is not copied.
- The exchanges' menu and the message menus open at the pointer, as Mac
  menus do; the window's open under the chip or the button.

A message's time at its right comes with a sideways swipe in the window
(its "peeking"), which is 2f (done).

### 2e: the message field's lists, attaching, dictation

Written 10 October 2026, **not built yet** (as step 1), measured from the
reference window (the Simeon chat and the Launch squad group; the
reference now stages attached files as main does, `stageBytes`) and read
from its code. Pushed so far:

- **The lists over the field**, as the window opens them (`cAe`): "@", "/"
  or "#" at the start, after a space or after "(", in the words after the
  last pick; ":" and two letters for emoji (not in "10:30" or "https://").
  Each sits 4 over the trigger's line and from its left (kept inside the
  chat at the right), over the messages: 360 wide on the chat's ground,
  a hairline, 12 round, rows of 28 (the picture 16, the name 13, what it is
  at 40%, its kind at the right), up to 320 high, then it scrolls; emoji
  320 wide, 14 round, ":shortcode:" and the name at 11, up to 260. ↑ and ↓
  choose (round at either end), Return or Tab picks, Escape puts the list
  away until its trigger goes or another opens; the pointer chooses too.
  "@" and "/" with nothing found say "No matches for …" over "Press Esc to
  close"; "#" and ":" close.
- **"@"** (`Mention`): everyone (a group of two or more), the members (a
  group's own; else every other agent and the groups this one is in),
  the agent's routines, the apps connected, filtered and ordered as the
  window does, the ones picked lately first among equals.
- **"/"** (`Reference a skill`): the agent's skills, then the app's
  actions in the palette's order (Org Chart, Open Hidden Agents while one
  is hidden, a group's Members, Channels, Chat Settings, Settings: General,
  Settings: Usage & Billing, Plugins, Theme: System, Light and Dark),
  eight at most, three kept for actions; SimeonCore's
  `ComposerLists.appActions` gives the window's own lists for "", "theme",
  "set", "chan" and "mem" (tested). An action runs and leaves nothing in
  the words; the themes work now (the whole app, kept for the next launch).
- **"#"**: the pull requests the chat named, newest first.
- **":"**: emoji by shortcode, the ones used lately first; a pick puts the
  emoji and a space in place of ":…".
- **A pick in the words** (an agent, a routine, an app, a skill, a pull
  request) sits as one piece, as the window's editor node: its picture
  (16) and name (12, 500) on a grey wash, 4 round; Delete takes it whole.
  What is sent is the words with "@Name" for each pick, and the editor's
  document with the picks (`richText`) as the window sends it. A chat's
  picks stay with its words while another chat is open. What is pasted
  comes in as plain words.

- **Attaching files**: the + opens the Mac's open panel over the window
  for several files; files dropped anywhere on the chat (the window's blue
  wash and "Drop files to add to chat") or on the words, and files or a
  picture pasted (as "image.png"), are taken too. Six at most ("Only 6
  attachments allowed — 2 weren't added."), none empty, none over 25 MB
  (200 MB for a video), each said over the words for five seconds ("2
  files couldn't be attached."); the + is off once six wait. A picture
  waits as a 52-point square of it, any other file as a chip like the
  chat's file card (its icon, name and size), each with Remove; they sit
  over the words, sideways when they don't fit, and the field says "Add a
  message, or hit send." The message can go with files alone; they are put
  on the agent's computer first, as the window does.
- **Dictation**: the microphone (blue while the field is empty, grey
  beside Send with words) asks for the Mac's microphone the first time
  (in the Electron app's words, "Simeon uses the microphone to take your
  dictation and for voice calls with your agents."), then records; the
  recording chip takes Send's place (Stop, the time "0:07", five sound
  bars) and the field says "Listening…". Stop sends the recording to
  Simeon's transcription (`audio/transcriptions`, as the Electron app
  sends it, no language so it is found from the speech) and the field says
  "Transcribing…" under a spinner; what was said goes in at the caret,
  with a space before it when the word before runs on. Under half a second
  is dropped, five minutes stops it, Escape cancels it. A refusal, no
  microphone, no network or any other failure says the window's line in
  red over the words until the microphone is tried again.
- **More emoji** (from a message's Add reaction or right click): the
  full picker where the menu was, in a Mac popover: "Search emoji" (it
  takes the keys), then every category titled over its emoji, 8 to a row
  in 32-point cells, the person's own reactions grey; typed words show
  "Results" or "No emoji found", Return picks the first. A pick reacts (or
  takes the person's own back) and closes it.
- **The lines over the words**, in the window's order: a send refused
  ("This message is already sending and can't be canceled.", red, six
  seconds), dictation's (red), then the files' line (at 40%). A message canceled while it
  waited comes back into its field, words, picks, files and the message it
  answered, when the field is empty (2a dropped it).

#### Buttons that do nothing yet

| Button | Its part or step |
|---|---|
| "/" Org Chart, Channels | 12 |
| "/" Open Hidden Agents | 3 |
| "/" Chat Settings | 7 (done) |
| "/" Members | 7d (done) |
| "/" Settings: General, Settings: Usage & Billing | 8 |
| "/" Plugins | 9 |
| "/" Update Simeon's Computer (offered once the computer's update is known to the field) | 13 |

#### Not in 2e yet

- The emoji picker is a Mac popover, so it has the popover's arrow and
  opens at the pointer; the window's is a menu placed where the reactions
  menu was.
- The sound bars follow the microphone's loudness over the last moments;
  the window's are its frequencies (a spectrum).
- The Mac records AAC (`audio/mp4`); the Electron app records Opus
  (`audio/webm`). The server takes both.
- Dragged over the words themselves, files are taken but the chat's blue
  wash does not show (the words take the drag first).
- "/" offers Channels and Org Chart as the reference does; the window
  offers them only when the account has channels and the org chart is on,
  which the Mac does not know yet (steps 12).
- "#" reads pull requests from the messages' words and documents; a cloud
  agent's card does not add its pull request yet.
- A routine's and a skill's own icon (`iconId`, `iconUrl`) is not drawn: a
  routine shows a clock, a skill sparkles.

### 2f: the butterflies' motion, the working line, scrolling

Written 10 October 2026, **not built yet** (as step 1), read from the
window's code (its mark engine `$_t`, the hidden marks it mirrors, the
activity slot, the transcript's bottom pin and its sideways swipe) and
checked in the reference window. Pushed:

- **Which butterflies move**: as in the window, only an agent's sidebar
  row and the chat's working line (`isStatic: false`); the chat's head,
  a group author's butterfly, the menus, chips and lists stay still. The
  window keeps one hidden 8-point mark per agent that those places mirror,
  so an agent's row and its working line move as one; the Mac shares one
  engine per agent the same way (`MarkStage`), and like the window gives
  every live mark the small mark's zoom on its glyph and the thickest
  trails.
- **The motion** is SimeonCore's `MarkEngine` (the window's engine, its
  numbers tested): resting, the butterfly is still; thinking, it folds
  into the orb and three rippling dots; searching, it sways and turns
  every few seconds; working, it leans in and turns now and then;
  messaging or waiting on someone, five dots circle it; sending to another
  agent, a dot flies out to the top right with a ring; making a picture,
  the orb whirls. Turns throw light trails in the agent's colours
  (`LightTrails`). Drawn as the window draws it: the outline drawn smooth
  through its 96 points while it turns or folds, the gradient over the
  shape's own box, the rim, veins, band, antennae and body fading as it
  folds, the dots and rings in the palette's flat colour, the trails' far
  side behind and near side in front.
- **Resting**: 1.4 s after the agent stops, once nothing is still
  folding, turning or trailing, the butterfly snaps to its rest pose and
  stops drawing, as the window pauses it; it starts again from rest.
- **Clicking the working butterfly** gives it, in turn, a turn, a hop (48,
  28, 14 and 6 units, 1.33 s) and a burst of 22 sparks (dots, dashes and
  pale stars flung out from the wings, falling and fading in under a
  second), as the window's pokes. SimeonCore gained the hop, the burst and
  the whirl's trails drawing in to the orb (tested).
- **The working line** keeps its 40 points under the messages whether or
  not the agent works, so nothing moves when it starts. It comes in over
  0.18 s from 92 % at its left, its butterfly popping in from 60 % a
  little after (0.34 s, 0.22 s late, overshooting); new words rise 4
  points as they come; it goes out over 0.14 s. Each activity's words
  stay at least 0.8 s before the next takes their place, the same words
  swap in place, and after a minute on one activity its time joins it
  ("Searching the web · 3m") (SimeonCore's `ActivityHold`, tested). Before
  the agent says what it is doing the line says "Iris is working", as the
  window does (it said "Working").
- **A new message** that arrives while the chat is at its newest comes in
  over 0.24 s from 12 lower and 94 % about its bottom corner on its own
  side, faded in by 55 % (`sand-1im2lgs`); a chat opened shows its
  messages as they are.
- **Scrolling as the window scrolls**: within 4 points of the newest the
  chat is pinned there, and anything new, longer words or a taller field
  glide it down to stay at the newest; scrolling up lets go, scrolling
  back to the newest pins it again (the window's bottom pin, `lht`). 2a
  followed within 48 points and jumped.
- **A message's time on a sideways swipe**: a mostly sideways two-finger
  swipe over the chat (1.5 points or more, and not over something that
  scrolls sideways itself, such as a code block or a table) moves the
  person's messages left by as much, 82 at most, and every message's time
  ("3:04 PM", 12 at 500, tabular, in the tertiary grey) fades and slides
  in at its right; 90 ms after the swipe it springs back over 0.435 s
  with the window's curve, which overshoots by 3.6 %. Hover bars stay away
  until it is back.
- **Reduce motion** (System Settings, Accessibility), as the window's
  `prefers-reduced-motion`: no turns, trails, hops or bursts; folds happen
  at once; the entrances are a 0.12 s fade; a swipe springs back at once.

#### Not in 2f yet

- A pinned agent's tile (60, live in the window) comes with the pins in
  step 3 (done).
- A group chat's working line with its members' typing ("Iris and Theo
  are typing…", the members' marks taking turns every 2 s) is the
  window's group line (`bJn`); the Mac shows the group's line as in 2a.
- An agent with a picture of its own instead of a butterfly does not move
  in the window; the Mac does not draw such pictures yet.
- The window's grain filter on the wings is left out, as in 2a.

#### Where the native parts look different

The butterflies are drawn by SwiftUI's Canvas each frame the display
draws, from the same engine; the window draws them in SVG. The new
message's and the working line's curves are the window's own
(`cubic-bezier`), and the swipe's release is its `linear()` curve point
for point.

## Step 3: the sidebar's menus

Written 10 October 2026, **not built yet** (as step 1), read from the
window's sidebar code (`sidebar.tsx`, its row, section, pin grid and
selection parts) and measured in the reference window, light and dark.
Pushed:

- **A row's right-click** (C02): Apple's menu with the window's items, in
  its order and groups: Pin (Unpin on a pin); Move to, a submenu of the
  sections with the agent's own ticked, then New section, or Move to new
  section while there are no sections (a pin has neither); Mark as Unread
  (Mark as Read when unread); Edit Profile and Duplicate (none for a group
  or a shared chat, C05); Copy conversation ID; Hide from sidebar and
  Delete in red. Duplicate opens the copy. Copy conversation ID copies the
  agent's id. A pin's menu (C04) is the same with Unpin.
- **Pins** (C03): pinned agents sit over the list as tiles: the live
  butterfly 60 over the name (11) and the title in blue, 80 wide (wider
  for a long title, up to 92 of name), as many columns as fit, 8 apart,
  rows 12 apart, the grid in the middle, padded 6, 8 above and 12 below.
  The open agent's tile is the white card; unread or at work is a 10-point
  dot at the butterfly's corner. On the rail the pins are rows, a hairline
  (54 wide, 15 %) under them.
- **Sections** (C06–C09): Move to new section makes "New section" at the
  top, its name ready to type over (C07: Return or clicking away keeps
  it, Escape leaves it). Each section has its header (30 high, its name 12
  at 60 %, its count while folded, a chevron under the pointer); a click
  folds or opens it over 0.2 s, and folded sections stay folded from one
  launch to the next. "Unassigned" (the agents in no section) comes last
  and has no menu. A section's right-click (C08): Rename, Move up, Move
  down (greyed at the ends), Delete, which asks first ("Its agents move to
  Unassigned. No agents are deleted."). An empty section says "Drag chats
  here". Sections are 10 apart. On the rail the open sections' rows follow
  one another with a hairline between sections.
- **Picking several** (C11): ⌘-click picks a row or lets it go, ⇧-click
  picks every row from the last one clicked (in the sidebar's order:
  pins, then open sections); a plain click lets them go and opens the
  agent. Picked rows take the window's blue wash. While rows are picked
  the head is 44 high with Move to section (a menu), Delete and Clear
  selection at its right (Delete and Clear under the head on the rail).
  A picked row's right-click moves or deletes them all ("Move 2 agents to
  new section", "Delete 2 agents"). Escape lets them go; Delete or
  Backspace deletes them, after the question, unless a field has the
  keys.
- **Renaming** (C10): a double-click on a row puts its name in a field,
  chosen; Return or clicking away keeps it, Escape puts it back.
- **Hiding** (C12, C14): Hide from sidebar takes the agent out of the list
  (it keeps working). Hidden Agents, with their count, then stands at the
  list's foot; it opens the Hidden Agents dialog: each hidden agent with
  Unhide, a click on one opening it. With every agent hidden the list says
  "All bots are hidden" with Show Hidden Agents. An agent open when hidden
  stays open.
- **Deleting** (C15): the window's question, in its words ("Delete
  “Scout”", "This permanently deletes the agent and its chat history.
  This can't be undone.", "Delete 2 agents" and the groups' own words), as
  a Mac alert over the window with Delete in red and Cancel. If the
  computer refuses: "Deleting failed. Check your connection and try
  again." Deleting the open agent opens the first in the list.
- **Unread** (C16): Mark as Unread puts the blue dot on the row at once and
  tells the computer; Mark as Read takes it off.
- **Control-Tab** walks the rows (Control-Shift-Tab back), a blue ring
  inside the row it is on, the list scrolling to it; letting go of Control
  opens that row; Escape, or the window going to the back, calls it off.
- **A draft**: a row whose chat has words typed and not sent (and is not
  the open one) shows "Draft: …" under its name, unless the agent is
  waiting for the person ("Waiting for you: …").
- **Dragging**: a row dragged onto the pins is pinned (where it is let
  go, over a tile); while a row is dragged and nothing is pinned, a dashed
  "Drag here to pin" zone (104 high) stands where the pins go. A tile
  dragged onto another takes its place; dragged onto the list it is
  unpinned (into the section it is let go on). A row dragged onto a
  section moves into it (picked rows go together). A section's header
  dragged onto another section goes above it (dragged up) or below it
  (dragged down), a hairline showing where. What a drop would land in
  greys.
- **No agents**: "No saved agents yet." once the computer has answered.

#### Buttons that do nothing yet

| Button | Its step |
|---|---|
| Edit Profile, in a row's menu | 7 (done) |
| The initials, Connect apps | 10, 9 (as step 1; Search and New chat are steps 4 and 5, done) |

#### Not in step 3 yet

- **Share agent…** and **Leave shared chat**: the window offers them only
  with sharing turned on and for a chat shared from another account; they
  come with the shared rooms (step 12).
- **Show full conversation** and **Show async tasks**: the window's staff
  items, for Simeon Labs' own accounts only; left out.
- Search's "Open Hidden Agents" (C13) comes with search (step 4, done).
- The window's tiles and rows glide to their new places when pins and
  sections change (its layout animation); here they take their places at
  once. A folding section fades.
- The window shows "Deleting..." on its Delete button until the computer
  answers; a Mac alert closes on the click, so the row goes when the
  computer has deleted it.
- Dragging on the rail.

#### Where the native parts look different

The menus are Apple's (SF Symbols for the window's icons), so their rows
are the Mac's height and grey, not the window's 30-point rows. The delete
and section questions are Apple's alerts. Dragging is the Mac's own: the
row's picture follows the pointer, rather than the row itself moving
under it as in the window.

#### What to compare

C02 to C16 in the gallery, each in light and dark, and the rail with pins
and sections against the window folded to its rail.

## Step 4: search (⌘K)

Written 10 October 2026, **not built yet** (as step 1), read from the
window's command palette (`QFn` and its hook) and measured in the
reference window, light and dark, with the computer's search off (as the
gallery shows it) and on (with sample messages, files and a routine fed
in). The matching and the order of the results are SimeonCore's `Jump`,
tested against what the window lists for the same words. Pushed:

- **Opening it** (D01): ⌘K opens and closes it, ⌘⇧F opens it, and so does
  the sidebar's Search. It opens empty, on All, the field taking the keys.
  The window dims (the text colour at 50 %, 70 % on dark) and the panel
  stands in its middle: 560 wide, 16 round, the raised ground, a hairline
  and a deep shadow (none on dark). Escape or a click outside closes it.
- **The field**: the glass (40 %) and "Search" (14 on 22), a hairline
  under them.
- **The tabs** (D02–D04): All, Agents, Groups, Actions; with the
  computer's search on (`isGlobalSearchEnabled`, on by default) also
  Messages, Files, Links and Routines, in the window's order. The chosen
  tab is grey, the rest at 60 %. Tab and ⇧Tab change the tab, and ← and →
  while nothing is typed.
- **The rows**, 49 high, 2 apart: an agent's butterfly with its name, its
  title in blue and its description; a group's members; an action's icon
  on grey and its line ("Views", "Current chat", "Settings ·
  Appearance"); a message's agent with "Theo to you · 6m ago"; a file's
  kind in its colour with "Scout · 1280×800 · 1d ago"; a link's site icon
  and page title over its address; a routine's clock on violet with "Every
  Monday at 9:00 AM · Theo". On All each says what it is at its right
  (Agent, Group, Action, Message, File, Link, Routine); a routine's tab
  shows its last run's date. Holding ⌘ shows ⌘1 to ⌘9 on the first nine.
- **With nothing typed**, All lists the agents (pins first) and then the
  actions; the other tabs their own.
- **Typing** (D05) matches as the window does (each word's letters in
  order, near each other, word starts scoring most; accents and case do not
  count) and lists the best first, the letters found in semibold. The
  computer's own message and file matches that the words do not show
  follow, then any hidden agent that matches with a "Hidden" tag. Words
  that find nothing say "No results" (D06). Messages and files are asked
  of the computer 150 ms after the last key; while its answer is on the way
  the earlier rows stay, and with none yet five grey rows shimmer.
- **The actions**, in the window's order: Org Chart (with the agent network
  on), Open Hidden Agents (with any hidden), for the open chat Members (a
  group), Channels (when it can have some) and Chat Settings, Settings:
  General, Settings: Usage & Billing, Plugins, and Theme: System, Light and
  Dark, the one in use ticked.
- **Keys**: ↑ and ↓ move the light (the list follows), the pointer moves
  it too; Return opens the lit row; ⌘1 to ⌘9 open the first nine. Letters
  still being composed (Japanese, Chinese) keep Return, the arrows and
  Escape. Under search the chat's own keys (⌘F, Escape), its right-click
  menu and its sideways swipe wait. Closed, the message field takes the
  keys back.
- **What a row does**: an agent opens; a message or a file opens its chat,
  reads back until that line is there, and brings it to the middle lit in
  yellow; a link opens in the browser; a routine opens its agent; a theme
  is set at once; Open Hidden Agents opens the Hidden Agents dialog.
- **Empty tabs** say the window's words: "No agents yet", "Search messages"
  ("Type to find messages across your chats."), "No group chats yet", "No
  files yet", "No links in this chat yet", "No routines yet", "No
  actions"; "Search unavailable" when the computer's search fails.
- **Dark** (D07): the panel `#181818`, the lit row grey at 32 %.

#### Buttons that do nothing yet

| Action | Its step |
|---|---|
| Org Chart | 12 |
| Chat Settings | 7 (done) |
| Members | 7d (done) |
| Channels | 12 |
| Settings: General, Settings: Usage & Billing | 8 |
| Plugins | 9 |

Each closes search, as the window's do, and opens nothing yet. A routine
opens its agent; in the window it also opens the agent's pane on its
Computer page (step 13).

#### Not in step 4 yet

- **Join shared room** and **New shared room** (with sharing on) and the
  window's update actions ("Update Simeon's Computer", the app's own
  update): with the shared rooms (12) and the computer (13). The app's own
  update has no Mac counterpart yet.
- The window's developer actions (Feature Flags…, the trace capture) and
  their submenus with a Back arrow: developer builds only; left out.
- The list's fading top and bottom edges while it scrolls.
- Settings: Usage & Billing follows the account's usage page switch in
  the window; here it is always listed (the reference shows it).
- A message inside a folded exchange between agents opens its chat at the
  exchange's row; the window opens the exchange itself.

#### Where the native parts look different

The field is Apple's; the panel is drawn in the window's colours rather
than Apple's glass, as the window draws it. The icons are SF Symbols in the
window's places. The window's ⌃ in the shortcuts (on the Linux reference)
is ⌘ on a Mac, as there.

#### What to compare

D01 to D07, light and dark, and a search with the computer's search on.

## Step 5: new chat (⌘N)

Written 10 October 2026, **not built yet** (as step 1), read from the
window's new chat (its To: line `L4n` and what choosing does, `HDn`) and
measured in the reference window, light and dark (E01–E07). The rules of
the line (its rows, what Return and Tab do, the names) were already in
SimeonCore's `NewChat`, tested; the new chat's own making of agents and
groups is new there (`createChatAgent`, `createChatGroup`). Pushed:

- **Opening it**: ⌘N or the sidebar's New chat. The chat's place shows
  the To: line along its top (44 high, a hairline under it: "To:" at 40 %,
  then the field, "Search or create Agents") with its menu open under it,
  an empty stage, and the message field ("Message Agent"). The sidebar
  gets a grey "Create new" row at the top of its list, and no row is the
  open agent's (E01).
- **The menu** (E01, E02): 26 in from the line, 8 over its foot, 560 wide
  at most, 14 round, raised, a soft shadow. Create new Agent (a plus in a
  grey circle) then every agent and group, 36-high rows, the lit one grey.
  Typing filters and ranks them as the window does, with Create “…” first
  unless the words name someone exactly, the first agent lit (E02, E05).
  Under a hairline: Tab add, ⏎ open. Holding ⌘ shows ⌘1–⌘9 on the rows.
  Empty: "Type a name to create a Agent" or "No matching Agents".
- **The line's keys**: ↑ ↓ move the light; Tab or a comma adds the lit row
  as a chip (E03); Backspace on empty words takes the last chip off;
  Return opens; Escape clears the words, then shuts the menu, then closes
  the new chat; ⌘1–⌘9 choose a row. A click on a row does what ⌘ and its
  number do. Letters still being composed keep their keys.
- **Chips** (E03, E04): 24 high, round, grey, the agent's butterfly (16)
  or a plus for a new name, the name (12), Remove. With anyone on the line
  the field says "Add or create another Agent" and a Close sits at the
  right. The message field says "Message Theo, Iris"; the sidebar's row
  says "Theo, Iris". Six at most.
- **One agent on the line** (E03): its chat opens under the line, and the
  sidebar shows it as the open agent; sending from its field sends to it
  and closes the new chat.
- **Return on the line** opens what is chosen: an agent; a new agent made
  from the name (introducing itself, or, when the name reads like a
  request, taking it as its first message; E05–E07); several, a group
  named for them ("Theo, Iris"), any new names made first. Anything already
  typed below waits in the chosen chat's field, files with it; a new agent
  opened that way does not introduce itself. Create new Agent makes "New
  Agent".
- **Return in the message field** with someone on the line sends it: to
  the agent, to a new agent as its first message, or to a new group of
  them.
- While an agent or group is being made, the chat's place shows the Mac's
  spinner until its chat opens. At 50 agents the computer refuses, and the
  window's alert says so ("50 is the maximum"). A group that fails takes
  the agents just made for it away again.
- Escape in the new chat closes it once nothing smaller is open (a list in
  the field, a reply, find, letters being composed); opening an agent (the
  sidebar, search, Control-Tab), even the one already open, closes it too.
- If making the agent or group for a message fails, the new chat comes
  back with the people on its line and the message in its field.

#### Not in step 5 yet

- The window's prefetch of an agent's chat as its row is lit.
- The window's "picking" pane (a new agent from a template, `e5n`): nothing
  in the merged window opens it (its `openPicker` has no caller), so it is
  not copied.
- The window shows its own creation screen while an agent is made; here it
  is the Mac's spinner alone.

#### Where the native parts look different

The To: field is the Mac's own text field; the spinner is Apple's; the
alert is Apple's. Keys and layout are the window's.

#### What to compare

E01 to E07, light and dark; then the sidebar's row and the message
field's words with two people on the line.

## Step 6: the first run

Written 10 October 2026, **not built yet** (as step 1), read from the
window's onboarding flow (`eDn` and its steps, with the renderer patch's
MEET, COO, CONNECT, COMPUTER and NAME parts) and measured in the reference
window at 1280 × 800, light and dark (A04–A08b, A30). SimeonCore already had
the flow's rules and the hand-off (`Onboarding`, `firstRun()`, `handOff()`,
`saveName()`); new there: Meet's and the computer's beats, the name step's
suggestion (`namePrompt()`), the computer's probe, and the butterfly's
"happy" and "proud" moods, tested. Pushed:

- **When it shows**: after "Setting up Simeon's computer", the window's
  start-up gate: never onboarded and no agents. A computer that does not
  answer yet (a new account's) is asked once more after 2.5 s, then the
  first run shows anyway; its hand-off waits for the computer and makes
  nothing if agents turn up. Otherwise the window opens. To see it on an account that already
  has agents, launch with `--first-run` (or `SIMEON_FIRST_RUN=1`); its
  hand-off then makes no second Simeon.
- **The frame of every step**: the whole window, the ground colour, things
  placed about its centre. A title (28, `-0.02em`), the step's scene, and
  Next over Back (288 × 36 pills, 12 apart; Next near black, near white on
  dark; Back grey; both darker under the pointer). A step fades in over
  0.2 s as the last fades out over 0.1 s. The top 52 points move the
  window.
- **Meet Simeon** (A04): Simeon fades in large (×2.3) on the window's slow
  spring, turns once round his upright axis (1.4 s), then settles at his
  seat 40 above the centre while "Meet Simeon" (168 above) and Next (56
  below) rise in. Back on the next step plays it again.
- **Simeon is your personal Chief of Staff** (A05): the title 296 above,
  "He hires an agent for every job you hand off." under it (15, the system's
  grey), Simeon proud at his seat, and six agents (Inbox, Research, Travel;
  Finance, Sales, Content) 300 out each side, faint until the blue curve
  from his side reaches them, one after another.
- **Your agents connect to the apps you already use** (A06): the site's
  connector scene: twelve app logos sliding behind a frosted tile one place
  every 1.6 s, the one behind the glass swelling, the far ones blurred, the
  row fading at both ends; Simeon on the tile.
- **They have their own computer and work just like you** (A07): the
  window's drawing of a computer (the wallpaper, two windows of white
  tiles) at 1.45 times on the centre; Simeon is the cursor, with the arrow,
  thinking under the screen, then every 0.9 s moving or pressing: a tile,
  another, the first window's close (it goes), the second window's button.
- **How should Simeon & Co call you?** (A08, A08b): three agents bounce in
  over a white field (300 × 38, the words centred, a blue ring when it has
  the keys), "They’ll use it in chat and on calls. You can change it later."
  under it. The field takes the keys after 0.45 s and offers the name the
  person chose, else Google's first name, until they type; never one made
  from the e-mail. Return is Next. Empty is allowed: nothing is saved.
- **The hand-off** (A30): Next on the name step saves the name and shows one
  line on the centre in the window's moving light: "Getting your team
  ready…" once the computer answers (asked every 2.5 s from the first
  step), else "Setting up your Simeon…" with the computer's percentage, or
  "Waking your computer…". Simeon is made (the Chief of Staff) and starts
  his introduction; at least 1.5 s later the window opens on his chat
  (A09). A failure says "Simeon couldn’t finish setting up", why in red,
  and Try again (no second Simeon).
- **A window narrower than 600 points** follows the window's phone rules:
  agents and seats come in to the width, the computer is sized to it, titles
  are held by their last line and sized to the width, lines may wrap, and a
  short window scales the whole flow about its centre. A wider window is
  never scaled, as in the window: below about 712 points high the
  computer step's title and Back are cut off.
- Going back to the name step empties the field (the suggestion fills it
  again), as the window does.
- People who reduce motion get each scene finished, as the window does.

#### Not in step 6 yet

- The name sheet the window shows once after the first run when no name was
  given ("What should your agents call you?", Not now asks again next
  launch): with the account (step 10).
- The window's `text-wrap: balance` on a narrow window's titles: SwiftUI
  breaks lines its own way.
- The butterflies' eyes follow the pointer in the window (`isGazing`); the
  butterfly has no eyes to move, so nothing shows that in either.

#### Where the native parts look different

The name field is the Mac's own text field (its caret is the Mac's, and
the Mac may draw its placeholder's grey and letter spacing its own way); the
frosted tile under Simeon on the apps step is Apple's glass, with the
site's white rim and shadow on it, so its blur is Apple's; Try again and
the rest are drawn as the window draws them. Meet's turn uses SwiftUI's
perspective, set to the window's 900 points for an 80-point Simeon.

#### What to compare

A04 to A08b, light and dark, each a few seconds after its Next (the scenes
move); the moments between them (Meet's turn, the curves drawing, the
cursor's presses); then A30 and the window opening on Simeon's chat (A09).

## Step 7: the agent pane

Written 10 October 2026, **not built yet** (as step 1), read from the
window's details pane (`E3n`, `IDn`, `p3n`, `h3n`, and the renderer patch's
AGENT_PANE parts) and measured in the reference window at 1040 × 760 and
760 × 600, light and dark (I01–I07, B09). It comes in four parts, each
pushed when written: **7a** the pane, its tabs and Profile; **7b** the
avatar editor; **7c** Routines; **7d** a group's members and a flight's
details in the pane.

### 7a: the pane, its tabs, Profile

- **Opening it**: the chat head's butterfly or name (again closes it, on any
  page), ⌘⇧,; Edit Profile in a row's menu (that agent opening if it is not
  the open one); Chat Settings from search or "/"; a thread's title in its
  breadcrumb, ⌘⇧I and ⌥⌘B (these close it whenever it is open). It opens on
  Profile. Closing: its ×, Escape (once nothing smaller takes Escape: a
  field, a reply, a list, the new chat, a viewer, search), the head's button,
  or dragging its edge narrower than 244 points and letting go.
- **Where it sits**: on the window's right, 480 wide (280 to 480, its left
  edge drags; the width and whether it is open are kept from one launch to
  the next). It widens from the right over 0.24 s, its page sliding in with
  it and fading in. Opening it folds an open sidebar to its rail (I01);
  closing it opens the sidebar again, unless the sidebar was opened
  meanwhile. It shows only while the chat keeps its 424 points beside the
  sidebar; in a narrower window it stays open but is not drawn (B09), and
  shows again when the window is wide enough. Opening it in a window too
  narrow for it beside the rail grows the window by what is missing, and
  closing it shrinks the window back if its width was not changed meanwhile.
  ⌘B opening the sidebar beside it grows the window too. The new chat hides
  it while it is open; making an agent from the new chat closes it.
- **Another agent opened**: the pane stays open, drawn afresh on Profile.
- **The pane** (I01): its ground `#fbfbfd` (`#1c1c1e` on dark), a half-point
  line on its left (darker under the pointer), a 44-point top bar with ×
  (28 × 28, round 6) that moves the window elsewhere. The page, padded 6 20
  40: the avatar's button (a 96-point disc, the butterfly at 64, a group's
  members in its middle, the 32-point pencil disc at its lower right), the
  name (22, medium), the title when it has one (15, grey); the three tabs
  (a 36-point pill track, Profile, Routines and Computer as icons, the
  chosen one's white pill sliding under it, a short line between the other
  two), then the page.
- **Profile** (I01, I06, I07): Name ("Bob" when empty), Title ("Describe
  what your agent does"; not for a group) and Description ("What this agent
  is for"), grey labels over the words, a hairline under each that turns to
  the text's colour while it has the keys. A field is saved when it lets go
  of the keys: Return does that for Name and Title; in the description
  Return is a new line, and it grows from 44 to 160 points then scrolls.
  Escape puts the stored words back. An empty name is not saved. The Chief
  of Staff's title and description are read only. For an agent,
  Notifications: the bell's tile, "Notifications", "Get notified when this
  agent finishes or needs input", and the switch (the window's blue when
  on), which says whether the agent tells the person when it finishes or
  needs them.

#### Buttons that do nothing yet

| Button | Comes with |
|---|---|
| The avatar's button and its pencil (Edit Avatar) | 7b (done) |
| The Routines tab's page (the tab switches; its page is empty) | 7c (done) |
| The Computer tab (a group's: 7d, done; an agent's computer) | 13 |
| "/" and search's Members | 7d (done) |

#### Where the native parts look different

The switch is the Mac's (small); the fields are the Mac's own text field
and text view. The Chief of Staff's read-only title and description are
selectable words rather than fields the keys can enter. The ×'s icon is an
SF Symbol. The window's own group avatar in the pane is cut off (its member
pictures forced to 96 points); here the members sit in the disc's middle,
as the avatar draws them elsewhere.

#### What to compare

I01 (Profile), I06 (a group), I07 (dark), B09 (760 × 600: the pane not
drawn); open and close it from the head, ⌘⇧, and Escape and watch the
sidebar fold and open; drag its edge, and below 244 let go.

#### After the compile review (pushed with 7c)

- A field still holding the keys when the pane closes or another agent
  opens is saved as letting go would (once).
- The description measures its height at its laid-out width (it opened at
  the wrong height before), and its line darkens when it takes the keys,
  not at the first letter.
- Closing a pane that grew the window: the pane slides shut first, then the
  window shrinks back (it vanished at once before).
- Escape with an agents' exchange open closes the exchange, not the pane.
- Dragging the edge counts from where the drag started (a click on it no
  longer moves it), and the resize arrows go if the pane closes under the
  pointer.
- Opening the pane while the new chat is open still folds the sidebar: the
  window does the same (`agent-pane-compacts-sidebar` runs on the store's
  open, whatever hides the pane).

### 7b: the avatar editor

Read from the window's editor (`c3n`, `e3n`, `l3n`, and the patch's voice
picker) and measured (I04). Pushed:

- **Opening it**: the avatar's button or its pencil opens it, again closes
  it; a click anywhere outside it, or Escape, closes it. It sits 6 under the
  avatar, centred on it, 294 wide, over the page (round 16, the raised
  ground, a hairline edge, a soft shadow, no arrow).
- **Its head**: Agent, Generate, Upload (a group has no Agent and opens on
  Upload), the chosen one on the grey; Reset at the right: "Reset to the
  Agent" when the agent has a picture (it takes the picture away), else, on
  Agent, "Reset character to default" when the agent has a stored colour.
- **Agent**: the twelve colours, six a row, the agent's ringed; a click saves
  it at once and the editor stays open. For an agent with a picture a colour
  is only shown on the avatar, with Cancel and Set avatar under it (Set
  avatar saves the colour and takes the picture away). Then Voice: the
  Mac's pop-up of the voices by name and a round play button for the
  voice's sample; a pick is saved at once ("Couldn’t save the voice." if
  refused). Hidden when calls are off.
- **Generate**: "Describe your avatar…" (⌘Return also generates), Generate;
  while it draws, the words on one line, a pulsing grey disc and
  "Generating…". The picture then goes to the crop. Closing the editor
  meanwhile still saves the picture, cropped in its middle; another tab
  meanwhile throws it away.
- **Upload**: the dashed drop zone ("Drag, drop, or paste an image", "or",
  Browse files), blue while a file is over it; the Mac's open panel ("Choose
  an avatar image": png, jpg, jpeg, webp, gif, bmp); ⌘V outside a field
  pastes a picture (and goes to Upload). Over 25 MB, unreadable or not a
  picture: the window's words in red.
- **The crop**: the picture in a 96-point circle that drags it, its name and
  size, "Drag to reposition", −, the Mac's slider (1 to 5), +; Restart and
  Set avatar ("Saving…"), which saves a 256-pixel PNG of the circle's
  square and closes the editor. The pane's avatar shows the picture.

#### Not in 7b

- An agent's picture shows on the pane's avatar only; the sidebar's rows,
  the chat's head and the rest still draw its butterfly. The window draws
  the picture everywhere: that comes when those screens are checked against
  an agent with a picture (step 14's pass).
- "Voices aren’t available right now." when the voices fail to load: the
  core cannot tell a failure from calls being off, so the picker is hidden
  in both cases. A sample plays from the network (the window downloads it
  first).

#### Where the native parts look different

The voice list is the Mac's pop-up button, the zoom the Mac's slider, the
open panel the Mac's; the generate field is the Mac's text editor. The
play and stop glyphs, minus and plus are SF Symbols.

#### What to compare

I04 light and dark; Generate and Upload with a picture in the crop; a
group's editor; an agent with a picture and a colour picked.

### 7c: Routines

Read from the window's list and editor (`K2n`, `_2n`, `P2n`, `Ugn`, `$gn`,
the event fields, the store's Test run wait) and measured with a routines
fixture (light and dark: the list, the empty state, the editor new and
stored, every frequency, every event, the menus, Running…, the save error).
Pushed:

- **The list**: New Routine at the right (only when there are routines),
  then the routines, active ones first: 48 high, round 10, the clock in
  green, the spinner in blue while its run goes, the pause sign when paused;
  the name over the host's words for when it runs, or "Paused". With none:
  the clock's tile, "Routines are recurring tasks this agent runs on a
  schedule." and Create Routine. Nothing while the first read is on its way
  or failed. Rows update as the host sends its lists.
- **The editor** takes the whole pane: Back to Routines, "Routine", Close;
  then Active (the Mac's switch), Delete, Test run; the bar's hairline shows
  as the body scrolls. Name ("Name this routine", taking the keys for a new
  routine), Instruction (80 to 160 high, then it scrolls), When to run, Run
  history. A field is saved when it lets go of the keys; empty or unchanged
  puts the stored words back. A new routine is made only once it has a
  name, an instruction and a trigger that is right; edits made while it is
  made go after it as one update when they change anything. "Couldn't save
  this routine." when a save fails, until the next one is tried. A stored
  name, instruction or trigger changed elsewhere shows unless it was edited
  here. Delete asks nothing and goes back to the list (a routine still being
  made is deleted when it comes back). Test run: not for a routine not yet
  made; "Running…" from the click until its run has ended and 3 seconds
  more, or while its newest run goes; Run history comes into view.
- **When to run**: the rows (the clock, or Slack's, GitHub's, Teams',
  Linear's, Sentry's and PagerDuty's marks; the sentence, its first word
  darker; × under the pointer), Add trigger / Add another (none at eight).
  The Add menu: On a schedule › Every hour, Every day › a time, Weekdays › a
  time, Every week, Every month, Interval, Advanced… (each saved at once; the
  last four open their popover), then Slack message, Git event, Teams
  message, Linear issue, Sentry alert, PagerDuty incident (each opens its
  popover; saved once right). × on the only row empties the card and opens
  the Add menu; nothing is saved (a routine needs a trigger).
- **A row's popover**, under it, over the rows below: Frequency and its
  controls (at :minute; at a time; on a day at a time; on the nth at a time;
  every so many minutes, hours or days), Advanced's grid (Months, Days, Time
  at times or every so many between two hours), Custom's line; Slack's,
  Git's, Teams', Linear's, Sentry's and PagerDuty's fields with the window's
  words and placeholders. A pick saves at once; a field saves when it lets
  go of the keys (Return). A click outside it or Escape closes it: rows that
  are right are saved, others go back (an event never completed goes).
- **Run history**: when each run began ("Just now", "4 min ago",
  "Yesterday at 5:08 PM", again every 30 seconds) and its sign (✓, ×, the
  spinner), its detail under the pointer; "No runs yet".
- **A routine's chip in the chat** opens the pane on Routines with that
  routine's editor (the list when the routine is gone); three or more open
  a menu of them.

#### Not in 7c

- Coming back from the editor puts the keys on the routine's row in the
  window; here nothing takes the keys (the Mac's buttons take them only
  with keyboard navigation on).
- The run times are in the Mac's time zone; the window uses the one set in
  Settings when there is one (Settings is step 8).
- The Add menu's and the selects' keyboard behaviour is the Mac's menus'.

#### Where the native parts look different

The menus are the Mac's: the Add menu's submenus open where the screen has
room (the window's always open to the left); a select's menu opens with the
chosen item over the pill, as the Mac's pop-up buttons do (the window's
list opens under it, scrolled to the chosen one); the ticks of Months, the
days and the Git events are the Mac's checkboxes in the menu, which stays
open while ticking. The switch is the Mac's. Chevrons, ×, + and the run
signs are SF Symbols; the clock and the spinner are drawn.

#### After the compile review

No compile errors were found in 7b or 7c. Fixed: the menus, the Add menu
and the avatar's "outside" read where their buttons are when clicked (they
used where they were before the page scrolled); the whole Instruction box
takes the keys, not only its lines; an open popover covers Run history
instead of pushing it down, the page growing only by what passes its end;
after a create, a change made elsewhere is followed at once; Escape while
letters are being composed stays with the field over the avatar editor;
the crop's open hand and an exchange's Escape no longer outlive their
views.

#### What to compare

The rl-* captures (list, empty, open, weekly, advanced, advanced every,
the Frequency and Time menus, the Git menu, Teams, the save error, an
invalid custom line), light and dark; make a routine from New Routine
(nothing is made until all three are there); Test run and watch
"Running…"; × on the only trigger.

### 7d: a group's members, a flight's details

Read from the window's members list (`z2n`, `F2n`) and the patch's flight
pane (`__simeonOpenFlight`, `__simeonUseFlight`, `__simeonFlightDetails`)
and measured with fixtures (groups of 0 to 6, a working member change, a
round trip with a logo), light and dark. Pushed:

- **A group's Computer tab** is its members: "Members", a 40-point row for
  each (its butterfly at 28, its name, cut at its end), Remove at the right
  under the pointer (red; pale and not pressable with one member left or
  while a change goes), Add Member while the group has fewer than six and
  someone can be added, and under the list "Groups can have up to 6
  members." or "Create more Agents to add them here." A row opens that
  agent's chat; the pane stays, on its Profile. The tabs' Computer now
  switches; an agent's computer on it is step 13, and a shared room's tab is
  empty.
- **Add Member**: a menu of the agents that are not groups and not in it,
  most recent first, each with its butterfly; a pick adds it at the end (a
  refusal says nothing).
- **Remove**: the Mac's alert, "Remove {name} from this conversation?",
  Remove and Cancel. Remove reads the members as they are then; while the
  change goes it reads "Removing..." and neither button can be pressed; a
  refusal keeps the alert open with "Removing failed. Check your connection
  and try again."
- **Members** in search and in "/" opens the pane on Computer, for a group
  whose members can change.
- **A flight**: a row of a flights card opens its details in the pane, in
  place of the agent's page (only the ×): the airline's mark (72, white in
  both themes), "FROM → TO", date · time · stops; Price, each leg (Departs,
  Arrives, Flight, Cabin, Time in the air, a layover after a leg that is not
  the last), Fare; the server's words as they come. The open row shows
  pressed; pressing it again closes the pane. It opens without growing the
  window and on no page; another row swaps the flight and keeps the scroll.
  It belongs to the chat it came from: another agent's pane shows that
  agent, and going back shows the flight. Closing the pane in any way
  forgets it (it stays on screen while the pane slides shut, where the
  window slides out the Profile).

#### A decision taken

The window hides Members for a room the person shares (`isSharedRoom`),
which this host never sends; it sends `sharedRoomId`, and refuses member
changes for such a room. Here a group shows its members unless it has a
`sharedRoomId` (or `isSharedRoom`) or is someone else's room (`remoteRoom`),
and search and "/" use that one rule (they disagreed before).

#### Not in 7d

- An agent's computer on its Computer tab (step 13).
- The window adds a member only when the host sends the new list back;
  here the list changes at once and goes back if refused (the core's way).
- The rows' keyboard order and focus ring are the Mac's.

- A member with a picture of its own shows its butterfly in the list and
  in Add Member's menu, as the sidebar does (pictures everywhere come with
  step 14's pass, as noted in 7b).
- To check on a Mac: the remove alert growing to show its failure line
  once it is already open.

#### Where the native parts look different

The remove question is the Mac's alert (the window's own dialog sits in the
window's middle over a dimmed backdrop; its failure line is red). Add
Member's list is the Mac's menu. The plus is an SF Symbol.

#### What to compare

The members-* and flight-* captures, light and dark: a group of three, of
one, of six; Add Member's menu; the remove alert, its "Removing..." and its
failure; ⌘K and "/" Members for a group and an agent; a flight from a card,
the same row again, another agent and back.
