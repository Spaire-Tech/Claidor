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

- **Sign-in** (A01; simpler since 29 October 2026): the SimeonLabs logo
  lighting up, "Sign in to Simeon", and two buttons, Sign in (filled) and
  Sign up (outlined). Sign in opens the sign-in page in the Mac's own
  browser, as the Electron app does; Sign up opens the web app's sign-up
  page (`mode=signup`), and either way the app signs in the same.
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
| The account's initials | 10 (done) |
| Connect apps | 9 (done) |
| Simeon › About Simeon | 10 (done) |
| Agent › Call … | 11 (done) |
| A row's right-click | 3 (done) |

### Not in this step yet

- **The chat** (step 2, below).
- **Pins and sections** (step 3, done): pinned agents are at the top of
  the list as plain rows, not yet as the large tiles of C03; a section's
  heading is not drawn yet.
- **The butterflies' motion** (step 2): in the Electron window an agent's
  butterfly moves while it works and turns into the typing dots while it
  writes (Simeon's, on the rail in B05). Here they stand still.
- **The theme setting** (step 8, done): Settings › General › Theme, ⌘K and
  "/" set it.
- **A new account's first run** (step 6, done).
- **"Can't reach your computer"** (step 13, done).

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
| The call button in the head | 11 (done) |
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
  computer's notices over it: step 13 (done).

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
  computer open the computer, step 13 (done).
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
| "/" Org Chart, Channels | 12 (done) |
| "/" Open Hidden Agents | 3 |
| "/" Chat Settings | 7 (done) |
| "/" Members | 7d (done) |
| "/" Settings: General, Settings: Usage & Billing | 8 (done) |
| "/" Plugins | 9 (done) |
| "/" Update Simeon's Computer (offered until the computer is known to be up to date, as the window does) | 13 (done) |

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
| The initials, Connect apps | 10 (done), 9 (done) (as step 1; Search and New chat are steps 4 and 5, done) |

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
| Org Chart | 12 (done) |
| Chat Settings | 7 (done) |
| Members | 7d (done) |
| Channels | 12 (done) |
| Settings: General, Settings: Usage & Billing | 8 (done) |
| Plugins | 9 (done) |

Each closes search, as the window's do, and opens nothing yet. A routine
opens its agent; in the window it also opens the agent's pane on its
Computer page (step 13, done).

#### Not in step 4 yet

- **Join shared room** and **New shared room** (with sharing on) and the
  window's update actions ("Update Simeon's Computer", the app's own
  update): with the shared rooms (12) and the computer (13, done). The app's own
  update has no Mac counterpart yet.
- The window's developer actions (Feature Flags…, the trace capture) and
  their submenus with a Back arrow: developer builds only; left out.
- The list's fading top and bottom edges while it scrolls.
- Settings: Usage & Billing is listed once the account's usage is in hand
  and not an enterprise team's, as in the window (step 8; before it, it was
  always listed here, which was wrong against the window).
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
> Replaced on 12 October 2026: the first run is one screen, the name, then
> the window on Simeon's chat (`mac/Simeon/FirstRun.swift`). What follows is
> the Electron window's six scenes as they were copied.

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
| The Computer tab (a group's: 7d, done; an agent's computer) | 13 (done) |
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
  an agent with a picture (step 14's pass). **Done in step 14.**
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
  switches; an agent's computer on it is step 13 (done), and a shared room's tab is
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
  place of the agent's page (only the ×), laid out as the iPhone's sheet
  since 24 October 2026 (the founder: "mac flight info have to be like
  iphone"): "FROM to TO" over its stops and time; the total in green; a
  card per flight (from and to with the airline's logo, departing and
  arriving, the flight, cabin and time in the air), the layover between
  two, a round trip's ways under their titles; the fare's terms in a card
  of their own. The open row shows
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

- An agent's computer on its Computer tab (step 13, done).
- The window adds a member only when the host sends the new list back;
  here the list changes at once and goes back if refused (the core's way).
- The rows' keyboard order and focus ring are the Mac's.

- A member with a picture of its own shows its butterfly in the list and
  in Add Member's menu, as the sidebar does (pictures everywhere come with
  step 14's pass, as noted in 7b). **Done in step 14.**
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

## Step 8: Settings

Read from the window's Settings (the settings chunk's modal, General and
Usage & Billing, and the patch's Manage Plan card) and measured in the
reference window at five sizes, light and dark, with usage fixtures from
loading to over the limit (J01–J07). Pushed:

- **Where it is**: over the whole window, dimmed at 50% under it, no
  animation; a panel of at most 1000 × 702 (the window less 40 and 94),
  round 14 (#F5F5F7 with a soft deep shadow; the raised ground on dark). Its
  pages on the left (198 wide): General, and Usage & Billing once the
  account's usage is in hand (not for an enterprise team). The page's name
  (17, medium) at its top, × at the corner. Each opening starts on the page
  asked for, at its top.
- **Opening and closing**: ⌘, (General; again while it is open, nothing),
  Settings: General and Settings: Usage & Billing in ⌘K and "/". Escape,
  ×, or a click on the dim close it; Escape in a rule's field is the
  field's. Search opens over it; an agent picked there opens its chat and
  closes Settings. The app menu has no Settings item, as the window's.
- **General**:
  - Account: the person's letters (or picture), name and e-mail with Copy
    (a check for 1.2 s), Sign Out, which asks ("Sign out?") and goes back
    to sign-in.
  - Appearance › Theme: Follow System, Light, Dark, at once.
  - Agent › Timezone: Auto-detect (this Mac's zone) or a zone, each with the
    time there now; the agents' and routines' zone.
  - Agent › Execution on Local Computer: Always allow, Ask every time
    (default), Never allow; choices above a team's ceiling greyed, with its
    line. Given to the computer until it says it back.
  - Agent › Auto-review: the switch; on, its rules: a rule written and
    added (⌘Return too) to Allow automatically or Ask first, 20 a list
    ("max 20 rules"), the table (Action, Behavior, Edit, Delete), a rule
    edited in its row (Cancel, Save Rule), and "These rules apply only to
    you…".
  - Security Key › Use hardware security keys (on by default).
  - A change shows once the computer has taken it, its control waiting
    meanwhile; a refusal leaves it as it was and says nothing.
- **Usage & Billing**: Weekly usage (Trial usage) with its bar, value and
  "Resets in N days" (again every 30 seconds); On-demand usage; the upgrade
  line and its button (the browser) when they apply; Cancel Trial with its
  question ("Canceling…", the failure kept in it); "Couldn’t refresh usage
  — showing the last known values." with Retry; Manage Plan ("Current plan:
  Pro", its line, Upgrade to Max, Manage Billing ↗, each opening Stripe in
  the browser, "Opening…", the failure under the card). The usage is read at
  sign-in and when the page shows, at most every 30 seconds.

#### Not in step 8

- The security key itself: the Electron app signs with the key on the Mac
  for the computer; that comes with the Mac's own parts (step 14). Until
  then the switch keeps the choice on this Mac and does not tell the
  computer, so it cannot turn keys off for the Electron app on the same
  computer. **Step 14 tells the computer the switch**; answering a key's
  request from this Mac is still not in (step 14, decision 19).
- The account card's "Signing in" and "Not signed in" states: Settings is
  only reachable signed in here.
- Keyboard: nothing in Settings takes the keys when it opens, and Tab
  moves as the Mac's controls do (the window's first Tab lands behind it).
- The Timezone menu lists the Mac's own zones (modern names such as
  Asia/Kolkata, GMT), not Chromium's 419.
- The theme is the Mac app's own (it is not shared with the Electron app's
  settings file).

#### A decision to confirm

⌘N and ⌘B act on the window behind Settings in the Electron app (the new
chat opens behind it; the sidebar folds). Here they do the same, since it
costs nothing; say if they should wait while Settings is open.

#### Where the native parts look different

The selects are the Mac's pop-up menus (the chosen item over the button);
the switches are the Mac's (mini); the sign-out and Cancel Trial questions
are the Mac's alerts (a failure's words go into the alert's text, not a red
line); the rule fields are the Mac's text views. Icons are SF Symbols
(gearshape, chart.bar, doc.on.doc, square.and.pencil, trash).

#### What to compare

J01–J07 and the settings-* captures, light and dark: General at the top and
scrolled, each select open, the time zone menu, the ceiling's line,
Auto-review off and on with rules, a rule being edited, Usage & Billing on a
plan, on a trial, over the limit, with on-demand; Manage Plan's buttons;
⌘, ⌘K, "/", Escape and a click on the dim.

#### After the compile review

A second reader with the compiler's rules found no compile errors and these
behaviour faults, fixed:

- Search closed over Settings gave the keys back to the message field, so
  the next Escape went to the field and Settings stayed. Now the keys stay
  with Settings.
