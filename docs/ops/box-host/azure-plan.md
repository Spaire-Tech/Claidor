# Moving the cloud computers from E2B to Azure

The plan for running Simeon's cloud computers on Azure Container Apps
Sandboxes in place of E2B (12 November 2026). The founder asked for it after
Microsoft gave Simeon Labs $5,000 of Azure credits.

The plan comes from two sources:

- **Our own code:** what the server, the computer image and the engine take
  from E2B.
- **Microsoft's documentation:** all 46 pages of `sandboxes.azure.com/docs`,
  the Learn pages, the REST API specification (`2026-09-01-preview`), the
  Python SDK's source (`azure-containerapps-sandbox` 0.1.0b4), the samples
  repository and the open GitHub issues.

Nothing here has run on Azure yet. Every fact Microsoft doesn't document is
marked **unknown**.

**There are no customers yet** (the founder, 12 November 2026: "we dont have
any clients … i couldn't care less about losing data and having to start
over"). So nothing moves through backups and there's no gradual rollout:
Simeon switches to Azure in one step, and the founder's computer starts fresh
there. The first version of this plan (#701) moved people one at a time and
was replaced the same day.

## The short version

- **The design matches E2B's.** Azure has what we use on E2B: one small virtual
  machine per person, frozen whole when it sleeps and back in a few seconds,
  billed by the second only while awake.
- **Three steps:**
  1. The founder sets up the Azure account.
  2. I build the Azure support: the image, the server code and a small engine
     change.
  3. One setting on Render switches to Azure, and the founder's computer is
     made fresh there.
- **Going back is that same setting.** It gives a fresh computer on E2B.
- **Four things are checked on the first real computer:**
  - The desktop with Chrome runs.
  - The screen and the app's live connections pass through Azure's ports.
  - A frozen 4 GB computer wakes reliably. An open Azure bug says it sometimes
    doesn't.
  - The ports are locked so only our server reaches them.

  If one fails, we switch back.
- **Cost:** about $0.22 per awake hour for our size (E2B: $0.17). The credits
  cover about 23,000 awake computer-hours. They must be activated within 90
  days and spent within 180 days of activation.
- **Timing:** before the launch, so the launch's sign-ups start on Azure and
  never move. That holds if the checks pass with a few days of the founder's
  own use to spare; if not, launch on E2B.

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
| A computer that has vanished | 502 "The sandbox was not found" | Unknown answer | Measured on the first computer |
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
    apply; the first computer shows it.
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
  from `Authorization`. One small engine change, published before the switch.
- **The screen ports:** the screens (6080, 6081) and the tunnel (8790) keep
  their own tokens. Check 5 covers all four ports.

## 4. The steps

### Step 0. The Azure account (the founder)

About an hour, on the Mac. No key goes in chat. The server's secret is printed
once in the Mac's terminal and goes straight to Render.

**The tools.** The `aca` installer is Microsoft's own, from its quickstart:

```sh
brew install azure-cli
curl -fsSL https://aka.ms/aca-cli-install | sh
```

**1. The credits, with nothing that turns them off.**
- Activate the $5,000 in Microsoft for Startups; it makes an Azure
  subscription. Note the end date (180 days from activation).
- In the Azure portal: Cost Management + Billing, then the subscription. Add a
  card and choose **Remove spending limit** if it's shown. A credit-based
  subscription that keeps its limit is disabled when the credits run out: all
  its computers stop, and its storage turns read-only
  ([subscription states](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/subscription-states)).
  With the card on file, use past the credits is billed instead.
- Set a budget alert (for example $500 a month). It only sends an e-mail and
  stops nothing.

**2. The resource group, the sandbox group and the registry.**

```sh
az login
az account set --subscription "<the new subscription's name>"
SUB=$(az account show --query id -o tsv)
az provider register --namespace Microsoft.App --wait
az provider register --namespace Microsoft.ContainerRegistry --wait
az group create --name simeon-computers --location westus3
aca sandboxgroup create -g simeon-computers --name simeon-computers \
  --location westus3 -s "$SUB" --set-config
aca doctor
az acr create --resource-group simeon-computers --name simeoncomputers \
  --sku Basic --location westus3
```

- `westus3` is close to Render's Oregon and cheaper than `westus2`.
- **If the registry name is taken:** registry names are global, so add digits
  (`simeoncomputers2`).
- **If `aca doctor` says personal accounts aren't supported:** that only
  concerns `aca` itself. The server signs in as its own identity (next step).

**3. The server's own identity.**

```sh
GROUP="/subscriptions/$SUB/resourceGroups/simeon-computers/providers/Microsoft.App/sandboxGroups/simeon-computers"
az ad sp create-for-rbac --name simeon-server \
  --role "Container Apps SandboxGroup Data Owner" --scopes "$GROUP"
APP=<the appId it printed>
az ad sp show --id "$APP" --query id -o tsv
az role assignment create --role "Container Apps SandboxGroup Data Owner" \
  --assignee "$(az ad signed-in-user show --query id -o tsv)" --scope "$GROUP"
```

- The last command gives your own account the same role, so
  `box/azure/build.sh` can make the disk image and the test computer from
  the Mac, signed in as you. The disk image is pulled from the registry with
  a short-lived token of yours, so the server's identity needs no access to
  the registry.

- It prints `appId`, `tenant` and `password`.
- **The password is the secret.** Put it on Render as
  `SIMEON_AZURE_CLIENT_SECRET` and nowhere else. It does nothing until step 1
  ships.
- **What to send back** (none of these is a secret):
  - the subscription id (`$SUB`);
  - the tenant;
  - the `appId`;
  - the last command's output (the identity's object id, for the port lock);
  - the registry's name.

**4. Room for a spike.**

Azure Portal → Help + support → Create a support request → Service and
subscription limits (quotas) → Azure Container Apps, region `westus3`. Ask for:
- **Sandbox cores: 2,000.** Learn's quotas page names that as the current cap
  for Sandboxes; more goes through the same support request. 2,000 cores is
  1,000 computers awake at once. Sleeping computers don't count, and ours
  sleep 10 minutes after their last task.
- **API requests: 10,000 a minute.** The default is 3,000. With 1,000 awake
  computers, the server's own checks use about a third of that.

Past 2,000 cores, a second region (`westus2` or `centralus`) doubles it. The
server already spreads computers across several entries in
`SIMEON_BOX_HOSTS`; it needs only a second sandbox group, with no code.

### Step 1. Azure support (me)

Built on 12 November 2026, on branch `claude/zen-cerf-w9w3i4`. What each
item became is under it. All of it ran against stand-ins only: no Azure
account was used.

1. **The image:** `box/azure/Dockerfile`, which adds to box2's image (the
   pinned digest E2B uses today):
   - `start-simeon-vm`;
   - an empty machine id;
   - a small start (`simeon-vm-init`) that waits for the server to write the
     settings, then runs `start-simeon-vm`.

   The settings go on the disk, not in `/run`, so a computer that ever wakes in
   Disk mode starts again on its own.

   `box/azure/build.sh` builds the image in Azure (`az acr build`, so nothing
   builds on the Mac) and turns it into a disk image.

   *Built:* `box/azure/Dockerfile`, `simeon-vm-init` and `build.sh`. The
   disk image is made by `box/azure/disk_image.py` (`POST …/diskimages` with
   a registry token of the person running it), named
   `simeon-box-<commit>-<time>`. A new name on Render gives each person a new
   computer at their next start, as a new image does on Docker.
