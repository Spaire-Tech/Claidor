# The agents' faces: DiceBear clay on the marks, measured (22 September 2026)

The founder's choice, after the cloud bodies (reverted), a glass pebble and a
Siri orb (both shown as moving pages and declined): "ok go with these. put
them on the marks." These are DiceBear's **clay** style.

## What it is

- `@dicebear/styles` 10.6.0, `clay.json`: a hand-authored vector style, 14
  bodies, 13 tops, 10 surface marks, 15 eye sets, 20 mouths, 12 clay colours.
  Licence **CC0 1.0** (the package's `LICENSE.md`, "Clay" row): no attribution
  owed, commercial use included. `@dicebear/core` 10.7.0 renders it (MIT).
- A face is generated on the Mac from the agent's id
  (`desktop/source/shared/agent/clay-face.ts`): deterministic, 0.3 ms per
  face, 215 KB of bundle for the generator and the definition together,
  no picture file, no network. Options fixed: `animationVariant: "none"`
  (the style's own squash is off), `backgroundColor: []` (no tile),
  `idRandomization: false`. Every id is then prefixed per painted instance,
  because two marks of one agent share a document and DiceBear's clip ids
  are not unique per avatar. The canvas clip is removed so a turning face
  may overflow the mark's box.
- The overlay (`desktop/source/electron-preload/clay-face-overlay.ts`) is the
  cloud overlay's path with the body swapped: the same host finding, the
  same hide rules for a grandchild face, an `<svg>` mark and an open shadow
  root, the same `[CaisraFaceOverlay]` console line. The seed is the id the
  mark's face source carries (`sand-agent-mark-source-<id>` in the
  reconstruction), else the mark's colour, else one shared face.
- Motion (`desktop/source/shared/agent/face-motion.ts`) is Grok Bot's table
  verbatim, rescaled to the 100-unit canvas: the body group bobs, leans,
  turns 360° in 1,000 ms on sending, spawning, celebrate and orbit, and
  bounces 8 units over 700 ms on excited, happy, notifying, alerting,
  bouncing and receiving; the eye group scales about the eye line for
  openness; each pupil group slides 4 units across and 3 down toward the
  pointer. `prefers-reduced-motion` and a paused mark hold the pose.

## Measured here

| Measure | Value |
|---|---|
| faces painted and moving on the preview page | 18 of 18 |
| marks on the reconstruction's thread | 8: 5 painted and moving, 3 inside a group avatar left as Grok's by design |
| a sleeping agent's eyes | `scale(1 0.12)` about its own eye line |
| gaze with the pointer at a corner | pupils at `translate(1.75 1.31)` |
| `[CaisraFaceOverlay]` line on the preview | `marks=18 hosts=18 painted=18` |
| `tsc` on `source/` and `frontend/` | clean |
| `node --test tests/*.test.mjs` | 115 tests, 113 pass, 2 pre-existing skips |

Pictures: `desktop/harness/shots/face-preview.png`, `face-preview-gaze.png`,
`faces.png`, `thread.png`; video `face-preview.webm`; the page itself at
`.build/face-preview.html` after `node harness/face-preview.mjs`.

## What is still not established

The pinned 0.18.0 bytes are not on this disk, so whether the real mark is a
`<span class="sand-grok-bot-mark">` around an `<svg data-grok-state>` with a
`data-source-id` is inherited from the reconstruction, not read. The overlay
reads the state and the id from the mark, a descendant, or an open shadow
root, and hides the face at any depth, so it survives the shapes that could
differ. On the Mac, after the build loop, View → Toggle Developer Tools,
filter `CaisraFaceOverlay`: `painted=N` with N the number of agents on screen
is the answer; `painted=0` with a `first=` fragment names the real mark.

One design note the founder should see once on the Mac: these are characters
with mouths. A face whose seed gave it a grin will grin while "sad". The
mouth can be pinned per agent or follow the state; both are small changes in
`clay-face.ts`.
