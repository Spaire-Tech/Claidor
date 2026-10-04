# How Simeon fits together

Simeon is a macOS app by Simeon Labs (`simeonlabs.com`). Each conversation in
the app is an agent. The agents work on a computer of their own, the "box": a
container that Simeon Labs runs for each person. The app, the box and the API
server are three separate programs that talk over the network. Around them
are the worker, the cloud runner, the web app and the website.

## The Mac app (`desktop/`)

The app is Electron, macOS on Apple Silicon only. Its code lives under
`desktop/source/` and compiles into the packaged `app.asar`.

- **The window.** The renderer is the checksum-pinned renderer of the upstream
  0.18.0 app the window comes from (see `desktop/NOTICE.md`). It is not
  rebuilt from source. At package time
  `desktop/scripts/lib/router-renderer-patch.mjs` edits its bytes: product
  name, marks, palette, header card, sheets and other styling. Each edit is an
  exact-anchor replacement, and the patch writes a record of every file it
  touched (`dist/renderer-router-extension.json`) that `npm run verify` checks.
  `desktop/frontend/` is a partial readable redraw of the window; it is not
  what ships.
- **Electron main process** (`source/electron-main/`). Sign-in, the account,
  settings, the connection to the box, the computer panel (noVNC), the
  startup data-folder move, and the local Docker connector used for testing.
- **The coordinator** (`source/node-agent-coordinator/`). A Mac-side process
  between the window and the box. It holds the gateway connection to the
  host in the box, supervises the local-exec daemon, forwards MCP sign-ins,
  and stamps the account scope on permission cards
  (`permission-scope-stamp.ts`).
- **The local-exec daemon** (`source/local-exec-daemon/`). Runs on the Mac and
  does the few things the agent may do on the person's own machine. It
  refuses sensitive paths (`~/.ssh`, `~/.aws`, `~/.simeon`, keychains,
  browser profiles) whatever the permission setting says
  (`source/shared/sensitive-local-paths.ts`).
- **The host** (`source/host/`). The agent loop and its tools. It does not run
  on the Mac: it runs inside the box. The packaged app carries it
  (`dist/host/host-main.cjs`) so it can be published to the box servers.
- **The box-exec daemon** (`source/box-exec-daemon/`). Shipped beside the
  host and mounted into the box at `/home/box/box-exec-daemon`. It serves the
  host's shell and file requests inside the box.

### The agent loop

A chat turn runs the host's full agent loop in the box
(`host/runner/turn-run-shell.ts`). The loop keeps one transcript per agent,
carries tool calls into the next turn, and can start teammates and subagents.
Every model call goes to Simeon Labs' proxy through the `simeon` model
provider (`host/extensions/inference/provider-session.ts`). Settings files
written before 29 September 2026 name it `claidor`, which is still read. The default models are
`gpt-6-sol` for the loop and `gpt-6-luna` for cheap work (summaries, memory,
computer and browser subagents, the auto-review classifier). The server
decides which models are offered (`server/simeon/desktop/pricing.py`).

## The cloud computer (the "box")

Every person runs on a cloud box. The app has no setting to change this.

- The API server finds or creates the box (`server/simeon/sand/box_service.py`,
  `ensure`). A new box is placed on the accepting box server with the most
  room and stays there (`box_service.place`, `box_hosts.py`). Box servers are
  Docker Engines reached over TLS; `SIMEON_BOX_HOSTS` lists several,
  `SIMEON_BOX_DOCKER_HOST` names one.
- The box image is pinned by digest (`SIMEON_BOX_IMAGE_DIGEST`). The host and
  the box-exec daemon are mounted into the container read-only from the
  published host bundle (`/var/lib/simeon/box-host/<key>/` on the box server).
  The container is labelled with the host's sha256, and a box whose label
  differs is replaced when it is idle.
