# The computer in the cloud, served (25 September 2026)

The app's `"remote"` box runtime was complete on the Mac and answered by
nothing on the server (`cursor-dependencies-map.md` §5). Simeon Labs'
server now serves the broker Cursor's server served, the two plain routes
the Mac and its local-exec daemon post to, and a reverse proxy to the
box's four ports. **None of this has run on a Mac, and no box host is
provisioned yet**: the broker answers one sentence until the founder sets
`CLAIDOR_BOX_HOST_PROVIDER` (§"What the founder must create").

## What was reused, not built

On the Mac, untouched: `electron-main/box/box-host-connector.ts`
(`BrokeredHostConnector`: the `EnsureSandBox` call, the hint headers, the
blocked hold, the descriptor `{baseUrl, token, headers: {x-anyrun-network-token},
vncProxy}`, recreate), `gateway-descriptor-cache.ts` (the encrypted 7-day
cache and its fast path), `node-agent-coordinator/gateway/box-vnc-proxy.ts`
and `electron-main/vnc/vnc-trust.ts` (loopback noVNC URLs rewritten to the
proxy's, the network token injected on the webview's requests), the egress
tunnel (`shared/node/egress-tunnel/*`), `box-migration-watcher.ts` and
`box-recovery.ts`, `host/extensions/box-lifecycle/*` (the box asks
`GetSandBoxRunState`), and `host/local-exec/local-exec-daemon.ts` (the
credential trade). The local Docker connector's `docker run` is the
specification of the container (`local-docker-host-connector.ts:270-290`).

On the server, untouched: `POST /desktop/api/box/renewal-credential`
(`DesktopService.issue_box_credential`, the `claidor_db_` child row) and
`POST /sand-box/inference-credential` (`renew_box_access`), which the
cloud box renews with; `polar/sand/connect.py` (Connect over FastAPI).

Searched for before building, by concept, over `server/`, `runner/`,
`desktop/source`, `desktop/scripts`, `docs/product` and `render.yaml`
(`rg -il "e2b|fly\.io|flyctl|DOCKER_HOST|docker.sock|dockerode|aiodocker|kubernetes|k8s|boxes\.|sandbox provider|remote box|cloud box"`):
no box host, no broker and no proxy existed. What the search found:
`docs/product/hosting-caisra.md` (the Rakazo VM notes, `SANDBOX_PROVIDER=e2b`
for a tree that is gone), `docs/product/measurements/` (an OpenClaw-era
probe with a fake pod, "There is no E2B code here and no E2B key"),
`runner/` (a Render worker with no Docker: shell, web and browser switched
off in `engineConfig.ts`, the reason `box-substrate-read.md` §2 gives) and
`polar/maty/` (claim, lease, heartbeat: a job queue, not a box host).
`e2b` is not in `server/uv.lock`; `httpx` and `websockets` are.

## What was built

Server, all in `server/polar/sand/`:

| File | What |
|---|---|
| `box_broker.py` | `aiserver.v1.GrokBotService`: `EnsureSandBox`, `RecreateSandBox`, `ForceRecreateSandBox`, `WatchSandBoxMigration` (stream), `GetSandBoxRunState`, `NotifySandAgentTurnFinished`; `POST /sand-box/local-exec-daemon-credential`; `POST /sand-box/local-exec-connection`; the hint headers and the hand-encoded `aiserver.v1.ErrorDetails` for a blocked box |
| `box_service.py` | find-or-create, start a stopped box, recreate on a dead credential, recreate with or without the volumes, run state, the migration log, the URLs, the local-exec credential (a `claidor_db_` child row with user agent `simeon-local-exec/<desktop>`) |
| `box_hosts.py` | `BoxHost` protocol; `DockerBoxHost` over the Docker Engine HTTP API with httpx (write the host bundle once per fingerprint to the box host (a helper container and `PUT /containers/{id}/archive`) → create with it bind-mounted read-only, as the Mac does → pull on 404 → start → inspect the published ports); `E2BBoxHost`, a documented stub |
| `box_proxy.py` | `/sand-box/{box_id}/p/{port}/{path}` for HTTP (streamed, so `/events` SSE works) and WebSocket (websockify, the egress tunnel), gated by the network token as header or `network_token` query |
| `box_repository.py`, `polar/models/sand_box.py`, migration `2026-09-25-1500_sand_boxes.py` | the `sand_boxes` table: one row per person |

