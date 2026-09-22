# The agents' faces: DiceBear slice on the marks, keyed on Grok's avatar (22 September 2026)

The founder's second choice, the same day as the clay faces: "i've changed my
mind on the avatars. i want this: https://www.dicebear.com/styles/slice/". And
a correction that matters more than the style: "the avatars lie and are
incoherent … click + and all you see are the same agents. the edit avatar are
all the same, with colors that makes no sense. change avatar should be the
other avaters."

## What was wrong with the clay faces

The clay face was keyed on the agent's id alone, read from the mark's
`data-source-id`. Where a mark carried none, it fell back to the mark's
colour, and then to one shared face. So:

- a new agent whose mark carried no id got the face of its colour, the same
  face as every other agent of that colour ("all you see are the same
  agents");
- the "change avatar" picker draws one cell per shape in the agent's colour;
  every cell keyed to the same id or the same colour, so every cell was the
  same face ("the edit avatar are all the same");
- the picker's colour row changed nothing the face showed, because the face
  ignored Grok's colour and drew clay's own ("colors that makes no sense").

The face was a function of the wrong thing. Grok Bot persists an avatar as a
**shape** and a **colour** (`avatar-editor/model.ts`: eight shapes, eleven
colours), writes both onto every mark as `data-avatar-shape` and
`data-avatar-color`, and the picker's cells carry the same two attributes.
That is the persisted choice, and it is what the face has to follow.

## What it is now

- `@dicebear/styles` 10.6.0, `slice.json`: a hand-authored vector style, 10
  shapes, 16 cut patterns, 12 body colours, no eyes. Licence **CC0 1.0** (the
  package's `LICENSE.md`, "Slice" row). `@dicebear/core` 10.7.0 renders it
  (MIT).
- A face is generated on the Mac (`desktop/source/shared/agent/agent-face.ts`)
  from three things: Grok's shape, mapped one-to-one onto a slice shape
  (blob→lump, pebble→egg, squircle→squircle, tablet→pill, wedge→diamond,
  hex→hexagon, cloud→arch, teardrop→lens); Grok's colour, as the body colour
  (Grok's own hex values); and the agent's id, which picks the cut pattern
  only. Deterministic, 0.3 ms per face, no picture file, no network. Options
  fixed: `shapeVariant`, `bodyColor`, `backgroundColor: []` (no tile),
  `idRandomization: false`. Ids are prefixed per painted instance; the canvas
  clip is removed so a turning face may overflow the mark.
- So: **a different shape is a different body, a different colour is a
  different paint, and the same agent keeps its cuts through both.** The
  picker's cells (`<agentId>-<shape>` in the reconstruction) are real
  alternatives, one body each, in the chosen colour; choosing one changes the
  mark's attributes, Grok saves them as before, and the face follows. Two
  agents of one shape and colour differ by their cuts (sixteen patterns; over
  forty agents the test measures at least eight distinct).
- The overlay (`desktop/source/electron-preload/agent-face-overlay.ts`) is
  the same path as before: same host finding, hide rules, shadow-root and
  `<svg>`-mark mounts, the same `[CaisraFaceOverlay]` console line. It reads
  the shape and colour from the mark, the nearest ancestor, a descendant or
  an open shadow root, and repaints when either changes (the observer
  already watched both attributes). The painted face carries `data-face-key`
  (`<agentId>|<slice shape>|<hex>`), which is what a repaint compares.
- Motion (`desktop/source/shared/agent/face-motion.ts`) is Grok's table
  verbatim on the body: bob, lean, a full turn in 1,000 ms on sending,
  spawning, celebrate and orbit, a bounce over 700 ms on excited, happy,
  notifying, alerting, bouncing and receiving. The slice has no eyes, so the
  openness and gaze outputs go unused. The body turns about the canvas
  centre (`sliceFaceGeometry`).

## Measured here

| Measure | Value |
|---|---|
| faces painted and moving on the preview page | 18 of 18 |
| distinct faces on the preview page (18 shape-and-colour pairs) | 18 |
| picker test: one agent, eight shape cells, one colour | 8 bodies, 1 cut pattern, 8 distinct faces |
| marks on the reconstruction's thread | 8: 5 painted and moving, 3 inside a group avatar left as Grok's by design |
| a thinking agent's body | `rotate(3 50 50)`; sending, at half a second, `rotate(180 50 50)` |
| `[CaisraFaceOverlay]` line on the preview | `marks=18 hosts=18 painted=18` |
| `tsc` on `source/` and `frontend/` | clean |
| `node --test tests/*.test.mjs` | 117 tests, 115 pass, 2 pre-existing skips |

Pictures: `desktop/harness/shots/face-preview.png` (eighteen agents, each a
different shape and colour), `faces.png` (the thread); video
`face-preview.webm`; the page at `.build/face-preview.html` after
`node harness/face-preview.mjs`.

## What is still not established

The pinned 0.18.0 bytes are not on this disk. The reconstruction writes
`data-avatar-shape` and `data-avatar-color` on the `.sand-grok-bot-mark` span
(`agent-avatar.tsx`) and on the picker's cells (`avatar-editor/view.tsx`);
whether the shipped renderer does the same is inherited, not read. If it does
not, every mark keys to `persona|lump|seed` and the founder sees one face
again. The reading is the `[CaisraFaceOverlay]` line on the Mac (View →
Toggle Developer Tools, filter `CaisraFaceOverlay`): its `first=` fragment
prints the real mark's attributes. `data-avatar-shape="…"` in it means the
keying holds; its absence names the next job, which is to read the shape off
whatever the mark does carry.