- The avatar editor's ⌘V (and Escape) acted behind Settings. They wait now.
- A routine's trigger popover or the avatar editor stayed open behind
  Settings. Opening Settings shuts them, as a click outside them would.
- Signing out with Settings open left it open for the next sign-in. It
  closes with the window now.
- The Timezone menu made a new date formatter for each of its ~600 rows.
  One formatter now serves the whole menu (`TimeZoneChoices.timesNow`).
- A message, a file or a routine picked in ⌘K over Settings opened its chat
  under Settings. Settings now closes for them, as it does for an agent
  (only the agent row was measured in the Electron app).

Not changed: the zone shown as "Auto-detect" is read when Settings opens;
moving the Mac to another zone with Settings open shows the new zone at the
next opening. Still to check on a Mac: the Cancel Trial alert's layout
while its button says "Canceling…".

## Step 9: Connect apps (Plugins)

Read from the window's Plugins overlay (the chunk `view-B5Ug8wEm.js`, the
patch's light look) and measured in the reference window at four sizes,
light and dark, with fixtures for the states the demo does not show (a
slow and a failing add, every sign-in answer, five statuses, a second
account, a server no entry claims, team installs, setup values, 24 tools,
skills, the GitHub banner, an empty or failing catalog). Pushed:

- **Where it is**: in Settings' place over the window (one of them at a
  time: ⌘, over Plugins brings Settings, Plugins over Settings replaces it),
  the same panel and dim; × 28 round at the corner. No motion anywhere:
  pages, tabs and Added change at once.
- **Ways in**: Connect apps at the sidebar's foot, ⌘K and "/" "Plugins",
  ⌘⇧M and ⌘⇧W (both on Marketplace, as the window's), and a plugin's link
  (`simeon://app/v1/plugin/add?id=…`), which opens that plugin's page.
  Ways out: Escape (the search's words first, then the search itself, then
  Plugins; on a page too), ×, a click on the dim, an agent, message, file
  or routine picked in ⌘K. Closing forgets the view (Marketplace, no
  search, no filter, no page).
- **The bar**: Marketplace and Yours (chosen on the press), the Filter
  button and its menu (Type: All types, Connectors, Skills; Ownership: All,
  Team, Public; it stays open while choosing), "Search plugins" (240 wide,
  each key filters at once; ⌘F puts the keys there). The search is shared
  by both tabs; each tab has its own filter.
- **Marketplace**: the sections A to Z (Featured first when there is one),
  "Results" while searching; two columns of rows (64 high: the logo, the
  name, its line, Add, the spinner while adding, or Added with its tick);
  4 rows a section with "Show N more"; the empty lines ("Loading the
  marketplace…", "No plugins match …", "The marketplace isn't available
  right now…").
- **A plugin's page**: Back, its name in the bar; the logo (56), the name,
  View Source ↗, the description; Add (the blue), Uninstall, or the team's
  label with Remove; Accounts (each one's status word and Authenticate,
  Reopen while its sign-in waits in the browser, Retry after ten minutes),
  Tools (folded, "n of m enabled", each switch), Setup Values with Edit
  Values, Connectors and Skills (folded). A server no entry claims has its
  own page with Details (Source, Transport, URL or Command, Tools).
- **The setup page** (Add on a plugin that asks for values, or Edit
  Values): each value (secrets hidden, "(optional)"), what is missing, then
  "Add <Name>" or Save Values; Return sends.
- **Yours**: the GitHub banner with Fix with agent (it opens or makes the
  Plugin Setup agent and opens its chat), Installed (6 rows, "Show all N
  plugins"; each with its status word or sign-in), Private (the open
  agent's skills, each with its switch); a skill's page with Name,
  Description, Instructions, Save and Delete skill.
- **The notice** at the panel's foot, green or red, 3.5 s (6 s for a
  failure), with Dismiss.

The calls are the Mac app's first Plugins window's (checked again against
the window and the box: `desktopMcp` `getCatalog`, `listServers`,
`listEffectivePlugins`, `installEntry`, `updatePluginInstall`,
`uninstallPlugin`, `removeServer`, `authenticateServer`, `listServerTools`,
`toggleMcpToolDisabled`, `resolvePluginLogo`; the agent's skills and the
plugin sync). Read when Plugins opens, the servers again every 15 seconds
while it is open and when the window comes forward. The new words and
small rules are SimeonCore's `PluginsOverlay.swift`, with tests.

#### Not in step 9

- Team popularity ("Used by N teammates"): the box has no such call, and
  Simeon has no teams. Multi-account editing and skill publishing are
  behind gates the window keeps off.
- The chat's references that open Plugins (an app to install, a server, a
  skill) and a connector card's "Browse more": the cards that carry them
  are not drawn that way yet. The openers exist (`PluginsState.open`).
- Keyboard: nothing in Plugins takes the keys when it opens, and Tab moves
  as the Mac's controls do, which can reach the window behind (as in
  Settings, step 8).

#### Decisions to confirm

1. Escape on a page closes all of Plugins, as the window does, instead of
   going back a page.
2. ⌘⇧W ("Skills") opens Marketplace, as the window does, not Yours.
3. A failed read looks like an empty one ("isn't available right now",
   "Nothing installed yet"), with no Retry, as the window has it.
4. Errors are shown as the computer words them (sometimes a code such as
   "desktop-source/malformed-reply").
5. Uninstall, Remove and Delete skill ask nothing first.

Not copied (the window's fault): ⌘F on a page reaching the chat's Find
behind; here it does nothing on a page.

#### Where the native parts look different

The Filter menu is the Mac's menu (its choices are the Mac's ticks, and it
stays open while choosing); the switches are the Mac's (mini); the fields
are the Mac's text fields; icons are SF Symbols (line.3.horizontal.decrease,
magnifyingglass, chevron.left, checkmark, person.2, list.bullet.rectangle).

#### What to compare

K01–K09 and the plugins-* captures, light and dark: Marketplace at the top
and scrolled, the Filter menu, a search, a plugin's page added (Linear) and
new (HubSpot), Yours with its rows, a page from Yours (Gmail), dark; Add,
the spinner, Added; a sign-in; Escape, ×, a click on the dim, ⌘K and ⌘,
over Plugins.

#### After the compile review

A second reader with the compiler's rules found nothing that would not
build, and these faults, fixed before the push:

- Each opening reads the catalog afresh: a plugin's link no longer closes
  its page for want of the last opening's catalog; signing out forgets the
  account's plugins.
- The servers read every 15 seconds redraw nothing unless they changed.
- ⌘F picks the search's words once the field has the keys.
- The Filter menu's choices are the Mac's radio buttons (one each, still
  open while choosing).
- The list kept under a page takes no keys.
- The pane's keys (⌘⇧, ⌘⇧I) and Control-Tab wait while Settings or Plugins
  is open. ⌘N and ⌘B still act behind, as step 8 notes.
- Escape in a page's field (setup values, a skill) lets go of the field
  first; the next Escape closes Plugins. The window was measured only with
  the search; this keeps what was typed from going with one key.

To check on a Mac: an app's sign-in finishing in the browser (the Electron
app catches a loopback redirect on the Mac; here the computer's manager
runs the sign-in, so its redirect should be the hosted one).

## Step 10: the account

Read from the window's account menu (`Xln`), its Weekly usage submenu
(`Qln`), About (`AVn`) and the sign-out question (`qon`), and measured in
the reference window light and dark, with sixteen usage readings (none, a
failure, a slow one, 0 to 150%, no reset date, on-demand with and without a
limit, large sums), a picture, and a host that signs out (L01–L04). Pushed:

- **The initials** at the sidebar's foot (and on the rail): the account's
  picture when it has one, else its letters; a touch larger under the
  pointer. No tooltip, as the window's. A click opens the menu.
- **The menu** (Apple's, as the sidebar's other menus since step 3): its
  foot 4 above the initials, its left edge on theirs, at least 228 wide.
  Weekly usage with its share ("38%") and ›, Settings, About, a line, Log
  out. Weekly usage is there once the usage is in hand; it is read at
  sign-in (as for Settings) and again when the menu opens if the last
  reading is 30 seconds old, and a reading that lands while the menu is
  open puts the row in, as the window's does. A failed reading takes the
  row away. The menu says "Weekly usage" and "Resets" on a trial too, as
  the window's does (Settings says "Trial usage" and "Ends").
- **Weekly usage ›**: "Weekly usage" with "Resets in 4 days" (whole days
  rounded up: "Resets today", "in 1 day", "in 7 days" when there is no date
  but there is an allowance) and the share; "On-demand", "Spend this
  cycle", "$12.4/$50" when on-demand spend is metered with a limit; then
  Change limit, which opens `https://app.simeonlabs.com/app` in the
  browser. The figures take no clicks and no keys.
