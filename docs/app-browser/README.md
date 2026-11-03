# The browser in the app

A plan (4 November 2026). The founder's decisions are made (below).

**Where it is.** Step 1, the engine's route, is built and tested with a
stand-in app, off by default ([protocol.md](protocol.md)). No app has a
browser yet, so nothing has changed for anyone, and nothing has run on a
Mac or a PC. Next: step 2, the browser on Windows.

## The decision

The founder, 4 November 2026:

- "a computer for routines. and the browser for running websites etc..
  cause its extremly faster"
- "keep computer" (the pane's tab keeps its name)
- "i would copy how open bot did it" and "we need to make sure we do not
  break anything"

The rule this plan follows: **the app's browser when the app is open, the
computer's browser when it isn't.**

| Where the work runs | When |
|---|---|
| A browser inside the Mac or Windows app | Websites, while that app is open |
| The person's Mac or PC (today's Execution on Local Computer) | Commands and files, while the app is open |
| The cloud computer | Routines, overnight work, anything asked while no app is open (a Slack message at 3 am, the iPhone while the Mac sleeps) |

The cloud computer keeps its own browser for that last row. A website task
never fails because the Mac is off.

## OpenBot, and what we may take from it

OpenBot (`github.com/nightly-labs/openbot`) has the browser this plan
wants: Chrome tabs inside its Electron window that its agents drive. Its
licence is PolyForm Noncommercial 1.0.0 ("Any noncommercial purpose is a
permitted purpose"), and Simeon is sold. So:

- we follow its **design** (described below in our own words);
- we **copy none of its code**, as with the reconstruction
  (`desktop/NOTICE.md`);
- the other way is a commercial licence from them (`licenses@openbot.run`).

How OpenBot does it, the parts this plan keeps:

- **Tabs are Chrome inside the window.** Each tab is an Electron
  `WebContentsView` placed over the panel. It is sandboxed, with no Node and
  its own session, so a page can't reach the app.
- **The agent drives a tab over Chrome's DevTools Protocol** (CDP), through
  Electron's own debugger. It attaches while a step runs and detaches when
  idle. Input is Chrome's own trusted input, never page scripts: sites
  (X, Google) refuse synthetic events.
- **What the model reads** is a compact snapshot:
  - a header (title, address, focus);
  - up to 20,000 characters of visible text;
  - up to 200 controls, each with a reference made of the snapshot's number
    and the element's node.

  A reference is refused, never guessed again, once the page changed.
  Clicks hit-test the spot first and refuse when something covers it.
  Actions return a short status, not a new snapshot.
- **One queue per tab**, with deadlines. After a click it waits for the page
  to settle (its navigation, then 250 ms with no change).
- **Logins stick** in a saved session ("partition"): one shared by all
  agents by default, or one per agent or per named profile.
- **The person and the agent share a tab.**
  - Take control at any time: the agent's next step waits, then is told to
    look again.
  - Passwords and codes are typed by the host, never sent to the model.
  - While a secret is being entered, screenshots and recording stop.
  - Dialogs and popups are kept with their opener, so OAuth sign-ins work.
- **Looking like Chrome.**
  - Electron's name is removed from the user agent, except for
    `accounts.google.com`, which refuses without it.
  - The client hints match `navigator.userAgentData` exactly, or Cloudflare
    loops.
  - FedCM is off, so Google falls back to its popup.
- **Other devices see a tab as a live picture.** A CDP screencast sends
  JPEG frames, at most 1280×800 and about 30 a second. Taps and keys come
  back, placed by the frame they were made on.
- **Tabs outlive a turn.** Only the agent closes them. They come back
  after a restart. An idle tab unloads after 30 minutes.
- **Their tests** are the list we'll write our own of:
  - identity;
  - typing in background tabs, and focus;
  - controls (selects, checkboxes, covered buttons, drag, canvas);
  - typing focus inside frames;
  - tool limits;
  - waits and deadlines;
  - the live view;
  - secrets;
  - popups and redirects;
  - dialogs;
  - sessions.

WKWebView (Apple's Safari view) isn't mentioned by OpenBot. Every guarantee
above comes from CDP, which WebKit doesn't have, so the Mac app can't use
it for this (decision 1 below).

## How Simeon does it today

All of this is read in the code; file references are in the sections that
use them.

- **The agent's browser** is Chrome in the cloud computer
  (`box/bin/box-chrome`, one per agent screen, DevTools on `127.0.0.1`).
  - The main agent only opens a page (`OpenPage`) or looks at the screen
    (`Screenshot`).
  - A `browserUse` helper drives pages with the `browser_*` tools, through
    Playwright over CDP (`host/runner/tools/sand-browser-tools.ts`, its
    driver uploaded into the computer).
  - A `computerUse` helper drives the whole screen by pixels.
  - Sign-ins live in the computer's Chrome profile, shared by every agent,
    and are backed up to S3.
- **Execution on Local Computer** already reaches the person's Mac or PC
  from the computer.
  - The engine pushes requests down a stream the app holds open
    (`GET /local-exec/requests`), and the app answers in batches
    (`POST /local-exec/responses`).
  - The app says hello with what it is, and pings every 10 s.
  - With no live app, the tool says the app must be open.
  - Files: `host/extensions/local-exec/local-exec-bridge.ts`,
    `mac/Simeon/MacLocalHands.swift`, `windows/src/main/hands/provider.ts`.

  **The browser in the app reaches the agent the same way.**
- **Every fill happens inside the computer's Chrome:**
  - the in-chat form (`form-fill.ts`);
  - 1Password and Simeon's saved logins;
  - the checkout's card (`checkout-fill.ts`) and Duffel's form;
  - the phone's keyboard kind (`typing-focus.ts`);
  - the checkout's picture.
- **The pane's Computer tab** shows the computer's screen over noVNC.
  - The take-over card ("Your turn on the computer") opens it.
  - Take control and Stop task are on the iPhone only.

## How the browser in the app works

1. **One browser, written once, in the app's main process.**
   - On Windows it is part of the Electron main process
     (`windows/src/main/`): tabs as `WebContentsView`s in the window, driven
     over CDP.
   - On the Mac, see decision 1. The recommendation is the same TypeScript
     browser run as a small Chrome helper inside the Mac app. The pane draws
     its live picture and sends taps and keys back, as OpenBot's other
     devices do. One browser to write and test, not two.
2. **The engine gets a second route for the same tools.**
   - The `browser_*` tools keep their names, arguments and answers. The
     snapshot keeps its `[ref=eN]` handles.
   - When a live app has said "I have a browser" (a new field in its hello),
     and the switch below is on, each step goes to the app over a new bridge
     shaped like local exec: `GET /local-browser/requests` and
     `POST /local-browser/responses`.
   - Otherwise it goes to the computer's Chrome, exactly as today.
   - The frames, the ops and the answers: [protocol.md](protocol.md).
   - The agent's instructions don't change. `OpenPage` opens in the same
     browser the helper will use.
3. **The switch.** A setting on the server, off by default, decides
   whether the engine may use an app's browser. Off, nothing changes for
   anyone. It goes on for the founder first.
4. **A task stays where it started.**
   - A page is never moved between the app's browser and the computer's in
     the middle of a task.
   - When the app's browser goes away mid-task (app quit, Mac asleep), the
     step fails with a plain sentence ("The browser on this Mac closed"). The
     agent then starts again on the computer, from the address.
   - How the engine tells one task from the next, per agent: a task on the
     computer ends when it has been idle ten minutes and a step opens an
     address; a task in the app lasts while that browser is open
     ([protocol.md](protocol.md), "Which browser a step goes to").
5. **Sign-ins.** One saved session for all of a person's agents, as on the
   computer today (decision 2). The person signs in inside the tab; the pane
   is the browser.
6. **Fills.**
   - Forms, 1Password, saved logins and the checkout's card are typed by the
     app into its own tab, over CDP, through the same queue.
   - The value never goes to the model, as today. Where today the engine
     types into the computer's Chrome, the request goes to the app with the
     same fields.
7. **The pane.**
   - The tab is still **Computer**. A small grey line at its top says where
     the work is happening: "On this Mac" (or "On this PC"), or "On Simeon's
     computer".
   - On the Mac, the tab shows the app's browser while the agent uses it,
     and the computer's screen otherwise.
   - The browser view, like a small Safari:
     - the agent's tabs as pills with their sites' icons;
     - the site's name with the lock;
     - Back, Forward and Reload;
     - the page;
     - the agent's face as its pointer;
     - Take Control in blue, and Give Back.
8. **Quitting while an agent browses.** A Mac alert: "Theo is still working
   in the browser". Its buttons are Move to Simeon's Computer, Stop and
   Cancel (decision 3).
9. **The iPhone** runs no browser. It shows the Mac's or PC's tab as a live
   picture, relayed through the server like the computer's screen, and can
   take control. This is a later step.

## The cards

Same cards, same buttons. Each card that touches a page gets a second route
to the browser the page is in.

| Card | Today | With the app's browser |
|---|---|---|
| Questions, drafts, approvals of commands, the Allow card, connectors, flights, products, joined, files | No page | Unchanged |
| Secret (an API key) | Saved on the computer for the agent | Unchanged |
| In-chat form | Typed into the computer's Chrome | Typed into the app's tab when the page is there |
| 1Password, saved logins | Read and typed on the computer | Typed by the app into its tab; the value never goes to the model |
| Take-over ("Your turn on the computer") | Opens the computer's screen | Opens the Computer tab on that exact tab, in Take Control; Done gives it back |
| Checkout: Review order, the bank check | Opens the computer, where the cart is | Opens the tab where the cart is |
| Checkout's card fill, Duffel's payment form | Typed into the computer's Chrome | Typed into the app's tab when the checkout is there |
| Auto-review of a browser step | Reads the computer's tabs | Reads the app's tabs for a step there |
| Chrome cookie import (Mac) | Brings Chrome's sign-ins to the computer | Kept; can also bring them into the app's browser |

Every card is tried in both places, the app's browser and the computer's,
before the browser is called done.

## Not breaking anything

- **Off by default.** With the server's switch off, or an app that doesn't
  say it has a browser (every app built before this), the engine takes
  today's route. An app newer than its engine does nothing new.
- **The computer's browser is not changed.** Its driver, tools, sign-ins
  and screen stay as they are. It is the route for every case the app's
  browser doesn't cover.
- **No silent moves.** A task never jumps browsers. A failure says what
  happened.
- **The same tools.** Names, arguments, snapshots and references are kept,
  so the agent's instructions and the routines written against them don't
  change.
- **Tests before each step lands:**
  - our own versions of OpenBot's scenarios above, run on the Windows app
    for real (Electron under `xvfb-run`, as the Windows checks already run);
  - the engine's route tested with a stand-in app;
  - the existing engine, web, Windows and core suites unchanged.
- **Nothing is done until it has run on a Mac and a PC.** Every card in
  both places, the take-over and a quit mid-task, signed in to real sites.
- **Nothing copied** from OpenBot (licence) or from the reconstruction
  (`desktop/NOTICE.md`).

## The order of work

Each step is its own pull request, read by a second reviewer, and tried on
a real machine before the next one starts.

0. **The founder's decisions** below.
1. **The route in the engine.**
   - The `local-browser` bridge, the hello's new field, the switch, and the
     `browser_*` tools sending to the app when it is there.
   - Tested with a stand-in app.
   - Off by default: nothing changes for anyone.
   - Reaches the cloud computers only once a host bundle is published from
     a Mac.
2. **The browser on Windows.**
   - Tabs, CDP, the snapshot, the queue, waits, sessions, popups, dialogs,
     downloads, looking like Chrome.
   - The Computer tab's browser view and Take Control.
   - Our own smoke tests.
3. **The cards on Windows.** The take-over, the form, 1Password and saved
   logins, the checkout.
4. **The Mac.** The browser (decision 1), the pane's view, Take Control,
   the quit alert.
5. **The iPhone.** The live picture and Take Control of a Mac's or PC's
   tab, through the server.
6. **Sign-ins for routines.** Handing the app's sign-ins to the computer,
   so a routine at night has them (decision 4).
7. **Switched on.** For the founder, then for everyone.

Later, and separate: the agents' thinking moving from the computer to the
server, so nothing waits on the computer at all (discussed 4 November 2026,
not decided).

## Decisions for the founder

All five decided as recommended: the founder, 4 November 2026, "go with
your recommendations".

| # | Question | Decided |
|---|---|---|
| 1 | **The Mac's browser.** (a) The same Chrome browser as Windows, run as a helper inside the Mac app, shown in the pane as a live picture. (b) Chrome built into the Mac app itself (CEF): more native, much more work. (c) Apple's WKWebView: ruled out, it can't be driven reliably. | (a): one browser for both, about 100 MB more in the Mac app |
| 2 | **Sign-ins.** Shared by all of a person's agents, or each agent its own | Shared, as on the computer today |
| 3 | **Quitting mid-task.** Ask, or always move to the computer | Ask |
| 4 | **Sign-ins for routines.** Hand the app's sign-ins to the computer: ask once per site, always, or never | Ask once per site |
| 5 | **OpenBot.** Build our own following its design, or buy a commercial licence | Build our own; none of its code |

## Progress

| Step | State |
|---|---|
| 0. Decisions | Done, 4 November 2026 |
| 1. The route in the engine | Built, tested with a stand-in app (`desktop/tests/app-browser-route.test.mjs`), off by default. Not yet on the computers: that needs a host bundle published from a Mac. Not run with a real app. |
| 2-7 | Not started |

Step 1, what was decided while building it (4 November 2026):

- **The switch** is `SIMEON_APP_BROWSER_USERS` on the server (e-mail
  addresses or user ids, `*` for everyone; empty is nobody). A listed
  person's computer gets `SIMEON_APP_BROWSER=1` each time it is made or
  replaced: a new account, an update of the computer (`RecreateSandBox`,
  its files kept) or a move between servers. A computer already running
  keeps what it had until then.
- **Uploads**: the engine reads the files on the computer, with the
  helper's checks, and sends them to the app, 25 MB at most together.
- **Auto-review** reads the app's list of tabs for a step there and refuses
  the step when it can't, as on the computer.
- **An answer from the app** wakes a sleeping computer, as local exec's
  does.
