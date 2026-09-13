# Build log

What was actually done, stage by stage, with the commits and the
verification. `plan.md` says what we intend; this says what happened,
including the things that turned out differently.

Newest stage last.

---

## Stage 0 — Point the app at our own server

**Commit:** `4eeffd85`. Preceded by `9d5c9c59` (the name).

### What changed

**One base URL, shared by both processes.** `src/shared/server/
constants.ts` is new and holds `SERVER_API_BASE_URL =
'https://api.claidor.com/desktop'`. The main process imports it in
`libs/endpoints.ts` and keeps a development override
(`FAISER_SERVER_BASE_URL`, was `LOBSTER_SERVER_BASE_URL`); the renderer
imports it directly.

**Nothing else had to move.** The app's paths already matched the
server's: `/api/auth/exchange`, `/api/auth/refresh`, `/api/auth/logout`,
`/api/user/profile`, `/api/user/profile-summary`, `/api/user/quota`,
`/api/models/available`, `/api/models/pricing-catalog`, and both proxy
routes. The base ends in `/desktop` because that is the prefix
`server/polar/desktop/endpoints.py` mounts under, and everything lined up
without a single path edit.

**Update, skill-store and kit-store** are built off that base instead of
NetEase's absolute URLs.

**The renderer's duplicate endpoint getters are gone.** It carried its
own `getUpdateCheckUrl`, `getManualUpdateCheckUrl`,
`getFallbackDownloadUrl`, `getSkillStoreUrl` and `getKitStoreUrl` that
nothing in the renderer imported — those calls are all made from main.
Duplicates pointing at another company's servers are worse than no
duplicates.

**Sign-in lost a round trip.** Upstream's `fetchLoginUrl()` asked NetEase
for the login URL over a request that could fail, then fell back to a
portal page. Ours is a fixed route, so it returns `${base}/login` and the
fetch and the fallback are both gone.

**Analytics is off at the source.** This was the urgent part and it was
not in the plan — the audit found it. Upstream posts every product event
to `rlogs.youdao.com` carrying the installation id, the signed-in user
id, subscription status and keyfrom attribution, including one fired
automatically at app start before anybody clicks anything.
`reportYdAnalyzer` now discards the event: no URL is built, no request is
made, nothing is queued for later. The cut is at the one function all 105
call sites go through. The sending machinery, the pending queue and the
retry timer are deleted.

### What was deliberately left

The portal and download links still point at NetEase
(`getPortal*`, `getFallbackDownloadUrl`). Every one is handed to
`shell.openExternal`, so nothing is fetched unless a person clicks a
growth surface — the ad slot, the credits float, the upgrade and pricing
links — and those screens go with the Messages shell. Pointing them at a
site that does not exist would be worse. Both files carry a comment
saying so and naming the one place to change.

### Fallout the tests caught

`logReporterUuidQueue.test.ts` covered the pending-event queue and was
deleted with it. `logReporter.test.ts` was rewritten to prove the
negative on every path — nothing sent for a normal event, nothing sent
for the app-start event, a touchpoint identity override ignored rather
than reported, and nothing queued after five calls.
`auth.test.ts` pinned the old portal login URL and now reads
`SERVER_API_BASE_URL`.

### Verified

Against the live server:

| Route | Result |
|---|---|
| `GET /desktop/api/kit-store` | 200 — `{"code":0,"data":{"value":{"kits":[]}}}` |
| `GET /desktop/api/skill-store` | 200 |
| `GET /desktop/api/mcp-marketplace` | 200 |
| `GET /desktop/api/updates/check` | 200 |
| `GET /desktop/api/user/profile` | 401 — no token, correct |
| `GET /desktop/api/models/available` | 401 — no token, correct |
| `POST /desktop/api/proxy/v1/messages` | 401 — correct |
| `POST /desktop/api/proxy/v1/chat/completions` | 401 — correct |

Locally: `tsc --project electron-tsconfig.json` clean, `tsc` clean,
`vitest run` 3900 passed across 394 files, `eslint --max-warnings 0`
clean on every touched file.

**Not verified:** the app has not been opened. Signing in with a Claidor
account and watching credits move is the founder's check.

### One thing I got wrong in passing

`GET /desktop/api/proxy/v1/chat/completions` returned 404 and I read it
as a missing route. It is the method: `POST` returns 401, which is
correct for an unauthenticated proxy call. Both proxy routes exist and
behave.

---

## Before Stage 0 — The name

**Commit:** `9d5c9c59`.

Faiser, applied in `appConstants.ts` as the single definition site,
plus `electron-builder.json` and `package.json`. It had to land before
anything shipped because `APP_NAME` decides the `userData` directory.
`direction.md` §0 says what deliberately keeps the old name and why.

**Two real faults surfaced while chasing the test fallout**, neither
caused by the rename:

- `scripts/electron-builder-config.cjs` hardcoded the old product name in
  all three installer artifact names while deriving the web package URL
  from `productName`. It would have shipped installers named for another
  app.
- `scripts/dist-win-web.cjs` separately hardcoded the same package name
  that the config derives. The two would have disagreed, and the build
  would have printed an upload path that does not exist.

Both now read `productName` from `electron-builder.json`.

Eleven tests across three files pinned the product name while the code
derived it. They derive it too now, so the next rename is checked by them
rather than broken by them.