- **Settings** opens Settings on General (step 8).
- **About**, from the menu and from Simeon › About Simeon (the window's own
  dialog, not Apple's About panel, as the Electron app does it): the
  window darkened, a 360-wide card with the app's icon, "Simeon", "Version
  0.1.0", "Copyright © 2026 Spaire, Inc." and Copy version info, which
  puts the window's three lines on the clipboard ("Version: …", "Release
  Track: stable", "OS: darwin") and says "Copied" for 1.2 s. ×, Escape or a
  click on the dark close it; over Settings, Escape closes About only. It
  shows over the sign-in screen too. No motion, as the window's.
- **Log out** asks the same question as Settings' Sign Out ("Sign out?",
  "You’ll need to sign in again to use Simeon.", Cancel and Sign out;
  Return signs out, Escape cancels), then forgets the sign-in and shows
  the sign-in screen.

The new words and the menu's reading are SimeonCore's `AccountMenu.swift`,
with tests against the window's numbers. The menu's money now rounds a half
up as the window does ("$1.3k" for $1,250; it said "$1.2k").

#### Not in step 10

- The window's update row and the blue update mark on the initials: Simeon
  has no update feed, so the Electron app never shows them.
- "Enter your name" beside the initials when the account has no name: in
  the window it lies over Connect apps; the native app asks for the name in
  the first run (step 6).
- Keyboard: the initials open the menu from the keyboard only as the Mac's
  buttons do (Space with keyboard navigation on); About takes no keys when
  it opens (the window puts them on ×).

#### Decisions (confirmed 11 October 2026: keep all)

1. The menu is Apple's menu, as the sidebar's (step 3): it looks and moves
   as the Mac's menus do (its own row height, highlight colour, corners,
   the arrows wrapping round), not the window's 30-point rows and fade.
2. The sign-out question is the Mac's alert, as in Settings (step 8).
3. Copy version info writes the window's lines word for word, "OS: darwin"
   and "Release Track: stable" included, so whoever reads them reads the
   same thing from both apps. Say if it should read "macOS 26.0" instead.
4. Change limit opens the web app's home, as the window's (the patch sends
   it there); there is no page for the limit itself yet.

Not copied (the window's faults): ⌘, opening Settings with the menu still
open (Apple's menu holds the keys while it is open); the initials' focus
ring invisible on dark; About's × without a focus ring.

#### Where the native parts look different

The menu and its submenu are Apple's: the share beside Weekly usage is the
Mac's menu badge; the two figures are drawn in the window's type (13 and 12,
the lighter grey for the second line) inside Apple's menu. Icons are SF
Symbols (gauge.with.needle, gearshape, info.circle,
rectangle.portrait.and.arrow.right). The question is the Mac's alert (the
app's icon, the accent colour on Sign out). About is drawn as the window's.

#### What to compare

L01 (the menu), L02 (Weekly usage ›), L03 (About), L04 (the question),
light and dark; the account-* captures (the menu's place in a 760 × 600
window and on the rail, a long sum, no on-demand, no reset date). On a Mac:
where the badge sits beside the submenu's arrow, and the figures' left edge
against Change limit's.

#### After the compile review

A second reader with the compiler's rules found nothing that would not
build, and these faults, fixed:

- Return with About open pressed the button behind it (Sign in on the
  sign-in screen, Try again in the first run). About now keeps Return.
- A reading landing while the menu was open rebuilt the usage submenu even
  when nothing had changed, which could close it under the pointer. The
  same reading now leaves it alone.
- With the usage still being read at sign-in, the menu never showed the row
  when that read landed. It now waits for it.
- Scrolling or pinching over Settings, Plugins or About zoomed a picture
  open behind them. The picture waits now.
- The account's picture was fetched again each time the sidebar folded to
  its rail and back, showing the letters first. It is kept once read.
- Simeon › About Simeon with the window closed opened nothing; it opens the
  window with About over it.
- The initials' tooltip is left off outright, rather than set empty.

Not changed: the clipboard is emptied before Copy version info writes (the
Mac needs that to write). A Weekly usage row that arrives while Apple's menu
is open makes the menu grow downward, over the initials (an open Mac menu
keeps its top where it is); the window's grows upward. Since the usage is
read at sign-in, this is rare. About puts no key on × when it opens, and
Tab does not stay inside it.

## Step 11: calls

Read from the window's call parts (the patch's phone button and "Voice
chat" line), the banner's own code (`voice-call/`) and the Electron app's
call service, and measured in the reference window and in the banner's
real page, light and dark, with a harness that ran the banner's real
controller, ringer and painter through fourteen calls (quick, slow and no
answer, refused, no microphone, hung up while ringing, ended by the agent,
the line dropped, muted, the transcript, work that came back). Pushed:

- **The phone** beside the agent's name at the top of the chat (24 round,
  8 past the name, level with its top; Apple's glass in light, the flat
  dark control on dark; darker blue under the pointer; "Call Theo"). It
  calls the agent. While a call is up, or its banner is still showing, it
  brings the banner forward instead, whichever agent it is. Not for a
  group, and not at all when calls are switched off (`SIMEON_VOICE_CALLS`).
- **Agent › Call <name>** does the same; "Call Agent" greyed with no agent
  open. The whole Agent menu is gone when calls are switched off.
- **No green pill in the chat**: the "Calling…" pill of M01–M03 belongs to
  the web and phone window; the Electron Mac app shows the call only in
  its banner (decision 1).
- **The banner** (M10–M19), a small window of its own: 360 wide, 12 under
  the menu bar and 16 from the right edge of the screen the pointer is on,
  over other windows and on every Space (not over another app's full
  screen), never bringing Simeon forward; it grows and shrinks with the
  call, its top where it is. The agent (its butterfly, breathing, or its
  picture), its name, and under it "Calling…" with the red hang-up, the
  call's clock, what the agent is doing ("Using Gmail…", "Sending the
  agenda to Dana…"), "Call ended · 2:48", or why it failed. The waveform
  (46 bars) while the call is on. Mute (Unmute, in orange), Transcript
  (what both said, the person's words in the chat's blue on the right,
  "What you both say shows up here." before anyone speaks; it scrolls past
  260), End. A finished call goes after 1.2 s; a failed one ("Couldn't
  connect", "Calls aren't switched on yet", "Out of credit for calls",
  "Simeon can't use the microphone") stays 20 s with Close, longer while
  the pointer is on it. File › Close Window on the banner ends the call.
- **The ring and the hang-up**: two rings before the voice, then one at a
  time while the call gets ready, seven at most, then "Couldn't connect";
  the two falling notes when a call that was on ends.
- **The voice**: ElevenLabs' Swift kit, the iPhone's (`ios/Simeon/Voice.swift`,
  now compiled into the Mac app too), with the token Simeon Labs' server
  hands out; the agent's prompt, greeting and voice, its two tools, what
  its work brings back said once the line is quiet, the record at the end
  (summary, transcript), each step in `~/Library/Application Support/Simeon/voice-call.log`.
- **The call's line in the chat**: "Voice chat · now" while it is on, then
  "Voice chat · 02:48" (1:02:05 past the hour). An ended call with words
  opens them over the chat, as the Electron app does: the agent's own head,
  the person's words on the right, the agent's on the left, "This chat is
  view-only" and Close Chat; Escape closes it.

The call's flow is SimeonCore's `LiveCall`, shared with the iPhone. The
Electron app was compared with it step by step; these differences were
fixed there, so they change the iPhone's calls too: ending at the click
(not after the voice lets go), seven rings then "Couldn't connect", a
hang-up while it rings staying "Call ended", the kit's error during a call
no longer ending it, a line dropped before it connects saying "Couldn't
connect", the working line naming what the agent does ("Using Gmail…"),
the chat's line written while it still rings, shared rooms left out of the
teammates the voice knows, the call's line added through the chat when
the agent's computer has no call channel, the waveform flat in silence.
Tests: `CallFlowTests.swift`.

#### Not in step 11

- Thumbs, Call Again and Chat on an ended banner: wired in the Electron app
  but nothing in its window shows them.
- The waveform from the voice's own sound: the Electron banner draws the
  voice's frequencies each frame; here the bars follow the call's loudness
  (the agent speaking, the person's voice), rising and falling the same
  way.
- The banner's keyboard focus ring (the Electron one draws #0A84FF inside
  a button): the Mac's own.

#### Decisions (confirmed 11 October 2026: as recommended)

1. No pill in the chat during a call, as the Electron Mac app (the green
   "Calling…" of M01–M03 is the web and phone window's).
2. No phone for a group (the Electron app offers it, and the call then goes
   nowhere: the computer writes no line and runs nothing from it).
3. The dark banner keeps the light sheen at its top left, as the Electron
   one draws it (its stylesheet meant a fainter one on dark). Later
   removed, light and dark: the founder, 11 October 2026, "call background
   got a light /white accent … please remove". The banner is its solid
   colour alone.
4. The banner's hairlines are 1 point, as drawn (its stylesheet says half).
5. Not over another app's full screen, as the Electron banner.
6. Work that came back is said once the voice has stopped and the person
   has been quiet a second (the rule you asked for on the iPhone, 9
   October); the Electron app says it the moment the voice listens.

#### Where the native parts look different

The banner is drawn as the Electron one; its shadow is SwiftUI's (no
spread), and its corners are round, not continuous, as in CSS. The icons
are SF Symbols (phone.fill, phone.down.fill, mic.fill, mic.slash.fill);
Transcript's three lines and the call line's five strokes are drawn.

#### What to compare

M10–M19, light and dark: the banner ringing, speaking, listening, working,
muted, the transcript empty and with lines, ended, failed, out of credit.
On a Mac, with a real call: the ring, the voice, the clock, Mute, the
transcript, End and its tone, the "Voice chat" line before and after, and
the call's lines opened from it. Check that the microphone question
appears the first time.

#### After the compile review

A second reader with the compiler's rules found nothing that would not
build, and these faults, fixed (the call's own ones in SimeonCore, so the
iPhone gets them too; tests in `CallFlowTests.swift`):

- Signing out (or the sign-in ending) during a call left it talking, its
  banner back on screen and End doing nothing. Signing out now ends the
  call; Reload (⌘R) keeps it, as the Electron app's reload does.
- End pressed while the voice was still connecting could leave the voice
  speaking. A voice that connects after the hang-up is let go at once.
- A call ended while its line was being written in the chat left "Voice
  chat · now" there for good. The line is closed then too.
- The seven rings counted the whole preparation (the chat read, the line
  in the chat), so a slow computer got "Couldn't connect". Only a token
  that has not come fails the call now, as in the Electron app.
- Work that came back before the voice was on was said to nobody. It waits
  for the voice.
- The banner's pointer is followed while another app is in front (a
  failed banner stays while the pointer is on it).