- The host bundle comes from `SIMEON_BOX_HOST_BUNDLE_URL`: a folder with
  `sand-host-bundle-latest.version` and `sand-host-bundle-<commit>.tgz`. The
  server reads the pointer at most every ten minutes, with no restart.
  `npm run publish:host-bundle` writes it (see `docs/building-the-app.md`).
- The server gives the box a fixed environment (`box_hosts.py`), including
  `SAND_BACKEND_URL`, `SAND_INFERENCE_PROVIDER=simeon` and the box's own
  renewal credential. The box trades that credential for fresh model tokens
  at `POST /sand-box/inference-credential`.
- Sleep: the worker checks every minute (`sand.box.hibernate_idle`). A box
  that is not busy and has no app attached for `SIMEON_BOX_IDLE_HIBERNATE_AFTER`
  (30 minutes) is stopped with its files kept. Opening the app or a routine
  firing wakes it (`sand.box.wake`).
- Size and capacity: `SIMEON_BOX_MEMORY_LIMIT_MB` (4096),
  `SIMEON_BOX_CPU_LIMIT` (2.0), `SIMEON_BOX_MAX_RUNNING` (3 awake per server).
  Past the limit the app is told to wait and retry.
- The app reaches the box's ports through the API's proxy at
  `/sand-box/{box_id}/p/{port}/…`, for HTTP and WebSocket.

`docs/ops/box-host/render-env.md` is the operator's guide for the box servers.

**Local Docker, for internal testing only.** With
`SAND_BOX_RUNTIME=local-docker` the Mac runs the box itself as a Docker
container named `simeon-box`, mounting the host from the packaged app
(`electron-main/box/local-docker-host-connector.ts`). Nobody outside the team
should use it.

## The API server (`server/`)

Python, FastAPI, at `api.simeonlabs.com`. The package is
`simeon`. The same code runs as the API and as the worker. Every setting is
read as `SIMEON_<NAME>`, and `CLAIDOR_<NAME>` is still read when the `SIMEON_`
name is not set (`simeon/config.py`). Route groups:

| Group | Where | What |
| --- | --- | --- |
| Sign-in | root: `/loginDeepControl`, `/auth/poll`, `/oauth/token` | The app's sign-in (`simeon/desktop/app_sign_in.py`). At the root because the app builds each path with a leading slash. |
| Desktop API | `/desktop/api/*` | Model proxy (`/proxy/v1/responses` and others), models, profile, quota, feedback, memory sync, apps, box renewal credential (`simeon/desktop/endpoints.py`, `capabilities.py`, `apps.py`, `video.py`). |
| Sand routes | `/sand/*` | Notifications, listener relay and ingress, sharing (`simeon/sand/`). |
| Connect RPC | `/aiserver.v1.*` | Box broker (`GrokBotService`), cloud agents (`BackgroundComposerService`), `AiService/AvailableModels`, `DashboardService`, `AutomationsService`. Anything else answers `unimplemented`. |
| Box proxy | `/sand-box/*` | The box port proxy, local-exec credentials, the box's token renewal. |
| Cloud runner queue | `/maty/runner/*` | Where the cloud runner claims jobs (`simeon/maty/`). |

