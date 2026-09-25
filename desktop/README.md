# Simeon, the desktop app

Simeon is a team of always-on agents on your Mac, each with a computer of
its own. This directory is the Electron app: the window is the pinned Grok
Bot 0.18.0 renderer, patched at package time to say Simeon; the host, the
agent loop, the box connectors and the Electron main process compile from
the readable sources under `source/`; and every model call goes to Simeon
Labs' server (`api.simeonlabs.com`, the `server/` directory of this
repository), never to Cursor.

`docs/product/building-the-app.md` is the map of what the packaged bundle
contains and where each piece comes from. `PROVENANCE.md` and `NOTICE.md`
say what is taken from the shipped 0.18.0 app and on what terms.

## Build and install

macOS on Apple Silicon only, Node 26, Xcode Command Line Tools, and a
genuine Grok Bot 0.18.0 app for `npm run bootstrap` to read (not in this
repository; see `building-the-app.md` for how it is found).

```sh
cd desktop
source ~/.nvm/nvm.sh && nvm use 26
npm ci                 # never npm install: the lockfile is the contract
npm run bootstrap      # hydrate src/app/dist from the pinned 0.18.0 app
npm run check          # typecheck + node --test, a required gate
npm run package        # dist/Simeon.app, ad-hoc signed
npm run verify         # audit the bundle, a required gate
```

Then quit Simeon and install the new build:

```sh
rm -rf /Applications/Simeon.app && cp -R dist/Simeon.app /Applications/ && open /Applications/Simeon.app
```

The app is ad-hoc signed until an Apple certificate exists, so macOS re-keys
the Keychain entries on every new build; sign in again if asked.

## What runs where

- **The window**: `dist/renderer/`, the checksum-pinned 0.18.0 renderer.
  Its bytes are edited only by `scripts/lib/router-renderer-patch.mjs` at
  package time (brand strings, marks, palette, header card, glass), and
  the patch record (`dist/renderer-router-extension.json`) carries every
  touched file's original and patched hash, which `npm run verify` reads.
- **The Electron main process** (`source/electron-main/`): sign-in to
  Simeon Labs, the account, settings, the local Docker box connector, the
  coordinator, the noVNC computer panel.
- **The host** (`source/host/`): the agent loop and its tools, running
  inside the box; `/tmp/sand-host.log` in the container is where every
  `[claidor]` line goes.
- **The box**: a local Docker container (`simeon-box`) by default; a cloud
  box through Simeon Labs' broker when a host is configured.
- **`frontend/`**: a readable partial reconstruction of the renderer. It is
  not what `npm run package` ships (the atom stylesheet was never
  recovered), and it is kept for reading and for the twenty-one avatars.

## Development commands

```sh
npm test                  # node --test tests/*.test.mjs
npm run typecheck         # frontend TypeScript
npm run source:typecheck  # runtime TypeScript
npm run start:clean-source # the reconstructed UI, for reading
npm run package:diagnostic # the fidelity bundle, for measuring
npm run verify            # verify an existing packaged app
```

Generated directories (`.cache`, `.build`, `dist`, `src/app/dist`, `.tmp*`)
are ignored.

## Where the records are

The product's decisions and measurements are in `docs/product/` at the
repository root, one dated file per subject; `CLAUDE.md` at the root is the
index. Nothing in this directory should be described from memory: read the
record, or run the build.
