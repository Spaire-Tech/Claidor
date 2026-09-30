# Simeon, the Mac app

Simeon is a team of always-on agents, each with a computer of its own. This
directory is the Mac app, built with Electron:

- **The window** is an upstream app's compiled renderer, pinned by checksum
  and patched at package time to be Simeon's (`NOTICE.md` says where it
  comes from and on what terms).
- **Everything else** compiles from the readable sources under `source/`:
  the Electron main process, the host with the agent loop and its tools,
  and the connectors to the agent's computer.
- **Every model call** goes to Simeon Labs' server (`api.simeonlabs.com`,
  the `server/` folder of this repository).

`../docs/building-the-app.md` explains the build in full, and
`../docs/architecture.md` explains how the parts fit together.

## Build and install

You need macOS on Apple Silicon, Node 26, the Xcode Command Line Tools, and
the upstream 0.18.0 app for `npm run bootstrap` to read. That app is not in
this repository; `../docs/building-the-app.md` says how bootstrap finds it.

```sh
cd desktop
source ~/.nvm/nvm.sh && nvm use 26
npm ci                 # never npm install: the lockfile is the contract
npm run bootstrap      # fill src/app/dist from the pinned 0.18.0 app
npm run check          # typecheck and tests; must pass
npm run package        # dist/Simeon.app, ad-hoc signed
npm run verify         # checks the packaged app; must pass
```

Then quit Simeon and install the new build:

```sh
rm -rf /Applications/Simeon.app && cp -R dist/Simeon.app /Applications/ && open /Applications/Simeon.app
```

The app is ad-hoc signed until an Apple certificate exists, so macOS asks for
Keychain access again after each new build. Sign in again if asked.

## What runs where

- **The window**: `dist/renderer/`. Only `scripts/lib/router-renderer-patch.mjs`
  changes its bytes, at package time (names, marks, colours, layout). The
  patch record (`dist/renderer-router-extension.json`) holds the original and
  patched hash of every file it touched, and `npm run verify` reads it.
- **The Electron main process** (`source/electron-main/`): sign-in, the
  account, settings, the connection to the agent's computer, the coordinator,
  and the computer's screen panel.
- **The host** (`source/host/`): the agent loop and its tools. It runs inside
  the agent's computer and writes its log to `/tmp/sand-host.log` there;
  Simeon's own lines start with `[simeon]`.
- **The agent's computer**: a cloud computer run by Simeon Labs' server.
  A local Docker computer (`SAND_BOX_RUNTIME=local-docker`) is for testing
  only.
- **`frontend/`**: a readable partial reconstruction of the window. It is not
  what `npm run package` ships; it is kept for reading and for the avatars.

## Other commands

```sh
npm test                   # node --test tests/*.test.mjs
npm run typecheck          # frontend TypeScript
npm run source:typecheck   # runtime TypeScript
npm run start:clean-source # the reconstructed window, for reading
npm run package:diagnostic # the full-fidelity bundle, for measuring
npm run demo               # the patched window in a browser, after package
```

Generated folders (`.cache`, `.build`, `dist`, `src/app/dist`, `.tmp*`) are
ignored by git.
