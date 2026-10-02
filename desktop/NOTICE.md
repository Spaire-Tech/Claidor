# Notice

Simeon is made by Simeon Labs. This file says where the Mac app's parts come
from and on what terms. Keep it with the code.

## What the app is built from

The app's window and its Electron shell are taken, at build time, from a
genuine copy of Grok Bot 0.18.0 for macOS arm64, a publicly distributed binary
application by Anysphere, Inc. Simeon Labs is not affiliated with or endorsed
by Anysphere, Cursor, xAI or SpaceX.

- The build reads that app on the building machine (`npm run bootstrap`) and
  never stores or redistributes it: no part of the installer is in this
  repository.
- The window is that app's own compiled renderer, changed only at package time
  by `scripts/lib/router-renderer-patch.mjs`, which records the hash of every
  file it touches.
- The rest of the app (`source/`) is a reconstruction of that app's behaviour,
  written from its shipped artifacts, with Simeon's own changes on top.
- Built apps carry Simeon's own bundle id and are signed by whoever builds
  them; they do not carry or claim the upstream signature.

The build checks the upstream artifact by these values (`scripts/lib/config.mjs`):

| | |
|---|---|
| Version | 0.18.0 (Electron 42.1.0) |
| DMG SHA-256 | `a253ccd8aab01e083f9812a0264354c5034d8ba7f0610bbb557e82ae77d203eb` |
| `app.asar` SHA-256 | `6665408168466f9cacc6087e917890c17f59d2e2e9c2404a5c4a59ad79c1de58` |

## Terms

No licence to the upstream code is granted or implied here. The renderer and
the shell taken from the upstream app remain under their own terms, and no
licence applied to Simeon Labs' code covers them. Before this repository or an
app built from it is given to anyone outside Simeon Labs, review copyright,
trademark, third-party dependency and service-terms obligations.

## Third-party notices kept in the app

- Avatars: DiceBear "Adventurer" style by Lisa Wischofsky, CC BY 4.0
  (`brand/avatars/README.md`; credited in the About dialog).
- File icons: `brand/file-icons/NOTICE.md` (vscode-icons, MIT).
- App logos: `brand/app-logos/` (Simple Icons, CC0; other marks belong to
  their owners).
- Suravaram (SIL Open Font License 1.1, Silicon Andhra and Vernon Adams):
  the sign-in wordmark's face, its Latin subset from @fontsource/suravaram
  5.3.0, at `brand/fonts/` with its licence (`Suravaram-OFL.txt`).
- npm dependencies keep their own licences in `node_modules`.
- playwright-core (Apache-2.0, Microsoft Corporation): the host program
  carries a packed copy (`source/host/runner/tools/sand-browser-playwright.gen.ts`)
  and writes it, with its LICENSE, NOTICE and ThirdPartyNotices.txt, onto a
  cloud computer whose image has none.
