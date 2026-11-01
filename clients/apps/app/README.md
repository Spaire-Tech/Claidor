# Simeon's web app

The Mac app translated into Simeon Labs' own web code: React, TypeScript and
Vite, in the browser only. It becomes the web app at `app.simeonlabs.com/app`
and, wrapped in Electron, the Windows app. The plan, the checklist and the
record of the work are in `docs/web-app/` (`README.md`, `PROGRESS.md`); read
both before changing anything here.

## Where it is served

- **Now:** `app.simeonlabs.com/app-next`, while it is being built. The old
  web app stays at `/app` until this one has everything the Mac app has.
- **The files:** `pnpm build` writes them into
  `clients/apps/web/public/app-next`, and they are committed with the source,
  as the old app's are. The website (`clients/apps/web`) serves them as they
  are: `next.config.mjs` opens `/app-next` on its `index.html` and gives it
  the old window's security headers.
- **`pnpm test` fails** when the committed files are not the build of the
  source (`scripts/check-built.mjs`).
- **Windows** will load the same files from disk, built with
  `SIMEON_APP_BASE=./`.

## Commands

```sh
cd clients && pnpm install
cd clients/apps/app
pnpm dev          # http://localhost:5174/app-next/
pnpm build        # into ../web/public/app-next; commit the result
pnpm test         # the tests, then the build check
pnpm typecheck
pnpm lint
```
