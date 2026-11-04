# The browser in the app: the bridge

How the engine sends the agent's browser steps to the browser in the Mac or
Windows app (4 November 2026). The engine's side is step 1 of [the plan](README.md);
the Windows app speaks it since step 2a (`windows/src/main/browser/`); the
Mac's browser comes with step 4.

The code: `desktop/source/shared/local-browser-gateway.ts` (paths, numbers,
sentences), `desktop/source/host/extensions/local-browser/local-browser-bridge.ts`
(the bridge), `desktop/source/host/runner/tools/app-browser-route.ts` and
`sand-browser-tools.ts` (the tools' second route). Tests:
`desktop/tests/app-browser-route.test.mjs`, with a stand-in app.

## The two paths

Shaped like local exec (`/local-exec/requests`, `/local-exec/responses`),
on the engine's gateway, reached through the server's proxy like the rest of
the gateway (`server/simeon/sand/box_proxy.py`).

| Path | What |
|---|---|
| `GET /local-browser/requests` | The engine's frames, as server-sent events (`data: {json}`). Open while the app's browser is there. |
| `POST /local-browser/responses` | The app's frames: `{"providerId": "…", "frames": [ … ]}`. Answers `{"ok": true}`. |

Both need the gateway's token (`Authorization: Bearer …`); without one set
on the gateway they answer 401. A request with an `Origin` header is refused,
as on every gateway path.

An answer on `/local-browser/responses` wakes a sleeping computer and goes
again, as local exec's does: the step that waits for it is frozen with the
computer and takes it where it stopped.

## The engine's frames

**`welcome`**, first on every stream:

```json
{ "kind": "welcome", "providerId": "…", "protocol": 1, "enabled": true }
```

`providerId` names this stream; every POST carries it. `enabled` is the
server's switch (below). Off, the app may stay connected but is sent no steps.

**`request`**, one browser step:

```json
{
  "kind": "request",
  "requestId": "…",
  "protocol": 1,
  "deadlineMs": 90000,
  "op": "snapshot",
  "viewId": "agent id",
  "args": { },
  "screenshot": true
}
```

- `op`: one of the ops below.
- `viewId`: the agent's tab (its id unless the step names another). The
  same view on the computer's Chrome is the same tab here.
- `args`: the tool's own arguments, as the agent wrote them, without
  `viewId`. For `upload_file`, `paths` is replaced by `files` (below).
- `screenshot`: whether to send a picture of the page with the answer.
- `deadlineMs`: the app gives up and answers with an error after this. The
  engine gives up after two minutes and sends `cancel`.

**`cancel`**: `{ "kind": "cancel", "requestId": "…" }`. Stop that step if it
is still running; send nothing for it.

## The app's frames

**`hello`**, first on every stream, and again after a reconnect:

```json
{
  "kind": "hello",
  "protocol": 1,
  "browser": true,
  "platform": "mac",
  "label": "MacBook Pro",
  "deviceId": "…",
  "browserSession": "…"
}
```

- `platform`: `mac` or `windows`. The agent is told "this Mac" or "this PC".
- `browserSession`: 8 to 128 letters, digits, `-` or `_`, made when the
  app's browser starts and kept until it quits. A stream that drops and
  comes back with the same session carries on the same tasks.
- A hello without `browser: true`, without protocol 1, another platform or
  a bad session is not used (logged as `refused-hello`).

**`ping`**: `{ "kind": "ping" }` every 10 seconds. An app that has pinged and
then is quiet for 30 seconds is taken as gone.

**`response`**, once per request:

```json
{
  "kind": "response",
  "requestId": "…",
  "ok": true,
  "summary": "Captured page snapshot (12 interactive refs)",
  "url": "https://example.com/",
  "title": "Example",
  "data": "- button \"Buy\" [ref=e3]",
  "viewId": "…",
  "screenshot": true,
  "screenshotB64": "…"
}
```

Or, when the step failed: `{ "kind": "response", "requestId": "…", "ok": false, "error": "…" }`.

Only the stream that was sent a request may answer it. The engine writes the
answer exactly as it writes the computer's helper's: the summary, then
`Current page: <title> (<url>)`, then `data`; a failure is its `error`. The
picture is a PNG, sent only when `screenshot` was asked, and left out above
16 MB.

## The ops

The same ops and arguments as the computer's helper, each doing what it
does there (`desktop/source/host/runner/tools/sand-browser-driver-source.ts`,
its `OPS`, is the reference for what each does). Each app writes its own
sentences and its own outline; what the agent reads is shaped the same:
the outline with `[ref=eN]` handles, the page, `data`, the picture. In short:

| Op | Tool | Arguments |
|---|---|---|
| `navigate` | `browser_navigate`, `OpenPage` | `url`, `newTab`, `front` (OpenPage: in front, no picture) |
| `snapshot` | `browser_snapshot` | `selector`, `interactive`, `maxDepth`. `data` is the outline with `[ref=eN]` handles, frames as `fN eM` |
| `click` | `browser_click` | `ref`, `element`, `button`, `doubleClick`, `modifiers`, `offsetX`, `offsetY`, `holdDurationMs` |
| `mouse_click_xy` | `browser_mouse_click_xy` | `x`, `y`, `element`, `button` |
| `type` | `browser_type` | `ref`, `text`, `submit`, `slowly`, `clear` |
| `fill` | `browser_fill` | `ref`, `value` |
| `select_option` | `browser_select_option` | `ref`, `values` |
| `upload_file` | `browser_upload_file` | `ref`, `element`, `files` |
| `press_key` | `browser_press_key` | `key` |
| `scroll` | `browser_scroll` | `ref`, `direction`, `amount`, `deltaX`, `deltaY` |
| `drag` | `browser_drag` | `sourceRef`, `targetRef` or `targetX`/`targetY`, `element` |
| `get_bounding_box` | `browser_get_bounding_box` | `ref` (no picture) |
| `highlight` | `browser_highlight` | `ref`, `durationMs` |
| `cdp` | `browser_cdp` | `method`, `params`. The helper's refusals apply: the `Browser.`, `Target.`, `Storage.`, `SystemInfo.`, `Security.`, `Input.`, `Tethering.` and `Cast.` methods, and the cookie and cache ones |
| `tabs` | `browser_tabs` | `action` (`list`, `new`, `close`, `select`), `index` (no picture) |
| `screenshot` | `browser_take_screenshot` | `fullPage` (at most 2000 pixels on a side, as the helper) |
| `review_state` | Auto-review | none; see below |
| `form` | The cards' fills (step 3b) | `action`, `domain`, `fields`, `values`, `submitAfterFill`, `missingAs`, `keyDelayMs`, `value`; see below (no picture) |
| `checkout` | The checkout card (step 3c-1) | `action`, `pageHint`, `fields`, `values`, `expiryLong`, `keyDelayMs`, `token`; see below (no picture) |

A ref is good only for the latest snapshot of its tab: an old one is
refused with a sentence that says to take a fresh snapshot.

In the Windows app (step 2a), a frame of another site is named in the
outline but not read (its controls have no refs; `browser_mouse_click_xy`
on the picture reaches them, since step 3c-1: until then the click went
to the page around the frame). Frames of the page's own site are read.

**Files.** For `upload_file` the engine reads the files on the computer,
with the helper's checks (an existing file, inside `/workspace` once links
are followed) and sentences, and sends them:
`"files": [{ "name": "resume.pdf", "path": "/workspace/uploads/resume.pdf", "dataB64": "…" }]`,
25 MB at most together. The app gives them to the page's file field or the
file window the click opens, never showing that window, and answers
`Attached resume.pdf to <element>`.

