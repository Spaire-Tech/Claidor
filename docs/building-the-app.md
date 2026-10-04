# Building the Simeon app

This is how to build, check, package, verify and install the Mac app, and how
to publish the host program that the cloud boxes run. For what the pieces are,
see `docs/architecture.md`.

## What you need

- **A Mac with Apple Silicon.** Bootstrap and package use `hdiutil`,
  `codesign`, `plutil`, `ditto` and `xattr` (`scripts/lib/system-tools.mjs`).
  `npm run package` refuses to run on anything but macOS.
- **Node 26.5.0**, from `desktop/.nvmrc` (`package.json` accepts `>=26.5.0 <27`).
  Run `nvm use` inside `desktop/`. The repository root's `.nvmrc` pins a
  different version for `clients/`, so check you are in `desktop/`. The native
  parser modules are rebuilt against this Node's ABI, and a different major
  gives modules the app cannot load.
- **Xcode Command Line Tools**, for the native builds.
- **A genuine copy of the upstream 0.18.0 app the window comes from** (see
  `desktop/NOTICE.md`). It is not in this repository. Bootstrap needs it (next
  section).

## The version

Simeon's version is the `version` in `desktop/package.json` (`0.1.0` for the
first release). Packaging writes it into the staged `package.json` (what the
About panel and `app.getVersion()` read) and into the bundle's
`CFBundleShortVersionString` and `CFBundleVersion` (what Finder shows). The
upstream shell's own `0.18.0` never reaches a person. Settings has no Updates
tab: the updater is off in every packaged build, and the cloud computer is
updated from the server (`docs/services-core.md`, the host bundle channel).

## The build loop

```sh
cd desktop
nvm use
npm ci                 # never npm install: the lockfile is the contract
npm run bootstrap      # hydrate src/app/dist from the pinned 0.18.0 app
npm run check          # typecheck + tests, a required gate
npm run package        # dist/Simeon.app, ad-hoc signed
npm run verify         # audit the bundle, a required gate
```

### `npm run bootstrap`

`scripts/bootstrap-runtime.mjs` finds the upstream 0.18.0 app in this order:

1. `SIMEON_UPSTREAM_APP=/path/to/the.app` (the older name
   `GROK_BOT_018_APP` is still read). It is used only if its version reads
   `0.18.0`; otherwise it is ignored with a warning. A copy in
   `/Applications` is often a newer version.
2. The cached copy in `desktop/.cache/runtime/` from an earlier run.
3. The pinned DMG: first an archived copy under `research-archives/` if one
   exists (it is not in this repository), otherwise a download from the URL in
   `scripts/lib/config.mjs` (`dmgUrl`).

Checksums are enforced (`scripts/lib/config.mjs`): the DMG must match
`dmgSha256` and the app's `app.asar` must match `upstreamAsarSha256`
(`scripts/lib/runtime.mjs`). A mismatch stops the build.

Success ends with `Checksum-pinned source payload ready: …/src/app/dist`.
The pinned app supplies only the Electron shell, ABI-matched native
dependencies and the window's renderer.

If you skip bootstrap, `npm run package` and `npm run verify` stop early with
a message that names the missing files (`scripts/preflight-bootstrap.mjs`).

### `npm run check`

Typechecks `frontend/` and `source/`, then runs `node --test tests/*.test.mjs`.
`npm run package` runs it again by itself.

### `npm run package`

`scripts/package-macos.mjs` builds `dist/Simeon.app`:

- compiles the Electron main process, host, coordinator, preloads, workers
  and daemons from `source/` into a new `app.asar`;
- keeps the pinned renderer and patches it with
  `scripts/lib/router-renderer-patch.mjs`, writing
  `dist/renderer-router-extension.json`;
- sets the identity: `CFBundleIdentifier` `com.simeonlabs.simeon`,
  `CFBundleDisplayName` `Simeon`, URL scheme `simeon`, and
  `NSMicrophoneUsageDescription`;
- renames the executable, `CFBundleName` and the helper bundles to `Simeon`
  together (`scripts/lib/macos-bundle-rename.mjs`);
- writes `LSEnvironment` with `SIMEON_API_BASE_URL`, `SIMEON_WEBSITE_URL` and
  `SAND_BACKEND_URL`, all `https://api.simeonlabs.com`
  (`SIMEON_BACKEND_URL` overrides all three);
- replaces every `.icns` with `brand/Simeon.icns`;
- signs ad hoc (identity `-`, `scripts/lib/codesign.mjs`) and checks the
  signature.

