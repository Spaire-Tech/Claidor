# Building Caisra

**20 September 2026.** Read this before running anything in `desktop/`.

## The build loop

```sh
cd desktop
nvm use
npm ci                 # lockfileVersion 3; never npm install
npm run bootstrap      # hydrate src/app/dist from the pinned 0.18.0 ASAR
npm run check          # typecheck + node --test — a required gate
npm run package        # 0.18.0 window chrome + ignited Claidor host, ad-hoc sign
npm run verify         # audit the bundle — a required gate
open "dist/Caisra.app"
```

Quit any running Caisra first (**Cmd+Q**). Do not open the copy in Applications or the Dock — that is the previous install.

## What that `.app` actually contains

| piece | source |
| --- | --- |
| window UI | checksum-pinned 0.18.0 renderer (the polished chrome) |
| agent host | recovered `source/host`, ignited, so Terra TPM still answers on Luna |
| Electron shell | checksum-pinned 0.18.0 |

`frontend/` is a recovered skeleton. It does **not** have the atom stylesheet the 0.18.0 chrome was compiled from. Packaging it on 20 September emptied the sidebar and composer. That is why the default package is the 0.18.0 window again.

`npm run start:clean-source` still launches the reconstructed UI for reading and testing. `npm run package:diagnostic` is the fidelity bundle without ignited host fallback.

## What `npm run bootstrap` needs

A genuine 0.18.0 app, resolved in this order:

1. `GROK_BOT_018_APP=/path/to/Grok Bot.app` — only if `plutil` prints `0.18.0`.
   `/Applications/Grok Bot.app` is often a newer Grok Bot (0.57.1 as of 20
   September 2026) and must not be used.
2. `.cache/runtime/Grok Bot.app` from a previous run.
3. `research-archives/original/0.18.0/macos-arm64/Grok_Bot_0.18.0.dmg` via Git
   LFS. **Not in this repository and never has been** — `git log --all` over
   that path returns nothing; `.gitattributes` carries the LFS rule and no file.
4. `https://downloads.cursor.com/grokbot/stable/darwin-arm64/0.18.0/Grok_Bot_0.18.0.dmg`
   — **403 from the build container**, re-checked 19 September. It may not be
   403 from a normal machine; that is untested and worth one command.

Expected DMG SHA-256
`a253ccd8aab01e083f9812a0264354c5034d8ba7f0610bbb557e82ae77d203eb`, 155.8 MB.
Expected `app.asar` SHA-256
`6665408168466f9cacc6087e917890c17f59d2e2e9c2404a5c4a59ad79c1de58`. Both are
enforced; a mismatch stops the build.

Success reads: `Checksum-pinned source payload ready: …/src/app/dist`.

Only macOS on Apple Silicon can bootstrap or package — `hdiutil`, `codesign`,
`plutil` and `ditto` are all required, and `package` refuses on anything else.

## What is ours in the packaged bundle

- **`dist/Caisra.app`** — the bundle name (`GROK_BOT_OUTPUT_APP_NAME` overrides).
- **`CFBundleDisplayName` = `Caisra`** (`CAISRA_DISPLAY_NAME` overrides).
- **`CFBundleIdentifier` = `com.claidor.simeon`** and **`CFBundleURLSchemes` =
  `simeon`**, since 23 September 2026 (`scripts/lib/config.mjs`,
  `reconstructedBundleId`, `reconstructedUrlScheme`; the app's own
  `SAND_DEEP_LINK_SCHEME` must match, and `tests/app-identity.test.mjs`
  checks it). Until then `com.anysphere.sand.reconstructed` and `sand`.
- **`LSEnvironment`** carries `CURSOR_API_BASE_URL`, `CURSOR_WEBSITE_URL`
  and `SAND_BACKEND_URL`, all `https://api.claidor.com`.
- **Host and electron-main** from recovered source when the 0.18.0 artifact
  self-check cannot activate them (`scripts/caisra-ignition-activation.mjs`).

- **`CFBundleExecutable` and `CFBundleName` = `Simeon`**, since 23 September
  2026: the packager renames the 0.18 shell's executable, its helper bundles
  under `Contents/Frameworks`, their inner executables and their plists
  together (`scripts/lib/macos-bundle-rename.mjs`), then signs. Before that
  both stayed `Grok Bot`, and `CFBundleName` alone set to Simeon crashed the
  app at launch. The shell's bytes are unchanged; only names move.

## Changing the shipped UI

Through `scripts/lib/router-renderer-patch.mjs`'s method against the 0.18.0
renderer: `replaceExactlyOnce` on an exact anchor string. Cloud faces live in
`frontend/src` today; they are not in the packaged chrome.

## Rights

The wiki states plainly that this is a research reconstruction, not an official
release, and that no upstream source licence is implied.