Connect calls must be JSON (`useBinaryFormat: false` on the app's transport);
`simeon/sand/connect.py` does not read binary protobuf. Desktop tokens start
`simeon_da_` (access), `simeon_dr_` (refresh) and `simeon_db_` (box
credential); the earlier `claidor_` prefixes are still accepted
(`simeon/desktop/tokens.py`).

## The worker

The worker runs the background jobs (Dramatiq). For Simeon that includes the
box sleeper and waker (`simeon/sand/box_tasks.py`) and the routine cron firing
for listeners (`simeon/sand/listeners_tasks.py`). It talks to the box servers
too, so it needs the same box settings and certificate files as the API.

## The cloud runner (`runner/`)

A Node service that claims jobs from `/maty/runner/*`, loads the person's
memory, asks the model one turn through the API's proxy on a per-job token,
and reports the answer. It has no tools. Each cloud-agent turn
(`simeon/sand/cloud_agents.py`) is one job.

## The web app (`clients/apps/web`)

Next.js, at `app.simeonlabs.com`. For the Mac app it provides the web sign-in
page: `/loginDeepControl` sends a person with no session to the web app's
`/login`, then asks them to confirm.

**Simeon on the web** (4 October 2026) is the Mac app's window served at
`app.simeonlabs.com/app`, with the page standing in for Electron
(`desktop/web/`, its README). The page trades the web cookie for the Mac's
token pair (`POST /auth/web-session`, a `DesktopSession` marked `web`), asks
the broker for the box, and runs the coordinator's gateway client in the
browser: commands and the event stream reach the host through the API's
proxy, which strips the browser's `Origin` so the host's own refusal of
browser requests keeps guarding direct access. The built page lives under
`clients/apps/web/public/app` and is rebuilt with `npm run web:build` in
`desktop/`. Connected apps are managed by the manager in the box
(`desktopMcp` on the gateway), and a sign-in started there comes back
through the server's hosted callback (`GET /desktop/mcp-oauth/callback`) to
`/app/connected.html`; the Mac and the box each refresh the sign-ins they
finished and exchange copies without the refresh token. The computer panel
is the box's noVNC page in a frame through the proxy. The agent's hands on
the person's own machine, WebAuthn, voice calls and the updater stay with
the Mac app.

## The website (`sites/simeonlabs.com`)

A static site served by Vercel from `public/`. Its hero plays the patched app
window as a scripted demo. `sites/simeonlabs.com/README.md` says how to
rebuild it.

## Sign-in

The app opens `https://api.simeonlabs.com/loginDeepControl` in the browser.
The page asks the person to confirm (after the web login if needed), then
opens `simeon://app/v1/open`. Meanwhile the app polls `/auth/poll` for its
token pair and later refreshes with `/oauth/token`. The access token is the
opaque desktop token inside a signed JWT, so the app can read its expiry.

The packaged app carries its backend in `LSEnvironment`: `SIMEON_API_BASE_URL`
and `SIMEON_WEBSITE_URL` (read by the login manager) and `SAND_BACKEND_URL`
(read by every other backend call), all `https://api.simeonlabs.com`. Do not
set `SAND_AUTH_CLIENT_ID`: it makes the app refresh its token before every
call.

## On the Mac

- **Bundle id:** `com.simeonlabs.simeon`. URL scheme: `simeon`. Executable and
  menu bar name: `Simeon`.
- **Data folder:** `~/.simeon`. On the first start that finds only
  `~/.caisra`, the app moves it there with one rename
  (`electron-main/startup/startup-data-root-migration.ts`). It holds, among
  other things, `vendor-mcp-installs.json`, `account-mcp-config.json` and
  `vendor-mcp-signin.log`.
- **Electron user data:** `~/Library/Application Support/Simeon` (from the
  staged `productName`).
- **Updates, Sentry and telemetry** are off in the packaged app: the build
  prepends `SAND_DISABLE_UPDATES=1`, `SAND_DISABLE_SENTRY=1` and
  `SAND_DISABLE_TELEMETRY=1` to the main process (`scripts/lib/build-asar.mjs`).

## Logs

- **Host log, in the box:** `/tmp/sand-host.log`. Our lines start with
  `[simeon]` (`source/shared/host-log.ts`): `model=` per model call, `tool=`
  per tool call, `send-message`, `prompt`, `memory-sync`, `channel=`,
  `auto-review`, `video`, `model-legacy` and others. The
  agent loop's own logger is silenced in production, so missing loop lines
  prove nothing.
- **Computer panel log, on the Mac:** `computer-stream.log` in
  `~/Library/Application Support/Simeon`. It records the box desktop stream:
  attach, load events, page console, failures. After 20 seconds without a
  connection the panel shows the last reason under the spinner.
- **Connector sign-ins, on the Mac:** `~/.simeon/vendor-mcp-signin.log`.
- **Server:** structured events such as `desktop.proxy.upstream_refused`
  (the provider's own refusal sentence; read it first when a model call
  fails), `desktop.video.generate`, `sand.box.ensure`,
  `sand.box.ensure.refused`, `sand.box.placed`, `sand.box.hibernated`,
  `sand.box.woken`, `sand.box.capacity.refused`, `sand.box.proxy.*` and
  `sand.listeners.*_refused`.

## Switches

On the Mac (environment of the app process):

| Variable | Effect |
| --- | --- |
| `SAND_BOX_RUNTIME=local-docker` | Run the box in local Docker (internal testing). |
| `SAND_DOCKER_BINARY` | Path to the `docker` CLI for the local box. |
| `SAND_STOP_BOX_ON_QUIT=1` / `SAND_KEEP_BOX_RUNNING_ON_QUIT=1` | Local box: always stop, or always keep, on quit. By default it keeps running only when an enabled routine exists. |
| `SAND_DISABLE_HWA=1` | Turn off GPU acceleration (on by default). |
| `SAND_DEVTOOLS=1` | Allow DevTools in a packaged build. |
| `SAND_SIMEON_FULL_AGENT=off` | Text-only escape hatch that runs turns on the Mac instead of the box loop. |
| `SIMEON_API_BASE_URL`, `SIMEON_WEBSITE_URL`, `SAND_BACKEND_URL` | Backend hosts; the packaged app sets them in `LSEnvironment`. |

In the host (inside the box):

| Variable | Effect |
| --- | --- |
| `SAND_AGENT_MODEL` | Model id for the agent loop. |
| `SAND_AGENT_MAX_STEPS`, `SAND_HIDDEN_TURN_MAX_STEPS` | Model-call budgets for asked turns and hidden turns. |
| `SAND_MEMORY_SYNC=0` | Turn memory sync off. |
| `SAND_LISTENER_RELAY_SERVED=0`, `SAND_SHARING_SERVED=0`, `SAND_CHANNELS_SERVED=0`, `SAND_VIDEO_SUBAGENT_SERVED=0` | Turn a served feature back to "coming soon". |
| `SAND_SIMEON_VIDEO_MODEL` | Model for the video subagents. |
| `SAND_AGENT_SCREENSHOT_TOOL=1` | Offer the agent's Screenshot tool (off by default). |
| `SAND_FEATURE_GATE_OVERRIDES` | Force feature gates, e.g. `sand_teach_by_demonstration=1`. |

Every `SAND_SIMEON_*` switch is also read under its earlier name,
`SAND_CLAIDOR_*`.

A cloud box gets its environment from the server, not from the Mac. The Mac
forwards the host switches in `SERVED_SWITCH_ENVS`
(`local-docker-host-connector.ts`) only into a local Docker box.

On the server: `SIMEON_BOX_*` (above), `SIMEON_DESKTOP_HOURLY_CREDITS` (the
hourly spend cap; the proxy refuses with code 40201 past it), and the provider
keys (`SIMEON_OPENAI_API_KEY`, `SIMEON_GEMINI_API_KEY`,
`SIMEON_COMPOSIO_API_KEY`).

## Not yet verified

- The packaged app on the cloud box, end to end on a Mac.
- A full sign-in round trip against `api.simeonlabs.com` from the packaged app.
- The data-folder move from `~/.caisra` to `~/.simeon` on a real Mac.
- Memory sync, channels, sharing, video subagents, listeners and skill
  publish with a real account.
- Auto-review cards for blocked commands, and whether the pinned window draws
  them.
- The box sleeping and waking against the production box server.
- Which exec daemon answers inside the box: ours, mounted, or the image's own.
