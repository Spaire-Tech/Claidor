# Simeon's cloud computer

The image every agent's desktop runs in, written by Simeon Labs
(Track D, piece 3 of the detachment plan, 5 October 2026). Before it, the
cloud computer was an image built by someone else; the server and the Mac
mounted our host into it. This folder is that image, ours: what it installs,
what runs inside, and the small contract the host relies on.

## What is in it

| Piece | Where | What it does |
|---|---|---|
| `Dockerfile` | `box/Dockerfile` | Debian trixie, Node 24, Google Chrome, the desktop (Xvfb, xfwm4, picom, x11vnc, websockify and noVNC, xdotool, ImageMagick), tools for the shell (git, gh, ripgrep, jq, ffmpeg, poppler, python3, uv, bun, playwright-core, LibreOffice), the host's add-ons compiled against that Node under `/home/box/deps`, and our scripts under `/usr/local/bin`. |
| `start-simeon-box` | `bin/` | The entrypoint (under tini). Prepares folders, logs and the machine id, then runs the supervisor. |
| `simeon-supervisor.mjs` | `bin/` | Starts and keeps alive the primary desktop, the exec daemon (1337), the window router (1339), the fork screens' websockify (6081) and the host (1340, when its bundle is mounted). Writes the health file the host forwards and answers the command mailbox. |
| `simeon-desktop` | `bin/` | Brings one desktop up: the X server, the wallpaper, the VNC server, the screen's websockify (or a fork token), the window manager, the compositor. Registers each piece with `box-register` so the supervisor restarts it. |
| `start-window`, `stop-window` | `bin/` | A fork window on display `:N` for one agent: its own desktop, its own exec daemon on `14000+N`, an owner token. The host runs these. |
| `simeon-window-router.mjs` | `bin/` | One door on 1339 for every exec daemon: `x-sand-display: N` and `x-sand-window-owner: <token>` pick the fork daemon, 403 when the token is not the window's. |
| `box-chrome`, `box-chrome-policy` | `bin/`, `etc/chrome-policies/` | Chrome as the box user on the current display, a profile per desktop, DevTools on a port only the box can reach, with the policies under `etc/`. |
| `sand-wallpaper`, `sand-wallpaper-tone.mjs` | `bin/`, `wallpapers/` | The wallpaper by time of day in the person's time zone (three tones drawn from the Simeon mark). |
| `box-doctor` | `bin/` | One PASS or FAIL line per check and a summary, what the agent reads when its box acts up. |
| `ensure-machine-id`, `link-chrome-session` | `bin/` | One machine id that survives a new container on the same volume; a fork window's Chrome sharing the primary profile's sign-ins. |
| `deps/` | `box/deps/` | `package.json` and its lock: the add-ons the host loads (`tree-sitter`, `tree-sitter-bash`, `web-tree-sitter`), versions as in `desktop/package.json`. |
| `test/smoke.sh` | `box/test/` | Runs the whole box on a Linux machine without Docker and checks the contract (40 checks). |

The host bundle is not in the image. The server (`BoxSpec`,
`server/simeon/sand/box_hosts.py`) and the Mac (`local-docker-host-connector.ts`)
mount it read-only when they make the container:

```
/home/box/sand-host/host-main.cjs       the host
/home/box/box-exec-daemon/main.cjs      the exec daemon
```

A new host is a new container with the new bundle mounted, never a swap
inside a running one (`docs/services-core.md`, "The host bundle channel").

## The contract the host relies on

Everything the host, the server and the Mac expect from the image, measured
in the code that calls it (5 October 2026):

- **Ports.** 1337 exec daemon (bearer `local`), 1339 window router, 1340 the
  host's gateway (`SAND_HOST_PORT`), 5900 primary VNC, 6080 primary screen
  (websockify with noVNC), 6081 fork screens (websockify, token files under
  `/tmp/sand-novnc-tokens.d/<N>`, one line `N: localhost:590N`). Fork
  windows: display `:N`, VNC `5900+N`, exec daemon `14000+N`, Chrome
  DevTools `9222+N` (`9223` on `:1`). The server dials 1340, 6080, 6081; the
  Mac the same through the host's stream guard.
- **Environment the host reads** (set by the server and the Mac, not here):
  `SAND_SUPERVISOR_ENABLED=1`, `SAND_USE_EXISTING_BOX_EXEC_DAEMON=1`,
  `SAND_DATA_ROOT=/home/box/sand-data`, `SAND_TREE_SITTER_NODE_DEPS=/home/box/deps`,
  `NODE_PATH=/home/box/deps`, `SAND_GATEWAY_BIND_HOST`, `SAND_HOST_PORT`,
  `SAND_GATEWAY_TOKEN`, `SAND_BACKEND_URL`, `SAND_INFERENCE_RENEWAL_CREDENTIAL`.
  The supervisor adds `SAND_PACKAGED=1`, `SAND_HOST_IN_BOX=1`,
  `SAND_HOST_LOG_FILE=/tmp/sand-host.log` when it starts the host.