2. **The host:** `server/simeon/sand/box_azure.py`, an `AzureBoxHost` with
   every call in the table in section 1.
   - It uses our own small REST client over `httpx`, with Microsoft's
     client-credentials sign-in, so there are no new libraries and no beta
     SDK.
   - It pins the API version.
   - Its errors map to the same holds as E2B's: full means "computers all in
     use".
3. **The settings:** in `config.py`, with the `SIMEON_` name read first and
   `CLAIDOR_` still read:
   - `SIMEON_AZURE_TENANT_ID`, `_CLIENT_ID`, `_CLIENT_SECRET`;
   - `_SUBSCRIPTION_ID`, `_RESOURCE_GROUP`, `_SANDBOX_GROUP`, `_REGION`;
   - `_DISK_IMAGE`, `_SERVER_OBJECT_ID`.

   Plus `"kind": "azure"` in `SIMEON_BOX_HOSTS`.

   *Built:* `server/simeon/sand/box_azure.py` and the settings, with tests
   against a stand-in Azure in `server/tests/sand/test_box_azure.py`.
4. **Reaching it:** the address and the Microsoft token in `dial_headers` and
   `internal_url`; the app's own `Authorization` moved into
   `x-simeon-box-authorization`; Azure's "gone" answer in `box_proxy`.

   *Built,* except the "gone" answer: what Azure's proxy says for a removed
   computer is not documented, so `check_sandbox.py` measures it
   (`port_after_removed`) and it is added once known. Until then a request
   to a removed Azure computer fails like any unreachable one. When the
   server cannot get Microsoft's token for a port, the request goes on
   without it and the computer looks unreachable, never a server error
   (`sand.box.azure.port_sign_in_failed`).
5. **The engine:** the gateway accepts its password from
   `x-simeon-box-authorization` (section 3). It works on E2B too, so it can be
   published at once.
6. **No ceilings of our own:**
   - The Azure entry runs with `"max_running": 0`, which means no limit of
     ours. The code's default is 3.
   - Azure's own limits (cores full, 429) show as "computers all in use,
     trying again in a minute", never as an error.
   - The sleeper checks the awake computers in parallel, not one after
     another. Today it waits on each computer's state and health in turn,
     every minute. At 1,000 awake computers that takes longer than the minute
     itself.