`SIMEON_OUTPUT_APP_NAME` changes the output bundle's name;
`SIMEON_DISPLAY_NAME` changes the display name.

### `npm run verify`

`scripts/verify.mjs` audits `dist/Simeon.app` (or `--app /path/to/App.app`):

- the `app.asar` holds every required runtime entry, and each compiled runtime
  came from `source/`;
- the native modules and the unpacked tree-sitter entries are present;
- every output matches the hashes in the build manifest;
- every renderer file matches the pinned inventory, or the patched hash in the
  patch record, and the patch record exists;
- no source maps ship in the renderer;
- bundle id, display name, executable, `CFBundleName` and helper names are
  Simeon's; the `simeon` URL scheme is registered and `sand` is not;
- `LSEnvironment` carries the three backend variables;
- every `.icns` file is `brand/Simeon.icns`;
- `codesign --verify --deep --strict` passes.

## Installing

Quit Simeon first (Cmd+Q). Then:

```sh
rm -rf /Applications/Simeon.app && cp -R dist/Simeon.app /Applications/ && open /Applications/Simeon.app
```

## First launch after a build

- **Sign in again.** The app is ad-hoc signed, so each build has a different
  signature, and macOS ties the Keychain entries (`safeStorage`) to the
  signature and the bundle id. The first build with the bundle id
  `com.simeonlabs.simeon` needs a fresh sign-in for the same reason.
- **macOS asks for permissions again** (screen recording, accessibility,
  automation, microphone). Those grants are also keyed to the bundle.
- **The data folder moves.** On the first start that finds `~/.caisra` and no
  `~/.simeon`, the app renames `~/.caisra` to `~/.simeon`. If an older host or
  daemon still holds the old folder, the move waits for a later start.

## Publishing the host bundle

The cloud boxes run the host from the packaged app. After `npm run package`:

```sh
SIMEON_HOST_BUNDLE_S3=s3://<bucket>/host-bundles npm run publish:host-bundle
```

`scripts/publish-host-bundle.mjs` takes `dist/host/host-main.cjs` and
`dist/box-exec-daemon/main.cjs` out of the packaged `app.asar` and writes, in
`desktop/dist/host-bundle/`:

- `sand-host-bundle-<commit>.tgz`, a deterministic tarball of the two files;
- `sand-host-bundle-latest.version`, the commit id.

With `SIMEON_HOST_BUNDLE_S3` set, it uploads both with the `aws` CLI, the
tarball first and the pointer last. Without it, upload them yourself in that
order. The version is the current commit (12 characters), so uncommitted
changes under `source/`, `scripts/` or `package.json` are refused
(`--allow-dirty` is for test builds only).

The folder must be readable over plain HTTPS without credentials. The server's
`SIMEON_BOX_HOST_BUNDLE_URL` names it; the server reads the pointer at most
every ten minutes and moves each box to the new version when it is idle.

## Other commands

`npm test` runs the tests alone. `npm run start:clean-source` launches the
readable reconstructed window, for reading. `npm run package:diagnostic`
builds the fidelity bundle, for measuring. `npm run demo` serves the patched
window as a scripted demo on 127.0.0.1, after `package`.
`.github/workflows/desktop_mac.yml` runs the build loop on a macOS runner, by
hand only.

## Mac checklist after a build

1. `npm run verify` passes.
2. The app opens as Simeon: menu bar name, Dock icon, window title.
3. Sign in. The browser opens `api.simeonlabs.com/loginDeepControl`, you
   confirm, and the app comes forward signed in.
4. `~/.simeon` exists, and `~/.caisra` is gone if it existed before.
5. The Computer panel connects. If it spins for more than 20 seconds, read
   `~/Library/Application Support/Simeon/computer-stream.log`.
6. Send a message. On the box server, `/tmp/sand-host.log` in the person's
   container shows `[simeon] model=` and `[simeon] tool=` lines.
7. On the API, the log shows `sand.box.ensure` for the box, not
   `sand.box.ensure.refused`.

## Not yet verified

- `npm run verify`'s identity, `LSEnvironment` and icon checks against a real
  package.
- A sign-in round trip from the packaged app against `api.simeonlabs.com`.
- The first launch with bundle id `com.simeonlabs.simeon` and the move to
  `~/.simeon`.
- Whether the upstream download URL answers from a normal Mac or a GitHub
  macOS runner.
- A host bundle published with `npm run publish:host-bundle` running on a
  cloud box.