- The transcript followed new lines even for someone reading further up;
  now only when it was at its foot.
- The banner's animations run at 60 frames a second at most.
- Quitting during a call ends it (its record on its way).
- Under a call's lines, search closing gave the keys to the hidden message
  field, and the person's lines had no Copy. Both fixed.
- On the iPhone, a call's line read "Voice chat · 00:00" while the call
  was on; it reads "now".

To know on a Mac: ⌘W reaches the banner only while Simeon is the app in
front (a click on the banner does not bring Simeon forward), as with the
Electron banner. With rows picked in the sidebar, Escape may first let
them go, then close a call's lines, as with an exchange.

## Step 12: the org chart and channels

Read from the window's org chart (its own chunk, `view-D0otXpJy.js`) and
the agent pane's Channels page, and measured in the reference window,
light and dark, at four sizes and with the pane open, with fixtures for
agents working, typing, waiting, unread, talking to each other, hidden;
a slow and a failing conversation; Discord and Slack connected, failing,
coming soon (N01–N08, O01). Pushed:

- **The org chart** from ⌘K and "/" ("Org Chart", while the computer's
  agent network is on and there is at least one agent), in the chat's
  place, its head too; the pane stays if it is open. No sidebar row is
  lit while it shows; any row (the open agent's too), ⌘N, a card's Open
  chat or a page of the pane closes it, and so do × and Escape. Each
  opening starts afresh.
- **Its head**: "Org chart" over "5 agents · 1 group · 3 message links";
  at its foot the sentence on solid and dashed links.
- **The canvas**: each agent's butterfly (36; a group's butterflies) with
  the sidebar's dot, its name, and "Working…" or "Typing…" in green,
  "Waiting for you", or a group's "3 members" under it; a solid line
  between agents that have messaged each other, a dashed one from a group
  to each member; a line goes darker for two agents active in the last two
  minutes, and green with a spark running along it while both work. The
  places are the window's own, worked out the same way (the shared code
  checks them against the window's numbers). Scroll to zoom (up to three
  times, about the pointer), pinch too; drag to pan; double-click to put
  it back.
- **The cards** (312 wide, at the right): an agent's or a group's (its
  butterfly at 72, its state, About, its members up to twelve and "+N",
  its last activity and when, Open chat or Open room); a group and a
  member ("Launch squad ⇄ Simeon", "Simeon is a member of Launch squad",
  the members, Open room); two agents' conversation (their last 30
  messages to each other, read from the first one's chat; "Loading
  conversation…", "Couldn't load this conversation." with Retry, "No
  messages between these two yet."; "Read-only — a conversation between
  two agents"). A click on the canvas, × or Escape closes the card.
- **Channels** from ⌘K and "/" (while the chat can have some: a platform
  open or a connection made, groups too), its page in the agent's pane
  under the three tabs: "Connect this agent to a messaging platform…",
  then Discord and Slack, each with its logo, its line ("Connected as …",
  or what went wrong), its chip (Connected, Needs attention, Connecting,
  Soon) or Connect; Reconnect and Disconnect when it went wrong; "…" under
  the pointer (How to connect, Refresh, Disconnect). Connect opens the
  token's field under the row ("Paste your bot token", "Stored securely,
  never shown to your agent.", Cancel, Store securely; Return stores). The
  page reads the computer again every 4 seconds while the pane is open and
  when the window comes forward, 15 seconds at most a read.
- **A message from or to a platform** keeps its tag in the bubble, now
  with the window's straight arrows (↓ Slack, ↑ Slack).

The new words and the channel calls are the shared core's (`AgentNetwork`,
`Channels.swift`, in SimeonCore since 11 October 2026 so the iPhone has the
org chart and Channels too), with tests.

#### Not in step 12

- The window's "How to connect" reads its own old table and always says
  the platform is "not available yet", even though Connect works. Copied
  as it is (decision 5).

#### Decisions (confirmed 11 October 2026: as recommended)

1. A click on a node or a line opens its card. In the Electron app it
   cannot (the canvas takes the click for panning; the cards open only
   from the keyboard), so this is a fix, not a copy; a double-click on a
   node no longer resets the zoom.
2. Escape closes the card, then the chart. The Electron app does nothing
   on Escape there.
3. Two fingers on the trackpad zoom, as in the Electron app (its sentence
   says "Scroll to zoom"); pinching zooms too.
4. Channels is offered for a group too, as in the Electron app.
5. "How to connect" keeps the window's words ("not available yet").
6. Connect puts the keys in the token's field (the Electron app leaves
   them on Connect).
7. The card covers the right of the canvas and can hide a node under it,
   as in the Electron app.
8. Hidden agents are on the chart and counted, as in the Electron app.

Not copied (the window's faults): cards that cannot be opened with the
pointer; a double-click on a node resetting the zoom.

#### Where the native parts look different

The lines are 1 point (the window asks for 1.5 and Chromium draws 1); the
dashes are 3.5 on, 1.5 off, as Chromium draws them. "…" is the Mac's menu;
the token's field is the Mac's secure field; the icons are SF Symbols
(xmark, ellipsis, questionmark.circle, arrow.clockwise, powerplug,
checkmark.shield, arrow.down, arrow.up).

#### What to compare

N01–N08 and O01, light and dark: the chart with its links, an agent's
card, a group's, Simeon's, a membership line's, a conversation's (and an
empty one), dark; the Channels page. On a Mac: scrolling and pinching to
zoom, dragging, double-click, the spark while two agents work together,
connecting Discord or Slack with a real token.

#### After the compile review

A second reader with the compiler's rules found two things that would not
have built: the chart's button and its members' butterflies had the names
of types already in the app (`CardButton`, `MemberMarks`). They are
`ChartButton` and `ChartMemberMarks` now, and no other name in `mac/Simeon`
is used twice. Fixed too:

- Every line looked hovered at once (each line's hover band was the size
  of the canvas). The line under the pointer is worked out from where the
  pointer is, within 8 points, as the window's 16-point band; a move
  redraws nothing unless that line changes. The lines' tooltips went with
  it (the card says the same).
- A search hit in the open agent left the chart in front. It gives way to
  the chat now.
- Signing out with the chart open brought it back at the next sign-in.
- Escape went to the sidebar's picked rows before the chart, and closed
  the chart's card under an open picture. The chart's Escape comes first
  now (its card, then the chart), and not while a picture or diagram is
  open over it; the wheel does not zoom the chart under one either.
- A drag that started on a node did not pan.
- A click on the canvas waited for a possible double-click before the
  card closed; it closes at once. A double-click on a node opened its card
  and shut it again; it opens it once.
- "/" read whether to offer Org Chart and Channels only when the chat
  opened (a computer still waking said no). It reads them each time "/"
  opens, as ⌘K does.
- Channels: Connect did not put the keys in the token's field; "…" went
  away while its menu was open; Refresh and Disconnect could be pressed
  again while the first press was running, and a slow read could land
  after a newer one and put the old state back. All fixed (a platform is
  busy until its last press is done; an older read never replaces a newer
  one).

Left as it is: if the computer's agent network is turned off while the
chart is open, the chart stays until it is closed (not yet compared with
the Electron app).

## Step 13: the computer, and the window's computer states

Read from the window's computer (the main bundle's preview, full view,
strip and hand-off card) and its rebuild, connection, disk and access
surfaces, and measured in the reference window, light and dark, at five
sizes and with the pane open, with the computer's answers patched for each
state (no status yet, unreadable, pulling, off, sleeping, on this Mac,
starting, a screen; helpers 1, 2, 5, 6; the stream away, a rebuild of each
kind, its failures, low disk, every access answer). Pushed in two parts:

