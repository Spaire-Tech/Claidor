# The app signs in to Claidor — measured, 19 September 2026

The app in `desktop/` speaks its own sign-in protocol, the
reconstruction's, and it is not ours to change. Claidor now answers it.
Three routes, at the **root** of the API host:

| route | method | what it is |
| --- | --- | --- |
| `/loginDeepControl` | GET, POST | the page the browser opens; asks, then records |
| `/auth/poll` | GET | what the app polls; 404 until confirmed, then the token pair |
| `/oauth/token` | POST | the refresh, in OAuth field names |

They live in `server/polar/desktop/app_sign_in.py`. `/desktop/…` is
untouched and still serves the older client's protocol.

## The two things that were nearly wrong

**1. `SAND_BACKEND_URL` alone does not do it.** This was the plan going
in, and it is not enough. Measured, by running the app's own
`getConfiguredBackendUrl`, `createDefaultLoginManager` and `LoginManager`
out of `desktop/source/` under node:

```
SAND_BACKEND_URL=https://api.claidor.com
  loginUrl  https://cursor.com/loginDeepControl?…      ← still Cursor
  pollUrl   https://api2.cursor.sh/auth/poll?…         ← still Cursor
  refreshUrl https://api.claidor.com/oauth/token       ← ours

CURSOR_API_BASE_URL=https://api.claidor.com
CURSOR_WEBSITE_URL=https://api.claidor.com
  loginUrl  https://api.claidor.com/loginDeepControl?… ← ours
  pollUrl   https://api.claidor.com/auth/poll?…        ← ours
  refreshUrl https://api.claidor.com/oauth/token       ← ours
```

Why: with no `SAND_AUTH_CLIENT_ID` and a hostname that is not local,
`isDevAuthBackend` is false, so `createDefaultLoginManager`
(`source/electron-main/account/cursor-auth.ts:155`) returns the stock
`LoginManager`, and that class reads `CURSOR_API_BASE_URL` and
`CURSOR_WEBSITE_URL` and **nothing else**
(`source/packages/cursor-config/auth/login.ts:12-13`).
`SAND_BACKEND_URL` is read only by `getConfiguredBackendUrl`, which is
what the refresh and the rest of the backend calls use. So:

**The configuration is two variables.**

```
CURSOR_API_BASE_URL=https://api.claidor.com
CURSOR_WEBSITE_URL=https://api.claidor.com
```

Setting `SAND_BACKEND_URL` to the same value as well is harmless and
makes the intent plain; setting it *instead* sends people to Cursor.

**Do not set `SAND_AUTH_CLIENT_ID`.** It would flip `isDevAuthBackend`
to true, and `shouldRefreshAccessToken` returns true unconditionally on
a dev backend (`source/shared/node/cursor-token.ts:50`) — a token
rotation before every single model call.

**2. The access token has to be readable.** The app reads `sub`, `email`
and `exp` straight off its own access token, and `isTokenExpiringSoon`
treats a token it cannot read an `exp` from as **always** expiring. An
opaque `claidor_da_…` token would therefore refresh before every call —
and several call paths pass no backend URL, falling back to
`DEFAULT_CURSOR_BACKEND_URL` (`api2.cursor.sh`), where a refresh fails
and the app *revokes the credentials and signs the person out*.

Measured, with a token minted by this server and read by the app's own
functions:

```
envelope  parseJwtPayload → {sub, email, exp, …}   isTokenExpiringSoon false   shouldRefresh false
opaque    parseJwtPayload → null                   isTokenExpiringSoon true    shouldRefresh true
```

## What the envelope is, and is not

The access token this flow hands out is the **same opaque token as ever,
inside a signed JWT**: `claidor_da_` + `header.payload.signature`, with
the opaque token in the `cat` claim and `sub`, `email`, `jti`, `exp`
beside it. `exp` is the session row's own `access_expires_at`.

- The prefix stays on the outside because `polar.auth.middlewares`
  refuses every bearer it does not recognise, and recognises this one by
  prefix alone — so `polar/desktop/tokens.py` is unchanged.
