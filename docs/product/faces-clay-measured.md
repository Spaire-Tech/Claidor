**Superseded the same day, 23 September 2026.** The founder did not like these faces ("i really dont like it") and replaced them with twenty-one avatars of their own, made with DiceBear's Adventurer style; `faces-adventurer-measured.md` is the current record and `character.tsx` no longer contains any of this drawing. The screenshots this note lists were removed with the code; the note is kept as the record of what was tried.

# The agents' faces as clay characters, measured (23 September 2026)

The faces are redesigned as matte 3D clay characters: a round head, a hair
shape sitting on it, small features, soft light from the top left, no
outlines. Everything is drawn inside `OnboardingCharacter`
(`desktop/frontend/src/recovered/features/onboarding/signed-in/character.tsx`),
as SVG, from numbers. No image, no WebGL, and nothing paints over the marks
from outside; the rule in `faces-slice-measured.md` holds.

Nothing else changed for the look. The sidebar, the chat header, the avatar
editor and onboarding still pass `color`, `shape`, `state`, `sizePx` and let
the component draw. The onboarding scene, the activity mapping and the
reminder middlewares were not touched.

Pictures: `docs/product/faces-clay/` (listed at the end). Preview page:
`node scripts/face-preview.mjs` in `desktop/`, which builds
`frontend/src/dev/face-preview.tsx` into `.build/face-preview/index.html`
and takes the screenshots. Test: `desktop/tests/clay-faces.test.mjs`.

## What a face is now

One `<svg viewBox="-15 -15 259 259">`, centre 114.27 as before. Inside:

| part | drawn as | at every size |
| --- | --- | --- |
| ground shadow | an ellipse under the head with a radial gradient to transparent, outside the face group so the head bobs over it | yes |
| head | a circle, r 92, centre 8 below the box centre, filled with a radial gradient in user space (light stop top left, base, dark stop bottom right) | yes |
| hair shadow | the front hair path, moved 9 down, blurred (`feGaussianBlur` 5), clipped to the head | yes |
| specular | one soft ellipse on the forehead, white 42 % to 0 | yes |
| rim | a 3 px stroke on the head and 2.5 px on the hair with a linear gradient that is transparent until 55 % and light at the bottom right | yes |
| eyes | a light sclera circle (r 13) with a dark pupil (r 6.4) and a 2 px catchlight; pupils clipped to the sclera | yes |
| mouth | a stroked curve; a filled shape for `laughing` and a dot for `surprised`, `scared`, `confused` | yes |
| hair | the style's front path, filled with the hair gradient; `hex` (puff) also has a back path drawn behind the head | yes |
| ears, brows, nose, blush | gated on `sizePx >= 36` | 36 px and above |

No accessory was added. The five parts at 16, 22 and 28 px are head, hair,
two eyes and mouth. The eyes are a light sclera with a dark pupil; the
pupil is what moves with gaze, the whole eye group is what squints.

Material: the gradients are three stops of `color-mix(in oklab, var(--x),
white 28%)`, `var(--x)`, `color-mix(in oklab, var(--x), black 22%)` on the
skin and 22 / 26 % on the hair, so one CSS variable per material draws the
whole matte body. Measured in Chromium: the first stop of the skin gradient
computes to `oklab(0.792274 0.0338176 0.0572723)`, so `color-mix` on a
`stop-color` resolves.

## Identity

**Colour keys and hash defaults are unchanged.** The eleven keys, the
shipped hash functions and the shape hash are byte-for-byte the previous
code (`git diff` on those lines is empty; the test records five ids and
their faces). The pairs are now hair colours, one for each theme:

| key | light theme | dark theme |
| --- | --- | --- |
| black | `#2E2C31` | `#46444D` |
| brown | `#8B5A3C` | `#9E6D4D` |
| red | `#D2493F` | `#E05E53` |
| orange | `#E27A33` | `#EE8D48` |
| yellow | `#E5B13B` | `#EFC252` |
| green | `#3E9C61` | `#50B074` |
| cyan | `#2FA49C` | `#41B9B0` |
| blue | `#3C7ED4` | `#5092E5` |
| violet | `#8868D2` | `#9B7DE3` |
| magenta | `#D2558E` | `#E1689E` |
| gray | `#8A8A91` | `#A3A3AB` |

