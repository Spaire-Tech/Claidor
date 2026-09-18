# Fleet log

The Chief of Staff's working memory. Updated every sweep. If this session is
replaced, a new Chief of Staff reads `staffing.md`, `how-the-fleet-runs.md` and
this file, in that order, and is current.

---

## Standing orders, from the founder, 18 September 2026

> "i dont wanna hear findings. im giving you full independence. only come back to
> me if theres something that genuinely need my decision. important only. if i
> can make that decision later dont ping me. i wanna come back with box server
> and brief all done."

So: **do not report progress. Do not report findings.** Ping only for a decision
that is (a) genuinely the founder's, and (b) blocking — work cannot continue
without it. A decision that can be made later is written down here and raised
when they next appear. The goal state is Box, Server and Brief all finished.

This is the same rule the agents themselves are given: interrupt for decisions,
not for progress.

## The three live agents

| Agent | Session | Branch | Environment |
|---|---|---|---|
| Server | `session_01DLw6fMpXbS3xWMBEpufTY6` | `claude/caisra-server` | Default |
| Brief | `session_01M1HpXj7rgnK8VJqWm85hUU` | `claude/caisra-brief` | Default |
| Box | `session_01CXLzHT5hrp4mRaZLgYaPGs` | `claude/caisra-box` | trusted network |

Parent (this Chief of Staff): `session_01YMzWbgRZHr2vqCvqAGGeow`, branch
`claude/caisra-mac-app-ouliez`.

All three may push and may open a pull request when work is finished and
verified. The `config:auto-create-pr:off` tag they inherited only prevents
*automatic* PRs, which is the behaviour we want: deliberate, not reflexive.

### What each was asked for

- **Server** — the image route. Read the speech route (`endpoints.py:1046`) as
  the pattern, decide between a synchronous `/api/proxy/v1/images/generations`
  and emulating the async task API the app already expects, build it with a
  pricing entry so it is metered, and **write down** what the desktop app must
  change without making that change.
- **Brief** — Task Zero: move the 21 managed-prompt constants out of
  `openclawConfigSync.ts` into `libs/brief/`. A pure move, proven by the existing
  tests passing untouched. Then the incident-based triage against `review.md`'s
  81 items.
- **Box** — a measurement, not a build. Can the engine hold a session on a
  remote sandbox backend at all? Told explicitly that "this cannot work from a
  Mac" is a good outcome for the task, so there is no incentive to fudge it.

### The three ways this goes wrong first, watched every sweep

1. **Brief edits a test during Task Zero** — that means it is not a pure move.
2. **Server touches anything under `desktop/`** — it owns Python only.
3. **Box starts building an E2B backend** instead of measuring.

## Known answers the agents will need

- **The E2B key's name is `CLAIDOR_E2B_API_KEY`.** Verified: `config.py:624` sets
  `env_prefix="claidor_"`, so a setting declared `E2B_API_KEY` in `Settings`
  reads that env var. Same mechanism as `CLAIDOR_COMPOSIO_API_KEY`,
  `CLAIDOR_OPENAI_API_KEY` and `CLAIDOR_ANTHROPIC_API_KEY` in `render.yaml`. The
  founder is adding it in Render.
- **No `npm install` has ever run in these containers**, so nothing in `desktop/`
  has been tested here. An agent claiming a desktop test passed without having
  installed is claiming something false.

## Open, and deliberately not raised with the founder yet

Written here rather than pinged, per the standing orders. Raise when they next
appear, or sooner only if one starts blocking.

1. **`desktop/src/main/main.ts` has no owner.** 15,377 lines, and the app-side
   change to call the new image route lives in it (`handleMediaGenerationCallback`).
   Server is producing the spec; somebody must be assigned the edit. Likely a
   fourth agent, or Box once it owns box IPC in the same file.
2. **The four drawings** — archive, video, audio, text — still block half of the
   Files agent's work, which has not been started.
3. **A room appears in the sidebar unasked** under the Grok-Bot-true room rule,
   unlike `create_agent` which draws a card. Flagged in the agent-to-agent audit;
   costs nothing until the room tool is built.

## Sweep history

| # | When | What happened |
|---|---|---|
| — | 18 Sep 22:22Z | Three agents created. First sweep scheduled for 23:13Z. |
