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
| 1. The base: the server and the computer, signing in, the window | Done, 1 November 2026 (1a to 1d). Carried to step 2: the first run for a new account and the access cover |
| 2. The sidebar and the chat | In progress: 2a part 1 (the chat's core) done; part 2 (the chat on screen) next |
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
| 1 November 2026 | The web app keeps no copy of the agents and chats on the device, as the Mac does on disk (`SavedChats`): it shows the server's copy (`chats/agents`, `chats/lines`) while the computer is away, which the server keeps for exactly that. A browser's storage would hold the person's messages on a shared or public computer | The session, as above |
| 1 November 2026 | Signed out, the web app goes straight to the website's own sign-in page and comes back (`/login?return_to=…`), as the old web app does: the website's page is the gate. The Mac's sign-in screen comes with Windows (step 7) | The session, as above |
| 1 November 2026 | What the person has typed and not sent (the Mac's drafts, kept on disk) is kept in the tab's memory only, and goes with the tab: for the same reason as the chats | The session, as above |
| 1 November 2026 | The web app has no catalogue of its own: it reads the Mac's two String Catalogs, made into tables by a script, so a translation is written once, for the Mac, and the web app has it. The screens read the Mac app's catalogue and the code translated from the core reads the core's, because the two say some English differently ("Done": "OK" on a Mac screen, "Terminé" in the core) | The session, as above |

## Open questions

For the founder, each to be answered before the step that needs it:

- **The website's deploy.** `app.simeonlabs.com/app-next` has answered 404
  since pull request #516 merged: the Vercel project `simeon` (the one
  that serves `clients/apps/web`) has not published it. Its previews say
  "Canceled by Ignored Build Step", a setting kept in Vercel, not in the
  repository. Needed before anything of the new app can be checked live:
  the founder to open the project's deployment for #516 and say whether it
  was ignored, failed or is ready.

- **A Windows code-signing certificate.** An unsigned installer makes
  Windows warn people before it runs (SmartScreen). Simeon Labs needs a
  code-signing certificate in its name before the first public Windows
  release. Needed at step 7.
- **Who checks on a Windows PC.** Nothing is done until it has run on the
  machine people use; for Windows, someone installs each build on a
  Windows PC. Needed at step 7.

## Log

Newest first.

### 1 November 2026: step 2a, part 1, the chat's core

- `src/core/entry.ts` (`Entry` and `TranscriptChange` in `Models.swift` and
  `Backend.swift`): a chat's line, the person's own reactions, a thread's
  reply, and the changes the host streams (written, changed, taken away,
  cleared, a whole copy).
- `src/core/chat.ts` (`Chat.swift`): a chat's rows. Stamps after a quarter of
  an hour or on a new day, "New" before the first unread line, bubbles with
  their quotes (none on an agent's answer to the only line since), pictures
  sent together as one, files, agents talking to each other folded into one
  line, a call written before calls were one line, routines changed one
  after another, notices in plain words, a thread's replies counted under
  their message, a message that is one link, a group's names and pictures.
  The cards keep their line as a `card` row until step 3 draws them; until
  then the chat says "This message can't be shown in this version of Simeon."
  in their place, the core's own sentence for a card it cannot draw.
- `src/core/chatRuns.ts` (`ChatRuns.swift`): each line's run (12 lower when
  someone else spoke before it, its corners 6 round beside the same
  sender's), checked against the window's own functions run on the same
  lines (the core's fixtures `chat-runs.json` and `sender-keys.json`).
- `src/core/markdown.ts` (`Markdown.swift`): a message's blocks (headings,
  lists and tasks, quotes, code, tables, rules, maths). Within a line, bold,
  italics, code, links and strikethrough, then GitHub's bare links: the Mac
  reads these with Apple's own Markdown reader, which has no copy for the
  web, so this one follows CommonMark's rules (the Mac's tests have none for
  it; its own are in `markdown.test.ts`).
- `src/core/plainWords.ts` (`PlainWords.swift`): a notice that names
  something behind Simeon reads plainly. Like the Swift copy, it names two
  earlier names to keep them off the screen: `scripts/kept_names.json`'s rule
  for the filter now keeps this copy and the built index file too.
- The backend (`Backend.swift`): a chat opened on the host (`openAgentTail`,
  without waking a computer that rests), older lines (`getAgentTranscriptTail`),
  a preview read without opening it, a message (`sendPrompt`, in the host's
  names), read (`setAgentUnread`), the chat's live lines (`transcript`).
- The store (`Store.swift`, `StoreSaved.swift`): a chat opened shows the
  server's copy of its lines (`chats/lines`) while the computer's are on
  their way, then the computer's; its new lines stream, a growing answer
  redrawing only its own row; a line the stream missed is fetched; a chat on
  screen stays read; older lines when scrolled up; "Couldn't load" and Retry.
  A message shows at once and gives way to the host's copy (by its nonce);
  "Failed to send" with Resend and Delete; held while the computer is out of
  reach ("Waiting to send…", Cancel), handed to the server meanwhile
  (`chats/send`), and sent to the computer again when it is back. Threads,
  and the lines find will read.
- **Not in this part:** the chat on screen (part 2); names in the chat in
  their colours and pills (`Mentions`), sending a reaction, find, the
  composer's files and "/" and "@" (2b and after); the Mac's asks to use
  this Mac (the Mac's alone); sending held through a rebuild (step 5).
- **Checked:**
  - 148 tests pass (52 more), translated from the core's ChatTests,
    ChatThreadTests, ChatDeliveryTests, ChatQueueAndThreadTests,
    ChatRunsTests, ReactionsTests, SendArgumentTests, MarkdownTests and
    SavedChatsTests' server copy and held messages, with the two fixtures;
  - three deliberate breaks (the nonce match, the quote rule, a run's
    corner), each caught by a test;
  - typecheck, lint, the words' and the build's checks,
    `check_translations.py`, `check_names.py`. The inventory now counts 110
    strings the new web app shows.
- **Not translated:** the core's tests that run on its demo seed
  (`DemoData`: the morning brief, a group's names, every card, the cards'
  buttons); the cards' come with step 3.
- **Not checked:** in a browser (nothing on screen uses it yet), and against
  the real computer.
- Pull request #521.
- **Next:** step 2a, part 2: the chat on screen (its head, its rows, the
  bubbles and their Markdown, the composer).

### 1 November 2026: step 1d, part 2, the session and the window

- `src/session.ts` (`MacSession.swift`, and the old web app's
  `desktop/web/bridge.ts`): a pair kept in the tab, else the website's
  cookie traded, else the website's sign-in page told to come back here;
  "Setting up" until a list is on screen (the server's copy when it comes
  first); the profile read for the account; a sign-in the server ends goes
  back to the sign-in page and forgets the computer's address.
- `src/core/faces.ts` (`AgentFaces.swift`): the faces read from the shared
  core's own copy (`Resources/Faces`, the same files the Mac and the iPhone
  ship); which face an agent shows (worn, its own picture, given, or one its
  id picks with the voices' hash); a group's layout.
- `src/core/listTime.ts` (`Chat.listTime`): "8:33 AM", "Yesterday", the
  weekday, "9/22", "9/2/25"; in the app's language in the person's region.
- The window (`MainWindow.swift`, `Sidebar.swift`, `SidebarList.swift`,
  `Pictures.swift`, `Look.swift`): the colours light and dark as CSS
  (`src/index.css`); the sidebar 320 wide with its half-point edge; each row
  as the Mac's (62 high, the picture 46, the name, the title's tag in blue,
  the time or the unread dot, the last line, the green dot at work in a hole
  cut round it, the open row's white card); a group's members drawn together
  with the gaps cut between them; "Can’t reach your computer" with Retry over
  no list, "Reconnecting to your computer…" over one, read again every 4 s;
  the store's Retry asks the broker again.
- **Not in this step, each with its screen:** the chat (step 2); the head's
  search and new chat, the foot's account and Connect apps, pins and
  folders, several rows picked, renaming, the right-click menu, dragging,
  the rail and the width dragged (step 2 and after); the first run for a new
  account and the access cover (step 2); Recover computer (step 5); faces
  given to agents that have none (the store's actions).
- **Checked:**
  - 96 tests pass (13 more: the session's five ways in and out, the faces
    against `AgentFaceTests` with the hash worked out apart in Python, the
    group's layout, the list's time against `testStampTexts` and
    `testNoTimeIsNotNineteenSixtyNine`); typecheck, lint, the words' and
    the build's checks, `check_translations.py`, `check_names.py`;
  - in Chromium, the built app against a stand-in server (the cookie, the
    profile, the broker, the computer's list): the whole way in ran and the
    window drew six agents' rows, the hidden one left out, the faces loaded,
    light and dark (screenshots taken); in French ("Bras droit", "Hier",
    "jeudi", "22/09", "En attente de toi : …"); and with the computer
    answering 500, the "Can’t reach your computer" card with Retry.
- **Not checked:** against the real server and a real computer, signed in:
  the address is not live yet (`/app-next` answers 404 since the first
  merge; see Open questions). The inventory now counts 40 strings the new
  web app shows.
- Pull request #520.
- **Next:** step 2, the sidebar and the chat.

### 1 November 2026: step 1d, part 1, the agents and the store's roster

- `src/core/models.ts` (`Models.swift`): an agent's row, every field the host
  sends; the sidebar's preview line (the Mac's Markdown stripping, "Sent 2
  images", "Waiting for you: …"); the Chief of Staff and his title in the
  app's language; the list's order. A row is the same row whatever its stamp.
- `src/core/backend.ts` (`Backend.swift`): `LiveBackend` with the list
  (read without waking a resting computer), calls to the server, commands,
  and the host's events in the screens' terms (`LiveBackend.map`, every
  channel but the chat's lines, which come with the chat).
- `src/core/store.ts` (`Store.swift`, `StoreSaved.swift`): the roster part of
  the store. On attach the server's copy of the list shows while the
  computer has not answered, the computer's list replaces it (and wins when
  it answers first), a resting computer is no failure, a refused account
  (403) raises the access cover, the host's events keep the list current and
  the same row again redraws nothing. The account read as the Mac reads its
  profile. The rest of the store comes with its screens.
- **Left for later, on purpose:** the agents' faces given to rows that have
  none (`wearingFaces`, step 1d's window), the open chat (step 2), the
  account's initials (Settings, step 6).
- **The tests:** 19 more (83 in all): the row and its preview line, French
  included (`testTheListLineIsTheMacs`, `testNoTimeIsNotNineteenSixtyNine`,
  the row of `SavedChatsTests`, `LanguageTests`' Chief of Staff); the list at
  launch (`SavedChatsTests`' computer-first and no-copy-unless-asked,
  `SleepingComputerTests`' resting computer); the events (`GatewayTests`'
  mapping) and the store after them; the list read from a computer through
  the gateway; the account.
- **Checked:** the tests, typecheck and lint pass; `check_translations.py`
  finds every new sentence in the core's catalogue; the inventory now counts
  31 strings the new web app shows. Two of my own test expectations were
  wrong at first (French writes a narrow space before ":", and "the list is
  on screen" is told only for an early copy, as in Swift); the code was
  right in the first and made to match Swift in the second.
- **Not checked:** against a real computer; the window that draws this is
  next.
- Pull request #519.
- **Next:** 1d, part 2: the session (the cookie, else the website's sign-in)
  and the window drawn (its colours, the sidebar, the faces).

### 1 November 2026: step 1c, the words

- `clients/apps/app/scripts/make-words.mjs` turns the Mac app's and the
  core's String Catalogs into one table per language (`src/words/mac/`,
  `src/words/core/`): each entry the translation in Apple's format (`%@`,
  `%lld`, `%1$@`, `%%`) or its plural forms. `--check` fails when the tables
  are not the catalogues'.
- `src/core/words.ts`, with `t` and `tk` for the screens (`src/l10n.ts`, the
  Mac's catalogue) and for the core's code (`src/core/l10n.ts`, the core's):
  - the key is made the way Swift makes it: t`Couldn’t reach ${name}.` is
    "Couldn’t reach %@.", a number `%lld`, a written % `%%`;
  - values go where the translation puts them, by place where it numbers
    them; a plural picks its form by the language's own rules (Polish has
    four);
  - a sentence with no translation shows its English.
- The app loads its language before it draws: the browser's first language
  Simeon is in (Windows' in Electron), else English. Only that language's
  two tables are downloaded (French: 15 KB and 73 KB compressed). The page's
  `lang` says it.
- **The checks:**
  - `check_translations.py` fails on a `t(…)` in the web app that is in no
    catalogue, on a `t` or `tk` whose English is not written out, when the
    web app's languages are not the apps', and when the tables are not the
    catalogues' (it runs `make-words.mjs --check`). So a catalogue changed by
    Mac work fails it until `pnpm words` is run (`CLAUDE.md` says so);
  - `pnpm test` runs the same table check;
  - `web_app_inventory.py` now counts the strings the new web app shows:
    2 of 3,164 (the two sentences step 1b uses).
- `docs/localization.md` names the web app's place in its platform table and
  in "Adding a language".
- **Checked:**
  - 9 new tests against the real catalogues: the keys and the values; English;
    each table its own ("Done" is "OK" on a screen, "Terminé" in the core);
    values in the translation's order; French and Polish plurals; the
    keyed sentences; a missing translation shown in English. 64 tests pass;
  - the checks catch faults: four wrong calls planted in a file (a sentence
    in no catalogue, a template whose words are not the catalogue's, a `tk`
    built from a value, a `t` of a variable) each failed
    `check_translations.py`, and the valid ones passed; a language taken off
    the web app's list failed it; a table edited by hand failed
    `make-words.mjs --check`, from `pnpm test` and from
    `check_translations.py`;
  - in Chromium, served by Vite: French, Polish, English and Japanese
    browsers each load only their own tables (Japanese falls back to
    English), the page's `lang` is the language, nothing errs.
- **Not checked:** a sentence on screen in each language: the window
  (step 1d) is the first to show any.
- Pull request #518.
- **Next:** 1d, the window: signing in, the layout, the agents list.

### 1 November 2026: step 1b, talking to the server and the computer

- `clients/apps/app/src/core`: the shared core's plumbing translated, file
  for file, each file's header naming the Swift it comes from:
  - `tokens.ts` (`Tokens.swift`): the pair, its expiry and account read off
    the envelope, the refresh answer read the Mac's way;
  - `api.ts` (`SimeonAPI.swift`): the bearer and the client headers,
    refreshing with five minutes left and once for calls made together, a
    401 asking one refresh before it signs out, `/desktop/api/` and its
    envelope, Connect calls to the box broker, dictation, Delete Account
    (five minutes, then asking the server), sign-out. Plus the web's own:
    the cookie traded for the pair (`/auth/web-session`), where the API is
    (`resolveApiBase`) and the pair kept in the tab under the old web app's
    key (`simeon.web.tokens`), all from `desktop/web/api.ts`;
  - `savedGateway.ts` (`SavedGateway.swift`): the computer's address kept
    for its account for seven days, in the tab's storage;
  - `gatewayConnection.ts` and `gateway.ts` (`Gateway.swift`): the address
    from the broker, `/health` before the broker, the hold on a full box
    server, the kept address at launch, a call sent again only when it
    surely never arrived, the computer that sleeps while the app is open
    (reads that do not wake it, the launch's one question, the wait while
    it rests), and the event stream (35 s of silence ends it; dialled again
    after 1, 2, 4, 8, then 10 s);
  - `http.ts`: fetch, with timeouts, cancelling and streams, in the place of
    URLSession; `json.ts`, `language.ts`, `recentActivity.ts` (the last 400
    lines, scrubbed, for a report);
  - `l10n.ts`: every sentence the person reads already goes through `t()`,
    which answers in English until step 1c brings the catalogue.
- **Not translated here, and where it goes:**
  - the iPhone's notifications (`registerPushDevice`): the browser's and
    Windows' notifications are step 7;
  - the host's commands and events as the screens read them (`LiveBackend`)
    and the tests that need them: step 2;
  - the picture editor's wording of a refusal and the account's initials,
    which belong to their screens.
- **The tests:** 39 of the shared core's tests translated with the same
  inputs and answers (`TokenTests`, `GatewayTests`, `GatewayConnectTests`,
  the gateway's part of `SleepingComputerTests`, and base64url from
  `SignInTests`), plus 15 new ones: the event stream loop (the Swift one
  runs only on Apple's systems and has no test), letters split across
  chunks, which failures are sent again, French dictation, one refresh for
  calls made together, the web sign-in (4), and fetch itself against a
  server on the same machine (an answer, a timeout, a closed port, a
  cancelled call, a stream, a silent stream).
- **Checked:**
  - 55 tests pass, with the typecheck and lint;
  - the tests catch faults: with one line of the gateway undone at a time
    (the stream's trust, the hold on a full server, the kept address, the
    forgotten address of a refused account, the asleep state, the record's
    word), each run fails;
  - the live server: `POST /auth/web-session` without a cookie answers 401,
    which the app reads as "not signed in on the website"; the browser's
    preflight from `https://app.simeonlabs.com` to the box broker allows
    every header the app sends, and the server exposes
    `x-automation-failure-hint` and `retry-after`, which the hold reads.
- **Not checked:** signed in, against a real computer. Nothing on screen
  uses this code yet; step 1d's window does.
- Pull request #517.
- **Next:** 1c, the words.

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
- Pull request #516.
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