**`review_state`**, for Auto-review before a step that changes a page: the
app answers `ok: true` with `data` as JSON,
`{ "pages": [{ "id": "…", "url": "…" }], "viewPageId": "…" }`: every open
tab, and the tab of the request's view. The engine hashes the list as it
hashes the computer's tabs, and checks it again before the step runs. A
failure, or a `data` without `pages`, refuses the step under review.

**The take-over** (`request_box_help`, step 3) for a task in the app: the
engine asks the app for a `screenshot` (8 seconds at most) and the card
shows that picture instead of the computer's screen. Nothing else changes
on the line; the person's answer goes to the engine as before.

**`form`**, the cards' fills (step 3b): the in-chat form, 1Password's
fill, the saved login and the new password, for a task in the app
(`desktop/source/host/runner/tools/app-browser-forms.ts`). The engine
sends, with a 60-second deadline:

- `action`: `check` or `locate` (only look for the fields), `fill`, or
  `newPassword`.
- `domain`: the card's site; the app uses the agent's tabs on it, its
  current tab first.
- `fields` (not for `newPassword`): 30 at most,
  `[{ "id": "email", "type": "email", "target": { "ref": "e4", "selector": "#email", "label": "Email" } }]`,
  each found by its ref, else its selector, else the words that label it,
  in the page first, then in its frames of other sites (since 3c-1).
  The types are the card's: `text`, `email`, `tel`, `password`, `otp`,
  `number`, `date`, `select`, `textarea`, `checkbox`.
- `values` (`fill` only): each field's value by its id, and nothing else.
- `submitAfterFill` (`fill`): Enter after a one-field form whose field
  went in; `missingAs`: `fillFailed` or `notFound`, for a field not found.
