# The design of record

The founder's redesign of the app. It arrives as a Claude Design canvas
and lives only in a chat upload; it is here so it survives. There are
two, and the later one wins where they differ.

## 15 September 2026 — the sidebar, avatars, voices, the agent panel

| File | What it is |
|---|---|
| `canvas-2026-09-15.html` | the canvas exactly as delivered — a self-unpacking bundle, 2.5 MB, opens in a browser |
| `canvas-2026-09-15-template.html` | the same thing unpacked: the markup and the `text/x-dc` script, readable |
| `cloud-blob.js` | the agent's face, lifted out of the bundle — a soft cloud with eyes, pure SVG, 110 lines |

What changed from 13 September, in the founder's words and the canvas's
code:

- **Twenty-five avatars.** `AVATARS` is twenty-five three-colour
  gradients. An agent's face is a `<cloud-blob>` tinted by one of them;
  its shape is `seed = i * 5 + 2`, so an avatar is one number, 0–24. The
  create screen rolls one when it opens (`setupPalette`) and it is
  stored on the agent — it is not derived from anything.
- **Avatars can be changed.** "Edit avatar" on the create screen opens a
  9-column grid of all twenty-five; the same button in the agent panel
  opens a 5-column one. Any of the twenty-five may be chosen.
- **Voices are spheres.** Each of the seven voices now carries its own
  five-colour palette and seed and is drawn with `<cloud-orb>` — the
  13 September sphere, unchanged (`cloud-orb.js` is byte-identical). An
  agent's face and its voice are two different pictures.
- **A voice is optional at creation.** The button reads "No voice yet /
  Add" until one is picked, then the sphere and "Change".
- **Delete lives in the sidebar.** A trash icon replaces the unread dot
  on the *active* row (only when there is more than one agent). It opens
  the agent panel with the delete question already asked.
- **The agent panel.** A third column, `clamp(236px, 25%, 324px)`, with
  the sidebar narrowing to `clamp(252px, 22%, 300px)` while it is open.
  Header "Agent settings"; a 76px avatar and Edit avatar; Name, Label,
  Description edited live; a Notifications toggle; Delete agent →
  "Delete {name} and this conversation? This can't be undone." with
  Delete / Keep. Opened from the sidebar's trash icon, or by the agent's
  name in the conversation header.
- **Typing is an animation.** In the header, three small dots beside
  the name (`thinkDot`). In the thread, the agent's blob at 26px hopping
  (`thinkHop`) beside a small bubble of three dots (`thinkBubble`).

## 13 September 2026 — the shell

| File | What it is |
|---|---|
| `canvas.html` | the canvas exactly as delivered |
| `canvas-template.html` | unpacked |
| `cloud-orb.js` | the sphere — 195 lines of self-contained WebGL2 |

The whole shell: Messages, the thread, compose, Apps, Settings, the
twelve role agents, the connector catalogue and the copy. Still the
specification for everything the 15 September canvas does not touch.

`cloud-orb.js` takes `colors` (five comma-separated hex values), `seed`
and `grain`. It is now the *voice's* picture and the logo's; the agent
wears the blob.

## 15 September 2026, evening — the face, the scale, the hover cluster

| File | What it is |
|---|---|
| `canvas-2026-09-15-type.html` | the canvas exactly as delivered — a self-unpacking bundle, 2.7 MB, opens in a browser |
| `canvas-2026-09-15-type-template.html` | the same thing unpacked: the markup and the `text/x-dc` script, readable |

The founder: *"i've added some changes to the design of the app. the
fonts, the size, the butons style etc... and more. (the emoji reactions
etc) make sure it all fits well with our app."* Diffed against the
file-cards canvas, element by element, the changes are four:

- **The face is Switzer** (`'Switzer','Switzer Variable',-apple-system,
  BlinkMacSystemFont,sans-serif`), bundled in the canvas at 400 and 500
  as woff2, woff and ttf. The app ships the two woff2 files under
  `desktop/src/renderer/design/fonts/`. Names and titles that were
  tracked at -.005em or -.008em are at 0; the larger titles keep their
  tightening.
- **Everything is one step smaller.** Type: 15 → 14, 15.5 → 14.5,
  14.5 → 13.5, 13 and 13.5 → 12.5, 16.5 → 15.5, 17 → 16, 19 → 18,
  21 → 20, 22 → 20.5, 27 → 25.5; the mono sizes at 12. Controls: rows
  52 → 49, 44 → 41; buttons 42 → 39, 40 → 37, 36 → 33, 34 → 31; the
  composer 52 → 49; blobs 40 → 37, 28 → 26, 26 → 24, 48 → 44, 88 → 82,
  76 → 70, 104 → 96; the voice orb 176 → 163. Columns:
  `272px minmax(0,1fr)` and, with the agent panel,
  `clamp(233px,21%,272px) minmax(0,1fr) clamp(220px,23%,294px)`. Menus
  and lists gain a 4px gap between rows and lose 2px of padding.