Desktop, three small changes: `shared/node/egress-tunnel/box-connection.ts`
derives the tunnel from a `/p/<port>` path when the hostname has no
`-<port>` label (Cursor's rule is tried first and unchanged);
`electron-main/main-edge.ts` `setBoxRuntime("remote")` probes the broker
through `boxRecovery.probeRemoteBox()` (new on `box-recovery.ts`, the
connector's `connect`) **before** stopping the local box, and on a
refusal puts the setting back and throws the broker's sentence; and the
Settings switch in `scripts/lib/router-renderer-patch.mjs` (`RBoxRuntime`)
is enabled both ways and no longer says Coming Soon. The refusal with
`SAND_CONNECT_SERVED=0` is kept.

One bug found on the way, in `polar/desktop/service.py`:
`issue_box_credential` revoked every child row of the desktop, which would
have killed the local-exec daemon's credential at every box creation; it
now skips the `simeon-local-exec/` rows.

## The routes and their shapes

Connect, at the root of the API host, desktop bearer unless noted:

| RPC | Answer |
|---|---|
| `EnsureSandBox` `{}` | `{gatewayUrl, gatewayToken, networkToken, vncUrl, forkVncBaseUrl, podId, cluster, tenantId, imageUpdateAvailable: false}`; `unavailable` + the one sentence with no host; `resource_exhausted` + `x-automation-failure-hint: SAND_BOX_BLOCKED` + `retry-after` + an `ErrorDetails` detail (`title`, `detail`, `additionalInfo.sandBoxBlockReason`) when the host raises `BoxBlocked`; the `CLOUD_AGENT_STORAGE_DISABLED` and `SAND_CLIENT_UPDATE_REQUIRED` hints are mapped from `BoxStorageDisabled` / `BoxClientUpdateRequired`, which nothing raises today |
| `RecreateSandBox` `{preserveData, force}` (desktop or box) | `{started, reason, operationId}`; the container is replaced within the call, on the same volumes unless `preserveData: false`; from a box credential with no cloud row: `started: false` and the "updated from the Mac" reason |
| `ForceRecreateSandBox` `{}` | same, volumes wiped |
| `WatchSandBoxMigration` `{fromOffsetKey, includeFinished}` (desktop or box) | frames `{phase, detail, atMs, offsetKey, operationId}`, phases as integers (2 CREATING, 5 WIPING, 6 DONE, 7 FAILED), replayed from the process's memory then held open 25 s for more |
| `GetSandBoxRunState` `{}` (desktop or box) | `{state, imageUpdateAvailable: false}`: 3 RUNNING, 2 HIBERNATED (stopped), 1 ABSENT; a box credential with no cloud row (the Docker box on the Mac, which asks now that the service is served) is RUNNING |
| `NotifySandAgentTurnFinished` (desktop or box) | `{}`; logged as `sand.box.turn_finished`; there is no push service |

Plain: `POST /sand-box/local-exec-daemon-credential` (desktop bearer, `{}`
→ `{credential, expiresAtMs}`, 12 h); `POST /sand-box/local-exec-connection`
(`{credential}` → `{baseUrl, token, networkToken}`; 401 `invalid_grant`
when dead; 404 `no_box` with no running cloud box).

Proxy: `https://<api>/sand-box/{box_id}/p/{1340|6080|6081|8790}/{path}`.
The gateway URL the app is told is `…/p/1340` (the gateway client
concatenates `/api/…`, `/events`, `/health`); `vncUrl` is
`…/p/6080/vnc.html?network_token=…&resume_lower_s=900&resume_upper_s=18000&path=websockify%3F…`
(`buildSandBoxNoVncUrl`'s shape); `forkVncBaseUrl` is `…/p/6081`; the
tunnel derives to `wss://…/p/8790/`. Every other query parameter passes
through. 401 on a wrong or missing token, 404 on any other port.

## What runs where

```
Mac (Simeon)                Simeon Labs' API (Render)             box VM (founder's)
─────────────               ────────────────────────              ──────────────────
BrokeredHostConnector ──►   /aiserver.v1.GrokBotService/*   ──►   Docker Engine API (CLAIDOR_BOX_DOCKER_HOST)
                            mints claidor_db_ credential            docker run … cursor universal:sand-box-latest
                            writes sand_boxes row                   SAND_INFERENCE_RENEWAL_CREDENTIAL in env
gateway client ────────►   /sand-box/{id}/p/1340/api/…  ──►      :<published 1340>   (SAND_GATEWAY_TOKEN)
VNC webview ───────────►   /sand-box/{id}/p/6080/vnc.html ──►    :<published 6080>   (noVNC + websockify)
egress tunnel ─────────►   wss …/sand-box/{id}/p/8790/    ──►    :<published 8790>
box host ──────────────►   /sand-box/inference-credential (renews its token, no Mac)
                           /aiserver.v1.GrokBotService/GetSandBoxRunState (box credential)
```

With `CLAIDOR_BOX_PUBLIC_URL_TEMPLATE` set the middle column's proxy is
skipped: the app is told `https://box-<hex>-1340.boxes.simeonlabs.com`
and dials the VM's TLS proxy directly (below).

## The environment (Render, `CLAIDOR_` prefix, `polar/config.py`)

| Variable | Meaning |
|---|---|
| `CLAIDOR_BOX_HOST_PROVIDER` | `docker` or `e2b`; empty = the broker answers "Simeon's cloud computer needs a host; set CLAIDOR_BOX_HOST_PROVIDER" |
| `CLAIDOR_BOX_DOCKER_HOST` | `https://<vm>:2376` (TLS), `http://<vm>:2375` (only behind a private network), or `unix:///var/run/docker.sock`; `tcp://` is read as http(s) by whether a client cert is set. `ssh://` is not dialled: tunnel it to one of those |
| `CLAIDOR_BOX_DOCKER_TLS_CA`, `_CERT`, `_KEY` | client certificate paths for a `--tlsverify` daemon |
| `CLAIDOR_BOX_HOST_ADDRESS` | where the API reaches the published ports; defaults to the daemon's hostname |
| `CLAIDOR_BOX_IMAGE`, `CLAIDOR_BOX_IMAGE_DIGEST` | the box image (default: Cursor's `universal:sand-box-latest`, as on the Mac) and an optional digest pin |
| `CLAIDOR_BOX_HOST_BUNDLE_URL` | a `.tar`/`.tar.gz` holding `host/host-main.cjs` and `box-exec-daemon/main.cjs` from `desktop/dist` after `npm run package`; uploaded into each new container. Empty: the image must carry them at `/home/box/sand-host/host-main.cjs` and `/home/box/box-exec-daemon/main.cjs` |
| `CLAIDOR_BOX_PUBLIC_URL_TEMPLATE` | e.g. `https://{box}-{port}.boxes.simeonlabs.com`; empty = the API proxies |
| `CLAIDOR_BOX_READY_TIMEOUT` | how long `EnsureSandBox` waits for `/health` (90 s) |
| `CLAIDOR_BOX_LOCAL_EXEC_CREDENTIAL_TTL` | 12 h |

`SAND_BACKEND_URL` inside the container is `CLAIDOR_BASE_URL`
(`https://api.simeonlabs.com`).

## Sleep, size and capacity (28 September 2026)

The founder: "build it exactly how grok bot built it … be careful and
true to it." Grok Bot's pods slept when idle and woke when asked for.
The client half of that was already in the tree and is unchanged; this
is the server half Cursor ran, built from what the client states.

**What Grok Bot's code says, and where:**

- The host answers `GET /health` with `isBusy`, `busyOnlyAwaitingApproval`
  and `lastBusyAtMs` (`host/gateway-server.ts`, `SandHost.getHealth` in
  `host/sand-host.ts`). It is busy while a turn, a background shell, a
  carried wake or a mid-drain revival runs. `lastBusyAtMs` moves only
  while it is busy on something other than an approval card, so a box
  that waits on the person's Allow card may sleep.
- Cursor's server read the same pair (`AdminSandBoxHostStatusResponse`:
  `is_busy`, `last_busy_at_ms`) and kept `last_active_at_ms` per pod
  (`TeamMemberSandBoxPod`).
- `AdminHibernateSandBox` takes `force` and answers `started` and `reason`:
  a busy box is refused unless forced.
- `GetSandBoxRunState` answers `SAND_BOX_RUN_STATE_HIBERNATED`. The
  window draws it as "sleeping", and as "Waking your computer…" on the
  cover.
- Waking is EnsureSandBox. The app's gateway client reconnects its event
  stream for as long as Simeon is open (`gateway-client.ts`), and every
  reconnect goes through `BrokeredHostConnector.connect` → EnsureSandBox,
  which starts a stopped box. The descriptor cache calls the broker again
  after its first live connection (`gateway-descriptor-cache.ts`), so a
  sleeping box is not dialled from a stale cache forever.
- When the box's notify stream connects, it drains every topic
  (`notify-bus/extension.ts:40`), so a box that has just woken picks up
  what the server queued while it slept.
- A full host is refused with the `SAND_BOX_BLOCKED` hint, a
  `retry-after` and the title and detail the window shows
  (`BrokeredHostConnector.connect`, `readBlockedInfoOrEmpty`).
- Pods came in sizes (`flavor` on `TeamMemberSandBoxPod` and the admin
  requests). The Mac's own `docker run` sets no limit; Docker Desktop's
  VM is its bound.

**What was built:**

- `last_active_at` and `hibernated_at` on `sand_boxes` (migration
  `sand_box_sleep_0928`).
- `box_service.hibernate` (`AdminHibernateSandBox`'s rule): stop the
  container and keep its volumes, credential and tokens; a busy box is
  refused ("busy") unless forced.
- `box_service.hibernate_idle`, the sleeper (`sand.box.hibernate_idle`,
  every minute, `box_tasks.py`). For each box the broker left running:
  - a box stopped or removed outside the broker is recorded as such;
  - a box that holds work stays awake and its `last_active_at` moves;
  - the host's `lastBusyAtMs` moves `last_active_at` forward;
  - a box the app is attached to through the API's proxy stays awake
    (below);
  - anything else idle for `CLAIDOR_BOX_IDLE_HIBERNATE_AFTER` sleeps
    (`sand.box.hibernated`). A box whose `/health` does not answer counts
    as idle, so a broken box does not run forever.
- **Attached.** The proxy keeps `sand:box:attached:<id>` alive in Redis
  (3-minute expiry, refreshed every minute) while any request, stream or
  WebSocket to the box is open. Why: with Simeon open, the app holds the
  event stream and reconnects it, so a box put to sleep under an open app
  would be woken at once by that reconnect. The effect is Grok Bot's in
  practice: the box sleeps once the app is closed and nothing runs.
- **Wake.** `notify.publish` (a routine's fire, a listener event, a
  shared room's turn) also queues `sand.box.wake`, which starts a
  sleeping box (`sand.box.woken`). A person's box is asked at most once
  every 30 seconds, however many events arrive. When the host is full,
  the wake waits (`sand.box.wake.deferred`) and is tried again every
  minute for an hour.
- **Capacity.** EnsureSandBox, a recreate and a wake count the other
  boxes awake on the host before creating or starting one. At
  `CLAIDOR_BOX_MAX_RUNNING` they refuse with the `SAND_BOX_BLOCKED` hold:
  reason `capacity`, title "Simeon's cloud computers are all in use",
  detail "Every cloud computer is busy right now. Simeon tries again in
  a minute.", `retry-after: 60` (`sand.box.capacity.refused`). A box that
  is already awake is never refused. The count is a soft limit: two
  EnsureSandBox calls in the same instant can both pass it.
- **Size.** Every new box is created with `Memory` = `MemorySwap` =
  `CLAIDOR_BOX_MEMORY_LIMIT_MB` (4096) and `NanoCpus` from
  `CLAIDOR_BOX_CPU_LIMIT` (2.0). A box created before this change keeps
  no limit until it is recreated.

**Ours, not Grok Bot's, because the client does not say:**

- How long a box may idle before it sleeps: 30 minutes.
- The size of a box: 4 GB and 2 CPUs.
- How many boxes may be awake at once: 3.
- Counting an attached app as activity. Grok Bot's pod proxy saw the
  same traffic; whether it counted it is not in the client.
- Waking on `notify.publish`.

**Not done:**

- The pre-sleep image update. Cursor asked the box to update before it
  slept (`autoUpdateBoxNow`, `pre_hibernation`). Our boxes run with
  `SAND_BOX_AUTO_UPDATE=0`, so that call would answer
  "auto-update-disabled"; it is not made.
- Messaging channels (Discord, Slack) run inside the box and disconnect
  while it sleeps. A DM sent to a sleeping box is not delivered until
  something wakes it.
- A person who tried the cloud computer and went back to local Docker
  still has a cloud box row. A routine's fire wakes that box too, and
  whichever box drains first runs it.
- The direct path (`CLAIDOR_BOX_PUBLIC_URL_TEMPLATE`) bypasses the API's
  proxy, so an attached app is not seen there. An idle open app is put to
  sleep and woken again by its next reconnect.

**Where it runs:** the sleeper and the wake are worker jobs, so the
worker needs the box host's settings and certificate files as well as the
API (`docs/ops/box-host/render-env.md`, shared environment group).

**Measured offline:**

- `server/tests/sand/test_box_sleep.py`:
  - an idle box sleeps, reads HIBERNATED, and EnsureSandBox wakes the
    same container;
  - a recent, busy, recently-busy or attached box stays awake;
  - a box that only waits on an approval card sleeps, and so does an
    unreachable one;
  - hibernate refuses a busy box unless forced;
  - wake starts a sleeping box and waits when the host is full;
  - `publish` queues a wake;
  - a full host refuses with the blocked hold; the person's own awake box
    is never refused; a sleeping box frees its place;
  - zero switches each limit off;
  - the caps reach the box spec.
- `test_box_hosts.py`: the caps reach the Docker Engine's create call.

**Not yet run** against the Hetzner VM or on a Mac. The lines to read in
Render's logs: `sand.box.hibernated`, `sand.box.woken`,
`sand.box.capacity.refused`. In the window: "sleeping", then "Waking your
computer…".

## The first real run, 28 September 2026

Two failures, in order, each measured and each fixed:

1. **"CA cert does not include key usage extension"**, 129 times as an
   unhandled 500. The API's Python 3.14 verifies TLS strictly; the CA the
   first `setup-box-host.sh` made had no key-usage extension (curl accepted
   it). The script now makes a CA that passes and replaces an old one
   (`docs/ops/box-host/render-env.md`).
2. **Every box stayed Created and never started, and one was left per
   EnsureSandBox** (89 in minutes). The host bundle was uploaded to
   `/home/box/sand-host`, which the image does not have: Docker's archive
   PUT answers 404 "Could not find the file" for a missing target (the Mac
   bind-mounts the file, which makes the directory; a copy does not).
   Reproduced against a real Docker Engine (29.3) with the published
   bundle. Now both files go in one tar extracted at `/`, which makes the
   missing directory and leaves `/home/box`'s owner and mode untouched
   (checked with a uid-1000, 0750 `/home/box`); a box that fails after
   its container is made is removed, and a brand-new box's two volumes
   with it; and a transport error with no message logs its type and the
   request instead of nothing.
3. **Every call through the API's proxy answered 401 `access_denied`.**
   Polar's `AuthSubjectMiddleware` reads every `Authorization` header before
   any route, and the app sends the box's gateway token there, which is no
   Simeon token. The proxy paths `/sand-box/<uuid>/p/<port>` are now
   anonymous to the middleware (`is_box_proxy_path`, `polar/auth/middlewares.py`);
   the proxy checks the box's own network token as before.
4. **The box answered with a host that is not ours, 29 September 2026.**
   Render's log showed `unknown gateway method` for `getSharingState` and
   `isAgentNetworkEnabled`, which our host serves (`host/extensions/`), and
   calls to `CreateGrokBotAgent`, which nothing in `desktop/source` makes:
   the image's own host was running, not the bundle we sent. The code
   difference from the Mac, read line for line in `local-docker-host-connector.ts`
   (~430–480): the Mac **bind-mounts** `host-main.cjs` read-only at
   `/home/box/sand-host/host-main.cjs` and the exec daemon's folder at
   `/home/box/box-exec-daemon`, sets `SAND_DATA_ROOT=/home/box/sand-data`,
   labels the container with both files' sha256, and replaces a container
   whose `host-sha256` label is not the current bundle's
   (`localDockerContainerNeedsReplace`). The server copied the files into
   the container's writable layer instead, which the image's supervisor
   is free to overwrite with its own host (it keeps its own copy and
   stages upgrades, `packages/constants/sand-supervisor.ts`); a read-only
   mount is the one thing it cannot replace. The server now does what the
   Mac does: the bundle is written once per fingerprint to
   `/var/lib/simeon/box-host/<key>/` on the box host (through a helper
   container that is never started and always removed), each box mounts it
   read-only at the Mac's two paths, carries the Mac's two labels and
   `SAND_DATA_ROOT`, and EnsureSandBox replaces a running box whose
   `host-sha256` label differs, on the same volumes (`sand.box.ensure.recreate`
   with `stale_host=True`). Measured against a real Docker Engine 29.3 with
   the published bundle: both mounts read-only, the label equal to the
   file's sha256, no helper left, a second box reusing the folder.
   `tests/sand/test_box_hosts.py`, `test_box_broker.py`
   (`test_a_box_running_another_host_program_is_replaced_on_its_volumes`).
   **Measured on the VM the same morning, and it was not enough.** Read
   through the Docker API from Render's Shell: the box had been replaced at
   06:36:57 with both read-only mounts and the right label, and the host
   running was `/opt/sand/sand-host/host-main.cjs`. The VM had pulled
   `sand-box-latest` on 28 September (`sha256:3e1d140e…`, built 28
   September 20:20), whose supervisor starts the host from `/opt/sand`; the
   founder's Mac runs the 16 September build (`sha256:322c3a90…`), whose
   supervisor starts `/home/box/sand-host/host-main.cjs`, the mounted file.
   The tag moved under us. The answering host's `"failureCode":
   "gateway/unknown-method"` and its `CreateGrokBotAgent` calls are in
   neither our source nor the bundle (checked by grep of both). Now
   `CLAIDOR_BOX_IMAGE_DIGEST` defaults to the Mac's build, and EnsureSandBox
   replaces a box whose image is not the configured reference
   (`stale_image`), the rule the Mac applies by refusing one. The registry
   still serves that digest (200 on its manifest, 29 September), and a real
   Docker Engine accepts the tag-and-digest form the Mac and the server
   both build. `test_a_box_on_another_image_is_replaced_on_its_volumes`.
   **The Mac floats on the same tag**: a Mac that pulls the image fresh
   today gets the 28 September build and the same foreign host. Pinning
   it there too needs the app rebuilt and its existing container removed
   (the Mac refuses a container on another image), so it is a separate
   change.

## What the founder must create

1. **A VM with Docker** (amd64; the image is `linux/amd64`, 4 GB+ RAM per
   box) reachable from Render: expose the Engine API over TLS
   (`dockerd -H tcp://0.0.0.0:2376 --tlsverify --tlscacert … --tlscert …
   --tlskey …`; Docker's docs "Protect the Docker daemon socket") and put
   the client cert's paths in `CLAIDOR_BOX_DOCKER_TLS_*` (Render secret
   files), or keep the daemon on a private network and use `http://`.
   Then `CLAIDOR_BOX_HOST_PROVIDER=docker`, `CLAIDOR_BOX_DOCKER_HOST`.
2. **The host bundle**: on a Mac, `npm run package`, then tar
   `dist/host/host-main.cjs` and `dist/box-exec-daemon/main.cjs` as
   `host/host-main.cjs` and `box-exec-daemon/main.cjs`, publish the tar
   (S3 works) and set `CLAIDOR_BOX_HOST_BUNDLE_URL`; or build an image
   `FROM public.ecr.aws/k0i0n2g5/cursorenvironments/universal:sand-box-latest`
   that `COPY`s the two files to their paths and set `CLAIDOR_BOX_IMAGE`.
3. **Firewall**: the published ports (Docker picks them from 32768 up) open
   from Render's egress to the VM, and from nothing else, when the API
   proxies; when the VM's own TLS proxy serves them, only 443 open.
4. **Optional, the direct path**: a wildcard `*.boxes.simeonlabs.com` A
   record to the VM and a TLS-terminating proxy on it that checks the
   network token and forwards `box-<hex>-<port>` to the container's
   published port. The proxy has to look the port up per box (published
   ports are random); the Caddyfile below does it with a map the broker
   can write, `/etc/caddy/boxes.map`, one line per box
   `box-<hex>-<port> <host port> <network token>`. Then
   `CLAIDOR_BOX_PUBLIC_URL_TEMPLATE=https://{box}-{port}.boxes.simeonlabs.com`.

```caddyfile
# /etc/caddy/Caddyfile — per-port hostnames for Simeon's cloud boxes.
# A row per hostname in /etc/caddy/boxes.map:  box-<hex>-<port> <hostport> <token>
*.boxes.simeonlabs.com {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}   # a wildcard cert needs DNS-01
    }
    map {labels.3} {upstream_port} {expected_token} {
        import /etc/caddy/boxes.map
        default "" ""
    }
    @unknown expression `{upstream_port} == ""`
    respond @unknown "no such box" 404
    @bad_token expression `{header.x-anyrun-network-token} != {expected_token} && {query.network_token} != {expected_token}`
    respond @bad_token "network token refused" 401
    reverse_proxy 127.0.0.1:{upstream_port}   # WebSocket upgrades pass through unchanged
}
```

The API does not write `boxes.map` today; a `docker inspect` loop on the
VM (`docker ps --filter label=com.simeonlabs.box=1`) can, reading the
token from the container's `SAND_GATEWAY_TOKEN` is not enough (that is the
gateway bearer, not the network token) — the broker would have to publish
it, which is the one piece of the direct path not built. Until then the
API proxy is the network path and needs no DNS.

E2B: the `e2b` package is not in the lockfile, and E2B's per-port
hostnames are `<port>-<sandbox-id>.e2b.app` — `<port>-<id>`, which is not
the `<label>-<port>` shape `deriveEgressTunnelWsUrl` reads. If E2B is
chosen later, the provider goes in `E2BBoxHost.create` (sandbox from a
template built on the box image, the same environment, ports published by
E2B) and the app gets a third derivation or the API proxy in front.

## What is measured, and what is not

Measured offline: `server/tests/sand/test_box_broker.py` (Ensure creates
then reuses; a stopped box is started, a lost one recreated on its
volumes; no host → 503 with the sentence; blocked → 429, hint, retry-after,
details; a box credential cannot Ensure; Recreate keeps the volumes and
Force wipes them; the migration stream replays CREATING then DONE; run
state absent → running → hibernated, from the cloud box's credential and
from a local box's; the local-exec mint, trade, 404 with no box, 401 dead,
revoked by sign-out; the proxy's token gate, path and headers, the SSE
stream; websockify and the tunnel over a real `websockets` echo server)
and `test_box_hosts.py` (the Docker provider against a fake Engine API:
the Mac's `docker run` line for line, the bundle at the two paths, pull on
404, replace on 409, ports read back, stop/start/remove with volumes).
Desktop: `tests/cloud-box-descriptor.test.mjs` (both tunnel shapes; the
descriptor from the broker's JSON; `setBoxRuntime` probes, falls back, and
shows the sentence; the recovery's probe; the switch's text).

Not run on a Mac, and the lines to read when it is:

1. **The env path first**, which needs no broker: run a box anywhere,
   set `SAND_HOST_GATEWAY_URL`, `SAND_HOST_GATEWAY_TOKEN` (and
   `SAND_HOST_GATEWAY_NETWORK_TOKEN`) on the packaged app and switch
   Settings → "Use local Docker VM" off. `EnvDescriptorHostConnector`
   takes it; `computer-stream.log` in the app's data folder shows the
   attach.
2. **Then the broker**: with `CLAIDOR_BOX_HOST_PROVIDER=docker` on Render,
   switch the toggle off. The API's log line is `sand.box.ensure`
   (`created`, `ready`, `gateway_url`); a refusal is `sand.box.ensure.refused`
   with the sentence the app shows under the switch. Inside the box,
   `/tmp/sand-host.log` should show the renewer's
   `inference credential renewed` line with the injected credential
   (no token file), then the `[claidor] model=` lines of the first turn.
   The proxy logs `sand.box.proxy.unreachable` / `ws_unreachable` when
   the VM's ports are not open to Render.
3. What may need a second look: whether the pinned renderer's Computer
   panel loads noVNC's assets through the proxy (they are relative to
   `vnc.html`, so `/sand-box/<id>/p/6080/app/…`; `vnc-trust.ts` injects the
   token per host, so `api.simeonlabs.com` gets it on every request from
   that webview partition); Render's idle timeout on the `/events` stream;
   and a box older than the 12 h local-exec credential.
