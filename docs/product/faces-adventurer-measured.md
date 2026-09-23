# The agents' faces are the founder's twenty-one avatars, measured (23 September 2026)

The founder's decision, after the clay redesign (`faces-clay-measured.md`,
superseded): "im okay with dice bear. but i wanna design my own avatars", then
"what i want is simple tho, not like grok bot. grok bot got 6 style,
different colors. i dont want all that. i want 20 avatars, straight up. you
dont change the form of his head, or skin color. when you change something,
you change the avatar straight up." They sent twenty-one, made with
DiceBear's Adventurer style: "i ended up going for adventurers. its 21 but
its ok."

So a face is now one finished drawing chosen by key. No shape axis, no colour
axis, no skin tone. This note records what was built, what is kept from the
animation system, what was measured here, and what was not run on a Mac.

Pictures: `docs/product/faces-adventurer/`. Preview page:
`node scripts/face-preview.mjs` in `desktop/`. Test:
`desktop/tests/avatars.test.mjs`.

## The sources and the pipeline

- `desktop/brand/avatars/adventurer-01.svg` … `adventurer-21.svg`: the
  founder's exports, renamed in the order they were made (the DiceBear
  file names are timestamps). Each is a 762 × 762 box holding `<defs>` of
  named parts (`head-default`, `eyes-variantNN`, `eyebrows-`, `mouth-`,
  `hair-`, and on some `glasses-`, `earrings-`, `details-birthmark`,
  `-freckles`, `-blush`) and a row of `<use>` placements. Every one has the
  same head (`head-default` at the same place); only the parts on it differ.
- `desktop/brand/avatars/measures.json`: Chromium's `getBBox()` of every
  placed part, written by `node scripts/import-avatars.mjs --measure`. The
  eye centre comes from here. A first version computed it from the path
  data and was 95 units out on one eye variant, so no parser is trusted; the
  browser measures, the generator reads.
- `desktop/scripts/import-avatars.mjs`: inlines every part in place (a hair
  that places the earrings is resolved too), so the generated markup holds
  no `id`, no `<use>`, no `url(#…)`, and forty copies of one avatar can
  share a page. It refuses a file without the CC BY 4.0 rights line or
  without head, eyes, mouth and hair. `--check` fails when the module is
  stale.
- `desktop/frontend/src/recovered/features/onboarding/signed-in/avatars.generated.ts`:
  181 KB, `AVATAR_KEYS`, `AVATARS` (key, parts, eye centre, head box, bounds,
  layers with their markup and placement), `ADVENTURER_CREDIT`.

## How the mark draws one

`OnboardingCharacter` (`character.tsx`) keeps the `-15 -15 259 259` box and
places the 762 source box in it at one scale for all twenty-one
(`259 / 762`), with the shared head centred on the mark. Hair wider than the
source box (avatar 03) is clipped to the mark, as DiceBear's export clips it.
Inside the face group, the layers below the eyes (the head) come first, then
the eyes in their own group, then everything above (brows, mouth, details,
glasses, earrings, hair) in DiceBear's order, so a fringe still covers the
brows and glasses still sit over the eyes.

Nothing is added to the drawing: no state changes the mouth, no brows lift,
no ground shadow. The test renders `celebrate` and `celebrate` paused and
checks the geometry is byte-identical.

## Identity

- The stored field `avatarShape` holds the key (`adventurer-01` …
  `adventurer-21`). Nothing new is persisted. `avatarColor` is left in place
  and draws nothing; `resolvePersonaColor` and the hash behind it are
  unchanged, and the sidebar wrapper still writes `data-avatar-color`.
- `resolvePersonaShape(agentId, shape)`: a stored key is kept; Grok Bot's
  eight shape names map onto the first eight (`blob` → 01 … `teardrop` →
  08), so the onboarding scene, which still says `blob`, and any agent
  stored before today keep a face; anything else hashes the id with the
  shipped shape hash onto the twenty-one. Recorded: `invoice-chaser` → 20,
  `weekly-standup` → 19, `sales-forecast` → 05, `persona` → 03, `hero` → 15;
  two hundred ids spread over at least eighteen avatars.
- The avatar editor: one row of twenty-one at 36 px, the chosen one at
  64 px above it. The colour row is gone. `AVATAR_SHAPES` is
  `AVATAR_KEYS`; `AVATAR_COLORS` is still exported and unused by the view.
- The onboarding create step: one "Avatar" radiogroup of twenty-one faces
  at 36 px, drawn through `renderCharacter` like the preview. The colour
  radiogroup is gone. `CHARACTER_SHAPES` is `AVATAR_KEYS`, the draft's
  default is the first key, `CHARACTER_COLORS` stays for the draft and the
  suggestion identities. `scene.ts` is untouched.

## The animation, unchanged

