# Simeon for Windows

The web app (`clients/apps/app`, the Mac app translated) in Electron, with
Windows' own parts around it. The plan and the record are
`docs/web-app/README.md` (step 7) and `docs/web-app/PROGRESS.md`.

## How it is made

- **The page** is the website's committed build,
  `clients/apps/web/public/app-next` (the one `pnpm test` in
  `clients/apps/app` checks), copied into the app and served from
  `app://simeon/app-next/` (`src/main/appProtocol.ts`). No second build of the
  web app.
- **The main process** (`src/main/`) is written by Simeon Labs for this app,
  from the Mac's Swift and the shared core. Nothing is taken from the retired
  Electron app in `desktop/` (`desktop/NOTICE.md`).
- **The bridge**: the page asks the app through one file both read,
  `clients/apps/app/src/desktop/contract.ts`; the preload
  (`src/preload/preload.ts`) carries the calls and events, nothing else.
- **Kept on the device**: the session's pair and the computer's address,
  sealed with Windows' own protection (`safeStorage`) in `%APPDATA%\Simeon\kept`.
- **Updates** (`src/main/updates/`, the Mac's `Updates.swift`): electron-updater
  reads the feed electron-builder.yml names (`publish`: the server, which sends
  it on to the release bucket's `releases/win32-x64/`), daily and from Settings ›
  Updates. Only a signed release updates itself (its build number and signers
  written by `scripts/release.mjs`), never an unsigned or a developer's build.
  An installer runs only when Windows says it is signed, validly, by the
  certificate's whole subject in `scripts/lib/release.mjs` (`signers`), checked
  just before it runs: as Simeon quits (after the page's and every part's
  work), or at the next launch, before the window, when Windows shut Simeon
  down with a release waiting. The switches, the last checks and the release
  waiting are kept in `%APPDATA%\Simeon\updates.json`; what the updater did
  is in `updates.log` beside it.
- **The browser in the app** (`src/main/browser/`, `docs/app-browser/`): the
  agents' websites in tabs of the app's own while it is open, when the
  server's switch is on for the person. Each tab is an offscreen Chromium
  window driven over the DevTools protocol; it dials the agents' engine
  whenever the hands do (`/local-browser/*`, `docs/app-browser/protocol.md`).
  Its log is `browser.log` in the data folder; downloads land in
  Downloads\Simeon.
- **The icon** is the Mac's (`resources/icon.ico`, `icon.png`, made by
  `scripts/make-icon.mjs` from `mac/Simeon/Assets.xcassets/MacIcon.appiconset`).

## Commands

```sh
cd windows
npm ci
npm run electron:install   # Electron's own binary (npm may skip it)
npm test                   # the main process's own logic
npm run typecheck
npm start                  # the app, against https://api.simeonlabs.com
npm start -- --api=http://127.0.0.1:8000   # against a server on this computer
npm run smoke              # the app run for real against a stand-in (Linux: xvfb-run -a npm run smoke)
npm run browser-smoke      # the browser in the app run for real against a stand-in engine and test pages (Linux: xvfb-run -a)
npm run package            # a developer's installer in out/ (on Linux: needs Wine)
node scripts/release.mjs   # a release in out/release/<version>/ (signed with WIN_CSC_LINK, WIN_CSC_KEY_PASSWORD, for lib/release.mjs's signers)
node scripts/release.mjs --publish   # and on the website (on Windows, signed and checked only; the aws command line signed in)
node scripts/make-icon.mjs # the icon again, from the Mac's
```

`SIMEON_UPDATES_FEED=http://127.0.0.1:<port>/<path>` gives a build that
isn't a release a stand-in feed on this computer (the checks); a release
reads only its own.

`SIMEON_APP_ROOT=<folder>` loads another build of the web app;
`SIMEON_USER_DATA=<folder>` gives the app a data folder of its own (the
checks do both).

## Not done here

What isn't built yet, and what wasn't checked, is in `PROGRESS.md`.