- **Files.** `/tmp/sand-supervisor/desktop-health.json` (the shape
  `desktop-health-forwarder.ts` parses), `/tmp/sand-supervisor/status.json`,
  `/tmp/sand-supervisor/command.json` and `acks/`, `/tmp/sand-desktop/<group>/<name>.json`
  (the registry of desktop pieces), `/tmp/sand-window-tokens.d/<N>`,
  `/home/box/sand-data/.sand-host-crash.json`, `/home/box/.sand-webauthn-proxy-enabled`
  (the marker the host writes before calling `box-chrome-policy`),
  `/home/box/sand-data/settings.json` (read for the time zone).
- **Scripts the host calls.** `start-window N [token]` (exit 75 when `:N`
  belongs to another token), `stop-window N`, `box-chrome [args]`,
  `box-chrome-policy`, `sand-wallpaper paint <display>`,
  `node sand-wallpaper-tone.mjs <settings>` (prints `<tone> <seconds>`),
  `box-doctor`.
- **Logs.** `/tmp/sand-supervisor.log` is the container's own log here;
  `/tmp/sand-host.log`, `/tmp/exec-daemon.log`, `/tmp/start-desktop.log`,
  `/tmp/xvfb:N.log`, `/tmp/x11vnc:N.log`, `/tmp/novnc:N.log`,
  `/tmp/xfwm4:N.log`, `/tmp/picom:N.log`, `/tmp/chrome:N.log`,
  `/tmp/sand-window-router.log`, `/tmp/novnc-forks.log`,
  `/tmp/sand-window-N/*.log`.

The `sand-` and `box-` names above are the host's: they are read by code
the Mac app and the server already ship, so they stay (`docs/kept-names.md`).

## Building

From the repository root, for the servers' architecture:

```sh
docker build --platform linux/amd64 -f box/Dockerfile \
  --build-arg SIMEON_BOX_VERSION=$(git rev-parse --short HEAD) \
  -t simeon-box:$(git rev-parse --short HEAD) .
```

Every version in the Dockerfile is pinned (Node, Chrome, playwright-core,
bun, uv, the add-ons' lock), so a build of a commit is reproducible. The
build checks itself: Node runs, Chrome is the pinned version, playwright
connects over CDP, the add-ons parse a shell line, every script passes
`node --check` or `bash -n`.

## Running it by hand

```sh
docker run --rm --name simeon-box-trial \
  -p 127.0.0.1:1340:1340 -p 127.0.0.1:6080:6080 -p 127.0.0.1:6081:6081 \
  -v simeon-box-trial-workspace:/workspace -v simeon-box-trial-data:/home/box/sand-data \
  --mount type=bind,src=$PWD/desktop/dist/host/host-main.cjs,dst=/home/box/sand-host/host-main.cjs,readonly \
  --mount type=bind,src=$PWD/desktop/dist/box-exec-daemon,dst=/home/box/box-exec-daemon,readonly \
  -e SAND_SUPERVISOR_ENABLED=1 -e SAND_USE_EXISTING_BOX_EXEC_DAEMON=1 -e SAND_DATA_ROOT=/home/box/sand-data \
  -e SAND_GATEWAY_BIND_HOST=0.0.0.0 -e SAND_HOST_PORT=1340 -e SAND_GATEWAY_TOKEN=trial \
  simeon-box:$(git rev-parse --short HEAD)
```

Then `http://127.0.0.1:6080/vnc.html` shows the desktop, and
`docker exec simeon-box-trial box-doctor` says what is up.

## Testing without Docker

`box/test/smoke.sh` installs the scripts into `/usr/local/bin` of a Linux
machine that has the desktop tools, boots the box with our exec daemon,
and checks the contract: the desktop, every port, capabilities directly and
through the router, a screenshot over the real wire, a fork window with
the right and a wrong owner token, the supervisor restarting a killed VNC
server, the command mailbox, the doctor, the wallpaper, a clean stop.
Measured 5 October 2026 on the development machine: 40 of 40 pass.

```sh
cd desktop && node scripts/build-box-exec-daemon.mjs
sudo SIMEON_BOX_EXEC_DAEMON=desktop/.build/box-exec-daemon/main.cjs box/test/smoke.sh
```

What the smoke test cannot see, and the Docker build must: Chrome itself
(not installed on the development machine), the host running inside (no
bundle there), and the image's own package versions.

## Switching the cloud to it

The server pins the image with `SIMEON_BOX_IMAGE` and
`SIMEON_BOX_IMAGE_DIGEST` (`server/simeon/config.py`); a box on another
image is replaced, keeping its two volumes (`docs/services-core.md`). The
Mac's internal Docker path reads `SIMEON_BOX_IMAGE` the same way
(`local-docker-host-connector.ts`), with the earlier image as its default
until ours is published.
