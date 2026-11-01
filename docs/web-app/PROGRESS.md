# The web and Windows app: progress

The running record of the web and Windows app (the founder, 1 November
2026: "document everything as you go so we dont rely on memory"). The plan
and the checklist are in `README.md`; this file says where the work is.

**Every change to the web or Windows app updates this file in the same
pull request:** the date, what was done, what was checked and how, what was
not checked, any decision and who made it, and what comes next. If this
file and the code disagree, the code is right and this file is fixed.

## Where it is now

| Step (`README.md`, "The order of work") | State |
|---|---|
| 0. The audit | Done, 1 November 2026 |
| 1. The base: the server and the computer, signing in, the window | In progress: the app's folder, build and address are done (1a); next, talking to the server and the computer (1b) |
| 2. The sidebar and the chat | Not started |
| 3. The cards | Not started |
| 4. The agent's pane, search, new chat, the org chart, starter packs | Not started |
| 5. The computer and calls | Not started |
| 6. Connectors and Settings | Not started |
| 7. Windows | Not started |

## Decisions

| Date | Decision | By |
|---|---|---|
| 1 November 2026 | A Windows app is the next project | The founder |
| 1 November 2026 | The Windows app is Electron around a web app. The web app is a translation of the Mac app into Simeon Labs' own code, and replaces the old web app at `app.simeonlabs.com/app`. It is not built on the old web app, whose window is another company's compiled renderer (`desktop/NOTICE.md`) | Proposed in the session; the founder said "Go" |
| 1 November 2026 | The Mac app stays Swift. A new Mac feature is also needed in the web app, and the checks in `README.md` fail until it is there | Proposed in the session; the founder said "Go" |
| 1 November 2026 | Nothing is remembered: the checklist is generated from the code (`scripts/web_app_inventory.py`) and this file records the work as it happens | The founder |
| 1 November 2026 | The code lives in `clients/apps/app`: its own app in the web workspace, React, TypeScript and Vite, in the browser only. Not inside the Next website (`clients/apps/web`), because the Windows app loads the same files from disk, which needs plain built files and no server | The session; the founder left the open questions to the session ("Ok well all you") |
| 1 November 2026 | It is served at `app.simeonlabs.com/app-next` while it is built. The old web app stays at `/app` until the new one has everything the Mac app has; then the new one moves to `/app` | The session, as above |
| 1 November 2026 | Its built files are committed into `clients/apps/web/public/app-next`, as the old app's are, so the website's deploy does not change (Vercel builds only `web`). `pnpm test` fails when they are not the build of the source | The session, as above |
| 1 November 2026 | Skills publishing is left out, as on the Mac. If the Mac app gets it, the checks ask for it here too | The session, as above |

## Open questions

For the founder, each to be answered before the step that needs it:

- **A Windows code-signing certificate.** An unsigned installer makes
  Windows warn people before it runs (SmartScreen). Simeon Labs needs a
  code-signing certificate in its name before the first public Windows
  release. Needed at step 7.
- **Who checks on a Windows PC.** Nothing is done until it has run on the
  machine people use; for Windows, someone installs each build on a
  Windows PC. Needed at step 7.

## Log

Newest first.

### 1 November 2026: step 1a, the app's folder, build and address

- `clients/apps/app`: the new app (Vite 7.3.0, React 19.2.4, TypeScript
  5.9.3, Vitest 3.2.4, the versions the workspace already uses). For now it
  shows only the mark, so the address, the build and the headers could be
  checked on their own. Its `README.md` says how it is built and served.
- `clients/apps/web/next.config.mjs`: `/app-next` opens
  `public/app-next/index.html`; `/app-next` and everything under it get the
  old window's headers (its security policy, the microphone allowed, never
  in a frame, not indexed).
- `scripts/check-built.mjs`, run by `pnpm test`: builds again into a
  scratch folder and fails when the committed files differ.
- `pnpm-workspace.yaml`, `turbo.json` (the two build settings,
  `SIMEON_APP_BASE` and `SIMEON_APP_OUT`), `.prettierignore`,
  `clients/CLAUDE.md`.
- **The lockfile:** adding the app made pnpm settle Vitest on Vite 7.3.0
  for the website's tests too (it was on 5.4.21), and changed how Next's
  optional peers are recorded. No version of Next or React changed.
- **Checked:**
  - the new app's typecheck, lint and test pass;
  - the build check passes, fails when a style changes without a new build
    (`width: 64px` to `65px`), and passes again once restored;
  - the website (`clients/apps/web`) still builds (`pnpm build`, 77 s) and
    its 24 tests pass with the new lockfile;
  - served by `next start`: `/app-next`, `/app-next/`, its script and its
    mark answer 200 with the headers above, and `/app` still serves the old
    app;
  - in Chromium, light and dark: the page draws the mark, the title is
    Simeon, and the console has no errors under the security policy.
- **Not checked:** on Vercel. The deploy after the merge is the first time;
  `app.simeonlabs.com/app-next` should show the mark.
- **Next:** 1b, talking to the server and the computer (`Tokens`,
  `SimeonAPI`, `Gateway` translated, with the shared core's tests).

### 1 November 2026: the audit

- `scripts/web_app_inventory.py` and `docs/web-app/inventory/`: the Mac
  app and the shared core read from the code. The totals:
  - 70 Mac files (36,822 lines) and 110 shared-core files (30,281 lines), 435 views;
  - 3,164 strings;
  - 50 server calls;
  - 70 box commands (the host answers 144);
  - 22 chat row kinds and 6 request cards;
  - 566 tests.

  Every file is placed in one of 14 areas.
- The old web app was measured against them:
  - it has 1,193 of the strings and 57 of the box commands;
  - what it lacks and what it has extra are in `README.md`, "The old web app".
- `README.md`: the plan, the area table, what the Mac's own parts become, the six checks, the order of work.
- **Checked:**
  - the script runs and its JSON files load;
  - the measurements were spot-checked by searching both codebases (routines' commands found in the old web app; `publishSkill` in the old web app only; the connector pages' strings almost all missing from it).
- **Not checked:** the strings measure can read a little high, because short words shared by many screens ("Cancel", "Done") count as found.
- Pull request #515.
- **Next:** step 1, the base, once the founder answers where the code lives.
