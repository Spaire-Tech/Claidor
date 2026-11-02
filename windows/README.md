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
npm run package            # the installer in out/ (on Linux: needs Wine)
```

`SIMEON_APP_ROOT=<folder>` loads another build of the web app;
`SIMEON_USER_DATA=<folder>` gives the app a data folder of its own (the
checks do both).

## Not done here

What isn't built yet, and what wasn't checked, is in `PROGRESS.md`.
