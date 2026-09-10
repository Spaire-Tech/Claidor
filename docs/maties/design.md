# Maties: the design

September 10, 2026. Registered before code. The founder drew one screen,
the chat (`docs/maties/design/chat-empty.png`, `chat-after-send.png`, and
the source, `founder-chat-template.html`). Everything else in the app is
designed here from that screen's rules, so that a person moving from the
chat to Settings or to an approval never feels a different hand.

The founder's words for this work: the chat is surface level; the real
thing has a lot more (how the answer is generated, the settings, the
approval); design the whole app from the little given, smartly and
logically; make sure the model's logo shows; bring back the stream from
the Swens build; the pictures in the design must ship in the app and
appear at once. The sphere is the logo. The bird is the default avatar
for now; the cast (plan step 4) replaces it later.

## 1. The rules

**Ground.** White. The page is `#ffffff`; the sidebar is `#fdfdfd` with a
half-pixel line `#f0eff1` on its right; raised surfaces are `#f4f5f7`
and `#f6f7f9`; hover is `rgba(16,20,28,.05)`. No dark blocks, no cards on
cards. The window edge is the frame; the only outer background is a very
faint radial wash from white to `#e2e4e9` at the far corner.

**Ink.** Text `#1c1f23`; secondary `#4a4f57`; muted `#8f96a0`; faint
`#9aa1ab`; captions `#a2a29c`. Borders are hairlines of the ink, never a
grey: `rgba(16,22,35,.05)` to `.07`. One blue, `#0060d0` (`#0055ba` on
hover), for the one primary action on a screen and for links in a pill.
Green `#1f8a4c` for done. Amber `#c8790a` for attention. Red `#e0322d` for
wrong. Nothing else is coloured; colour is information.

**Type.** Four faces, each with one job.

- Instrument Sans, the body and every control: 14.5 px, line 1.5,
  letter-spacing −.008 em. Labels 13–13.5 px. Captions 12.5 px. Section
  eyebrows 11.5 px, weight 500, uppercase, tracking .06 em, colour
  `#6b7280`.
- Newsreader, the voice: the headline (« What can I help you with
  today? », 28–42 px, weight 400, line 1.15, tracking −.012 em) and the
  assistant's prose in an answer (17.5 px, line 1.5, colour `#2f333b`,
  max 74 ch). Serif is the assistant speaking; sans is the app.
- JetBrains Mono, 11.5–13 px, for anything the computer says exactly:
  paths, commands, cell references, shortcuts (`⌘K` in a 5 px pill,
  `#f2f2f0`), figures in tables (`tabular-nums`).
- Hanken Grotesk for the fine labels inside tool cards (12.5–13.5 px).
  Bodoni Moda is in the file and unused; it stays unused.

The fonts ship with the app (`desktop/public/fonts`, Google Fonts under
the SIL Open Font License, Latin subsets, variable weight) so the first
frame is already set in them. No font ever loads from the network.

**Shape.** Pills for choices (`999px`). 9 px for list rows, 11 px for
buttons and the search box, 13 px for menus, 16–18 px for result cards,
20 px for a card that holds prose, 24 px for the composer and for a whole
panel. Corners get bigger as the thing gets bigger; nothing is square.

**Depth.** Two shadows only. Resting: `0 1px 2px rgba(16,22,35,.04), 0
6px 18px rgba(16,22,35,.06)`. Lifted (the composer, a menu, a card that
holds prose): `0 1px 2px rgba(16,22,35,.05), 0 12px 32px
rgba(16,22,35,.09)`, with `inset 0 1px 0 rgba(255,255,255,.7)` as the
top light. Menus add `backdrop-filter: blur(30px) saturate(1.8)` over
`rgba(255,255,255,.96)`.

**Motion.** Slow enough to be seen, fast enough to be ignored.
- Things appear with `pcIn`: 5 px up and a fade in .14 s (menus), .22 s
  (cards), .4 s (steps of a run).
- Waiting is a shimmer across the words, never a spinner beside them:
  `aShimmer` 1.8 s, a grey gradient swept through the text.
- The stream (section 4).
- The sphere breathes (section 2). Nothing else moves on its own.
- `prefers-reduced-motion` turns every animation into a plain appearance.

**Words on screen.** Plain, short, no jargon. « Reading the file »,
« Up to date », « Could not start ». Never « indexing », « tokens »,
« embeddings ». Errors say what happened and what to do next.

## 2. The three marks

