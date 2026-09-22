# Harness — pictures of the reconstructed renderer

`node harness/shoot.mjs` builds `frontend/` with Vite, serves it on the
loopback, boots it in the bundled Chromium with a fake Electron preload and a
fake coordinator, and photographs every screen into `harness/shots/`. It
needs no Mac, no 0.18.0 bytes, no server and no keys; it fails if anything
tries to leave the loopback.

```sh
node harness/shoot.mjs                    # every screen, light
node harness/shoot.mjs thread settings    # named screens
SHOT_SCENARIO=dark node harness/shoot.mjs # the dark theme, as dark-*.png
SHOT_SCALE=2 node harness/shoot.mjs       # retina pictures
SHOT_NO_BUILD=1 node harness/shoot.mjs    # reuse the last Vite build
SHOT_FACES=0 node harness/shoot.mjs       # Grok's own marks, no face overlay
node harness/face-preview.mjs             # eighteen faces moving, as a page and a video
```

Screens: `thread`, `account-menu`, `settings`, `plugins`, `agent-settings`,
`composing`, `group`, `faces`. A screen that fails is still photographed, as
`<name>-FAILED.png`, and the run exits non-zero.

## The faces

The packaged app paints a slice face per agent over Grok's marks from the
preload (`source/electron-preload/agent-face-overlay.ts`): DiceBear's slice
style (CC0), generated on the machine from Grok's persisted shape and colour
(`data-avatar-shape`, `data-avatar-color` on the mark) with the cut pattern
from the agent's id (`source/shared/agent/agent-face.ts`), moved with Grok's
own motion table (`source/shared/agent/face-motion.ts`). The slice has no
eyes, so only the body moves. `face-overlay-bundle.mjs` bundles that
same code as one browser script and `shoot.mjs` injects it into every page, so
the pictures show what the preload does; `SHOT_FACES=0` leaves it out. The
`faces` screen puts each mark on the thread into a different state. Marks
inside a group or shared-room avatar keep Grok's own face, by design, and are
counted apart.

`face-preview.mjs` is the moving version: it writes `.build/face-preview.html`
(self-contained; open it in any browser and eighteen agents' faces, in
eighteen shape-and-colour pairs, cycle through the states, spin and bounce),
and records
`shots/face-preview.png`, `shots/face-preview-gaze.png` and six seconds of
`shots/face-preview.webm`.

## What is real and what is fake

| Piece | Source |
|---|---|
| the renderer | `frontend/src/main.tsx`, built into `.build/frontend-shell` |
| `window.desktop`, the preload bridge | `fake-desktop.js`, shapes from `frontend/src/recovered/contracts/desktop-bridge.ts` |
| `window.coordinatorPort`, the agent coordinator | `fake-desktop.js`, protocol from `frontend/src/production/coordinator-client.ts`, methods from `source/shared/rpc/coordinator.ts` |
| agents, transcripts, account, catalogue | `fixtures.mjs` |

Two things the fake had to get right, both measured against the renderer:
the last open conversation is restored from a per-account persistence slice
(`…selection.last-agent`), so the fake answers that read; and a coordinator
reply has to arrive within the same turn of the event loop, because the
renderer's open effect re-runs and drops a transcript reply that lands a
frame late.

## The audit

The thread run also writes `shots/audit.json`: every `sand-*` class in the
DOM that no loaded stylesheet defines, with the elements it sits on, and
every text element still at the browser's default font size. That is the
style fix's work list.

## What this is not

Not the pinned 0.18.0 renderer: that bundle is not in the repository and its
download is refused from the build container. The pictures show the
reconstruction, which is the tree the new layout is built in. Fidelity to
the shipped app is judged on a Mac, side by side.

Dependencies live in `harness/package.json` (`playwright-core` only); the
browser is the one preinstalled at `/opt/pw-browsers`, or `SHOT_CHROMIUM`.
