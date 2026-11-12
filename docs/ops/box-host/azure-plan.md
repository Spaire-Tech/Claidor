# Moving the cloud computers from E2B to Azure

The plan for moving each person's cloud computer from E2B to Azure Container
Apps Sandboxes (12 November 2026). The founder asked for it after Microsoft
gave Simeon Labs $5,000 of Azure credits: "I need you to study it deep and come
back with an absolutely solid plan that won't break anything."

The plan comes from two sources:

- **Our own code:** what the server, the computer image and the engine take
  from E2B.
- **Microsoft's documentation:** all 46 pages of `sandboxes.azure.com/docs`,
  the Learn pages, the REST API specification (`2026-09-01-preview`), the
  Python SDK's source (`azure-containerapps-sandbox` 0.1.0b4), the samples
  repository and the open GitHub issues.

Nothing here has run on Azure yet. Every fact Microsoft doesn't document is
marked **unknown**, and each unknown becomes a test in step 1, before anyone's
computer moves.

## The short version

- **The design matches E2B's.** Azure has what we use on E2B: one small virtual
  machine per person, frozen whole when it sleeps and back in a few seconds,
  billed by the second only while awake.
- **The move between providers is already built.** Our server can move a
  person's computer through its backup. The old computer is paused, not
  deleted, and a move that fails leaves the person where they were. Moving is
  one setting per person, and so is going back.
- **Four things must be proven before anyone moves** (step 1):
  - The desktop with Chrome runs.
  - The screen and the app's live connections pass through Azure's ports.
  - A frozen 4 GB computer wakes reliably. An open Azure bug says it sometimes
    doesn't.
  - The ports can be locked so only our server reaches them.

  If the first three fail, we stay on E2B and lose nothing. If the lock fails,
  we stay on E2B too, because no computer can sit on a port anyone can reach.
- **Cost:** about $0.22 per awake hour for our size (E2B: $0.17). The credits
  cover about 23,000 awake computer-hours. They must be activated within 90
  days and spent within 180 days of activation.
- **Timing:** launch on E2B. Steps 0 to 2 can be done now without touching
  anyone's computer. People move after the launch week, the founder first.

## 1. What our code takes from E2B

The server talks to a computer through one interface, `BoxHost`
(`server/simeon/sand/box_hosts.py`). E2B is one implementation of it
(`server/simeon/sand/box_e2b.py`, 577 lines); the Docker servers are the
other. The rest of the server only sees the interface, plus five E2B-specific
spots:

- `box_service.dial_headers` and `internal_url`: the per-port address and the
  traffic token header.
- `box_proxy.sandbox_gone`: E2B's 502 "The sandbox was not found".
- `box_service.hibernate_idle`: `keep_alive`, which pushes E2B's timeout out
  every minute.
- `box_service` placement (`_listed_on`, `place`, `_move_if_listed`): who goes
  to which server.
- `box/e2b/`: the template build and check; `box/bin/start-simeon-vm`: the
  computer's start.

The engine on the computer knows nothing of E2B, except that its gateway reads
its password from the `Authorization` header (`host/gateway-server.ts`,
`isAuthorized`). That matters for the port lock (section 3).