- **The Computer tab** (I03): the frame (the pane's width less 40, 16:10,
  14 round) with the agent's screen watched only, its pointer, and "Open"
  under the pointer or with the keys; "Booting up the computer" and the
  window's moving bar while it is read or started, "Setting up the
  computer" with its percent while it is pulled, "Can't reach Simeon's
  screen" with Retry and the reason in red, the spinner while the screen
  connects (and after 20 seconds why), "Screen preview unavailable" after
  too many crashes, the display glyph when it is off; "Simeon's screen"
  under it. While the agent waits: "Needs your attention", its words,
  Skip this step and I'm done, continue. A click anywhere on the frame
  opens the computer.
- **The computer over the whole window**: the 44-point bar (the traffic
  lights at its left, a strip that moves the window, Exit fullscreen at its
  right), the hand-off's banner (its buttons answer and close it), the
  screen as the largest 16:10 that fits, the helper's name and the other
  helpers' screens (↑← ↓→ between them, "and N more" with a menu). It is
  the person's to use while open: the keys go to it, ⌘C ⌘V ⌘X ⌘A ⌘Z reach
  it as Ctrl, and the clipboard goes both ways. Opening it starts the
  computer; closing it hands nothing back and the message field takes the
  keys. Choosing an agent, Settings and Plugins close it.
- **The hand-off card** in the chat: Take over, its snapshot and Open
  computer open the computer; I'm done and Skip answer as before.
- **Search's routine** opens the open agent's pane on Computer (another
  agent's: that agent with its pane on Profile), as the window does.
- **The stream away**: "Reconnecting" at the window's top after 2.5
  seconds, "Checking connection" for a second once it is back, "Simeon's
  computer restarting" while it comes up; after two minutes "Couldn't Reach
  Simeon's Computer" with Recover Simeon's Computer (and its question) and
  Retry.
- **Rebuilding the computer**: Update Simeon's Computer in ⌘K, "/" and the
  sidebar's foot (while it may be updated); its question ("Update Simeon's
  Computer?", "An agent is working" with Update anyway and Update when done,
  "Update while agents are working?"); an update goes to the pill at the
  top (its ring and step; a click brings the dialog), a reset or recovery
  to the dialog in front (its steps, the bar and percent, Continue in
  Background); "Taking longer than expected" after two minutes; "Update
  failed", "Reset failed", "Recover failed" with their Retry. Sending waits
  while it runs.
- **Low disk** under the chat's head ("Computer is low on disk space", or
  critically), with Go to Disk Saver; Disk Saver is set to work once each
  time the disk runs low.
- **The access notice** 8 over the message field, in the window's words
  for each answer, with its button to simeonlabs.com; Send is off under it.
  The access is read again each time the window comes forward.
- **The sidebar** when the agents can't be read: "Can’t reach your
  computer" with Retry and Recover computer ("Your computer isn’t set up"
  for an account without Simeon), "Reconnecting to your computer…" over a
  list already shown; read again every 4 seconds.
- **The whole window**: the access cover for an account refused before
  its computer was ever reached; "Setting up Simeon's computer" while the
  agents are read with none to show (Reload).

The shared code gained the update offer, the agents at work, the rebuild's
steps, the ⌘K row, the card's waiting rule and the helpers' rule, with
tests. The Mac app now builds the iPhone's screen view (noVNC in a web
view) and ships noVNC.

#### Not in step 13

- "Simeon is Paused" (the computer blocked) and "Update Privacy Mode": the
  native connection does not tell those refusals apart yet.
- Low disk on the new chat's screen (the window shows it there too).
- "Check for Updates" (the app's own update): no Mac counterpart yet.
  Sparkle at the switch (step 14, decision 11).
- The window's reports about the screen (`reportOpenComputer`,
  `reportVncSession`): nothing the person sees.

#### Decisions to confirm

The computer:

1. While the computer is open its keys are the computer's (Escape, ⌘K,
   ⌘N, ⌘, too) and Tab stays inside it; Exit shows a ring with the keys.
   (The window lets Tab walk into the hidden window, and ⌘N or ⌘F reach
   hidden fields, until its screen takes the keys.)
2. The 20-second "isn't connecting" notice is a plate at the frame's foot,
   as the window means it (its own falls apart into a column of letters).
3. The hand-off card waits while the computer carries its request or while
   it has no answer. (The window says "Done" for a waiting request whenever
   the computer's status can't be read.)
4. Closing the computer lets go of its screen. (The window keeps it
   connected, hidden, while the pane is open, even for the next agent.)
5. Every helper's screen shows the agent's own screen, as in the window.
6. A routine found by search opens the pane on Computer, not the routine,
   as in the window.
7. "and N more" has the thumbnails' frame (the window's is 42 high), and
   its menu is the Mac's.
8. "Exit fullscreen" keeps the window's word, though it only closes the
   computer.
9. The red under "Can't reach" on the dark full view is the dark red (the
   window's light red barely shows there).

The window's states:

10. The sidebar's Update is a 24-point disc at the foot's right (a cloud,
    a clock while queued), its words as its tooltip. (The window draws it
    over the initials and partly off the window.)
11. One computer dialog at a time, and it holds the keys. (The window lets
    them open under each other and get stuck.)
12. Return under the access notice keeps the words. (The window empties
    the field and sends nothing.)
13. Nothing says why Send is off during a rebuild, as in the window.
14. The pills centre on the whole window, as in the window.
15. On the rail, "Can't reach" is the glyph alone (its words as tooltip),
    as in the window.
16. The agents are read again every 4 seconds while they can't be (the
    window's code says 4 seconds; it retries in bursts), and "Reconnecting
    to your computer…" shows over any list already shown (the window only
    for one kept from an earlier launch, which the Mac app does not keep).
17. The sidebar's Recover computer asks "Recover Simeon's Computer?"
    first. (The window resets at once, which recreates the computer.)
18. "Taking longer than expected" opens over the rebuild's dialog with its
    own scrim, and never for an update in the background, as in the window.
19. Update Simeon's Computer is offered until the computer is known to be
    up to date, as in the window.

#### Where the native parts look different

