# The computer's screen: what "connecting" hides, and the log that now names it (22 September 2026)

## What the founder measured on the Mac

With the Computer panel spinning "connecting" indefinitely:

```
docker port grok-bot-local-vm 6080        → 127.0.0.1:6080
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
   (`~/Library/Application Support/Caisra/computer-stream.log` on a Mac),
   started over each run and echoed to stderr. It records the webview
   attach (src, partition, which preload, whether that file exists), every
   load event with Chromium's error code and name, every console line the
   page prints, a preload that failed to load, and a renderer that went
   away. Wired from `vnc-trust.ts`, which already saw every box webview.
2. **`preload-vnc.ts` `installNoVncStatusReporter`.** Inside the page, the
   preload prints `[CaisraScreen]` lines: the page's address, each change of
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
cat ~/Library/Application\ Support/Caisra/computer-stream.log
```

The first `attach webview` line says what the renderer asked for and
whether `preload-vnc.cjs` was found. What follows is the answer:

| Lines | Meaning |
|---|---|
| no `attach webview` line at all | the pinned renderer never created the guest |
| `guest load FAILED code=… (ERR_…)` | the page did not load; the code names why |
| `guest preload FAILED` | the box preload did not run |
| `[CaisraScreen] noVNC did not start` | the page loaded but noVNC's script did not run |
| `[CaisraScreen] … dialog=noVNC_connect_dlg` | autoconnect did not fire |
| `[CaisraScreen] … status="Failed to connect to server"` | the websocket was attempted and refused |
| `[CaisraScreen] … dialog=noVNC_credentials_dlg` | x11vnc wants a password |
| `[CaisraScreen] state=connected` | the stream is live and the fault is the "connected" message path |

## Measured here

| Measure | Value |
|---|---|
| `node --test tests/*.test.mjs` | 127 tests, 125 pass, 2 pre-existing skips |
| `tsc` on `source/` and `frontend/` | clean |
| the three bundles the build ships (`preload-vnc.cjs`, `preload.cjs`, `main.cjs`) | carry the new code |
| on a Mac | not yet run; the log above is the next reading |