**The sphere is the logo.** It is not an image: a 48 px circle clipped
over three blurred, slowly rotating gradient layers (green-blue-lime with
an orange glint) and a white highlight, exactly as the founder built it
in CSS (`sphA` 7 s, `sphB` 11 s, `sphC` 9 s, `sphGlint` 5.5 s). It lives
in one component, `<Sphere size>`, and appears: at the top of the empty
chat above the headline (48 px); as the mark beside every assistant turn
(22 px, still, not animated, so a long conversation does not shimmer);
on the welcome and sign-in screens (64 px); in the About tab; and,
rendered once to bitmaps by `scripts/render-brand-assets.cjs`, as the app
icon, the in-app logo file and the menu-bar icon. The brush-stroke mark
traced earlier is retired.

**The model's logo shows.** Wherever the model is named, its provider's
mark sits before the name: in the composer's model chip (« Claude Sonnet
5 » with the Anthropic mark), in the model menu, and in the small line
above every assistant turn (« Claude Sonnet 5 · 12:40 » in 12.5 px
muted, the mark at 14 px). The app already has the provider marks
(`src/renderer/components/providers/uiRegistry`); the design only fixes
where they go.

**The avatar.** The bird (`desktop/public/avatars/parrot.png`, shipped
with the app) stands at the bottom right of the empty chat, 120–196 px
wide, behind everything, never clickable, and disappears the moment the
first message is sent. It is the default character until the cast exists.
Later, the chosen character replaces it in the same place, and its four
states (idle, working, waiting, done) replace the still picture.

## 3. The shell

**The sidebar** (298 px, `#fdfdfd`, padding 16 14 18):

1. Search chats: a full-width box, `#f6f7f9`, radius 11, icon
   `#9aa1ab`, placeholder `#8f96a0`, `⌘K` pill at the right. Opens the
   search modal.
2. Five rows, 14.5 px, `#31353b`, icon 17 px `#6b7280`, radius 9,
   padding 9 10, hover `rgba(16,20,28,.05)`: New Task, Scheduled Tasks,
   Kits, Skills & Connectors, Library. The icons are the founder's line
   drawings (pencil, clock, four squares, puzzle piece, books).
3. Eyebrow « MY AGENTS », padding 26 11 8.
4. One white card per agent with the resting shadow (radius 11, padding
   10 11, the agent's icon at 17 px): the agent's name. Under the open
   agent, its conversations: title on the left (13.5 px, `#4a4f57`,
   truncated), age on the right in 11.5 px `#a2a29c` (« 1h », « 2d »),
   the current one on `#f0f0f2`. Hover shows the row's menu (rename,
   delete) at the right. A subagent's conversations indent under it.
5. The bottom row: the person's initials in a 26 px circle (`#e8effa`,
   blue letters) or their picture, their first name, and the gear at the
   far right for Settings. Signed out, the same row reads « Sign in »
   with the sphere in place of the initials.

The sidebar collapses to nothing (the design shows it closed): the top
bar's first button opens and closes it, and `⌘B` does the same. The
chosen width is remembered.

**The top bar** (54 px, no background): the sidebar toggle at the left
(icon `#4a4f57`), the conversation's title centred in 14.5 px `#31353b`
once a conversation exists (nothing on the empty chat), and at the right
the share icon (opens the existing share menu) and, on a conversation,
the search-in-conversation and fork actions the app has. On Windows the
window controls sit here as they do now.

**The window.** Minimum 420 px for the main column. Only one thing
scrolls: the conversation. The composer and the top bar stay.

## 4. The chat

**Empty.** Centred column, max 800 px. The sphere (48 px). The headline
in Newsreader. The composer. Four suggestion pills under it (« Create
Slides », « Data Analysis », « Write Documents », « Create Website »),
each with its icon in its own colour, radius 999, hairline border,
white; these are the app's quick actions and open their prompt panels as
they do now. The bird at the bottom right.

**The composer** is two cards. The upper card (white, radius 24, lifted
shadow, padding 16 14 13 20): the text box (« Assign a task or ask any
question », 15 px, grows to fit, ⇧⏎ for a new line), then a row: the
« + » (34 px round, opens the menu: Attach a file ⌘⇧A, Mention @, Use
my selection), the kits/skills button (four squares), space, the model
chip (provider mark, name, chevron; opens the model menu), the send
button (36 px black circle `#1d1d1f`, white arrow; grey while empty;
becomes a square « stop » while an answer streams). The lower card
(`#f2f3f5`, radius 24, sits 34 px behind the upper and 44 px below it,
hairline border) carries the tray: the working folder chip (folder icon,
name, chevron; opens the folder picker) and the agent chip (briefcase,
name, chevron; opens the agent picker). Attached files appear as chips
above the text with their file icon (Word, Excel, PowerPoint, PDF, mail,
SharePoint, from `desktop/public/file-icons`, shipped with the app) and
an × on hover. A selected text snippet, a browser annotation and a media
mention keep the chip shape.