The screen is drawn by noVNC in the Mac's web view (the window loads the
computer's own page in Chromium); "and N more"'s menu is the Mac's; the
icons are SF Symbols (display, arrow.up.left.and.arrow.down.right,
arrow.down.right.and.arrow.up.left, checkmark.circle, circle,
icloud.and.arrow.down, clock, location.fill for the agent's pointer).

#### What to compare

I03 light and dark (the window's picture shows "Can't reach", its demo
answer being refused); the full view at 1040 × 760 with and without the
hand-off banner; the reconnect pill, the update pill, the rebuild dialog,
"Couldn't Reach", a failure; low disk; the access notice; the sidebar's
card. On a Mac: a real screen in the tab and the full view, typing and ⌘C
⌘V into it, the clipboard both ways, Take over from a real hand-off, a
real update of the computer.

#### After the compile review

A second reader with the compiler's rules found nothing that would not
build (the iPhone's screen view included), and these faults, fixed:

- Under the computer and its dialogs, a sideways swipe, a right-click and
  the wheel still reached the hidden chat, org chart or picture behind.
  They wait now, as under Settings.
- A computer dialog held every key, ⌘Q, ⌘H, ⌘M and ⌘W too, so "Couldn't
  Reach" (which stays while the Mac is offline) could not be quit from the
  keyboard. ⌘ keys go on to the menus; About over a dialog keeps its own.
- The access cover never looked again: once access was fixed on the web it
  stayed until Reload. It reads access and the agents again when it shows
  and each time the window comes forward.
- The stream's log wrote with calls that end the app on a full disk; it
  uses the ones that fail quietly.
- "Setting up Simeon's computer" (Reload) covered a dialog that still held
  the keys. It is under the dialogs and pills now.
- A Recover asked from the sidebar during a background update came back,
  out of place, when the update ended. A rebuild beginning lets go of any
  question asked before it.
- Low disk shows on the new chat's screen too, under the To: line, as the
  window has it.

## Step 14: the Mac's own parts, the agent's hands on this Mac

Read from the Electron app's main process (menus, window, notifications,
the Dock, Move to Applications, zoom, links, panels, the local-exec daemon
and its gate) and measured in the reference window, light and dark: the
Deep Links dialog, a message link, the right-click menus the page takes,
the Allow card at five sizes with every button's states, its tooltips and
keys, each answer's calls in order, the ceiling's states, the outcome
lines; and every place the window draws an agent, with pictures given
to two agents and a group (17 places, light and dark, a picture that
cannot be read, a group's own picture). Pushed in three parts:

- **Notifications**: "Iris needs you" with the Mac's sound, a finished
  turn without one, by the same rules as the Electron app (what the
  window in front already shows is not said again). Asked for once signed
  in. A click brings Simeon forward, makes the window again if it was
  closed, and opens that agent; Settings stays as it is. Another account,
  or signing out, takes this run's notifications back.
- **The Dock's number**: unread messages, hidden agents aside; none at 0.
- **The window in front**: the computer is told whether the window is in
  front, and the open chat counts as read only while it is, so the Dock,
  the sidebar's dots and the notifications agree.
- **What connecting sets**: the computer's own notifications off (the Mac
  says them), this Mac's time zone, the local setting squared with the
  computer's, the security key's switch.
- **Links into the app** (`simeon://app/v1/…`): the window forward;
  the same link twice within 2 seconds once; `info?topic=deep-links`
  shows the Deep Links dialog (signed out too; Done, × and Escape close
  it); a plugin's link opens Plugins on it, after the sign-in when it came
  before.
- **Links in messages** open only for http, https, mailto, obsidian and
  tel; any other kind does nothing.
- **Right-click on a chat picture**: Copy image, Save image… and, for a
  picture from the web, Copy image address.
- **Downloads**: the save panel as a sheet on the window, the name by the
  Electron app's rule, the file checked first; "Couldn't save this file"
  when it fails, and nothing half-written left behind. The avatar
  editor's Browse is a sheet too.
- **Zoom**: ⌘= (or ⌘+), ⌘- and ⌘0, 50 to 300 percent in steps of 10, the
  whole window laid out at its size divided by the zoom, as Chromium's.
- **Menus**: File has Close Window ⌘W only (no Save or Print); no Help
  menu; no window tabs.
- **Move to Applications** at launch, in the Electron app's words, only in
  a release build marked for it (see decision 9).
- **The agent's hands on this Mac**: while Simeon is open and signed in,
  the computer's requests to run a command in the person's zsh or to read,
  list, upload or download a file are served here, each checked first
  against the places that hold keys, then against the setting (Never,
  Always allow, or what was allowed once). Written to
  `~/.simeon/local-exec-daemon.log` as the Electron daemon writes. Stopped
  at sign-out and at quit.
- **The Allow card** over the message field of the agent's chat (under
  the access notice when both show), as wide, 8 above it, the messages
  ending over it: "Allow Simeon and all agents to run commands on your
  local computer?", its line, Always allow, Allow once, Never, and the ×
  (Deny once, also Escape). An answer greys the buttons until the
  computer settles the ask; one that fails says so in red and can be
  tried again; the message field takes the keys back after. Always allow
  waits for the team's policy and is off below it, its reason as the
  tooltip. The agent's working line hides while the card waits.
- **Execution on Local Computer** is kept per account (another account
  starts from "Ask every time"; signing out forgets it), its team's
  ceiling read at sign-in, and a message sent lets go of the Allow once
  answers.
- **Use hardware security keys** (Settings › General) is told to the
  computer, the switch greyed until it has it.
- **Agents' own pictures** wherever the window draws an agent: the
  sidebar, pins and rail, the chat's head, author runs, the exchange
  chip, its list and head, ⌘K, "@", the new chat, members and Add Member,
  Hidden Agents, the org chart, call lines and the call banner. Round,
  filling the circle, a half-point edge at 10 % of the ink, never moving.
  A group with its own picture shows it too, with a grey "Group chat"
  badge at its corner in the sidebar; a member with a picture is its
  round picture in a group's avatar. None in notifications, the first
  run or the brand's butterfly, as in the window.
- **Group avatars of 20 points or less**, and a group's chat head, are
  its members in a row (the head 52 each), as the window draws them; past
  four, three and "+N". The exchange chip cuts a gap round each mark.
- **The corner dot** (working, unread) cuts its room out of the avatar
  under it, 2 points round it, as the window does.
- **A pictured agent at work** shows the window's grey three dots in the
  working line, in place of the butterfly.

#### Not in step 14

- Answering a website's request for a security key from this Mac (the
  Electron app runs the upstream signer and a "Security key request"
  window): decision 7. With the switch on, the computer says this Mac
  cannot be reached.
- The window's error screen (P01): decision 5.
- The app updating itself: decision 11.
- A link's own right-click menu (Open link, Copy link address): links are
  runs in the message's text, and the Mac's text gives no menu per run
  yet. The picture menu is in.
- A group's working line with a pictured member's small dots: the group
  line itself is not built yet (step 2f).
- The answered card's line is the chat's centred line, wrapping on a
  narrow window (the window keeps it to one line with its words as the
  tooltip).

#### Decisions (confirmed 11 October 2026: as recommended)

The Mac's own parts:

1. A notification clicked with the window closed opens the window on
   that agent. (The Electron app shows nothing.)
2. A notification for an agent that is gone only brings the window
   forward. (The Electron app opens an empty chat.)
3. The open chat counts as read only while the window is in front, as in
   the Electron app.
4. Zoom is copied and not remembered across launches (the Electron app
   most likely does not remember it either).
5. No error screen: the Mac's views do not fail the way a web page does.
   Its words are kept for later.
6. The picture menu is copied; the message field keeps Apple's own text
   menu (spelling, look up, services).
7. Message links open only for the five kinds the Electron app allows.
8. The Deep Links dialog shows this app's real scheme (the window prints
   its older one).
9. Move to Applications asks at every launch with no "don't ask again",
   as the Electron app, but only once this app is the Simeon people
   install: until then both are "Simeon.app" and a move would put this one
   in the Electron app's place.
10. A plugin's link that comes before the sign-in opens Plugins after it.
11. Updates: Sparkle (confirmed 11 October 2026), set up at the switch,
    not before: nothing to update until this app is the one people have.
    The release script writes Sparkle's feed beside `latest.json` in the
    release bucket (or the server builds it from `latest.json`, as
    `server/simeon/desktop/releases.py` answers the Electron updater
    today), each release signed with a key made once on the founder's Mac
    and never lost; the app gains Simeon › Check for Updates…. Not the
    release script alone (people would stay on old versions while their
    computers change), not an updater of our own, not the App Store (its
    sandbox would not let the agent run commands on the Mac).
12. No Help menu; Apple's own Edit items (Find, Spelling, Substitutions)
    are kept.

The hands:

13. The card shows one fixed sentence, as the Electron app; it does not
    say which command or file.
14. Escape while typing in the message field keeps its own meaning. (The
    Electron app denies the ask from the field.)
15. The hands run only while Simeon runs. (The Electron daemon keeps
    serving for up to 12 hours after quit.) With Simeon closed, the
    computer says this Mac isn't connected.
16. The setting is kept in this app's own settings, not the Electron
    app's `settings.json`; the "Allow once" file is shared. With both apps
    on one Mac they can disagree until the switch.
17. A request that touches keys is refused after the person was asked,
    as in the Electron app (only the computer could skip the card).
18. Always allow is black on white (white on black in dark), as drawn.
19. The security key: only the switch is copied for now.
20. No words of Simeon's own for macOS's folder prompts (Documents,
    Desktop, Downloads), as the Electron app.
21. The × shows a ring with the keys (the window's has none).

Pictures:

22. The pane's avatar shows the whole picture in its 96-point disc. (The
    window clips it to a 64-point circle inside the disc, a slip of its
    own patch.)
23. A picture that cannot be read shows the butterfly. (The window shows
    an empty circle with the browser's broken-picture glyph.)
24. A group's chat head, and every group avatar of 20 points or less, is
    its members in a row, as in the window (the Mac drew the pyramid).
25. The picture's edge is half a point (the window draws one pixel on a
    screen that is not Retina).
26. A pictured agent at work shows the grey three dots, as in the window.
27. The corner dot's cut, for pictures and butterflies alike, as in the
    window.
28. The exchange chip's gap round each mark, as in the window.
29. Notifications carry no picture, as in the window.

#### Where the native parts look different

