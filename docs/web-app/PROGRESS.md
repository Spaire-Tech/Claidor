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
| 1. The base: the server and the computer, signing in, the window | Not started |
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

## Open questions

For the founder, each to be answered before the step that needs it:

- **Skills publishing.** The old web app has it (`publishSkill` and its
  family); the Mac app does not. Port it to the web app, or leave it out as
  the Mac does? Needed by step 6.
- **Where the web app's code lives.** The proposal is `clients/apps/web`,
  the web app already at `app.simeonlabs.com`: the same address and the
  same sign-in cookie, under `/app` in place of the old bundle. Needed at
  step 1.
- **A Windows code-signing certificate.** An unsigned installer makes
  Windows warn people before it runs (SmartScreen). Simeon Labs needs a
  code-signing certificate in its name before the first public Windows
  release. Needed at step 7.
- **Who checks on a Windows PC.** Nothing is done until it has run on the
  machine people use; for Windows, someone installs each build on a
  Windows PC. Needed at step 7.

## Log

Newest first.

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