- The outer face group takes `translate(0 -bob-bounce) rotate(tilt+spin CENTER CENTER)`; the inner eyes group takes `translate(gaze.x*4 gaze.y*3) scale(1 eye)`. The loop is the same code.
- The eyes group is centred on the measured eye centre, so the squint closes the drawn eyes in place (`sleeping`, `.12`, reads as closed eyes; glasses stay open over them) and the gaze moves the drawn eyes.
- `MOTION` is the forty states with their four numbers, untouched; the test deep-equals five rows and the key set. The three smile states no longer draw a smile over the mouth: the avatar's own mouth is the mouth. That is the one deliberate departure from the audit's contract, and it is the founder's rule.
- Paused, reduced motion, `data-grok-state`, `data-paused`, `data-emphasis`, `data-source-id`, `data-pointer-shown`, `data-reduced-motion`: as before. The svg also carries `data-avatar="<key>"`.
- Onboarding moves the same way: the four cast characters are placed by `scene.ts` and moved by its CSS springs, each face bobbing on its own loop; only what each wears changed (the scene's `blob` is avatar 01, and the create step's draft is whichever the person picks).

## Licence

CC BY 4.0, Lisa Wischofsky ("Adventurer", Figma community file
1184595184137881796), generated with DiceBear. Attribution is required:
the generated module carries `ADVENTURER_CREDIT`, `brand/avatars/README.md`
states it, and the About dialog (`about/overlay/view.tsx`) shows it under
the copyright line. The pinned renderer's About, which the packaged app
shows, does not; see below.

## Measured here

| measure | value |
| --- | --- |
| sources | 21, all 762 × 762, all CC BY 4.0, all with head, eyes, mouth, hair |
| generated module | 181 KB; `--check` clean; 0 ids, 0 `<use>`, 0 `url(#` |
| faces on the preview page (21 × 5 sizes + the states sheet) | 259 |
| distinct `data-avatar` values on the page | 21 |
| duplicate element ids on the page | 0 |
| page errors and console errors/warnings while animating, light and dark | 0 |
| `tsc --project frontend/tsconfig.json` | 0 errors |
| `node --test tests/avatars.test.mjs` | 5 of 5 pass |
| screenshots | 9 files, 3.7 MB |

Read off the pictures: at 16 px each avatar is a hair colour over a skin
colour with the eyes as dark marks; at 28 px on the dark background all
twenty-one tell apart; the states sheet (64 px, taken mid-animation) shows
the squint on `thinking`, the wide eyes on `excited` and `celebrate`, and
closed eyes on `sleeping`, with glasses staying put.

## Not run, not measured

- **Nothing was run on a Mac.** The sidebar at 22 px, the chat header, the editor row and the onboarding create step were not seen in the real shell; the create step's radiogroup has no CSS of its own beyond an inline flex wrap.
- **The packaged app does not draw this.** `npm run package` ships the checksum-pinned 0.18.0 renderer (`building-the-app.md`); its faces are Grok Bot's own and its About has no credit line. The avatars reach a window only through the `frontend/` build (`npm run build:clean-source`). Putting them into the pinned renderer is a patch on its minified chunk (`router-renderer-patch.mjs`'s method) that nobody has written and that cannot be verified from this container, which has neither the pinned bytes nor a Mac.
- **Cost.** An avatar is 5 to 7 inlined parts, about 15 paths, no filter. Forty in a sidebar means forty rAF loops as before; not measured.
- **`npm run check` did not run whole.** This container has Node 22 against `engines >= 26.5` and no `npm ci`; a minimal toolchain was installed. The other test files fail here on packages that were not installed, as recorded in `faces-clay-measured.md`; none of them touches these files.

## Files

- `desktop/brand/avatars/` — the 21 sources, `measures.json`, `README.md`.
- `desktop/scripts/import-avatars.mjs` — the generator.
- `desktop/frontend/src/recovered/features/onboarding/signed-in/avatars.generated.ts` — the data.
- `desktop/frontend/src/recovered/features/onboarding/signed-in/character.tsx` — the component.
- `desktop/frontend/src/recovered/features/agent-info/avatar-editor/{model,view}.tsx` — the editor's row.
- `desktop/frontend/src/recovered/features/onboarding/signed-in/{model.ts,view.tsx}` — the create step's row.
- `desktop/frontend/src/recovered/features/about/overlay/view.tsx` — the credit.
- `desktop/frontend/src/dev/face-preview.tsx`, `desktop/scripts/face-preview.mjs` — the preview page.
- `desktop/tests/avatars.test.mjs`, `desktop/tests/fixtures/avatars-entry.tsx` — the test.
- `docs/product/faces-adventurer/faces-adventurer-{light,dark}.png` (whole page, 1×), `-16px-light`, `-28px-{light,dark}`, `-80px-{light,dark}` (2×), `-states-{light,dark}` (2×).
