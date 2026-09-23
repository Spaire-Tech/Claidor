# The agents' marks are orbs — how, and what is measured (23 September 2026)

The founder, 23 September, after the audit in `avatar-animation-audit.md`:
"i prefer sphere/orbs. yes, no eyes but its okay. there is animation inside
the sphere. i still want it to appear in onboarding and follow the
animations and everything else in chat." Then, with the shapes: "theres
orbs, pills, hexagons etc.. in my chosen colors", and "go head".

This file is the record of the build. Read `avatar-animation-audit.md`
first: every identifier below (`sd`, `$_t`, `wct`, `Iee`, `Jo`, `Ij`,
`PQ`, `nnt`, group `A`, `clipPath#N`) is named there with its byte offset
in the pinned chunk.

## What ships

Two files and one wiring line, all package-time, none of them touching the
pinned bytes in the cache:

- `desktop/scripts/lib/orb-mark-element.js` — the founder's `<cloud-orb>`
  (from `desktop/design/orbs/cloud-orb.js`, the "Orb Shapes" page) with
  four changes for life inside the mark: a `none` outline so the SVG clip
  cuts the shape; it reads its host mark (the closest
  `span.sand-grok-bot-mark`) for colour (`--fg`), seed (`--orb-seed`) and
  state (`data-grok-state`); it sizes from the on-screen rectangle, since
  inside a `<foreignObject>` the layout box is 259 units however small the
  mark is drawn; and it skips marks under 10 px (the hidden engine
  container) or off screen, and repaints marks under 48 px every other
  frame. Copied to `dist/renderer/assets/cloud-orb.js` and loaded by
  `index.html` as a classic script before the renderer module (the page's
  CSP is `script-src 'self'`, so it cannot be inline, and it must not be
  `crossorigin` for the reason `building-the-app.md` records).
- `desktop/scripts/lib/orb-mark-patch.mjs` — fifteen exact-once string
  replacements in the animator chunk plus one in `index.html`, applied by
  `scripts/clean-build.mjs` right after the Settings and brand patches.
  Provenance in `dist/renderer-orb-marks.json`. Any anchor missing or
  ambiguous fails the build.

## How each animation survives

| Animation | Where it lived | What keeps it |
|---|---|---|
| Bounce, spin, breath, tilt, pointer follow | per-frame `translate/rotate/scale` on face group `A` | the orb's `<foreignObject>` is a child of `A` |
| Shape morphs (orbit, radar, progress, the picker's morph) | `d` rewritten each frame on body path `G` **and** clip path `Y` | the orb is clipped by `clipPath#N`, whose path is `Y` |
| Rings, particles, dots, glyphs (notifying, alerting, celebrate…) | hidden overlay elements in `--fg` | untouched; they paint over the orb |
| State → mood | `data-grok-state` on the `sd` span | the orb reads it and sets the liquid's speed (`STATE_SPEED`) |
| Eyes, gaze, blink | eye paths under `clipPath#N` in `--bg` | hidden (`display:none`); "no eyes but its okay" |
| Onboarding scene | its own `sd` at 80 px with `isFollowingPointer` | unchanged: it is an `sd`, so it is an orb |
| Colour | `--fg` as `light-dark(light, dark)` from `snt` | the element maps the light hex to one of the six palettes; an unknown hex (an ink) gets tints and shades of itself |

The body path `G` stays in the tree with `fill:none`, so every ref and
every per-frame `setAttribute` the animator makes still has its target.

## What changed for the person

- **Shapes**: the picker offers disc, pill, squircle, square, blob, hex.
  Disc, pill and square are new entries in `Jo`, drawn by the renderer's
  own generators (`zBe(113,113,2)`, `ZJt(113,62)`, `zBe(107,107,6)`), so
  the face geometry `Po` computes for them is the same kind the others
  have. The other 16 shapes stay in `Jo`; an agent that already carries
  one keeps it.
- **Colours**: the picker offers blue, green, orange, violet, cyan, gray,
  with swatches showing the palette's mid stop. The other five ids stay
  valid and map to the nearest palette (red, yellow, brown → orange;
  magenta → violet; black → gray).
- **No mirrors**: `wct` returns null, so every mark is its own animator.
  A `<use>` clones its target into a closed shadow tree where a custom
  element never upgrades, so the mirrors had to go. The hidden engine
  container `mln` still mounts one `sd` per staged agent; the orb inside
  it is under 10 px and never paints. The `tryPokeMark` commands (spin,
  bounce, burst on click) still reach those hidden engine instances and
  not the visible marks — **the click pokes are lost until they are
  re-routed**, which is a follow-up, not a regression anyone asked about.
- **Seeds**: `Iee` and the chat header pass `--orb-seed` (the agent id
  through the renderer's own FNV hash `mOt`, mod 991) so two blue discs
  do not move in step. The onboarding mark has no agent and runs at seed 0
  plus the palette's seed.

## Measured

`desktop/design/orbs/mark-preview.html` is the patched SVG structure
(defs/clipPath, face group, clipped group with the unfilled body path and
the foreignObject) built by hand around the element, with the eight
shipped picker shapes from `shape-paths.js`, the three new ones generated
the same way, 57 marks at 36, 80 and 160 px, the face group bouncing and
tilting per frame, and states cycling. Screenshotted headless at 1× and
2× on 23 September (Chromium 141, SwiftShader software GL, this
container):

- every shape clips the orb correctly, including the morph-only ones
  (cloud, teardrop, wedge);
- the face group's transform carries the foreignObject (the hex is drawn
  tilted mid-bounce);
- the six palettes read from `--fg`; red (not in the six) draws as tints
  and shades of its own hex;
- **frame cost is not measured**: software GL ran 57 marks at 4 fps at
  1× and 2.7 fps at 2×, which says nothing about a Mac's GPU. The shader
  is the founder's own page's, which he runs at full rate with six orbs.

Also measured: the pinned chunk `index-UbX-y3il.js` carries each of the
fifteen anchors exactly once and parses after the patch
(`tests/orb-mark-patch.test.mjs`, third case, with
`GROK_BOT_PINNED_RENDERER` pointing at an unpacked 0.18.0 renderer; the
renderer is not in this repository, so on a machine without it the case
skips and says so).

## Not measured

- The app itself with the patch: `npm run package` runs on a Mac, and the
  renderer needs the Electron preload to mount. The first run should
  look at: the sidebar, the chat header, the onboarding scene, the
  shape/colour picker (six and six), a morph state (`progress`), and
  `Activity Monitor` with forty agents in the sidebar.
- Frame cost on a Mac, at 2×, with a sidebar of marks plus the chat
  header, plus each own `sd` running its own spring loop instead of one
  engine per agent. The animator parks its rAF when settled
  (`$_t`'s early return), so the idle cost should be the orbs alone.
- Dark mode: the element reads the light hex of `light-dark(...)` for the
  palette id, so the palette is the same in both schemes by design; not
  yet seen on screen.

## Reset before looking

To see onboarding again with the orbs, the account reset the founder
already uses (quit Simeon first):

```
rm -rf ~/Library/Application\ Support/Simeon
```