- `value` (`newPassword`): the password, typed into the page's
  new-password fields (three at most).
- `keyDelayMs`: between keys, 25 unless given, 200 at most.

The app answers `ok: true` with `data` as JSON, never a value:
`{ "page", "missing": [ids] }` (`check`), `{ "page", "found": [ids] }`
(`locate`), `{ "page", "outcomes": { id: "filled" | "fillFailed" | "notFilled" | "notFound" }, "submitted" }`
(`fill`), `{ "page", "filled", "failed" }` (`newPassword`). The engine
writes the computer's own sentences from it. A step with no tab on the
site answers `ok: false`. Neither side logs the arguments; the app's log
has only the op and how long it took.

**`checkout`**, the checkout card (step 3c-1), for a task in the app
(`desktop/source/host/runner/tools/app-browser-checkout.ts`). The app uses
the agent's tabs whose address holds `pageHint`, else those on its site or
under it (the agent's current tab first), as the computer does:

- `read`: the page's text, `{ "page", "text" }`; the card's total is
  checked against it. 25 seconds at most.
- `picture`: `{ "page", "jpegB64", "iconUrl" }`, the tab as it shows now
  and the icon the page names, for Review order. 25 seconds at most.
- `fill`: Link's or Shop's one-time card. `fields` are the computer's own
  marks, in the order they are filled:
  `[{ "kind": "card number", "selector": "…", "frameOnly": "…" }]` (the
  kinds: card number, expiry, expiry month, expiry year, security code,
  name on card, billing ZIP); `values` each kind's spellings
  (`{ "expiry month": ["04", "4"] }`); `expiryLong` the expiry for a field
  asking for `YYYY`; `keyDelayMs` 35 unless given. The answer:
  `{ "page", "hinted", "found", "filled": [kinds] }`, never a value. 60
  seconds at most.
- `token`: Link's pay token into Link's block (`.AiAgentPaymentSteering`
  with `link_pay_token`): `{ "page", "found" }`.

The card's fields are looked for in the page and in its frames of other
sites (a payment provider's); a list (a month, a year) is chosen, every
other field typed key by key. The engine writes the computer's own
sentences from the answer. Neither side logs the arguments.

**While the person has control** (Take control in the Computer tab's full
view, step 2b), nothing on the line changes. In the app:

- The agent's steps wait in their queue, each until the person gives the
  browser back or until 5 seconds before its deadline, which answers
  `ok: false`: "The person has taken control of the browser here and
  hasn’t given it back yet. Wait a little, then take a fresh
  browser_snapshot before acting; or ask them in the chat."
- `review_state` doesn't wait: it is read at once.
- Given back, the refs of the last snapshot of each of the agent's tabs are
  refused ("The person used this page since your last snapshot, so eN may
  point elsewhere now; take a fresh browser_snapshot."), and the next
  answer says "The person used the browser (Take control) and gave it back;
  the page may have changed, so take a fresh browser_snapshot before
  acting."

## Which browser a step goes to

The engine decides, for each agent's tab (its view):

1. **The switch.** Off, every step runs on the computer's Chrome, as before.
   It is `SIMEON_APP_BROWSER=1` on the computer, which Simeon Labs' server
   sets for the people in `SIMEON_APP_BROWSER_USERS` each time their
   computer is made or replaced (`docs/services-core.md`, the cloud
   computer).
2. **A new task** goes to the app heard from last, when one with a browser
   is connected; else to the computer.
3. **A task stays where it started.** A task on the computer stays there
   until it has been idle ten minutes and a step opens an address
   (`browser_navigate`, `OpenPage`); then it chooses again. A task in the
   app stays there while that browser session is connected.
4. **The app's browser went away.** A step waits up to 10 seconds for a
   dropped stream with the same session to come back. Then, for a step that
   opens an address, the task starts afresh (rule 2). For any other step the
   agent is told, and the next steps go to the computer:

   > The browser on this Mac closed, and its pages with it. The next steps
   > use the browser on your own computer: start again from the address.

5. **Mid-step.** A stream that drops while a step runs fails that step:
   "The browser on this Mac stopped answering; try the step again." No
   answer in two minutes: "The browser on this Mac didn't answer within
   2 minutes; try the step again." A cancelled turn sends `cancel`.

## The log

In the computer's `/tmp/sand-host.log`:

- `[simeon] local-browser on (SIMEON_APP_BROWSER=1)` or `off (…)` at start.
- `[simeon] local-browser {"event":…}` for each stream (`registered`,
  `detached`), `hello`, `refused-hello`, a task's `route` (`app` with its
  place, or `box`), `closed`, `timeout` and `stopped`.

On the API: `sand.box.app_browser` when a computer is made with the switch on.
