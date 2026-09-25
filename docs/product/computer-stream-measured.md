# The computer's screen: what "connecting" hides, and the log that now names it (22 September 2026)

## What the founder measured on the Mac

With the Computer panel spinning "connecting" indefinitely:

```
docker port grok-bot-local-vm 6080        → 127.0.0.1:6080   (the container is simeon-box since 23 September)
curl -sI http://127.0.0.1:6080/vnc.html    → HTTP/1.1 200 OK
/tmp/novnc:1.log (inside the box)          → websockify up, 0.0.0.0:6080 → localhost:5900, no client lines
/tmp/x11vnc:1.log                          → x11vnc up on 5900 for display :1
```

Chat transport was already proven (Docker, container, host on 1340, token,
event stream). This proves the box side of the screen too: the page is
served and websockify and x11vnc are up. What it also proves is that in all
that time **no client ever reached websockify**: it logs a line per
connection and there were none. The app's webview never opened the
websocket. The break is between the app and that page.

## Why the app could not say so

Read off the reconstruction (`computer/shell/vnc-webview.tsx`,
`electron-preload/preload-vnc.ts`, noVNC 1.5 `app/ui.js`):

- The panel shows `.sand-box-vnc-pool__connecting` while `src != null &&
  !connected && !crashed`. "Connected" comes from one message the VNC
  preload sends when the page's root element gains `noVNC_connected`.
  Nothing times this out.
- The page is loaded with `autoconnect=true&resize=scale&reconnect=true`.
  With `reconnect=true` noVNC retries every 5 s after a failed connect,
  forever; each failure sets `noVNC_disconnected` and writes "Failed to
  connect to server" into `#noVNC_status`, which the preload's chrome hider
  keeps off screen. A page that never loads only emits `load_fail`
  telemetry, to a structured-log endpoint Claidor does not serve.
- So a page that fails to load, a preload that fails, a noVNC that never
  starts, a socket that is refused, and a password prompt all look the
  same: a spinner.

This is stock Grok Bot code. There is no unused fix in it. What stock does
differently in production is the transport: a cloud box's desktop URL is
rewritten to the pod's egress proxy with a network token
(`box-host-connector.ts` `buildConnection`, `box-vnc-proxy.ts`). Our local
Docker box hands the renderer the raw loopback URL, which is stock's dev and
local-VM path, allowed by name in `vnc-trust.ts` (`isLoopbackBoxDesktopUrl`).

## What the app does now

Three pieces, none of which change the connection itself:

