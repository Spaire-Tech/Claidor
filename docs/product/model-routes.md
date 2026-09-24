# Seats run on routes (24 September 2026)

The product overview says Simeon "picks the right model under the hood" and
the person can "pin a model you trust for a step, or bench one". This is the
first, rule-only layer of that: a route table, a route on each agent, and a
turn that honours it. The learned layer (which model wins on your work) is
not built; §Not built says what it needs.

## What was there

- A turn's model id never reached the executor. `host-runner-composition.ts`
  computed `staticModelId` from `SAND_AGENT_MODEL` and used it only for the
  prompt's model info; the owner input built at `createAgentOwnerInput`
  carried no `modelId`, so `claidorModelForSession` fell through to Terra
  on every turn.
- `claidorModelForSession` accepts a session model only if it is Terra,
  Luna or their environment overrides (`isConfiguredClaidorModelId`). Any
  other id is ignored on purpose, so Grok Bot's own ids never reach the
  proxy.
- Effort followed the role only: `high` for the loop, `low` for the cheap
  roles.
- The agent profile file (`agent-profile.ts`) held name, description,
  title and the two avatar fields.

## What changed

- `shared/agents/model-routes.ts`: three routes, each a tier and an
  effort. `frontier` (primary, high), `everyday` (primary, medium),
  `quick` (cheap, low). A route names a tier, not a model id, so it
  survives a model rename and follows `SAND_CLAIDOR_MODEL` /
  `SAND_CLAIDOR_CHEAP_MODEL`.
- `SandAgentProfile.modelRoute`: stored lower-cased in `profile.json`;
  every writer (session create, materialise, recover, clone, rename on
  first send, `updateAgent`, the gateway's `createAgent`) carries it and an
  old file without it reads as `""`.
- `AgentProfileForRunner.modelRoute` and `profile-watch.ts` read it off
  the seat.
- `provider-session.ts`: `ClaidorSessionModelOptions.reasoningEffort`,
  honoured by `claidorReasoningEffortForSession` ahead of the role's
  default; `claidorSessionForRoute(id)` resolves a route to
  `{ modelId, reasoningEffort }` or `undefined`.
- `createAgentOwnerInput` in `host-runner-composition.ts` sets
  `modelId` and `reasoningEffort` from the seat's route; the shell passes
  both into the session options (`turn-run-shell.ts`,
  `production-turn-agent-owner.ts`).
- CreateAgent and UpdateAgent take `route` (an enum of the three ids, the
  route descriptions in the tool description so the coach reads them when
  it staffs). `agentManagement.create/update` forward it as `modelRoute`.

A seat with no route runs exactly as before: Terra at `high`.

## Measured

Offline: `desktop/tests/model-routes.test.mjs` (route table, resolution,
profile round trip, tool parameters, the composition anchors). The full
suite is green. Not yet run on a Mac.

## To read on a Mac

Create two seats on different routes (ask Simeon: "create a teammate on the
quick route to format this"), run a turn on each, then in the box:

```
grep '\[claidor\] model=' /tmp/sand-host.log | tail
```

Two lines, one `model=gpt-5.6-terra effort=high`, one
`model=gpt-5.6-luna effort=low`. If both say Terra, the route never
reached the owner input: check `profile.json` in the agent's folder for
`modelRoute`.

## Not built

- A third lab. The proxy reaches OpenAI models only on the wire the app
  speaks (`/v1/responses`); `pricing.py` says an Anthropic model is not
  reachable on it. Every route is Terra or Luna until that changes.
- The person's Override in the window. The pinned renderer has no field
  for it; today the route is set by the coach's tool or by editing
  `profile.json`. The gateway accepts `modelRoute` on create and update, so
  a renderer patch can add it.
- The learned layer (LLMRouter, MIT) that ranks models on the person's own
  accept/redo signal. Needs the signal first.
- Showing the route in ListAgents so the coach knows who runs what.