**Shape keys map to hair styles**, so an agent whose persisted shape is
`cloud` keeps being the one with that silhouette:

| key | style | how it is built |
| --- | --- | --- |
| blob | crop | cap: arc r+7 from 198° to 342°, fringe dipping to y 66 |
| pebble | bob | arc r+10 from 150° to 390° (down past the ears), sides curving in to a fringe at y 80 |
| squircle | fringe | arc r+8 from 194° to 346°, a near-straight fringe at y 93, over the brows |
| tablet | flat top | a rounded block, 164 wide, y 14 to 78, top corners 26, bottom 12 |
| wedge | quiff | a swept shape peaking at (cx+46, −2) with the fringe swept from right temple to left |
| hex | puff | a back ellipse (rx 108, ry 80 at y 66) behind the head, plus a low front cap |
| cloud | curls | thirteen circles: seven of r 25 on r+2, six of r 22 on r−16 |
| teardrop | bun | cap r+6 from 200° to 340° plus a circle r 24 at (cx+4, 15) |

Every path lies inside the box: the test samples each one and asserts
`−15 ≤ x, y ≤ 244`, that the hair's top is above the eye line and that it
is wider than 120 units so it reads at 16 px.

**Skin tone: derived from the hair colour, not from a third hash.** Five
matte tones (`#F4DCC6`, `#E9BD95`, `#CD9466`, `#9F6A47`, `#63402B`), chosen
by a fixed table from the colour key (black→3, brown→4, red→1, orange→2,
yellow→1, green→3, cyan→5, blue→2, violet→4, magenta→3, gray→5). Adding a
persisted field was not in scope, and a hash of the id would not have been
coherent anyway: the component sees `sand-agent-mark-source-<id>` in the
sidebar, `<id>` in the editor's preview and `<id>-<shape>` in its shape
cells, so a hash of what it is given would have drawn one agent in three
tones and the eight picker cells in different tones, the exact failure
`faces-slice-measured.md` records. With the tone a function of the colour,
the same agent has one tone everywhere and the picker's cells agree. The
editor and the onboarding create step have no third row; `CHARACTER_COLORS`,
`CHARACTER_SHAPES`, `AVATAR_COLORS` and `AVATAR_SHAPES` are untouched.
`resolvePersonaTone(color)` is exported for the day a field exists.

## The animation contracts, kept

- **Outer face group**: `faceRef`, `translate(0 -bob-bounce) rotate(tilt+spin CENTER CENTER)`, unchanged. The ground shadow is outside it, on purpose, so the bob reads as a lift.
- **Inner eyes group**: `eyesRef`, `translate(gaze.x*4 gaze.y*3) scale(1 eye)`, unchanged. One difference in where it sits: the group is now inside a `translate(CENTER EYE_Y)` so the scale closes the eyes about the eye line. Before, `scale(1 .12)` on a group at y 106 pulled the eyes to y 13 (the top of the box) while closing them; now they close in place. The numbers the loop writes are the same.
- **Pupils**: a third group the loop moves by `gaze.x*7, gaze.y*5`, clipped to the sclera. This is the "pupil moves with gaze" half; the eye group still gets its shipped offset.
- **`MOTION`**: the forty states with their four numbers, untouched (the test deep-equals seven rows and the key set). Exported as `PERSONA_MOTION`.
- **The three smile states**: `excited`, `happy`, `celebrate` draw the smile curve at the same control point as before (`Q114.27 166.27`). The expression table adds a mouth per state (grin for `laughing`, frown for `sad`/`bored`/`drowsy`, a dot for `surprised`/`scared`/`confused`, flat for `angry`/`suspicious`/`shy`/`sleeping`/`powering-down`, a small neutral curve otherwise), closed lids when the state's eye openness is ≤ .3 (`sleeping`, `drowsy`, `powering-down`), and a brow lift/angle per state at 36 px and above. All of it is read at render, none of it per frame.
- **Paused, reduced motion**: the same early return; a paused face shows its state's mouth, brows and lids at rest.
- **Wrapper and data attributes**: `data-grok-state`, `data-paused`, `data-emphasis`, `data-source-id`, `data-pointer-shown`, `data-reduced-motion` as before; the svg also carries `class="sand-face"`, `data-avatar-hair="<style>"` and `data-surface-theme` when the prop is set. `PersonaMark`'s span and its `data-avatar-color`/`data-avatar-shape` are untouched.

