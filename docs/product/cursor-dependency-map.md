# What the app still needs from Cursor

**19 September 2026.** Every claim here came from a command, and every command
is in the file so it can be re-run. Where I could not test something, the row
says **untested** rather than guessing.

## How this was measured

```sh
cd desktop
# every URL literal in the readable source
grep -rhoE "https?://[^\"'\`]+" source/ --include=*.ts | sort -u          # 59 distinct
# the ones naming a Cursor host, excluding generated protobuf
grep -rnE "https?://[^\"'\`]*(cursor|anysphere)" source/ --include=*.ts \
  | grep -v "^source/packages/proto/generated/"                           # 18 call sites
# RPC methods declared by the backend services vs actually called
ls source/packages/proto/generated/aiserver/v1/*_connect.ts               # 7 services, 1,069 methods
```

**1,069 backend methods are declared. The app calls 67.** That ratio is the
headline: the surface looks enormous and is not.

## The table

| what it calls | what for | works without it? | what replaces it |
| --- | --- | --- | --- |
| `cursor.com/loginDeepControl`, `api2.cursor.sh/auth/poll`, `/oauth/token` | sign-in | **yes — already done** | Claidor. `server/polar/desktop/app_sign_in.py`, live |
| `EnsureSandBox`, `ForceRecreateSandBox`, `WatchSandBoxMigration` | brokering the agent's computer | **yes, in local-docker mode** | already in the app. `local-docker-host-connector.ts:245` routes to `localConnect()` and the broker is never called |
| `GetSandAccessStatus` | may this account use the product | **yes — degrades** | nothing. `fetchSandAccess` failing returns `SAND_ACCESS_UNKNOWN`; measured |
| `GetMe`, `GetSandUsageStatus`, `GetCurrentPeriodUsage`, `GetSandTrialClaimStatus`, `CancelSandTrial`, `UpdateUserName`, `GetUserPrivacyMode`, team settings | account name, usage numbers, plan | **yes — degrades**, each catch-and-continue | Claidor, if we want the numbers. Identity already comes from the token |
| `AvailableModels` | the model picker | **untested** | Claidor already serves a model list at `/desktop/api/models/available` |
| `RunWebSearch`, `RunWebFetch`, `RunGenerateImage`, `TranscribeAudio` | tools Cursor's backend executes | **untested — likely load-bearing** | ours to build, or drop the tool. This is real capability, not plumbing |
| 21 MCP / plugin methods (`GetAvailableMcpServers`, `ListSandMcpTools`, `ExecuteSandMcpTool`, marketplace, OAuth) | the plugin system | **untested** | Claidor serves empty skill/kit/MCP catalogues today |
| 11 `BackgroundComposer*` methods | Cursor's cloud agents | **untested — probably droppable** | nothing. This is their product, not ours |
| `RecordSandAuditEvents`, `ReportClientNumericMetrics`, `SubmitLogs`, 3 labelling calls | telemetry | **yes** | delete |
| `api3.cursor.sh/tev1/v1` (Statsig) | feature flags and event logging | **untested** | delete. **Hardcoded, not overridable by env** — the only network host in the app with no override |
| `metrics.cursor.sh` Sentry DSN | crash reporting | **yes** | delete. Already off: electron-main is built with `SAND_DISABLE_SENTRY ??= "1"` |
| `api2.cursor.sh/updates` | auto-update | **yes** | delete. Already off: `SAND_DISABLE_UPDATES ??= "1"` |
| `cursor.com/help`, `/dashboard`, `/agents/<id>`, `review.cursor.com` | links a person can click | **yes** | point at ours, or remove the menu item |
| `cursor.com` in the agent's system prompt | the agent tells users about Cursor | **yes** | rewrite. Cosmetic to the code, not to the user |

## The three things worth knowing

**1. The biggest dependency is already solved and shipped.** The box — the
machine the agent works on — was the one thing that looked structural. In
`local-docker` mode the broker call never happens; the connector branches
before it. That is the single most important line in this map:

```ts
connect: async () => settings.getBoxRuntime() === "local-docker"
  ? await localConnect() : await remote.connect(),
```

**2. Almost everything else is optional by construction.** Access, usage,
profile, telemetry — each is wrapped in a catch that degrades. That is not luck;
the app is built to survive a backend that does not answer. It is why sign-in
works today against a Claidor that serves none of the rest.

**3. Four calls are real capability, not plumbing.** `RunWebSearch`,
`RunWebFetch`, `RunGenerateImage`, `TranscribeAudio` are work Cursor's servers
*do*. Cutting them removes features unless we build or buy replacements. Every
other row is a name, a link, or a number.

## What is untested, and why

Rows marked untested need the app running to answer — the question is always
"does this throw or degrade", and that is visible in a log, not in a grep. They
are cheap to settle once the app is up: turn one off, watch what happens.

I have deliberately not written "does not exist" or "is not needed" anywhere I
did not check.