- It does not disturb the app: `parseJwtPayload` reads the **second**
  dot-separated segment, so a prefix on the first is invisible to it.
- `DesktopService.authenticate` unwraps and then looks the session up by
  the same hash as always. There is no second way to check a desktop
  credential; expiry, revocation and rotation all behave identically.
  Signing out through `/desktop/api/auth/logout` kills an enveloped
  token, and there is a test that says so.
- The opaque token is readable inside the payload. That adds no
  exposure: the envelope *is* the bearer, so anyone who can read the
  payload already holds the credential. Nothing in the app logs a
  decoded payload — `createLoggedInStatus` takes `sub`, `email`, `exp`
  and the cross-user-sharing code takes `sub`.

## The confirmation page, and why it exists

`/loginDeepControl` carries somebody's `challenge` in the query string.
A GET that signed you in would mean anyone who can get a signed-in
person to open a link of their making ends up holding that person's
session, because the verifier behind that challenge is theirs. So the
GET only **asks**: it names the account and waits for a POST. The
session cookie is `SameSite=lax`, which a cross-site form post does not
carry, and the POST additionally refuses a foreign `Origin`.

After the POST the page tries `<redirectTarget>://app/v1/open`, built
from the name the app sent — `simeon` since 23 September 2026
(`SAND_DEEP_LINK_SCHEME` in `desktop/source/shared/desktop.ts`; it was
`sand`, which Grok Bot also claims) — the one route `parseSandDeepLink`
(`desktop/source/shared/deep-link.ts`) accepts, which brings the window
forward. The server did not change for that: it never spelled `sand`. There is no auth deep link in that
parser and none is needed: the app learns it is signed in by polling.
A `redirectTarget` that is not a bare protocol token builds no link.

## No migration

A pending sign-in is a `DesktopAuthCode` row whose `code_hash` is the
keyed hash of `deepcontrol:{uuid}:{challenge}`. At poll time the server
recomputes the challenge from the verifier, so it can find the row only
if the poller holds the verifier — that is the whole PKCE proof — and
`used_at` makes it single-use exactly as a code is. Nothing was added to
the schema.

## Status codes, because the app keys on them

- `/auth/poll` **404** is « not yet ». `waitForResult` resets its
  consecutive-error count on a 404 and keeps waiting; any other failure
  counts towards giving up after three. An unknown uuid gets the same
  404, so a stranger polling a guessed uuid cannot learn whether
  somebody is mid-sign-in.
- `/oauth/token` answers a spent or unknown refresh token with **200 and
  `shouldLogout: true`**, not a 4xx. A non-2xx makes the app show « we
  couldn't confirm your sign-in » and throw the credentials away as a
  failure; `shouldLogout` is the plain « your session ended ». Both sign
  out; only one of them lies about why. A malformed request — wrong
  grant type, missing token, not JSON — does get a 400.

## What this does **not** do

Sign-in is not the whole of what the app asks of a server. Once signed
in it talks Connect RPC to the same backend URL for the profile
(`getTeams`, `getSandUsageStatus`), the access check
(`getSandAccessStatus`), the model list and the box broker. Claidor
serves none of those yet. Measured consequence, from the app's own code:
every one of them is caught and degraded — `fetchSandAccess` failing
returns `SAND_ACCESS_UNKNOWN` rather than signing anyone out, and a
failed profile fetch is reported and swallowed. The account identity the
app shows comes from the token, so it is right. What is missing is
everything downstream of it.

**Corrected 25 September 2026:** the round trip has run. Sign-in returned
to the packaged app on the founder's Mac on 23 September (CLAUDE.md, the
`simeon://` scheme), against `api.claidor.com`; the host has since moved to
`api.simeonlabs.com` and that round trip is not yet measured. The line
below is what was true when this record was written.

**Not run (as of 19 September):** nobody had signed in to a deployed `api.claidor.com` with
these routes. What was run is the Python suite
(`tests/desktop/test_app_sign_in.py`, 28 tests then, green) and the app's own
URL and token resolution under node, both above.