| What the server does | On E2B today | On Azure | Known? |
|---|---|---|---|
| Make a computer | `AsyncSandbox.create` from a template, public traffic off, pause on timeout | `PUT /sandboxes` from a disk image: 2 cores, 4 GiB, 40 GiB disk, labels, auto-suspend off | Documented |
| Write the person's settings and the engine | `files.write` as root | `write_file`, which writes as root (issue #1820) | Documented |
| Run a command as root | `commands.run(user="root", timeout=…)` | `executeShellCommand` with `user`; the SDK can't set the user, the REST API can; no documented timeout | Partly: long commands run detached, and the server reads their result from a file |
| Start the desktop and the engine | `setsid -f start-simeon-vm` | The image's own start (Azure runs ENTRYPOINT at boot): a small script that waits for the settings, then runs `start-simeon-vm` | Documented that the entrypoint runs; test it |
| Put to sleep | `pause`: the whole machine frozen | `POST /stop` in Memory mode (it returns a snapshot) | Documented; open bug #1869 |
| Wake | `connect`, then set the clock | `POST /resume`, wait for `Running`, then set the clock | Documented "under a second" to "~2 seconds"; clock unknown |
| Read the state | `get_info`: running or paused | `GET` sandbox: `Running`, `Stopped`, `Suspended`, `Resuming`, `Stopping`, `Creating`, `Deleting` | Documented |
| Keep awake | `set_timeout` every minute | Nothing, with auto-suspend off; whether there is a maximum lifetime is unknown | Unknown: test 24 hours awake |
| Remove | `kill` | `DELETE` | Documented |
| Find by name | `list` by metadata | `list_sandboxes(labels=…)` | Documented |
| Reach a port | `https://<port>-<id>.e2b.app` with `e2b-traffic-access-token` | `https://<id>--<port>.<region>.adcproxy.io`, each port locked to our server's identity (section 3) | Documented, except WebSockets and long connections |
| A computer that has vanished | 502 "The sandbox was not found" | Unknown answer | Measure in step 1 |
| Full or too busy | `RateLimitException`, `ServiceBusyException`, shown as "computers all in use" | 429, or a quota error (`HttpResponseError`) | Map them in step 2 |
| New engine on a running computer | Files written beside the old ones, then `update-engine.sh` (up to 120 s) | The same script, run detached, its last line read from a file | Same script |
| Build the image | E2B template from box2's image (`box/e2b/build_template.py`) | Our image on top of box2's (pinned digest), pushed to an Azure registry, turned into a disk image | Documented; conversion "can take several minutes" |

## 2. What Azure Container Apps Sandboxes is (facts, with sources)

