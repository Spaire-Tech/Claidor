# The agents on the server, the computer as their hands

A plan, 4 November 2026. Step 0 (prove it) is done; what it found is in
[What step 0 found](#what-step-0-found-4-november-2026). Nothing else is
built yet.

## What the founder asked for

> "the computer should NOT BE USED FOR THINKING OR SIMPLE ACTIONS, LIKE
> TALKING TO THE AGENT or using connectors etc. … you should use the
> computer whenever the work cant be done thru a connector. websites,
> running code/commands, making files, logins that sticks, routine. one of
> the whole point of the computer is to be able to do work when the mac is
> off."

So:

- **On the server, always on, nothing to wake:** the agents' thinking,
  talking to them, connectors, memory, the cards, the routines' schedule,
  Discord and Slack replies, approvals.
- **On the computer, woken only for it:** websites (its Chrome and the
  sign-ins that stick there), running code and commands, making and keeping
  files, the screen for Take control.
- **While none of the person's devices is connected** (Mac, Windows PC,
  iPhone all off), the computer is where that work gets done. That covers
  routines, what comes in (an email, a Slack or Discord message, a
  listener's event), and tasks that keep going after the app is closed.
  The thinking stays on the server; the computer is woken for the steps
  that need it.

## How the app behaves when it is done

**Never wakes the computer:**
- opening the app on the Mac, the Windows PC or the iPhone: agents and
  chats are there at once;
- talking to an agent: the reply comes from the server;
- connectors (email, calendar, Slack, Notion…);
- memory, making or changing agents;
- answering a card (a question, an approval, a form, a draft), unless the
  card is about the computer itself;
- a routine that only uses connectors;
- an email or a message coming in that the agent can handle with
  connectors;
- opening a file an agent already made. Every finished file is copied off
  the computer to the server automatically, as soon as it is finished, and
  opens from there.

**Wakes the computer, in about a second:**
- a website (its Chrome, where the sign-ins stay);
- running code or commands;
- making or changing files on it;
- the person opening its screen or pressing Take control;
- a "Your turn on the computer" card.

**The sleep timer:** the computer sleeps 10 minutes after its work ends,
never in the middle of it. Two things keep it awake for as long as they
last:
- a job running on it;
- an open screen or Take control session.

Today a running job already keeps it awake (`BoxHealth.holds_awake`). An
open screen most likely does too, since its connection to the proxy does
not carry the app's "let it sleep" mark (`box_proxy.keep_attached`), but
that is not confirmed. Step 0 reached no real computer, so step 1 checks
both on the founder's.

**In practice:**
- **The person closes the app mid-task.** The agent goes on, on the
  server, and wakes the computer if it needs it. The result is in the chat
  next time, with a notification.
- **All devices are off.** Routines run at their time, emails and messages
  that come in are handled, and the computer does the website, code and
  file steps. It all waits in the chats.
- **A stranger writes.** The agent reads it and answers with no tools.
- **The computer restarts or updates.** Nothing breaks: cards, chats and
  tasks live on the server. Updates happen while it is quiet, and the logs
  say what happened.
- **The computer can't wake.** The agent says so in the chat, plainly. It
  never fails silently.

The browser in the Mac and Windows apps is not used: websites open on the
computer only.

## How it is today (read in the code, 4 November 2026)

- **The whole engine runs inside the computer.** `desktop/source/host` is
  started there by the supervisor (`box/bin/simeon-supervisor.mjs`,
  `SAND_HOST_IN_BOX=1`). Its data is there too: agents, chats, memory and
  settings, in `/home/box/sand-data`. So a message, a connector call or a
  card answer each need the computer awake. A card the engine keeps only in
  memory breaks when the computer restarts (#565).
- **Already on the server:**
  - the model calls (the API's metered proxy);
  - a copy of each chat, and the inbox for messages sent while the computer
    sleeps (#420);
  - the connectors' accounts (Pipedream and Composio hold them,
    `server/simeon/connectors`);
  - a copy of memory (`desktop/memory_merge.py`);
  - the Discord and Slack connections (the runner holds them; the computer
    replies).
- **The cloud runner** (`runner/`) answers queued jobs with one model call
  and no tools at all (`runner/README.md`). It is not a brain the agents
  could move into.
- **The engine reaches its "hands" through a network address.** The hands
  are the computer's exec daemon (`desktop/source/box-exec-daemon`). It
  runs commands, reads and writes files and starts the browser driver, at
  `127.0.0.1:1337`, with a token (`host/box/loopback-sand-box.ts`,
  `BoxEndpoint`). Each agent also has a window of its own on the computer
  (`box/bin/start-window`): a desktop on display :N with its own hands on
  `14000+N`, reached through the window router on `1339`
  (`box/bin/simeon-window-router.mjs`). The browser tools are a script the
  engine runs on the computer through the hands
  (`sand-browser-driver-source.ts`). Step 0 ran all of this from outside
  the computer; see below.

## What step 0 found (4 November 2026)

**The short answer: it works.** The engine, unchanged, ran outside a
computer. An agent's turn ran start to finish, and its command reached a
stand-in computer through the computer's own router and ran there. No real
server, model or computer was reached: the API and the model were stand-ins,
and so was the computer.

**How it was run.** All in a test machine (Linux), with the probe in
`desktop/scripts/agents-on-the-server/`:

- `build-host.mjs <dir>`: the engine built as `scripts/build-simeon.mjs`
  builds it (the engine, its four worker threads, the agent coordinator),
  in 2.6 s.
- `stand-in-api.mjs <port> <log>`: a stand-in for the API. It writes down
  every call. It answers the model credential and the model: the stand-in
  model asks for one Shell command, then tells the person what came back
  with SendMessage. Everything else gets 404.
- The stand-in computer: the real hands program (`hands-daemon.ts`, the
  daemon started by itself), the real window router
  (`box/bin/simeon-window-router.mjs` on 1339), and
  `stand-in-start-window.sh` in place of `/usr/local/bin/start-window`. It
  starts a window's hands program but no screen, since the test machine
  has none.
- `hands-client.ts`: the engine's own client, driving the hands program
  directly over the network.

The engine was started with its data in a folder of its own
(`SAND_DATA_ROOT`), its gateway on a local port with a token, and
`SAND_BACKEND_URL` pointing at the stand-in.

**What was measured:**

| | |
|---|---|
| Engine start, to its gateway answering | about 1 s |
| Engine at rest | 244 MB of memory, 0.4% of one CPU |
| Engine during a turn | 350–380 MB at the most; about 0.3 s of CPU per turn |
| An app command through the gateway (status, the agent list) | 2–5 ms |
| A whole turn (message, command, reply), the agent's window already open | about 460 ms |
| From the model asking for the command to its result going back | 86–88 ms, two safety checks included |
| The command itself on the computer | 8 ms |
| The first command of an agent's turn, its window not yet open | about 400 ms more (start-window) |
| The hands program directly, over the network (step 0b) | ping 15–22 ms, a command 12 ms, a file read 5–6 ms |

The stand-in model answers at once, so a real turn is as slow as the real
model plus these numbers. The distance to E2B through the API's proxy is not
in them; it is measured in step 1.

**What the engine asks of the server** (one start and four turns): the
model and its credential, the model list, the chat copy, the inbox, memory,
routines' events, teams, skills, plugins, privacy mode, notifications,
sharing and channels. All of them are the API's own routes. None is the
computer.

**Where an agent's work lands.** `Shell` ran in the agent's window on the
computer, in `/workspace`, through the router on 1339. A file it made was in
the computer's `/workspace`, not on the engine's machine. `ExternalShell` and
`ExternalRead` are the Mac's own hands (the local-exec line) and are
unchanged by this plan.

**What has to change for step 1.** Each one was found by running it:

1. **Where the engine finds its hands.** Today it dials `127.0.0.1:1337` and
   `127.0.0.1:1339` with the token `local` (`loopback-sand-box.ts`,
   `box-windows.ts`). From the server it must dial the person's computer
   through the API's proxy, with a token that is that computer's own, over
   https and a path, not `http://host:port`. One door is enough: the router on
   1339 already sends a request without a window header to the main hands
   program.
2. **The router's door, opened only to the brain.** Today nothing outside
   the computer can reach 1337 or 1339. E2B's public traffic is off
   (`box_e2b.py`, `allow_public_traffic: False`), and the API's proxy
   forwards only 1340, 6080, 6081 and 8790 (`box_hosts.py`, `BOX_PORTS`).
   Step 1 adds 1339 for the brain alone. The hands behind the router accept
   `local`, so the router must check the computer's own token before passing
   anything on.
3. **Files are written through the shell.** The hands program has no write
   call (`writeArgs` is refused), so the engine's writes already go through
   the shell. Over the network that took 75 ms for 100 KB in 30 KB pieces;
   one long command fails (`E2BIG`).
4. **Six places check `SAND_HOST_IN_BOX`** (the plan said five before it
   was run):
   - the engine updating itself (`host-upgrade`): off on the server, since
     Render deploys it;
   - sending its log from the computer (`box-log-shipper.ts`): off, since
     Render keeps the log;
   - **phone notifications: today only an engine inside a computer sends
     them** (`mobile-push-notifier.ts`), so the brain must send them;
   - the computer's rebuild and update (`forever-box`), which today assumes
     it runs on the computer it rebuilds;
   - the computer's disk check (`forever-box`): it belongs to the computer,
     not the brain;
   - writing the agents' reference pages (`/home/box/reference`: the
     computer guide, the app guide, the routines guide), which agents read
     on the computer. The brain must write them to the computer through
     the hands, or the computer image must carry them.
5. **The engine must not start a hands program of its own.** It does so
   unless `SAND_USE_EXISTING_BOX_EXEC_DAEMON=1`. With that set it also uses
   the agents' own windows, as on the computer.
6. **Its native parts.** The command parser (tree-sitter) is loaded from
   the installed packages (`SAND_TREE_SITTER_NODE_DEPS`, `NODE_PATH`), so
   the brain's image installs them.
7. **The computer has to be awake.** Start-window, the router and the hands
   all live on the computer. When it sleeps, the engine's command waits for
   the wake (step 1: "asks the API for the computer").

**Not verified in step 0:**

- the founder's real computer, through the API's proxy (step 1);
- a real model;
- the browser driver and a real Chrome: they go over the same shell path,
  but the test machine has no screen;
- a file read through an agent's `Read` (read was checked through the
  client only, at 5–6 ms);
- connectors (the stand-in answered 404).

## The design

**One engine, moved, not rewritten.** The same engine runs on Simeon Labs'
side, one process per person. The apps keep talking to it the way they do
now, through the API's proxy (`box_proxy.py`). Only where the proxy sends
them changes, from the computer to the person's engine. No app is rebuilt.

**Its hands are the computer.** When a step needs the computer, the engine:

1. asks the API for the computer, which wakes it in about a second on E2B;
2. sends the step to the computer's exec daemon, through the proxy, with
   the computer's token;
3. lets the computer go back to sleep when the work is done.

| Stays on the computer | Moves to the person's engine on the server |
|---|---|
| Shell and code (`Shell`), files in `/workspace` (`Read`, `Write`, `Edit`, file transfer) | Thinking and replies, sub-agents |
| Chrome and its sign-ins (browser tools, browser-use and computer-use helpers, checkout, Duffel's pay page, 1Password and saved-password fills) | Connectors (Pipedream and Composio's remote servers) and web search and fetch |
| The screen, Take control, the video helper | Memory, settings, the agents and their chats (`sand-data`) |
| Connectors that only run as a program on the computer (`LoadMcpServers`) | Cards and approvals, `SendMessage`, drafts, reactions, forms, secrets |
| | Routines' schedule, listeners, Discord and Slack replies, sharing |

**Where it runs.** A new Render service, "the brain". It runs one engine
per person, starts it when the person or a routine needs it, and stops it
after a quiet while. Each person's data sits on the service's disk, backed
up the way the computer's is (`box_store.py`, S3). It runs no command of
the agent's: those all go to the computer.

## Not breaking anything

Simeon has one person on it, the founder ("ive no customer. its just me"),
so there are no switches for other people and no step for "everyone".
Two rules hold:

- **The founder's data is backed up before anything moves**, and the
  computer's engine is kept until the new one works.
- **Every step logs what it decided**, so nobody has to guess from outside,
  as on 4 November. Each step is checked on the founder's Mac: sending a
  message, using a connector, opening a website and running a routine.

## The order of work

0. **Prove it. Done, 4 November 2026** ([what it found](#what-step-0-found-4-november-2026)).
   The engine ran outside a computer against a stand-in computer, with its
   memory, CPU and speed measured and the list of changes written. The
   founder's computer through the proxy moved into step 1, so that step 0
   reached nothing real.
1. **The brain service.** The founder's engine on Render, with their data
   copied from their computer's backup. The proxy sends
   their apps to it; their computer is reached only for its hands. It
   carries the seven changes step 0 found. Checked by talking to an
   agent and using a connector with the computer asleep, then opening a
   website, which wakes it, with the time each step takes through the
   proxy written down. Started 5 November 2026 on the founder's "go ahead
   with step 1"; [its pieces](#step-1-in-pieces) are below.
2. **Cards on the server.** Hand-offs, approvals and permission prompts
   live in the engine's data, not its memory, so a restart can't strand
   them.
3. **Routines, listeners and channels** run on the brain. The computer is
   woken only for the steps that need it, whether the Mac is open or not.
   The runner's routine jobs become the brain's; mail from strangers
   follows decision 3.
4. **Files.** Every finished file is copied off the computer to the
   server automatically, so opening it never wakes the computer.
5. **The computer as hands only.** The engine is no longer started on the
   computer. The computer image keeps the exec daemon,
   Chrome, the screen and the files. Most of this comes with step 1 (the
   engine's `hands` role, 1a); step 5 removes what is left.

### Step 1, in pieces

Reading the code for step 1 (5 November 2026) found four things step 0's
list missed:
- **The computer's files are backed up by the engine.** `/workspace`,
  Chrome's sign-ins and the command-line tools' settings are copied to the
  backup by the engine on the computer (`box-store-sync`, its categories
  `workspace`, `chrome-profile`, `cli-config`). A computer the server
  rebuilds gets them back from that backup. So a small part of the engine
  has to stay on the computer, or a rebuild would lose them.
- **Two engines must not both answer.** If the computer's engine kept
  running beside the brain, both would read the same inbox and run the
  same routines, and every message would be answered twice.
- **The sleep timer asks the computer's engine whether it is busy**
  (`/health`). With the agents on the brain, it has to ask the brain, or
  the computer could sleep in the middle of one of the brain's commands.
- **The Computer tab gets the computer's state and screen address from
  the engine** (`getForeverBoxStatus`). On the brain, the engine has to
  read them from the server.

Each piece below is safe by itself. Nothing changes for the founder until
1e turns it on, and turning it off puts everything back on the computer.

- **1a. The engine's two roles.** One setting, `SIMEON_ENGINE_ROLE`:
  - `brain` (on Render): everything the person talks to. It reaches the
    computer through the API, sends phone notifications, writes the
    agents' reference pages onto the computer, reads the computer's state
    from the server for the Computer tab, and backs up its own data;
  - `hands` (on the computer): only what has to stay there. That is backing
    up and restoring the computer's files, the disk check and the log. No
    agents, no inbox, no routines;
  - not set: as today.

  **The backups, kept apart.** A person's backups are kept by source
  (`box_store.py`: `store_id(user, source)`), and the server makes a store
  for any source it is given. A store has one record of what it holds, and
  each backup run also clears the agents' databases it does not find on its
  own disk (`pruneMissingAgentStoreDbs`). So if a computer with no agents
  backed up into the agents' store, it would erase them. Therefore:
  - the brain backs up the agents and chats (`sand-data`) to a store of its
    own. The first time, it brings them in from the computer's store;
  - the computer backs up only its files (`workspace`, `chrome-profile`,
    `cli-config`) to its own store, as today, and never runs the agents'
    part. The agents' copy already in the computer's store stays as it was
    at the switch: it is the way back if the brain is turned off.

  **Part 1, the hands through the API: done, 5 November 2026.** Two
  settings, `SIMEON_HANDS_URL` and `SIMEON_HANDS_HEADERS`
  (`box-remote-accessor.ts`, `boxHandsRouteFromEnv`). When they are set,
  every call to the computer goes to that address, with those headers
  added. A half-set or malformed one stops the call with a message naming
  the setting, never its value. Checked on the test machine:
  - the computer's usual ports (1337, 1339) were closed and its hands and
    router ran on other ports, so nothing could reach them directly;
  - a stand-in for the API's door (`stand-in-api.mjs`, `/hands`) forwarded
    calls to the router;
  - a turn ran: 11 calls to the computer, all through the door, first to
    the main hands program and then to the agent's own window; the file was
    made in `/workspace`;
  - without the brain's token, the door answered 401.

  The tests are in `desktop/tests/hands-route.test.mjs`.

  **Part 2, the computer's `hands` role: done, 5 November 2026.**
  - `SIMEON_ENGINE_ROLE` (`engine-role.ts`): `hands`, `brain`, or not set
    (the whole engine). An unknown value is the whole engine, and the
    start's log line says so.
  - With `hands`, the engine's start makes the keeper (`hands-keeper.ts`) in
    place of the whole engine. Everything else at start is unchanged: the
    backup is copied in at boot, the data folder is locked, and the gateway
    answers the server on 1340.
  - The keeper runs the computer's backup and answers `/health` (never
    busy), `snapshotBoxStoreNow` and `getBoxStoreStatus`. At start it writes
    the agents' reference pages into `/home/box/reference`, as the whole
    engine does. Nothing else: no agents, no inbox, no routines, no chat
    copy.
  - Phone notifications are sent by the engine that runs the agents: the one
    in a computer, as before, or the brain (`mobile-push-notifier.ts`). The
    keeper sends none.
  - What each role backs up (`boxStoreCategoriesForRole`): `hands`
    everything but the agents' folder; `brain` the agents' folder alone;
    not set, everything. Without the agents' folder, the backup's sweep and
    clearing of the agents' databases do nothing (`store-db-capture.ts`
    returns before reading anything).
  - The computer passes its settings on to the engine (the supervisor's
    `{...process.env}`), so the server sets the role when it makes the
    computer (step 1c), with no change to the image for this.

  Checked:
  - in tests (`desktop/tests/engine-roles.test.mjs`, 5 tests):
    - the roles;
    - each role's folders, on the engine's real folder list;
    - on the computer, the agents' databases are neither swept nor
      cleared, and the backup's record and storage are not touched;
    - the keeper's answers;
    - the start makes the keeper and nothing of the whole engine;
  - with the built engine on the test machine (`SIMEON_ENGINE_ROLE=hands`,
    backups on, the stand-in API):
    - its gateway answered after about 1 s;
    - `/health` said not busy;
    - `snapshotBoxStoreNow` answered;
    - a message sent to it was refused;
    - it wrote the 3 reference pages;
    - it made three calls to the server: the credential, the privacy
      setting and the backup's store. There was no chat, inbox, routine or
      model call, so nothing can be answered twice;
  - the stand-in has no storage, so its backup runs failed. A real backup
    in the `hands` role is checked on the founder's computer in 1e.

  It uses about 240 MB, as the whole engine does at rest: the engine's
  bundle loads all its code even when the keeper uses little of it.

  **Part 3, the brain's own needs: done, 5 November 2026.**
  - **What the brain brings in at its first start** (`copyInKeepsRelPath`,
    `box-copy-in.ts`): only the agents' folder from the backup. The
    computer's files and Chrome's sign-ins stay on the computer. The
    restore's log says how many of the backup's files it took.
  - **The Computer tab's state** (`readBoxRunStateThroughRoute`): the brain
    asks `GET {SIMEON_HANDS_URL}/state`. The API answers it from its own
    record and never wakes the computer for it (1c). The answer is in the
    apps' words: `running`, `hibernated` (shown as asleep) or `absent`.
    When the server can't be asked, the answer is `running`, which is what
    the engine on the computer always says.
  - The screen's address needs no change: the apps already turn the
    engine's `127.0.0.1:6080` address into the API's own
    (`Gateway.swift`, `screenSocket`).

  Checked:
  - in tests (`desktop/tests/brain-role.test.mjs`, 5 tests): what each
    role brings in; a restore with three files in the backup downloads
    only the agents' one; the state in each answer, including the server
    being down;
  - with the built engine as the brain: with the stand-in door answering
    "asleep", the Computer tab's call (`getForeverBoxStatus`) said
    `hibernated`, and nothing was sent to the computer.

  The brain's own backup store needs no code: its start script sets
  `SAND_BOX_STORE_ID` to a source of its own (1d).

**1b, the computer's router: done in the code, 5 November 2026; the image
is not rebuilt yet.** On a computer in the `hands` role, the router on 1339
lets a call through only with the computer's own gateway token in
`x-simeon-box-token`. The server gave the computer that token
(`SAND_GATEWAY_TOKEN`) and alone holds it. The router takes the header off
before the call goes on. Without the token, or with a wrong one, it answers
401. A computer in the `hands` role with no token of its own refuses every
call. In any other role nothing changes. The supervisor needs no change:
the router and the engine get the computer's settings, the role among them,
as they are (`{...process.env}`).

Checked:
- in tests (`desktop/tests/window-router-box-token.test.mjs`, 3 tests),
  with the real router script and a stand-in hands program;
- end to end on the test machine: the brain, then the stand-in door
  (which adds the token, as the API's door will), then the real router in
  the `hands` role, then the hands program. A turn's 11 calls went through
  and the command ran; a call straight to the router without the token was
  refused.

The computer's image has to be rebuilt before the router changes on a real
computer. That takes three steps:
1. **Box image** in GitHub Actions, run by hand (`.github/workflows/box_image.yml`);
2. its name and digest copied into `SIMEON_BOX_IMAGE` and
   `SIMEON_BOX_IMAGE_DIGEST` on Render;
3. the E2B template rebuilt (the **E2B template** workflow, or
   `bash box/e2b/build-and-check.sh`).

GitHub Actions jobs have failed within 3 seconds, with no log, since #560,
so this may need the founder. Until then a computer in the `hands` role
would still run the old router, so 1e waits for the rebuild.
- **1b. The computer image.** The router on 1339 lets a request from
  outside the computer through only with the computer's own gateway token,
  which the server already holds. The supervisor starts the engine as
  `hands` when the server says so. The image is rebuilt once.
- **1c. The server.** For a person on the brain (a list of e-mail
  addresses in one setting; today only the founder's):
  - the apps' calls go to the brain, not the computer, and never wake it;
  - a door to the computer's router for the brain alone, with its own
    token; it wakes the computer first;
  - the sleep timer asks the brain whether a job is running;
  - the brain is given the person's tokens and model credential when it
    starts;
  - the computer is made with the `hands` role: rebuilt once, its files
    kept from the backup.
  **Part 1, the brain's own routes: done, 5 November 2026.**
  - Three settings: `SIMEON_BRAIN_USERS`, `SIMEON_BRAIN_URL`,
    `SIMEON_BRAIN_TOKEN` (`docs/services-core.md`, "The brain"). With any
    of them empty, nothing changes for anyone.
  - `POST /sand-box/brain/bootstrap` gives the brain what it starts the
    person's engine with.
  - `GET /sand-box/brain/hands/state` gives the computer's state from the
    record.
  - The brain's credential is new (`issue_brain_credential`, user agent
    `simeon-brain/`). It can't share the computer's: a renewal replaces the
    credential's one access token, so two holders would keep cancelling each
    other. It is kept beside the computer's as the Mac's local helper's is
    (`kept_beside_the_box`): neither revokes the other, and both move to
    another signed-in device when one signs out.
  - Checked in tests (`server/tests/sand/test_brain.py`, 7):
    - the refusals;
    - what the brain gets;
    - the brain's credential and the computer's both renewing;
    - a new brain credential replacing the last one but never the
      computer's;
    - a new computer credential never revoking the brain's;
    - the state.

    The desktop and computer suites pass except 10 model and proxy tests,
    which fail the same way on `main`.

  **Part 2a, the door to the computer's hands: done, 5 November 2026.**
  - Every path under `/sand-box/brain/hands/` except `state` goes to the
    computer's window router on 1339 (`simeon/sand/brain.py`, `hands`). The
    brain's `SIMEON_HANDS_URL` is `https://api.simeonlabs.com/sand-box/brain/hands`.
  - It checks the brain's token and the person's user id. It adds the
    computer's own token (`x-simeon-box-token`, the router's check from 1b)
    and E2B's traffic token, and drops the brain's headers.
  - A computer the record says is asleep is woken first, under the person's
    lock (`broker.wake_locked`), as the apps' proxy wakes one for an
    answer. A call E2B turns away because it lost the computer (paused
    under the call) is woken and sent again, for up to 40 s. It never
    reached the computer, so it can't run twice.
  - While a call is open the computer counts as in use, so the sleeper
    leaves it. A long command waiting for its answer counts too.
  - The engine sends its bearer for the hands (`local`) as it came. The
    API's sign-in layer would have refused it with a 401 before the door
    ran, as it did on the apps' proxy on 28 September. The door's paths are
    now left to the door (`is_box_proxy_path`).
  - Only E2B computers have the door: Docker publishes only the apps' ports.
  - Checked in tests (`server/tests/sand/test_brain.py`, 6 more, and
    `test_box_proxy_auth.py`, 2 more):
    - what the computer receives: the path, the query, the body, the
      engine's headers, the two tokens, and none of the brain's headers;
    - a sleeping computer woken first;
    - a lost one woken and the call sent again;
    - the router's refusal passed back;
    - a full E2B account and an update in progress each answered with
      a retry time;
    - the refusals.

    The sign-in layer test fails without the change.
  - Not checked: a real E2B computer (the router on a real computer is
    still the old one until the image is rebuilt, 1b), and how long a call
    takes through the API (`sand.brain.hands.call` logs it).

  **Part 2b, the apps reach the brain: done, 5 November 2026.** No change
  in the apps; the server routes them (`simeon/sand/brain_users.py` says
  who is on the brain).
  - The apps' calls to the engine's port (1340) go to the brain's gateway
    (`SIMEON_BRAIN_URL`), at the address the apps already keep, with their
    own bearer and none of the computer's tokens. They never wake the
    computer and never count as it in use. The screen and the tunnel still
    go to the computer.
  - `EnsureSandBox` answers with the computer as recorded and never wakes
    it, with `letsSleep: false`. The apps' sleep rule (step 4 of the
    computer-as-worker work) then never holds them back: the agents are
    always reachable, whatever the computer is doing. A computer the record
    says is gone is still made, as before.
  - The Computer tab still works. The engine reads the computer's state from
    the record (1a part 3). Opening an agent's screen asks the engine
    (`ensureForeverBox`), and the engine wakes the computer through the
    door.
  - Incoming work (a message, a routine, a Slack event) no longer wakes the
    computer (`sand.box.wake.on_brain`). The brain's engine is always on and
    takes it.
  - Whether someone is on the brain is read once a minute per person,
    not at every call, and not at all while nobody is.
  - One brain serves one person today, so `SIMEON_BRAIN_USERS` lists one
    address. A second person's apps would be refused by the brain's gateway
    (their bearer is not the one it holds), never shown the first person's
    agents. Several people on one brain needs a way to find each person's
    engine: later.
  - Checked in tests (`server/tests/sand/test_brain.py`, 6 more):
    - the engine's port goes to the brain and the screen to the computer;
    - someone not listed still reaches their computer;
    - the brain down answers 502;
    - `EnsureSandBox` and the record never wake and say `letsSleep: false`;
    - a gone computer is still made;
    - incoming work leaves the computer asleep.

    Three of them fail without the change.

  **Part 3, the computer as hands only: done, 5 November 2026.**
  - A computer for a person on the brain is made in the `hands` role. The
    server records it three ways:
    - `SIMEON_ENGINE_ROLE=hands` in its settings;
    - the `com.simeonlabs.engine-role` label (E2B metadata);
    - `engine_role` in the row's `host_meta`, so the door and
      `EnsureSandBox` can tell without asking E2B.
  - A computer with another role than the person's is out of date, as one
    made without the browser was (#563). It is made again once, on its
    files, after a fresh backup. Nobody else's computer changes: with no
    role expected and none given, nothing is out of date.
  - For a person on the brain, `EnsureSandBox` answers from the record only
    once the computer is hands. Before that it runs the usual ensure, which
    makes it again.
  - The door refuses a computer that isn't hands yet (409
    `computer_not_hands`): its own engine would run the agents next to the
    brain's.
  - **Decision: the sleeper doesn't ask the brain.** The plan had the sleep
    timer ask the brain whether a job is running. It isn't needed: the door
    already counts the computer as in use while the brain uses its hands,
    and for 3 minutes after. Asking the brain would keep the computer awake
    through turns that use only connectors, which is the cost this work
    removes. If a long turn pauses between two commands, the computer may
    sleep and is woken by the next command. E2B keeps its memory, so the
    programs on it carry on. The founder may overrule this.
  - Checked in tests:
    - `test_box_broker.py`, 3: a person on the brain gets a hands computer,
      and asking again makes nothing; everyone else gets no role; a
      computer made before is made again as hands, once, on the same
      volumes, and again without a role when taken off the list.
    - `test_brain.py`, 2: the door refuses a computer that isn't hands, and
      `EnsureSandBox` makes such a computer again.
- **Switching it on, in this order** (1e; each step needs the founder):
  1. Rebuild the computer image (1b), so the router checks its token.
  2. Make the brain service on Render (1d) without starting it. Set
     `SIMEON_BRAIN_USERS`, `SIMEON_BRAIN_URL` and `SIMEON_BRAIN_TOKEN` on the
     API. From then on the apps' calls go to the brain, which isn't up yet,
     so do steps 3 and 4 straight away.
  3. In the app, Settings → Computer → Rebuild (files kept). The computer is
     backed up and made again as hands. That fresh backup is what the brain
     brings in.
  4. Start the brain. At its first start it brings the agents and chats in
     from the computer's backup, then backs up to its own store.
  5. Check on the Mac: a message and a connector with the computer asleep,
     then a website, which wakes it.
- **1d. The brain service.** Its Dockerfile and start script in the repo,
  and the settings to make it on Render: a private service in Oregon,
  2 GB, a 1 GB disk. The founder makes it in Render's dashboard (nothing
  here can reach Render), and adds the brain's token to it and to the API
  without pasting it anywhere.
- **1e. On for the founder.** A fresh backup first. The brain brings the
  founder's agents and chats in from it, then the switch is turned on. It
  is checked on the founder's Mac: a message and a connector with the
  computer asleep, then a website, which wakes it.

## Decisions (taken 4 November 2026; the founder may overrule)

1. **Where it runs:** a Render service, one engine process per person. Today
   that is one process.
2. **The browser in the app** (`docs/app-browser/`): off while this is
   built, with the code kept. Websites go back to the computer's Chrome.
3. **Mail and messages from strangers:** the runner's no-tools rule stays.
4. **A routine that only uses connectors** runs on the server and never
   wakes the computer.

## What is not known yet

- How long a step takes through the proxy to E2B. Inside the test machine,
  the command's round trip was 86–88 ms; step 1 measures it for real.
- The cost on Render. Step 0 measured the engine at 244 MB at rest and
  under 400 MB during a turn, and nearly no CPU at rest. That fits a
  1 GB service with room to spare; the price is read when step 1 picks the
  plan.
- Whether an open screen keeps the computer awake (step 0 did not reach a
  real computer).