1. **`electron-main/vnc/computer-stream-log.ts`.** The main process writes
   `computer-stream.log` in the app's data folder
   (`~/Library/Application Support/Simeon/computer-stream.log` on a Mac; before 22 September's rename the folder was `Grok Bot`, never `Caisra`),
   started over each run and echoed to stderr. It records the webview
   attach (src, partition, which preload, whether that file exists), every
   load event with Chromium's error code and name, every console line the
   page prints, a preload that failed to load, and a renderer that went
   away. Wired from `vnc-trust.ts`, which already saw every box webview.
2. **`preload-vnc.ts` `installNoVncStatusReporter`.** Inside the page, the
   preload prints `[SimeonScreen]` lines: the page's address, each change of
   noVNC's state, noVNC's own status sentence, any dialog it opens
   (connect, credentials), page errors, and "noVNC did not start" if no
   `noVNC_*` class ever appears within 5 s. They land in the same log
   through the main process.
3. **`electron-preload/computer-stream-notice.ts`.** The main process
   forwards each line to the window; when a spinner has been up for 20 s
   the window preload paints one sentence under it, from the last line that
   carried a reason (`shared/computer-stream.ts` `computerStreamReason`),
   with the log's path. It clears when the spinner does.

## How to read it

Open the Computer panel, wait 20 seconds, then:

```
cat ~/Library/Application\ Support/Simeon/computer-stream.log
```

The first `attach webview` line says what the renderer asked for and
whether `preload-vnc.cjs` was found. What follows is the answer:

| Lines | Meaning |
|---|---|
| no `attach webview` line at all | the pinned renderer never created the guest |
| `guest load FAILED code=… (ERR_…)` | the page did not load; the code names why |
| `guest preload FAILED` | the box preload did not run |
| `[SimeonScreen] noVNC did not start` | the page loaded but noVNC's script did not run |
| `[SimeonScreen] … dialog=noVNC_connect_dlg` | autoconnect did not fire |
| `[SimeonScreen] … status="Failed to connect to server"` | the websocket was attempted and refused |
| `[SimeonScreen] … dialog=noVNC_credentials_dlg` | x11vnc wants a password |
| `[SimeonScreen] state=connected` | the stream is live and the fault is the "connected" message path |

## Measured here

| Measure | Value |
|---|---|
| `node --test tests/*.test.mjs` | 127 tests, 125 pass, 2 pre-existing skips |
| `tsc` on `source/` and `frontend/` | clean |
| the three bundles the build ships (`preload-vnc.cjs`, `preload.cjs`, `main.cjs`) | carry the new code |
| on a Mac | not yet run; the log above is the next reading |

## "Can't reach …'s screen", audited (22 September 2026, evening)

The founder, after the rename build: "it says cant reach computer. no matter
how many times i retry." That is a different state from the endless
spinner, and it comes from earlier in the chain.

**What the words mean, read off the reconstruction** (`computer/shell/model.ts`,
`status-store.ts`, `controller.ts`): the panel shows "Can't reach X's screen"
with Retry when `readState === "error"`, and that is set only when the read
of the box's status **failed or exceeded 15 seconds**
(`VNC_STATUS_TIMEOUT_MS`), with no status ever cached. Retry calls the
status read again, then ensure. So a "Can't reach" that survives every
retry means `getForeverBoxStatus` itself fails every time. That call goes
renderer → coordinator → gateway (`http://127.0.0.1:1340`; **corrected 25 September 2026, ledger F-409: `getForeverBoxStatus` itself has no deadline** — the coordinator bounds only the SSE connect, `sendPrompt` and roster reads; a `timeout` outcome for this method comes from the SSE-connect deadline inside `resolveConnection`, not from the command) →
host `forever-box.getStatus` → `HostBox.getStatus` → `runState`, which for
the loopback box is always "running", then the cached desktop URL or
`state: "absent"`. On the host it is trivial and cannot take 15 s. So the
failure is the **gateway command**: the coordinator has no connection to the
box, the gateway is not answering, or the host throws. If chat works on the
same box, the last is the only one left; if chat also fails, it is the
first two.

**What could have changed between "connecting" and "can't reach".** The
rename touched `source/host`, so the host bundle hash changed, and the local
Docker connector replaces the container when that happens
(`localDockerContainerNeedsReplace`). A replaced container is a cold box:
the gateway has three minutes to come up before the connector gives up
(`READY_TIMEOUT_MS`), and until then every command fails. The exec daemon
is also not among the ten checks `box-doctor` runs (machine-id, chrome,
chrome-fds, egress, clock, dbus, xvfb, x11vnc, novnc, novnc-forks,
compositor), so a doctor that passes says nothing about it.

**What the app does now, so this never needs a terminal again.**

- The local Docker connector narrates every step into `computer-stream.log`:
  Docker's version, the container (exists, running, owned, schema, whether
  the host bundle matches), a replacement, a start or a creation, the wait
  for the gateway (a line after 20 s of silence), the gateway ready with the
  time it took, and any failure with its message.
- The coordinator's box-reachability reports that are not "ok" go into the
  same log: outcome (`timeout`, `network`, `http_5xx`, `box_blocked`…), the
  command, the cause, the base URL. Lines written before the log exists are
  held and flushed.
- The "Can't reach" placeholder gets one sentence under it at once, with the
  last reason and the log's path, the way the spinner does after 20 s.

**How to read it.** Open the Computer panel, then:

```
cat ~/Library/Application\ Support/Simeon/computer-stream.log
```

| Lines | Meaning |
|---|---|
| `local docker FAILED: … Docker is unavailable` | Docker Desktop is not running |
| `local docker: replacing the container` then `gateway not answering yet after 20s` | a cold box after a host change; wait, or it reports the failure at three minutes |
| `local docker FAILED: Local Docker VM did not expose its gateway within three minutes` | the new container's gateway never came up: `docker logs simeon-box --tail 50` is the next reading |
| `box reachability outcome=network … cause=ECONNREFUSED` | the coordinator cannot open the gateway port at all |
| `box reachability outcome=timeout method=getForeverBoxStatus` | the gateway answers but the host does not, within 15 s |
| `local docker: gateway ready` and no reachability line, yet "Can't reach" | the host throws inside `getStatus`; that is a host bug and the next thing to read is the host's own log inside the box |

Not run on a Mac.