- **Machines:** "a hardware-isolated microVM" with its own kernel. Starts in
  under a second from a cached image. Each machine has its own CPU, memory,
  disk and network.
  [overview](https://learn.microsoft.com/en-us/azure/container-apps/sandboxes-overview)
- **Sizes:** L is 2 cores, 4 GiB and 40 GiB of disk, our size today (E2B gives
  15 GiB of disk with 9.6 free). Sizes go up to 16 cores and 32 GiB. The disk
  allowed grows with the cores.
- **Sleep:**
  - **Memory mode** keeps "full sandbox state, including memory": Chrome's
    tabs and every program come back as they were.
  - **Disk mode** keeps only the disk and restarts the machine.
  - Every stop writes a snapshot. Stopped machines cost no compute.
  - Microsoft's advice: "Don't use sandbox memory or local disk as your only
    durable data store." Our backup (`box_store.py`) is that second store.

  [lifecycle](https://learn.microsoft.com/en-us/azure/container-apps/sandboxes-snapshots-state-management),
  [reliability](https://learn.microsoft.com/en-us/azure/reliability/reliability-container-apps-sandboxes)
- **Auto-suspend:** default 300 s. We turn it off and keep our own sleeper, as
  we do on E2B. The SDK turns it on at every create, so it has to be turned
  off right after.
- **Ports:** HTTPS only, upstream HTTP/1.1 or HTTP/2, no plain TCP. Each port
  can require a Microsoft Entra token and be limited to one identity. The proxy
  removes that token before the request reaches the machine. WebSockets, idle
  timeouts and request size limits are not documented.
  [ingress auth](https://sandboxes.azure.com/docs/sandboxes/sandbox/ingress-auth)
- **Images:** any OCI image, from a public or private registry, converted into
  a disk image.
- **Limits:**
  - **Machines awake at once:** 300 running cores per region per subscription
    by default. That is 150 machines at our size, against E2B's 100 on Pro.
    Stopped machines don't count. Raising it takes a support request.
  - **API calls:** 3,000 per minute.
  - **Machines per group:** 100,000.

  [limits](https://sandboxes.azure.com/docs/sandboxes/limits)
- **Regions:** 40, including `westus3` (Arizona, near Render's Oregon) and
  `westus2`.
- **Maturity:**
  - Announced generally available on 23 September 2026, but the data-plane API
    is `2026-09-01-preview` and the Python SDK is 0.1.0b4, "Community preview".
  - No SLA, no zone redundancy, one region.
  - Microsoft said a stable SDK would come by Ignite (November 2026).

  [reliability](https://learn.microsoft.com/en-us/azure/reliability/reliability-container-apps-sandboxes)
- **Open bugs that touch us:**
  - **#1869 (26 October):** two machines auto-suspended in Memory mode could
    not be resumed. The resume answered 409 and then 504, for hours. A second
    report came on 28 October. No answer from Microsoft. This is the feature
    we depend on most.
  - **#1749:** under Azure's outbound inspection, its certificate goes stale on
    long-lived machines. We run with no outbound policy, so this shouldn't
    apply; we check in step 1.
  - **#1820:** the files API writes as root. That suits us.
  - **#1761:** data disks can't attach. We don't use them.
- **Chrome:** another user runs Chrome inside a sandbox (#1826, a certificate
  problem fixed on 22 September). Microsoft's own "computer use … watch live
  via noVNC" sample is listed in its samples index but missing from the
  repository. Nobody documents a desktop with VNC.

## 3. Locking the ports

On E2B, each computer's ports refuse anyone without its traffic token, and
only our server has it. Azure has no token like that. It has two locks, and
we use both:

- **The real lock: an Entra token per port, limited to our server's own
  identity.**
  - Our server gets the token from Microsoft with its own credential (a
    service principal) and sends it as `Authorization: Bearer …`.
  - A missing token gets 401; another identity gets 403.
  - The SDK can't set "this identity only", so the server calls the REST API
    directly.
- **A second fence: only Render's outbound addresses.** Render shares those
  addresses with its other customers, so this is never the only lock.

**The conflict:** the engine's gateway reads its own password from the same
`Authorization` header, and Azure removes that header after checking its
token. So for computers on Azure:

- **The server:** our proxy moves the app's own `Authorization` into a header
  of our own (`x-simeon-box-authorization`).
- **The engine:** the gateway accepts its password from that header as well as
  from `Authorization`. One small engine change, released before anyone moves.
- **The screen ports:** the screens (6080, 6081) and the tunnel (8790) keep
  their own tokens. Step 1 checks each of the four ports.

## 4. The steps

Each step says what it changes for people, how we know it worked, and how to
go back.

### Step 0. The Azure account (the founder; nothing changes for anyone)

I'll give the exact clicks when we start. None of it needs a key in chat; the
secret goes straight from Azure into Render.

1. **Activate the credits** on a subscription, and note the end date (180 days
   from activation).
   - Microsoft for Startups wants a personal Microsoft account.
   - The Sandboxes portal says personal accounts aren't supported. Our server
     signs in as its own identity (an app registration), not as a person, so
     this should not matter. It is the first thing step 1 checks.
2. **Create a resource group** in `westus3`. It's closer to Render than most
   regions and cheaper than `westus2` ($0.000024 per core-second against
   $0.000034).
3. **Create a sandbox group** in it (portal → Container Apps → Sandboxes).
4. **Create a container registry, Basic** (about $5 a month).
5. **Register an app** for our server. Give it the role "Container Apps
   SandboxGroup Data Owner" on the sandbox group, plus pull rights on the
   registry, and make a client secret.
6. **Ask for more cores:** about 1,000 cores in `westus3`, which is 500 awake
   computers. Do it before we need them; the request goes through support.

### Step 1. Proof on a test computer (me, then the founder runs one script; nothing changes for anyone)

**What gets built:**
- `box/azure/Dockerfile`, which adds to box2's image (the pinned digest E2B
  uses today):
  - `start-simeon-vm`;
  - an empty machine id;
  - a small start (`simeon-vm-init`) that waits for the server to write the
    settings, then runs `start-simeon-vm`.

  The settings go on the disk, not in `/run`, so a computer that ever wakes in
  Disk mode starts again on its own.
- `box/azure/build.sh`: builds the image in Azure (`az acr build`, so nothing
  builds on the Mac) and turns it into a disk image.
- `box/azure/check_sandbox.py`: like `box/e2b/check_template.py`, makes one
  test computer, measures it, prints JSON and removes it.

**The gates.** Each is measured, never assumed:

| # | What | Passes when |
|---|---|---|
| 1 | Our server's identity works from outside Azure, on this subscription | It makes and removes a computer |
| 2 | The desktop and Chrome run | `box-doctor` passes; a screenshot shows the desktop; Chrome opens a page |
| 3 | WebSockets through Azure's ports | The noVNC screen streams for 30 minutes without dropping |
| 4 | Long connections | The app's event stream stays open 30 minutes; a 5-minute long poll comes back |
| 5 | The port lock | No token: 401. Another identity: 403. Ours: 200. The gateway still reads its own password from our header. All four ports checked |
| 6 | Sleep and wake in Memory mode | A 4 GB computer with Chrome open, 20 rounds: each wake under 5 s, tabs and programs as they were, clock right after we set it |
| 7 | A long sleep | Resumes after 1 hour, 24 hours and 72 hours asleep (bug #1869) |
| 8 | No hidden lifetime | Stays awake 26 hours with auto-suspend off |
| 9 | Commands and files | Files written as root; `date -s` and `mount --bind` work; the engine update script runs detached and its answer is read back |
| 10 | Snapshots | How many each stop leaves and how big; whether the old ones can be deleted |
| 11 | What Azure bills | Cost Management after a week: compute, storage, outbound data |

**If gate 3, 6 or 7 fails:** we stop. Azure can't run our computers as they
are, and the credits go to an overflow Docker server instead (section 6).

**If gate 5 fails:** we stop too. No computer goes on a port anyone can reach.

### Step 2. The server's Azure code (me; nothing changes until Render names an Azure entry)

All of it goes in behind the existing settings, with tests against a stand-in
Azure server, like `server/tests/sand/test_box_e2b.py`:

1. **The host:** `server/simeon/sand/box_azure.py`, an `AzureBoxHost` with
   every call in the table in section 1.
   - It uses our own small REST client over `httpx`, with Microsoft's
     client-credentials sign-in, so there are no new libraries and no beta
     SDK.
   - It pins the API version.
   - Its errors map to the same holds as E2B's: full means "computers all in
     use", gone means made again from the backup.
2. **The settings:** in `config.py`, with the `SIMEON_` name read first and
   `CLAIDOR_` still read:
   - `SIMEON_AZURE_TENANT_ID`, `_CLIENT_ID`, `_CLIENT_SECRET`;
   - `_SUBSCRIPTION_ID`, `_RESOURCE_GROUP`, `_SANDBOX_GROUP`, `_REGION`;
   - `_DISK_IMAGE`, `_SERVER_OBJECT_ID`.

   Plus `"kind": "azure"` in `SIMEON_BOX_HOSTS`.
3. **Reaching it:** the address and the Microsoft token in `dial_headers` and
   `internal_url`; the app's own `Authorization` moved into
   `x-simeon-box-authorization`; Azure's "gone" answer in `box_proxy`.
4. **The engine:** the gateway accepts its password from
   `x-simeon-box-authorization`. This needs an engine release, which the
   founder publishes.
5. **Who goes where:** a server that names a person beats a server that takes
   everyone (`"*"`).
   - Today, with E2B on `"*"`, listing someone on Azure would move nobody.
   - Tests for making a computer, moving one and moving back.
6. **A wake that fails:** a computer that can't be resumed within 2 minutes
   (bug #1869) is made again from its backup, logged as
   `sand.box.azure.resume_failed`. The person keeps their files and loses
   what the backup doesn't hold (section 5).
7. **Cleanup:** a command that deletes the old E2B computers of people who
   have been on Azure for 14 days. It is run by hand, and it lists before it
   deletes.
8. **Docs:** `docs/services-core.md`, and an "Azure" section in
   `docs/ops/box-host/render-env.md`.

Checks before merging: the server's tests, lint and types, and
`check_names.py`. Each part is a separate pull request.

### Step 3. The founder's own computer (one person)

- **Render:** add an Azure entry to `SIMEON_BOX_HOSTS` with
  `"users": ["<founder's e-mail>"]` and `"max_running": 5`. Leave the E2B entry
  as it is.
- **What happens:** at the founder's next idle start, their backup is brought
  up to date, the E2B computer is paused (not deleted), and a computer is made
  on Azure from the backup (`sand.box.moved`).
- **Watch it for a week of real use:**
  - wake times (`wake_ms`);
  - `sand.box.awake` and `sand.box.sleep`;
  - any `resume_failed`;
  - the screen, Chrome, calls, routines and Claude, with Claude connected
    again after the move;
  - what Azure bills.
- **Going back:** take the founder off the Azure entry. Their computer moves
  back to E2B the same way, from the backup.

### Step 4. Ten people

- **Render:** add up to ten listed people to the Azure entry, with
  `"max_running": 20`.
- **Watch it for a week:** the same log lines, and every `resume_failed`.
- **Going back:** the same, person by person, or all at once by removing the
  entry.

### Step 5. Everyone

- **Render:** the Azure entry gets `"users": ["*"]` and the core quota as
  `max_running`. The E2B entry gets `"accepting": false` and no `users`.
- **What happens:** people move at their next idle start, so the move spreads
  over days as they come back. When Azure is full, a person stays on E2B,
  working (`move_deferred reason=full`), and moves later.
- **Going back:** put E2B's `users` back to `["*"]` and drain Azure.

### Step 6. Closing E2B

After 30 days with nothing moved back:

- run the cleanup (step 2, item 7);
- check E2B lists no computers;
- downgrade E2B's plan.

Until then, E2B stays paid as the way back.

## 5. What a person loses when their computer moves

A move makes a new computer from the backup, as E2B moves and new templates
do today.

| What | Comes along? |
|---|---|
| Agents' data, chats, workspace files | Yes, from the backup |
| App sign-ins | Yes, from the backup |
| Chrome's cookies, saved logins, site data | Yes, from the backup |
| Claude Code's sign-in (`~/.claude/.credentials.json`) | **No.** The person connects Claude again; the app already says so ("Connect Again", section 6 of `docs/your-own-models.md`) |
| Open Chrome tabs and running programs | No; the agents open what they need again |
| Anything installed or saved outside the backed-up folders | No |

Copying Claude's sign-in file across through our server would be quicker, but
Anthropic's terms say platforms "may not collect, store, or intermediate
Claude.ai credentials". So it isn't copied. **The founder decides** whether to
tell people before their move.

## 6. Costs

Azure's own price list (`prices.azure.com`) for East US, `westus3` and
Germany West Central gives the same Container Apps consumption rates, which
sandboxes use. `westus2` and West Europe cost more.

| | Per awake hour, 2 cores and 4 GiB | Notes |
|---|---|---|
| Azure `westus3` | $0.216 | $0.000024 per core-second, $0.000003 per GiB-second |
| Azure `westus2` | $0.302 | |
| E2B (today) | $0.166 | |

Beyond compute:

- **Snapshots:** "coming soon" at Premium Blob ZRS rates, $0.20 per GB-month in
  `westus3`. Each sleeping computer keeps at least its memory (4 GB) plus its
  disk changes, so roughly $1 to $4 a month per person once Microsoft bills
  it. Gate 10 measures the real size.
- **Outbound data:**
  - **The screens:** when people watch, their computer's screen goes out of
    Azure to Render. The first 100 GB a month are free, then $0.08 per GB.
  - **Backups:** these go to our S3 bucket on AWS. They are mostly small
    changes.
  - **Pages Chrome loads:** these come in, and incoming data is free.
- **Registry:** Basic, $0.1666 a day.
- **Credits:** $5,000 is about 23,000 awake computer-hours at `westus3` rates
  (for example 200 people awake 4 hours a day for a month). They must be used
  within 180 days of activation. After that, Azure bills normally, about 30%
  more than E2B per awake hour.
- **If the gates fail:** the credits still buy an overflow Docker server for
  the launch. A large Azure virtual machine added to `SIMEON_BOX_HOSTS` like
  box2 takes new computers when E2B is full. That works today, with no code.

## 7. Why this won't break anything

1. **Nothing changes for anyone** until the founder adds an Azure entry on
   Render. Steps 0 to 2 touch no one's computer.
2. **One person first**, then ten, then everyone, each with a week to watch.
3. **Every move goes through the backup**, and the old computer is paused, not
   deleted. A move that fails puts the person back where they were, and no
   move is tried for 30 minutes (`sand.box.move_failed`, existing code).
4. **A full Azure** leaves people on E2B, working.
5. **A wake that fails** on Azure makes a new computer from the backup, so a
   person is never stuck.
6. **Going back is one setting**, at every step, for one person or everyone.
7. **E2B stays paid** until 30 days after the last move.

## 8. What is still unknown

These are the questions step 1 answers. Each is either a gate or a number we
measure:

- WebSockets and long connections through Azure's ports (gates 3 and 4).
- How reliable waking from Memory mode is, given bug #1869 (gates 6 and 7).
- Whether a desktop with VNC and Chrome runs (gate 2).
- Whether there's a maximum lifetime for a machine (gate 8).
- Whether a personal-account subscription allows our server's identity
  (gate 1).
- How big snapshots are and how long they're kept (gate 10).
- What Azure answers for a machine that's gone (step 1, measured).
- How long an exec may run (gate 9).
