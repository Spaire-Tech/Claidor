# Building Caisra

**20 September 2026.** Read this before running anything in `desktop/`.

## The build loop

```sh
cd desktop
nvm use
npm ci                 # lockfileVersion 3; never npm install
npm run bootstrap      # hydrate src/app/dist from the pinned 0.18.0 ASAR (Electron shell + ABI)
npm run check          # typecheck + node --test — a required gate
npm run package        # assemble dist/Caisra.app from reconstructed renderer + ignited host
npm run verify         # audit the bundle — a required gate
open "dist/Caisra.app"
```

Quit any running Caisra first (**Cmd+Q**). Do not open the copy in Applications or the Dock — that is the previous install.

That sequence is the product. Finder opens `dist/Caisra.app`. `npm run start:clean-source` is the same reconstructed UI without wrapping it in the 0.18.0 shell.

## What that `.app` actually contains

The 0.18.0 Grok Bot.app is still the **Electron shell** (helpers, native ABI). It is not the UI or the agent host.

| piece | source |
| --- | --- |
| window UI | `frontend/src` (cloud faces, Messages, Settings) |
| agent host | `source/host` ignited so Terra TPM falls back to Luna |
| Electron shell | checksum-pinned 0.18.0 |

Until 20 September, `npm run package` kept Grok's 0.18.0 renderer and host byte-for-byte. Merging product work to `main` did not change what Finder opened. That is why rebuilt apps still showed the old faces and a silent model.

The old fidelity bundle remains at `npm run package:diagnostic`.

## What `npm run bootstrap` needs

A genuine 0.18.0 app, resolved in this order:

1. `GROK_BOT_018_APP=/path/to/Grok Bot.app` — **the quickest route if 0.18.0 is
   installed anywhere on the machine.** The version is checked.
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
  `npm run verify` checks the plist against this constant, so the two cannot
  drift.
- **`CFBundleIdentifier` = `com.anysphere.sand.reconstructed`**, pinned, and
  verified. The official app is never overwritten.
- **`LSEnvironment`** carries `CURSOR_API_BASE_URL`, `CURSOR_WEBSITE_URL`
  and `SAND_BACKEND_URL`, all `https://api.claidor.com`
  (`CAISRA_BACKEND_URL` overrides). Without this the packaged app signs in to
  cursor.com.
- **Renderer** from `frontend/src`. Vite's `crossorigin` attribute is stripped
  so `loadFile` (opaque origin `null`) can apply the stylesheet.
- **Host and electron-main** from recovered source. If the 0.18.0 artifact
  self-check cannot activate them, packaging ignites the same entries
  `scripts/build-caisra.mjs` uses.

`CFBundleName` and `CFBundleExecutable` stay `Grok Bot`, because Electron
derives its nested helper names from them and this build reuses the ABI-matched
0.18 shell exactly.

## Changing the shipped UI

Edit `frontend/src`. `scripts/lib/router-renderer-patch.mjs` is only for the
fidelity diagnostic bundle.

## Rights

The wiki states plainly that this is a research reconstruction, not an official
release, and that no upstream source licence is implied.
