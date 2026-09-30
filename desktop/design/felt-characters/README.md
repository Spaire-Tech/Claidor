# Felt characters (archived design work, 30 September 2026)

Not shipped. Kept so the work can be picked up again. Nothing in the app or
the website loads these files.

- `lookdev/`: three single-file tests of a 3D felt character in three.js
  (strands, shells, volume). The founder chose the strands look.
- `forms/`: the felt "flower cloud" page built on the strands look: the app's
  12 gradient palettes, bead eyes, and all 39 of the app's character states
  (Lifecycle, Reactions, Agent morphs, Product lifecycle). `parts/` is the
  source; `parts/build.sh` writes `index.html`. Open `index.html` in a browser
  (it loads three.js 0.170.0 from jsDelivr).
- `website-clouds/`: the clouds placed at random on simeonlabs.com (commit
  e175edff, reverted in b3e328d2). `clouds.built.js` is the built bundle.
- `demo-avatars/demo-clouds.built.js`: the felt clouds as the agents' avatars
  inside the website's app demo (never committed; recovered from the preview).
  It expected three.js and RoomEnvironment vendored next to it and a
  `<script type="module" src="./demo-clouds.js">` in the demo's index.html.
- `references/`: screenshots of these versions.

Only tested in headless Chromium with software rendering, never on a Mac.