Notifications, the save panels, the move question and its failure are
macOS's own; the tooltips wait as macOS's do (the window's show at once);
the Allow card's triangle is the SF Symbol `exclamationmark.triangle`.
The "Group chat" badge's glyph is the SF Symbol `person.2.fill`; the "+N"
disc's dark colours are the Mac's (the window's were not measured).
Zoom scales the window's own drawing: text at 200–300 percent may be less
sharp than Chromium's (to check on a Mac).

#### What to compare

The gallery's last section. On a Mac: a notification while the window is
behind, its click with the window closed; the Dock's number; ⌘= ⌘- ⌘0; a
`simeon://app/v1/info?topic=deep-links` link from Safari; a plugin's
link signed out, then signed in; a picture's right-click and Save image…;
a download into a folder that refuses it; an agent asked to run `ls ~` on
this Mac: the card, each answer, the command's result, and
`~/.simeon/local-exec-daemon.log`; quitting while a long command runs;
an agent and a group given a picture in the pane: every place above, at
work and idle, light and dark.

#### After the compile review

A second reader with the compiler's rules found nothing in parts one and
two that would not build, and these faults, fixed:

- The Allow card's Escape could deny an ask the person could not see:
  with a picture or file open over the chat, an exchange or call open, or
  the Deep Links dialog showing. It gives way to all of those now, and to
  the org chart and the pane's own popovers; when it does take Escape, the
  window's own (closing the pane, letting go of picked rows) waits, as in
  the Electron app.
- Settings › General kept the setting under the e-mail as written, the
  sign-in under it in lower case: for an address with capitals, opening
  Settings set the choice back to "Ask every time", and the hands then
  refused what the computer, still at "Always allow", never asked about.
  Both use lower case now.
- Quitting left a command that was running in the foreground alive (it
  runs in a session of its own). Quitting now waits, a second at most, for
  running commands to be stopped.
- The hands and the team's policy waited for the account's profile, which
  is read once: if that read failed at launch, the hands never started and
  Always allow stayed greyed. Both start with the computer now.
- A notification that launched Simeon only brought the window forward. Its
  agent is opened once the agents are read.
- A read of `file:///Users/…/.ssh/…` passed the check for places that hold
  keys and was read (the check looked at the path as written, the read at
  the path worked out; the Electron daemon has the same hole). The read now
  checks the path it reads, with a test.

Part three (pictures), read the same way:

- One thing would not have built: the group avatar's members asked for
  their pictures (kept on the main thread) from code that was not. They
  are on the main thread now.
- A group mentioned in the message field drew its row of members over its
  name in the chip (the chip kept a 16-point square). The chip, and the
  exchange's head, now grow to fit the row.

## After step 14: the pointing hand

The founder, 11 October 2026: the cursor turns into the pointing hand over
everything that can be clicked, as in the Electron window (its `cursor:
pointer`). `mac/Simeon/HandCursor.swift`: every borderless button uses
`.buttonStyle(.hand)`, the plain style with the hand added; switches, the
voice picker, the sign-in buttons, Plugins' tabs and Back, the org chart's
lines, and the butterflies a click pokes get `.handCursor()`. A disabled
control keeps the arrow. Left as they are: a dialog's backdrop, text
fields, menus and their items (the Mac's own), and places with a cursor of
their own (resize edges, the avatar's crop, zoom, the org chart's pan, a
table's cells). New clickable views use `.buttonStyle(.hand)` or
`.handCursor()`, never `.buttonStyle(.plain)`.

To check on a Mac: links inside a message's words (SwiftUI's text draws
them; whether it shows the hand over a link was not checked here).

## After the founder's first build (11 October 2026)

What the founder saw on their Mac, against the Electron app, and what
changed:

- **The hover bar (reaction, reply, more) showed inside the bubble**, at
  its right edge (the founder's second screenshot). It was set beside the
  bubble with a custom alignment guide in an overlay, which the Mac did
  not honour. It now hangs from a zero-size point on the bubble's edge
  (`outside(trailing:)`, HandCursor.swift), 6 beside it, level with its
  middle. The three other places placed the same way now use the same
  kind of point: the exchange's More, the access notice and Allow card 8
  over the message field (`above(gap:)`), and the "@", "/", "#" and ":"
  lists 4 over their line.
- **The reactions menu opened over the message.** It opened at the
  pointer. It now opens 4 under the hover bar's button, as the window's
  (`placement: bottom-start`, `bottom-end` on the person's side), so it
  grows away from the bubble; More, the exchange's More and More emoji
  open there too. The right click still opens at the pointer.
- **A picture sent showed as a file card** ("Photo 1.png 508 KB"). A
  picture or video the person sends, or an agent attaches, is now drawn as
  the picture: one alone at its own width up to 320 and at most 200 high
  (`y7n`), several sent together in one row (`aMn`, `j2e`); other files
  stay cards. It also sat above the time line: the computer writes a sent
  file with no time, so it now takes its message's (by the nonce they were
  sent with, `UIn`), and the time line goes above an untimed file rather
  than between it and its words (`$In`).
- **"Sent while offline" showed under old messages.** The window shows it
  only on a message this app held while the computer could not be reached
  and then sent, until the app quits (its outbox,
  `sentWhileOfflineAtMsByEntryId`), not from the mark the computer keeps.
  The Swift app now does the same.

## The Apple design pass (11 October 2026)

The founder, once the copy was done: "apple liquid glass transparance in
the side bar. design the composer like the iphone. bring the design of the
connectors extra step before going to the website but as a iframe." These
three depart from the Electron window on purpose; everything else stays
its copy.

- **The sidebar** (`Sidebar.swift`) is a floating Liquid Glass panel, 8 in
  from the window's edges and the chat, 18 round, as macOS 26's own
  sidebars float. Inside it the Mac's sidebar material alone, so the
  desktop shows through; the Electron window painted it over at 93% and
  drew a hairline at its edge, both gone (`sidebarPaint`, `sidebarEdge`).
  Around the panel, the window's ground. The material is rounded by its
  own mask (`SidebarMaterial(radius:)`), since SwiftUI's clip does not
  round an AppKit view behind the window. The rail is the same panel, 72
  wide; the traffic lights sit inside its top corner.
- **The composer** (`Composer.swift`) is the iPhone's (`ChatComposer`):
  Attach as a 40-point glass disc at the left, then the field in glass, 20
  round, 40 high on one line, growing a line at a time to six. At its
  right, the grey microphone while there is nothing to send and the blue
  send (30, the arrow bold) once there is; the recording chip while
  listening. The window's two forms (one line, and stacked with the
  buttons under the words) are gone, and so is the grey microphone beside
  Send. The lines, the files and the message being answered stand over the
  field, lined up with it; the reply on its own glass (`ReplyPill`). No
  opaque ground behind it: the messages fade into the ground under the
  field (the iPhone's soft edge). A click on the glass beside the words
  gives them the keys. The lists still open 4 over their line.
- **Connecting an app** (`MacConnector.swift`): first the iPhone's consent
  (`ConnectConsentSheet`, the text from `ConnectConsent` in the core), in
  the window over the dimmed chat: the app's logo and name, what it does,
  the three points, the small print, Connect in the blue and Cancel;
  Return connects, Escape and a click outside cancel. Connect opens the
  app's sign-in page inside the app, in Apple's sign-in sheet on the
  window (ASWebAuthenticationSession), which closes itself once the app is
  connected (asked every 2 seconds, up to 5 minutes, as the iPhone's
  `AppConnector`). It covers the chat's connector cards (Add), and in
  Plugins Add for a plugin that brings an app, and Authenticate and Retry
  (Reopen opens the waiting page again with no consent); a vendor's page
  after Add opens in the sheet too. Slack and GitHub's listener card still
  opens the browser.

  Why not a plain web view (the founder's "iframe"): Google, Microsoft and
  others refuse their sign-in inside an embedded web view ("This browser
  or app may not be secure", `disallowed_useragent`), and most of the
  apps people connect first are Google's. Apple's sheet is the in-app page
  they accept, and it keeps the person's existing sign-ins. Where Chrome
  is the Mac's browser, macOS may hand the page to Chrome instead of the
  sheet; that is the system's choice. If the sheet cannot open at all,
  the page opens in the browser as before.

To check on a Mac: the glass over the desktop with the window in front
and behind (the material greys when the window is not in front), in light
and dark; the composer's list placement with a reply and files over the
field; the consent with a long app name and on a short window (its words
then scroll); a Google app's sign-in end to end in the sheet; Escape
under the consent not closing Plugins behind it.

### The sidebar again (11 October 2026)

The founder, on their Mac: the glass panel "has like a background, for
some reason that changes its color" (the desktop through the panel took
the colour of whatever stood behind the window). Put on the chat's own
ground it was "too white": "just leave it as it was before but less
accented". The sidebar is the Electron window's again (the Mac's sidebar
material painted over at 93%, a half-point hairline at its right, the
open agent's white card), with the paint a shade nearer the chat's
ground (`#fafafa` for the window's `#f7f7f7`; `#0c0c0c` for `#111111` on
dark) and the hairline at 6% of the text colour for 10%. The glass panel
and its rounded material are gone.

### The logo lighting up (11 October 2026)

The founder's video of the SimeonLabs logo ("lighting up like 'setting
up simeon's computer' but in diagonal, then going to true colors"),
measured frame by frame into `LogoLightUp` (the core, with its tests):
nothing for 0.2 s, a fade to 40% of the ink by 1.0 s, a band of the full
ink crossing on the diagonal twice (from 1.2 s and 1.9 s), then the true
colour by 2.85 s. The Mac's sign-in shows it in the butterfly's place
beside "Simeon" (`LogoShimmer`, SignInScreen.swift; the logo is the
iPhone's `SignIn/Mark`, the site's favicon); the iPhone's launch and
sign-in show it too. With Reduce Motion, the logo at once.

### The rows as on the iPhone (11 October 2026)

The founder: "apply the spaces / box change (chief of staff) etc to the
mac". The sidebar's rows take the iPhone list's spacing and title tag,
scaled by the type (the Mac's name is 14 to the phone's 17): rows 62 high
and 4 apart, 66 a row (the phone's 80); the butterfly 46 (the phone's 56),
10 before the text; the title in a grey box (`Look.tag`, `#252527` on
dark) with its words in our blue, 11.5 medium, 10 after the name (the
phone's 14 and 13). The rail keeps the window's 54 and 36.

### One Connect (13 October 2026)

The founder: "there is no logic, in the 'add' - then takes you to this
authenticate button. should just be a connect button … you add it, the
iframe appears, you say connect, it says added. then you have to go to
'yours' to authenticate." Measured in the code that day: Add installed the
app, started its sign-in in the background with any failure dropped
(`try?` in `PluginsModel.install`), and said "Added"; the Marketplace row
said "Added" for anything installed, signed in or not; the sign-in then
waited in Yours under Authenticate. Now, on the Mac and the iPhone, with
the consent kept:

- One button, Connect, everywhere an app can be connected (the
  Marketplace row, the plugin's page, a chat card, Yours). It installs the
  app and opens its sign-in in one go, and the window waits for it
  (`connectAfterInstall`): "Connected Gmail" once it is, with the skills
  synced as before.
- A sign-in the person cancels, or one that never opens, takes the app it
  added back out (`uninstallPlugin`, as Uninstall does; `Connecting.undoes`,
  `AppStore.undoConnect`), unless the computer says it connected after
  all; "Gmail wasn't connected" or why it didn't. One that closed on the
  vendor's page before the computer said so is kept ("Finishing Gmail's
  sign-in…"): it may still finish.
- The Marketplace row says Connected only for an app signed in; an
  installed app still waiting for its sign-in says Connect (its sign-in
  only); another state shows its status word; "Added" is left for a plugin
  of skills alone. Authenticate reads Connect in Yours and on a page.
- The values a setup page takes are kept whatever the sign-in after it
  does; that sign-in no longer holds the window busy.

Shared in `SimeonCore/Connecting.swift` and `AppStore.beginConnect`, with
a test (`PluginCallsTests`). Not yet run on a Mac or an iPhone.

### Connectors, in our design (13 October 2026)

A first pass copied Muse's screens (bold section titles, rounded groups
with lines, Featured cards, See all, the Mac's blue segmented control, a
search field with a blue edge). The founder: "that's not our design ...
that bold title 'creativity' big title WHY. you went off style", "whats
that blue picker. what happens to water glass. what is that search bar",
"the see all makes no sense". So the page is the approved Connect apps
design again (11 October 2026), with only what was asked:

- Named Connectors; Yours is no longer a page behind "4 connected" but
  the second half of Apple's segmented control, Available | Yours ("connected
  become yours"): on the iPhone the system's own (glass on iOS 26); on the
  Mac `GlassSegments`, a capsule of our glass with the chosen half a lighter
  capsule sliding to it, no blue.
- Every app of each section is shown: no See all, View all or Show N more.
- The logos larger on their tiles: 42 at 76% on the iPhone's rows (was 37
  at 60%), 40 at 76% on the Mac's (the Mac's own logo filled its grey tile).
- The Mac: "Search connectors" as a capsule of glass with no edge when it
  has the keys, the filter a round glass button beside it (the sidebar's);
  one app to a row as on the iPhone, no card and no line, a faint fill
  under the pointer; 760 wide.
- Kept from the first pass: the Mac's consent at 600 wide with × at the
  top, not stopping at 640 high; "Connectors" in ⌘K and "/".

Not yet built or run on a Mac or an iPhone (Linux here: the files parse,
the core's tests pass).


### The checkout card (13 October 2026)

The founder: "we also need a card for each payment. like muse screenshot.
i'll let you make sure we implement this all logically." One card for each
purchase, before Link is asked for anything (docs/services-agents.md §7d).
It sits in the chat like the "Your turn on the computer" card: the cart in a
44-point tile, "Checkout" and "<agent> wants to place an order at
<site>"; "Check the items, delivery and terms on the shop's page before you
allow it."; the checkout as the agent left it (16:10, its top, 12 round on
the Mac, 14 on the iPhone) with "Review order ↗" in glass over its corner;
the Link card that pays ("Visa •••• 1234", "Pay with Link", the network's
mark on a small white card); "Total" and the amount; Deny and Allow as the
36-point pills (grey, blue). A Test pill and "Link's test mode: nothing is
charged." in test mode. After Allow the buttons give way to where it stands:
"Asking Link…", "Approve it in the Link app" with Open Link, "Approved ·
placing your order", then "Ordered · Order #1042 · Arrives …", "Didn't go
through", "Denied", "Expired" or "Canceled" ("Nothing was paid."). The
iPhone's card has the flight card's frame (nearly the chat's width, 22
round); the Mac's is 420 wide, 20 round. The gallery chat (`--gallery`)
shows one waiting and one ordered; the demo's Allow walks through Link to
the order.

Not yet built or run on a Mac or an iPhone (Linux here: the files parse,
the core's tests pass).

### Booking a flight (13 October 2026)

The founder: "we can book thru duffel. all we need is a form. when they
enter their info then we take care of checkouts thru link etc."
(docs/services-agents.md §10a). Under a flight in the pane, "Book with
Simeon" (the blue 36-point pill; the computer's sentence above it when it
can't): the traveller form goes into the chat and the pane closes. The form
is a card like the checkout card (420 wide, 20 round): the airline's mark,
"Travellers" and the route, the date and times, the fare and total, "Add
traveller details" and the privacy line; the details on a 460 by 620 sheet
in the grouped form, one section per traveller, Cancel and Continue (Return)
at its foot. The flight's checkout card has an aeroplane in its tile, the
flight in a white block (dark: #3a3a3c) where a shop's picture goes, and
Open the computer while the bank checks the card.

Not yet built or run on a Mac (Linux here: the files parse, the core's
tests pass).

### The agent at work, as the iPhone's (28 October 2026)

The founder: "the mac shows a three-dot thing. the iphone show the agent
avatar. can we do like iphone." The working line under the messages shows
the agent's picture at 28 points, still, 8 points from what it is doing
("Typing…", "Searching the web"), in place of the grey three dots (item 26
above). In a group, the member at work (else the first) at 22, as the
iPhone's group line.

Not yet built or run on a Mac (Linux here: the file parses).

### An email's Cc and files (28 October 2026)

The founder: "im very mad at the experience of sending emails." A reply's Cc
was on the card and could not be seen or changed. The email card has a Cc
row under To, always there to add to, and Send sends it; the files the agent
attaches are listed by name, with a paperclip, under the words; a reply is
titled Reply. Sending itself changed on the computer
(`docs/services-agents.md`, "Sending an email").

Not yet built or run on a Mac (Linux here: the file parses).

### The question card, as the upstream app's (28 October 2026)

A pick sends the option's own reply (`value`), not its label. The option the
agent recommends is blue and a destructive one red. When the agent allows
several (`multiSelect`), each pick ticks its ring and Submit sends them
together. The same on the iPhone (`docs/services-agents.md`, "The cards, as
the upstream app's").

Not yet built or run on a Mac (Linux here: the file parses).

### The in-chat form (28 October 2026)

`UserFormCard.swift`: the fields a page on the agent's computer needs typed
(a sign-in, a code, an address), each with its name above it, masked for a
password or a code; Fill in sends them to the computer, which types them into
the page (`submitUserForm`), and the card forgets them. Once answered, each
field says whether it went in. The X is a decline (`dismissUserForm`). The
same on the iPhone (`docs/services-agents.md`, "The in-chat form").

Not yet built or run on a Mac (Linux here: the files parse, and SimeonCore and
its tests build).

### 1Password (28 October 2026)

`MacOnePassword.swift` and `OnePasswordCards.swift`. The connect card's Connect
runs 1Password's command-line tool, which the 1Password app unlocks with Touch
ID: the accounts (a picker when there are several), the vault "Shared with
Simeon" (made when missing) and a read-only key for it, sent to the agent's
computer. Without the tool or its app integration, the card says how to set it
up. The fill card's Fill with 1Password asks for Touch ID first. The same cards
on the iPhone, whose connect card points here (`docs/services-agents.md`,
"1Password").

Not yet built or run on a Mac, and not with a real 1Password account.