- **Every button is a pill** (`border-radius:999px`) at weight 400 —
  Create agent, Use this voice, Always allow, Connect, Install, Import
  agent, Delete, the settings selects, the header's icon buttons.
  Toggles come down to 44×26 (knob 19) and 41×24 (knob 17).
- **A hover cluster beside every text bubble.** Three 28px round
  buttons — react, reply, more — in a 93px slot beside the bubble, on
  the left of the person's own and the right of the agent's, at
  opacity 0 until the pointer rests on the row. React opens six emoji
  (👍 ❤️ 😂 😮 😢 🙏) at 31px on a glass popover; the pick becomes a
  24px chip at the bubble's foot and picking it again clears it. Reply
  sets the composer to the message's first 52 characters in curly
  quotes. More opens a 191px menu with one row, which copies an id and
  says "Copied" for 1.1 seconds.

Built as: `tokens.ts` (the scale, `font.ui`, `font.emoji`), `tokens.css`
(`@font-face`), `shell/layout.ts` (the columns), every component under
`design/` (the sizes and the pills), and `thread/MessageActions.tsx`
with `thread/actions.ts` and `thread/useReactions.ts` (the cluster;
reactions kept per conversation in the renderer's storage). One thing
is not the canvas's word for word: its menu row says "Copy request ID"
and copies a hash it invents. The app copies the engine's message id
and calls it that, because that is what it is.

## Reading these

The `canvas*.html` files are the originals and should not be edited.
Read the `*-template.html` beside each: the template and the script that
drives it are the whole specification — every colour, size, radius,
shadow and animation, plus the seeded agents and the copy.

What to read alongside: `../direction.md` for the decisions, `../review.md`
for what was found wrong and fixed. Where a canvas and `direction.md`
disagree, `direction.md` wins — it records corrections the founder made
after a canvas was drawn.

## 15 September 2026, later — the file cards

| File | What it is |
|---|---|
| `canvas-2026-09-15-files.html` | the canvas exactly as delivered — a self-unpacking bundle, 2.5 MB, opens in a browser |
| `canvas-2026-09-15-files-template.html` | the same thing unpacked: the markup and the `text/x-dc` script, readable |

The founder: *"i want when the artifact to finish, like when the ai
finishes its work to render it in this style, and not just wordmock.doc
… its pdf excel and word. with their own svg."* In the canvas, typing
`send me the pdf`, `send me the excel model`, `send me the word memo` or
`send me the whole pack` answers with a `{ kind: "file", files: [...] }`
message (`maybeSendFiles`), and the file message draws one card per
file:

- a column, `gap:9px; max-width:min(70%,440px)`;
- each card `padding:13px 14px; border-radius:18px; background:#fbfbfc;
  border:1px solid rgba(255,255,255,.6)`, with the raised shadow
  `0 1px 2px rgba(16,22,35,.04), 0 12px 32px rgba(16,22,35,.08), inset
  0 1px 0 rgba(255,255,255,.7)` and `#f6f7f9` on hover;
- the file's own icon at 38px — `icons/pdf-doc.webp`,
  `logos/apps/excel.webp`, `logos/apps/word.webp`,
  `logos/apps/powerpoint.webp` — then the name at 15px/500, then a
  34px round button with a down-arrow, `#eef1f5` on hover.

Built as `design/thread/ThreadItemView.tsx` (`AttachmentCard`), fed by
`design/thread/attachment.ts` (`peelAttachments`): the trailing file links
of a reply become the cards, in order, under whatever was said. The
canvas's fake bot matched words in the prompt; the app's cards come from
the files the agent actually links. The Word, Excel and PowerPoint
images were already bundled under `design/logos/`; the PDF one is
`design/thread/pdf-doc.webp`, lifted from this bundle.

## 16 September 2026 — onboarding, step one

`canvas-2026-09-16-onboarding.html` is the founder's bundle as uploaded
(`Caisra_Mac_Onboarding_1.html`); `canvas-2026-09-16-onboarding-template.html`
is its own source, pulled from the bundle's `__bundler/template`, with
the script (roles, tasks, timings) at the bottom. Built as
`desktop/src/renderer/design/onboarding/`; the three app logos it
embeds are under `desktop/public/logos/apps/` as `apple-notes.webp`,
`macos-settings.webp` (shrunk from the bundle's 472KB PNG) and
`imessage.webp`. Photographed by `harness/onboarding-walk.mjs`.

