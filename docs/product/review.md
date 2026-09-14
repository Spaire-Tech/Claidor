# The review

14 September 2026. The founder opened the built app for the first time
and found it, in their words, "horrifyingly terrible… you didn't respect
my design. I designed things and you completely ignored them."

This is the list. It is a document of record, not a plan: every item is
written down before anything is fixed, so that what was wrong is
recoverable later and nothing quietly disappears.

**The canvas is not in dispute.** The file the founder re-sent
(`Swens_Messages_2.html`) is byte-identical to
`docs/product/design/canvas.html` once the bundler's asset UUIDs are
normalised. The design I built from is the design I was given. There is
no stale-file excuse anywhere below.

**How this list is kept.** Items are numbered and never renumbered.
Each says what is wrong, where the design says otherwise, and where the
code is. Status is one of: `open`, `agreed`, `fixed`, `disputed`.
Nothing is marked `fixed` until the founder has seen it in the running
app — not a test, not a screenshot.

---

## Part 1 — What I found myself, before the founder started

Written out after re-reading the canvas on 14 September. These are mine,
not yet the founder's, and the founder's list will be longer. Listed
first because they were found by reading the design against the code —
which is what should have happened before any of it was built.

### 1. Apps is the wrong shape entirely — `open`

**Design:** a full-screen sheet. `max-width: 1080px`,
`height: calc(100% - 48px)`, `border-radius: 24px`. The tabs sit in the
header row **beside** the 22px title, and the search box is on the
**right of that same row**, `width: min(300px, 42%)`.

**Built:** a 620px modal. Tabs stacked under a subtitle, search full
width below them.

**Where:** `src/renderer/design/shell/Apps.tsx`.

### 2. The Apps tabs are named wrong — `open`

**Design:** `Plugins` and `Agents`. The Plugins tab then has a section
heading `Connectors` with a count.

**Built:** `Connections` and `Agents`.

**Where:** `Apps.tsx`, `AppsTab`.

### 3. The Agents tab is a card grid, not a list — `open`

**Design:** `grid-template-columns: repeat(auto-fill, minmax(360px, 1fr))`,
20px gap. Each card: 24px padding, 20px radius, a 48px orb, the name at
16.5px, a skills count and an `Official` badge in blue, an install
button on the right, and the description on its own line underneath at
15px/1.55.

**Built:** a list of 38px rows with the description squeezed beside the
name.

**Where:** `Apps.tsx`.

### 4. The agent detail is somewhere else entirely, and I invented a screen — `open`

**Design:** agent detail lives **inside Apps**. A back arrow, an 88px
orb, the name at 27px, a meta line, an install button, a description at
16.5px, a divider, and skill chips as 34px pills.

**Built:** a five-tab sheet — Instructions, Memories, Skills, Routines,
Integrations — opened by tapping the agent's name in the conversation
header.

**Those five tabs do not appear anywhere in the canvas.** The gesture
does not either. I took the phrase "the agent detail gets its five tabs"
from `plan.md`, which is mine, and built it over the founder's design
instead of against it.

**Where:** `src/renderer/design/agent/AgentDetail.tsx`,
`useAgentDetail.ts`, `detail.ts`, and the `onOpenAgent` prop on
`MessagesShell.tsx`.

### 5. Settings is designed and I never built it — `open`

**Design:** a 236px tab rail on the left with four tabs — General,
Computer, Usage, Updates, each with its own icon — and a content column
of grouped rows. Rows come in five kinds: select, toggle, button, field
with a Save, and a meter with a fill bar. Groups are 18px-radius blocks
on `#eef1f5`.

**Built:** nothing. The account menu opens NetEase's original
thirteen-tab settings.

**Where:** no file. `FaiserApp.tsx` calls `onOpenSettings` which reaches
the old `Settings` component.

### 6. I removed two rows from the account menu the founder had designed — `open`

**Design:** Trial usage with a percentage and a chevron; Support;
Settings; divider; Add account; Log out.

**Built:** usage, Settings, divider, Log out.

I removed Support and Add account deliberately and wrote comments in the
code justifying it — "no URL", "no second account". That is not drift.
That is overruling the designer.

**Where:** `src/renderer/design/shell/AccountMenu.tsx`.