## Theme

The theme is decided by CSS. The component installs one `<style
id="sand-face-style">` per document at module load (`installFaceStyle`,
idempotent, no-op without a `document`), which sets `--sand-face-hair` to
the light pair by default, to the dark pair under
`[data-theme="cursor-dark"]` (the attribute the shell and onboarding root
carry) and under `prefers-color-scheme: dark` where no `cursor-light`
ancestor says otherwise, and back to light on
`.sand-face[data-surface-theme="light"]` (the onboarding computer demo).
Sclera, ink, rim, shadow and blush strengths follow the same switch. Measured
on the preview page: `--sand-face-hair` computes to `#2E2C31` in the light
panel and `#46444D` in the dark one for the same black-haired face; one
stylesheet element after 503 faces mounted.

## Measured here

| measure | value |
| --- | --- |
| faces on the preview page (8 styles × 11 colours × 5 sizes + the states sheet) | 503 |
| page errors and console errors/warnings while they animate, light and dark | 0 |
| `tsc --project frontend/tsconfig.json` | 0 errors |
| `node --test tests/clay-faces.test.mjs` | 5 of 5 pass |
| screenshots | 8 files, 4.9 MB, listed below |

Legibility, read off the pictures: at 16 px (`faces-clay-16px-light.png`)
each face is a head, a hair colour and two dark dots; at 28 px in the dark
theme (`faces-clay-28px-dark.png`) the eight styles tell apart and the
eleven colours read; at 64 px the seven states (`faces-clay-states-*.png`,
taken mid-animation) show the squint on thinking, the smile on excited and
celebrate and the closed lids on sleeping.

## Not run, not measured

- **Nothing was run on a Mac.** The component was not seen in the sidebar at 22 px, in the chat header, in the editor or in onboarding in the real shell. The theme switch was measured on the preview page's `data-theme`, not on the shell's.
- **The packaged app does not draw this.** `npm run package` ships the checksum-pinned 0.18.0 renderer (`building-the-app.md`: "Cloud faces live in `frontend/src` today; they are not in the packaged chrome"). The clay faces are in the reconstruction and ship only when the window is built from `frontend/` (`npm run build:clean-source`). The pinned renderer's faces are unchanged.
- **Cost.** Each face has one blur filter (the hair shadow) and a rAF loop, as before; the frame rate with forty faces in a sidebar is not measured. If it matters, the filter is the first thing to remove.
- **`npm run check` did not run whole.** This container has Node 22 and the package wants ≥ 26.5, and `npm ci` was not run (Electron and native builds); a minimal toolchain was installed instead. On it, `npm test` runs 126 tests with 78 passing and 44 failing, every failure a `Could not resolve` or `Cannot find package` for a dependency that was not installed (`@anthropic-ai/claude-agent-sdk`, `ai`, `happy-dom`, `zod`, `@connectrpc/connect`…), none in a file this change touches. `source:typecheck` fails the same way (309 errors, all missing modules).
- **Font smoothing.** The screenshots come from Linux Chromium at 2×; the Mac's rendering of the sub-pixel eyes at 16 px is not seen.

## Files

- `desktop/frontend/src/recovered/features/onboarding/signed-in/character.tsx` — the component.
- `desktop/frontend/src/dev/face-preview.tsx`, `desktop/scripts/face-preview.mjs` — the preview page and its builder (not shipped).
- `desktop/tests/clay-faces.test.mjs`, `desktop/tests/fixtures/clay-faces-entry.tsx` — the test.
- `docs/product/faces-clay/faces-clay-light.png`, `faces-clay-dark.png` — the whole page, both themes, idle, 1×.
- `faces-clay-16px-light.png`, `faces-clay-28px-light.png`, `faces-clay-28px-dark.png`, `faces-clay-80px-light.png` — one size each, 2×.
- `faces-clay-states-light.png`, `faces-clay-states-dark.png` — idle, thinking, working, searching, excited, celebrate, sleeping for every style at 64 px and one at 28 px, 2×.