After the first message the composer moves to the bottom of the column
and stays there; the headline, sphere and bird go.

**The person's message.** A pill-cornered bubble on the right, `#f4f5f7`,
radius 18, padding 12 18, 14.5 px `#1c1f23`, max 72 % of the column.
Attachments sit above the text as small chips inside the bubble. Hover
shows copy and edit at the left of the bubble.

**The assistant's turn.** No bubble. A 22 px still sphere at the left,
then the column. Above the column, the line « Claude Sonnet 5 · 12:40 »
with the provider mark, 12.5 px muted. A turn records its model only
when its final message lands, so while it runs the line shows the model
the session is set to; once recorded, the record wins. Then, in order,
whatever the turn contains:

- **Thinking.** « Thinking » in 15 px with the shimmer, alone, until the
  model says or does something. When the model's own reasoning is
  available, a « Thought for 4 s » line in 13 px muted that opens to the
  reasoning in 13.5 px `#6b7280`, folded by default.
- **A step** (a tool call). One step at a time, not a list: the step's
  title (16 px, weight 500, `#31353b`, the tool's icon at 18 px), under it
  the step's sub-line in 14 px `#9aa1ab` with a green ring turning
  (`aRing`) that becomes a green tick when the step is done, and under
  that a result card (white, radius 16, `0 0 0 .5px rgba(30,32,38,.07),
  0 8px 24px rgba(16,20,28,.05)`, padding 13 18 13 15) that starts as a
  grey skeleton and fills with what the step produced: a file name with
  its icon (a link that opens or reveals the file), a page title, a
  number, a short line. Steps are indented 36 px under the sphere's text
  column. When the turn finishes, the steps fold into one line: « 4
  steps · 12 s », which opens to the full list; the last result card
  stays visible. A failed step keeps the ring red and its sub-line says
  what failed in plain words.
- **The answer.** Newsreader, 17.5 px, line 1.5, `#2f333b`, max 74 ch,
  with the markdown the app already renders (lists, tables in Instrument
  Sans 14 px with `tabular-nums`, code in JetBrains Mono on `#f6f7f9`
  radius 10 with a copy button, headings in Newsreader weight 500). Links
  are ink with a 2 px offset underline. A file the answer names (« see
  budget.xlsx, sheet Q3 ») is a chip with its icon that opens the file.
- **The stream.** The answer does not print as tokens land. Two things
  together, from the Swens build, kept exactly: a clock in front of the
  stream that reveals `max(2, round(length / 90))` characters every 26
  ms, so any answer takes about two seconds to unfold whatever its
  length and bursts never lurch; and each word, as it is revealed, comes
  up out of a blur (`aWordIn` .34 s: opacity 0 → 1, blur 4 px → 0, 2 px
  up). Words are keyed so a word animates once and never again. Code
  blocks and tables reveal whole, not word by word. When the model
  stops, whatever is left reveals at the same pace and then stops.
- **Under the answer**, on hover: copy, fork, retry, and the tokens in
  and out the turn recorded, all 12.5 px muted. No cost: the app has no
  per-turn price to show. Retry re-opens the question for editing (the
  app has no « generate again » of its own).

**Approval.** When a step needs the person's yes, the step's result card
becomes the approval card and the composer waits. The card says, in one
plain sentence, what will happen (« Maties wants to delete a folder »),
then the exact thing in JetBrains Mono on `#f6f7f9` (the full path; the
full command; the file names, all of them, scrollable if long), then one
line of consequence (« This cannot be undone » or « Files go to the
Trash »), then two buttons at the right: « Not now » (ghost) and the
action verb in blue (« Delete », « Send », « Run »). At the left, a
third ghost button « Later » puts the card aside: it becomes one
hairline row above the composer (an amber dot for an action, a blue dot
for a question, the sentence, « Not now », and « Expand » or « Resume »
to bring the card back). The card never says « execute » or
« permission ». `⏎` is never the yes.

Not built yet: a checkbox « Don't ask again for this kind of step in
this conversation » under the buttons, for the kinds where that is safe
(reading, running a known tool), never for deleting or sending. The
approval answer the engine accepts today is yes or no for one step; a
remembered answer needs a new flag on that answer first.

**Questions from the assistant** (the question wizard) use the same
card: the question in Newsreader 17.5 px, the options as pills, one
selected, « Continue » in blue.

**Plans** (a proposed plan) use the card with numbered steps in
Instrument Sans and « Start » in blue.

**Subagents** appear as a step whose result card names the agent and
opens its own conversation in the right panel.

**The right panel** (artifacts, previews, the browser) keeps its width
behaviour and gets the tokens: white, hairline left border, the file's
name in 14.5 px with its icon, the app's renderers underneath. Its tabs
are pills.

## 5. Settings

The settings window is a sheet (radius 24, lifted shadow, max 1180 ×
780) over a dimmed page, as now, restyled: the tab list at the left (each
row 14.5 px, icon 17 px, radius 9, the open one on `#f0f0f2`), the page
title in Newsreader 23 px at the top of the content, sections as
eyebrows, rows as white cards with hairlines between them (radius 16),
switches as the app's switch in the one blue, buttons as pills. « Save »
and « Cancel » only where a tab has a form; tabs that save on change say
so with a quiet « Saved » that fades. Tabs in order: General, Appearance,
Account (the sphere, the person, usage this month, the models with their
provider marks), Library, Agent Engine, Memory, Dreaming, Browser, IM
Bot, Email, Plugins, Shortcuts, About (the sphere, the name, the version,
the MIT notice).

## 6. The other screens

- **Scheduled Tasks, Kits, Skills & Connectors, Library**: a page with
  the title in Newsreader 23 px at 28 36, one line of explanation in 14
  px `#86868b`, then cards (white, radius 18, resting shadow) in a grid
  or a list, the primary action as one blue pill at the top right,
  filters as pills. Empty states: one sentence and one pill, the sphere
  above them at 40 px.
- **Sign-in and welcome** (`WelcomeDialog`, `LoginButton`, the chat
  login prompt): the sphere at 64 px, the sentence, one blue pill
  (« Sign in with Claidor »), the small print in 12.5 px.
- **Engine starting** (the overlay while the engine boots): the sphere
  breathing at 48 px and « Starting up » with the shimmer; a failure
  shows the plain reason and « Try again ».
- **Search (⌘K)**: the menu style (blur, radius 13), the box at the top,
  results as rows with the conversation's title and age.
- **Toasts**: bottom centre, radius 13, blur, 13.5 px, one line, one
  action at most.
- **The account menu** from the bottom row: the menu style with the
  person, « Manage account », « Sign out ».
- **Onboarding** (the tour cards): the card style, the sphere, one
  sentence, « Next ».

## 7. Dark

The founder drew light. Dark follows the same tokens inverted with care,
not by negation: ground `#141518`, surfaces `#1c1e23` and `#22252b`, ink
`#f2f3f5`, muted `#8f96a0` unchanged, hairlines `rgba(255,255,255,.07)`,
the blue lightened to `#3b82f6`. The sphere is the same. Dark is not
shown to the founder until light is signed off.

## 8. How it is built

- Tokens in `src/renderer/theme/css/themes.css` (`classic-light` becomes
  the design; the other themes stay for now, restyled later or removed)
  and `index.css` (fonts, type scale). Tailwind reads the variables, so
  the whole app moves at once when the tokens move.
- New primitives under `src/renderer/components/design/`: `Sphere`,
  `Stream` (the paced reveal with word fade), `Shimmer`, `Pill`,
  `Card`, `Eyebrow`, `FileIcon`, `ProviderMark`. Each small, each with
  a test where there is logic.
- Then the screens, in this order: shell and empty chat; composer and
  the person's message; the assistant's turn with the stream, steps and
  approval; Settings; the rest.
- Every screen is photographed in the built app under the same
  viewport as the founder's file (1440 × 900) and sent to the founder
  for correction before the next.

## 9. What the founder did not draw, decided here

- The assistant's turn has no bubble and a still sphere; the person's
  has a grey bubble. Two shapes, so the eye never confuses who spoke.
- Steps show one at a time and fold when done. A list of twenty tool
  calls is the engine's view, not the person's.
- Approval shows the exact path and command. Learned on the founder's
  own disk clean-up: without them the person cannot decide.
- The composer keeps its two-card shape on every screen; the tray is
  where the folder and agent live, and nothing else goes there.
- Serif for the assistant, sans for the app. It is the one rule that
  makes the answer feel written rather than printed.