### 7. The sidebar has no search — `open`

**Design:** a 40px pill on `#e9edf2` under the title, with a magnifier
and a `Search` placeholder.

**Built:** nothing. I built a find-in-conversation bar in the thread
header instead, which is a different feature.

**Where:** `src/renderer/design/shell/Sidebar.tsx`.

### 8. The sidebar rows are missing their unread dot — `open`

**Design:** a 7px circle at the end of each row, coloured per row
(`bot.dotColor`).

**Built:** absent.

**Where:** `Sidebar.tsx`.

### 9. The voice picker is a carousel, not a grid — `open`

**Design:** a modal with the heading "Choose a voice." and the line "How
your agent speaks to you."; a **176px** orb; prev and next arrows either
side of the voice name (19px) and its description (15px); a row of dots;
then "Use this voice" and "Cancel".

**Built:** a grid of seven tiles.

**Where:** `src/renderer/design/shell/Compose.tsx`, `VoicePicker`.

### 10. The thread header is missing the share button — `open`

**Design:** three buttons on the right — search, **share**, computer.
The share button opens a popover with one row: "Share as template".

**Built:** search and computer. No share.

**Where:** `src/renderer/design/shell/MessagesShell.tsx`.

### 11. The composer's `+` is a dead button — `open`

**Design:** it opens a 232px popover with two rows — "Attach files" with
a paperclip, and "Teach a task" with a red record dot
(`border: 2px solid #e0322d` around a 7px `#e0322d` fill).

**Built:** `onPlus={() => {}}`. A control that does nothing, which is
the exact thing the founder has already told me not to ship.

**Where:** `FaiserApp.tsx`, `Composer.tsx`.

### 12. The send button should become a microphone when there is nothing to send — `open`

**Design:** one 40px dark circle. An up-arrow when there is a draft, a
**microphone** when there is not.

**Built:** two separate controls.

**Where:** `src/renderer/design/shell/Composer.tsx`.

### 13. Compose has no group chips — `open`

**Design:** the To: bar holds removable chips — a 24px orb, the name,
and an × — and there is a "start group" button below the picker.

**Built:** single recipient only. I deferred it to Stage 10 on my own
authority and left no trace of that decision in the design.

**Where:** `Compose.tsx`, `composeRows.ts`.

---

## Part 2 — The founder's list

Numbering continues. These are the founder's words and findings, taken
screen by screen from the running app.

### 14. The first screen in the app is upstream's engine splash — `agreed`

**What happens:** launching the app shows a full-screen white panel with
the **LobsterAI lobster icon**, the heading "Starting AI engine", the
line "AI engine is starting the gateway…", a progress bar at 10%, and a
rotating **"Tip"** carousel — "Ask AI for HTML, SVG, or Mermaid diagrams
— the side panel previews them live".

**Why it is wrong,** three ways at once:

1. **It is not in the design.** The canvas has no splash, no progress
   bar and no loading screen of any kind. `direction.md` is explicit
   that the app opens on a conversation.
2. **It is NetEase's branding and NetEase's growth surface.** The
   lobster is upstream's app icon. The Tip carousel is the first-run
   tour that `plan.md`'s housekeeping list already says to remove. It
   also advertises a side panel that is not part of this product.
3. **It says the engine's name out loud.** "AI engine", "gateway" — the
   machinery is named to the person, which `direction.md` rules out.

**Why it appears:** `EngineStartupOverlay` is rendered in `App.tsx`
**above** the `useFaiserShell` switch, so it draws before anything of
mine is reached. The new shell never replaced it because I never looked
at what the app does before my code runs.

**Where:** `src/renderer/components/cowork/EngineStartupOverlay.tsx`
(257 lines), mounted from `src/renderer/App.tsx` — the state is
`isEngineStartupOverlayVisible` around line 244, the render is below it.

**Agreed:** it should not be there.

**Answered, 14 September:** *"nothing until its ready for now."* So the
window shows nothing at all while the engine starts — no splash, no
progress, no tip, no greyed shell. The first thing drawn is the app,
once it can be used.

"For now" is noted: this is the answer today, not a ruling for ever. If
the wait turns out to be long enough to feel broken, it comes back to
the founder rather than getting a spinner added quietly.