7. **A wake that fails:** a computer that can't be resumed within 2 minutes
   (bug #1869) is made again, logged as `sand.box.azure.resume_failed`. The
   person keeps what the backup holds. Without this, a stuck computer stays
   stuck.
8. **A check:** `box/azure/check_sandbox.py`, like
   `box/e2b/check_template.py`. It makes one test computer, measures the
   checks below, prints JSON and removes it, so the image can be checked
   without switching.

   *Built.* It also measures what no document says: whether commands run as
   root, whether a file's mode is read as written (600), whether a
   200-second command answers, whether the image's first process runs,
   what a port answers while the computer sleeps and once it is removed,
   and whether auto-suspend stays off for ten idle minutes. The port lock is
   checked with the runner's own token: ports locked to them answer, a port
   locked to another identity answers 403. Run through the stand-in Azure
   only.
9. **Docs:** `docs/services-core.md`, and an "Azure" section in
   `docs/ops/box-host/render-env.md`.

All of it is tested against a stand-in Azure server, like
`server/tests/sand/test_box_e2b.py`. Checks before merging: the server's
tests, lint and types, `check_names.py`, and the engine's `npm run check`.
Nothing changes on E2B until Render names the Azure entry.

### Step 2. The switch (the founder, about ten minutes)

1. Publish the engine (it now reads the new header).
2. Run `bash box/azure/build.sh` once: the image, the disk image, then the
   measurements (`check_sandbox.py`, about 20 minutes). Send the JSON back.
3. **Render:** set the Azure settings, and set `SIMEON_BOX_HOSTS` to the Azure
   entry alone, with `"users": ["*"]` and `"max_running": 0`.
4. Open the app: a fresh computer is made on Azure. Connect Claude again.
5. Use it for real. The checks below are measured, never assumed, and each one
   either passes or sends us back.

| # | What | Passes when |
|---|---|---|
| 1 | Our server's identity works from outside Azure, on this subscription | The computer is made |
| 2 | The desktop and Chrome run | The screen shows the desktop; an agent opens a page |
| 3 | WebSockets through Azure's ports | The screen streams for 30 minutes without dropping |
| 4 | Long connections | The app's live updates arrive for 30 minutes; a routine's long wait comes back |
| 5 | The port lock | No token: 401. Another identity: 403. Ours: 200. All four ports checked |
| 6 | Sleep and wake | 20 sleeps and wakes with Chrome open: each wake under 5 s, tabs as they were, clock right |
| 7 | A long sleep | It wakes after 1 hour, 24 hours and 72 hours asleep (bug #1869) |
| 8 | No hidden lifetime | It stays awake 26 hours on a long task |
| 9 | A new engine | The next engine published goes onto the same computer (`sand.box.updated_in_place`) |
| 10 | Snapshots | How many each sleep leaves and how big; whether the old ones can be deleted |
| 11 | What Azure bills | Cost Management after a week: compute, storage, outbound data |

### Going back

Set `SIMEON_BOX_HOSTS` back to the E2B entry. The next start makes a fresh
computer on E2B. The E2B account and its key stay in place until Azure has run
the launch, so going back takes a minute.

**If check 3, 6 or 7 fails:** Azure can't run our computers as they are. We go
back to E2B, and the credits go to an overflow server (section 5).

**If check 5 fails:** we go back too. No computer stays on a port anyone can
reach.

### Other ceilings before a launch

These aren't Azure's, but a spike hits them first. All computer traffic goes
through the API, and every awake computer is checked every minute. The plans
below are the ones in `render.yaml`; the dashboard may differ.

| What | Today | Before launch |
|---|---|---|
| The API | Starter: one process, 0.5 CPU, 512 MB | A larger plan. More instances once I've checked the API is safe with several |
| Redis | Free: 25 MB, 50 connections, nothing kept | A paid plan (Starter: 256 MB, 250 connections), so it keeps its data |
| Postgres | basic-256mb | A larger plan |
| Model providers | Each key has its own rate limit | Check the tier of each key on Render |

## 5. Costs

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
  it. Check 10 measures the real size.
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
- **If the checks fail:** the credits still buy an overflow Docker server for
  the launch. A large Azure virtual machine added to `SIMEON_BOX_HOSTS` like
  box2 takes new computers when E2B is full. That works today, with no code.

## 6. What is still unknown

These are what the checks in step 2 answer:

- WebSockets and long connections through Azure's ports (checks 3 and 4).
- How reliable waking from Memory mode is, given bug #1869 (checks 6 and 7).
- Whether a desktop with VNC and Chrome runs (check 2).
- Whether there's a maximum lifetime for a machine (check 8).
- Whether a personal-account subscription allows our server's identity
  (check 1).
- How big snapshots are and how long they're kept (check 10).
- What Azure answers for a machine that's gone (`check_sandbox.py`,
  `port_after_removed`).
- Whether commands may run as root, and how long one may run
  (`check_sandbox.py`).
- Whether auto-suspend stays off (`check_sandbox.py`).
