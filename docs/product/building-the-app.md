# Building Caisra — the pipeline, and the one I invented instead

**19 September 2026.** Read this before running anything in `desktop/`.

## The build loop

```sh
cd desktop
npm ci                 # lockfileVersion 3; never npm install
npm run bootstrap      # hydrate src/app/dist from the pinned 0.18.0 ASAR
npm run check          # typecheck + node --test — a required gate
npm run package        # compile runtimes, patch, assemble, ad-hoc sign (macOS only)
npm run verify         # audit the bundle — a required gate
open "dist/Caisra.app"
```

That is the project's own documented sequence. Nothing else produces the app.

## The mistake this document exists for

**`frontend/` is not the product's UI.** It is a Vite design workspace for
reading and testing recovered components. The reconstruction's documentation
says so in one line: *"The packaged UI is not `frontend/` … It is never the
default packaged renderer."* The shipped UI is the checksum-pinned 0.18.0
renderer, preserved byte-for-byte with one anchored Settings Router patch.

Both modes are first-class in `scripts/lib/clean-build.mjs`:

| mode | renderer source | `buildKind` |
| --- | --- | --- |
| `clean-source` | `frontend/src` | `source-aware-reconstruction` |
| `checksum-pinned-artifact-runtime` | `src/app/dist/renderer` | `fidelity-hybrid-reconstruction` |

`scripts/package-macos.mjs` takes the second and says why: *"Keep the
checksum-pinned shipped renderer as the polished UI authority."*

I built the first, called it the product, and then spent six hours explaining
why its styling looked wrong — including a whole commit fixing a real CORS bug
in a renderer that was never going to ship. The bug was real. The renderer was
the wrong one. `scripts/build-caisra.mjs` now says this at the top of the file.

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

The shipped renderer is pinned, so the fork's identity goes in the places the
packaging step already owns (`scripts/package-macos.mjs`):

- **`dist/Caisra.app`** — the bundle name (`GROK_BOT_OUTPUT_APP_NAME` overrides).
- **`CFBundleDisplayName` = `Caisra`** (`CAISRA_DISPLAY_NAME` overrides).
  `npm run verify` checks the plist against this constant, so the two cannot
  drift.
- **`CFBundleIdentifier` = `com.anysphere.sand.reconstructed`**, pinned, and
  verified. The official app is never overwritten.
- **`LSEnvironment`** now carries `CURSOR_API_BASE_URL`, `CURSOR_WEBSITE_URL`
  and `SAND_BACKEND_URL`, all `https://api.claidor.com`
  (`CAISRA_BACKEND_URL` overrides). Without this the packaged app signs in to
  cursor.com: a bundle launched from Finder inherits no shell environment,
  however the terminal that built it was configured. All three names are needed
  and none is redundant — see `docs/product/app-sign-in.md`.

`CFBundleName` and `CFBundleExecutable` stay `Grok Bot`, because Electron
derives its nested helper names from them and this build reuses the ABI-matched
0.18 shell exactly.

## Changing the shipped UI

Through `scripts/lib/router-renderer-patch.mjs`'s method and no other:
`replaceExactlyOnce` against an exact anchor string in the minified bundle,
which throws if the anchor is missing or ambiguous. That is how the Settings
Router panel gets in, and it is how a rebrand of visible strings would get in.
Never by rewriting the renderer — the fidelity build accepts it only against a
complete file-by-file SHA-256 inventory.

The reconstruction's own rule applies to anything added: *"Do not invent
screens, labels, or interactions to fill an evidence gap. Incomplete renderer
mapping stays unmapped."* The 18 runtime assets drawn in
`scripts/make-runtime-assets.mjs` are for the clean-source workspace only; the
packaged renderer ships the originals, and `npm run verify` checks the app icon
against its manifest SHA-256 — a drawn one fails that gate, correctly.

## Rights

The wiki states plainly that this is a research reconstruction, not an official
release, and that no upstream source licence is implied. Shipping a product on
the pinned renderer is a different act from building one to look at. The
founder has given the instruction and holds that call; it is recorded here so
nobody later mistakes it for a decision that was never made.
