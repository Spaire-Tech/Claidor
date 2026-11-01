# Simeon on the web and on Windows: the audit

The founder, 1 November 2026: "i want the window app. and that's your next
projet … my mission for you is to audit the mac app, then the web app. and
see whats missing." Then: "How do we make sure we dont miss anything".

This is that audit. It is the checklist the web app is built against, and
the Windows app after it. Where the work stands, every decision and the
open questions are in `PROGRESS.md`, updated with every change.

## The plan it rests on

- **The Windows app is Electron around a web app.** That web app is also
  the one at `app.simeonlabs.com/app`, so one codebase serves the web,
  Windows (and Linux).
- **That web app is a translation of the Mac app**, screen by screen, into
  code Simeon Labs owns (`clients/apps/app`). It is not the web app people
  use today.
- **Why not today's web app** (`clients/apps/web/public/app`):
  - Its window is another company's compiled renderer, read from their Mac
    installer and patched (`desktop/NOTICE.md`: "No licence to the upstream
    code is granted or implied here").
  - Every feature since 11 October was built in Swift. Adding one to the
    old window means patching its compiled code.
  - It can only be built on a Mac that has the upstream app (`npm run
    bootstrap`). It was last rebuilt on 8 October 2026; the 169 commits to
    the Mac app and the shared core since 11 October are not in it.
- **The Mac app stays Swift.** Each new Mac feature is then also needed in
  the web app; the checks below fail until it is there.

## How the lists are made

Nothing here was remembered. `scripts/web_app_inventory.py` reads the code
and writes `docs/web-app/inventory/`:

| File | What it lists |
|---|---|
| `files.json` | Every Swift file of the Mac app (`mac/Simeon`) and the shared core (`ios/SimeonCore`): lines, what its header says it is, its views, whether it needs a Mac, its words on screen and how many of them the old web app has |
| `areas.json` | The files in 14 areas. Each file is in exactly one, and the script stops when a file is new or gone, until the map in the script is updated |
| `strings.json` | Every English string in the two catalogues (`Localizable.xcstrings`), the files that show it, whether the old web app shows it, and whether the new one does (`web_app`: its `t(…)`, read as `check_translations.py` reads it) |
| `server.json` | Every call to Simeon Labs' server: paths and Connect RPC methods |
| `box.json` | Every command the Mac sends to the cloud computer, with the 144 the host answers (`desktop/source/host/gateway-protocol.ts`) |
| `chat.json` | Every kind of chat row and card the Mac draws (SimeonCore's `ChatRow` and `RequestCard`) |
| `tests.json` | The shared core's tests, file by file |

```sh
python3 scripts/web_app_inventory.py     # about a minute; prints the totals below
```

### The totals (1 November 2026)

| | |
|---|---|
| Mac app | 70 Swift files, 36,822 lines, 435 views; 66 files use the Mac's own toolkit |
| Shared core | 110 Swift files, 30,281 lines |
| Words on screen | 3,164 strings in the catalogues (818 the Mac's, 2,364 the core's), 3,061 of them found in the code |
| Simeon Labs' server | 50 calls |
| The cloud computer | 70 commands sent, of the 144 the host answers |
| The chat | 22 kinds of row, 6 kinds of request card |
| Tests | 566, in 63 files |

## The Mac app, area by area, against the old web app

"Of those, in the old web app" is the share of the area's strings found in
the old web app's code (`clients/apps/web/public/app`, the window and
`web-bridge.js`). It measures what the old app has of the area, not its
look. Strings shared by many screens ("Cancel", "Done") make it read a
little high.

| Area | Mac lines | Shared-core lines | Words on screen | Of those, in the old web app | Box commands | Not in the old web app |
|---|---:|---:|---:|---:|---:|---|
| **Signing in and the first run** | 751 | 1,186 | 65 | 50% | 7 | `refreshUserName` |
| **The window, its look and its words** | 1,355 | 406 | 20 | 60% | 0 | – |
| **The sidebar, agents, groups, new chat, starter packs, the org chart** | 4,471 | 2,133 | 153 | 84% | 15 | – |
| **The chat: messages, the composer, reactions, find, threads, dictation** | 7,064 | 4,784 | 308 | 74% | 0 | – |
| **Cards in the chat: questions, drafts, approvals, secrets, forms, 1Password, products, checkout, flights, joined** | 3,931 | 1,668 | 294 | 47% | 0 | – |
| **Previews: files, pictures, videos, diagrams** | 1,756 | 623 | 50 | 94% | 0 | – |
| **The agent's pane: profile, avatar, routines, channels, a group's members** | 5,224 | 2,057 | 386 | 78% | 0 | – |
| **The cloud computer: its screen, take over, rebuild and recovery** | 1,894 | 2,436 | 144 | 82% | 9 | `stopAgentTask`, `takeComputerControl`, `typingFocus` |
| **Calls with an agent** | 780 | 1,125 | 46 | 45% | 3 | – |
| **Search (⌘K)** | 847 | 822 | 75 | 86% | 6 | – |
| **Connectors: the catalogue, connector pages, connecting, accounts** | 3,150 | 3,826 | 1,415 | 9% | 0 | – |
| **Settings, the account menu, usage and billing, Wallet, Credentials Store, feedback** | 3,391 | 1,954 | 303 | 44% | 2 | – |
| **Talking to the server and the computer, and what is kept on the device** | 0 | 5,642 | 88 | 37% | 50 | `answerCredentialRequest`, `answerPurchase`, `buyProduct`, `connectOnePassword`, `dismissOnePasswordConnect`, `dismissUserForm`, `startFlightBooking`, `submitFlightPassengers`, `submitUserForm` |
| **The Mac's own: hands on this computer, local permission, 1Password app, notifications, Dock, menu bar, updates, links** | 2,208 | 1,619 | 44 | 63% | 3 | – |
| **All** | 36,822 | 30,281 | | | | |

`areas.json` lists each area's files, its box commands and its server
calls.

## The old web app

**What it is.** The Electron window's compiled renderer, with
`desktop/web/bridge.ts` in front of it standing in for Electron. It is
built by `desktop/web/build-web.mjs` into `clients/apps/web/public/app` and
served at `app.simeonlabs.com/app` (`desktop/web/README.md`).

**What it has of the Mac app.**
- 1,193 of the 3,164 strings (38%).
- 57 of the 70 box commands.
- The areas the Mac app copied from it are mostly there: previews 94%, search 86%, the sidebar 84%, the computer 82%, the agent's pane 78%. They are in the window's older design, not the Apple design pass of 11 October.

**What it lacks, measured.**
- **Cards** added since: 1Password fill and connect, in-chat forms, products and checkout, flight booking, the joined card. These are 9 of the 13 missing box commands, and the cards area is 47%.
- **The computer:** Stop (`stopAgentTask`), taking over the computer (`takeComputerControl`), typing focus (`typingFocus`).
- **Connectors:** the connector pages and the consent before connecting (1,263 strings, 9 of them in the old web app), Add Another Account (`apps/{toolkit}/accounts`), the server's own connecting (`/desktop/apps/start`). The area is 9%.
- **Settings:** Wallet, Credentials Store, Usage & Billing's newer parts (`user/quota`, `billing/settle`, `billing/free-month`, `billing/portal`), Send Feedback and Report an Issue, the Apple design of every page. The area is 44%.
- **Calls** through the server's voice proxy (`proxy/v1/voice/calls`). The area is 45%.
- **The chats kept on the server** while the computer sleeps (`chats/agents`, `chats/lines`, `chats/send`): the old app shows nothing until the computer answers.
- **Starter packs** (`packs/{id}`, `/v1/pack/add`), generated pictures (`proxy/v1/images/generations`), the agents' faces, plain-words errors, email sign-in.

**What it has that the Mac app does not.** Searched in both codebases:
- **Skills publishing** (`publishSkill` and its family): the only one a person could use.
- **An agent's memory** commands: no screen in the window.
- **The egress tunnel:** off by default.
- **Teaching by demonstration:** its gate is off in what ships.

Nothing else; `mac/PARITY.md` lists the rest of the window as copied or as
deliberately not built (staff-only screens, a privacy block the server never
raises, broken shared rooms).

**So** the old web app is not a base to build on. The new web app replaces
it at the same address. Skills publishing is left out, as on the Mac
(`PROGRESS.md`, "Decisions").

## What the Mac's own parts become

| On the Mac | On the web | On Windows (Electron) |
|---|---|---|
| Sign in with Apple's sheet; Google, email | The web sign-in: the cookie traded for the token pair (`POST /auth/web-session`), as the old web app does | The Mac's way: the browser, then `/auth/poll` (`/loginDeepControl`) |
| The token pair in the Keychain | The tab's storage, as today | Windows' credential store (Electron `safeStorage`) |
| Notifications, the Dock's number | The browser's notifications | Windows notifications, the taskbar badge |
| The menu bar icon | – | The system tray icon |
| Updates (Sparkle, `/desktop/download/mac/appcast.xml`) | Always the latest | Electron's updater, on a Windows feed the server serves |
| `simeon://` links (packs, plugins, sign-in returns) | Web addresses | The `simeon://` handler registered on Windows |
| The agent's hands on this Mac (`MacLocalHands`, `LocalExec*`, `SensitivePaths`) | Not possible in a browser | A Windows version: commands in PowerShell, Windows' paths, Windows' sensitive folders. A later phase |
| "Execution on Local Computer" | – | With the hands above |
| 1Password through its Mac app | – | 1Password's Windows app, later |
| Chrome's cookies imported (Mac only) | – | Chrome on Windows, later |
| Dictation (recorded, transcribed by the server) | The browser's microphone, the same server call | The same |
| Liquid Glass | Its look in CSS (blur, tint, rim) | The same |

## The checks that keep it complete

They are built with the web app and run on every change, as
`check_names.py` and `check_translations.py` do, so a new Mac feature fails
them until the web app has it:

1. **Words:** every string in the two catalogues is in the web app's
   catalogue and shown by its code. The translations come along with it.
   *In place (step 1c):* the web app reads the two catalogues themselves
   (`scripts/make-words.mjs`; `pnpm test` fails when its tables are not
   theirs), `check_translations.py` fails on a sentence of the web app's
   that no catalogue has, and `strings.json` counts the strings the web app
   shows (`web_app`).
2. **Server calls:** each of the 50 calls in `server.json` is made by the
   web app, or is listed as the Mac's alone (Apple's sign-in, the App Store).
3. **Box commands:** each of the 70 in `box.json` is sent by the web app,
   or is listed as the Mac's alone.
4. **The chat:** a page that draws every one of the 22 row kinds and 6
   request cards from sample data, beside the Mac's.
5. **The shared core's tests:** the 566 tests translated with the code;
   the same inputs give the same answers.
6. **Screens side by side:** each area's screens on the Mac and on the web,
   for the founder to tick, the Mac's taken on the founder's Mac.

## The order of work

Each step ends with its area's checks passing and the founder's look:

1. **The base:** talking to the server and the computer (`Backend`,
   `Gateway`, `Store` translated), signing in, the window and its look.
2. **The sidebar and the chat:** agents and groups, messages, the composer,
   reactions, find, threads, previews.
3. **The cards**, every one.
4. **The agent's pane, search, new chat, the org chart, starter packs.**
5. **The computer and calls.**
6. **Connectors and Settings:** connector pages, accounts, Usage &
   Billing, Wallet, Credentials Store, feedback.
7. **Windows:** the Electron app (installer, sign-in, notifications, tray,
   updates, links). Then Windows' own: the agent's hands on the PC,
   1Password, Chrome.
