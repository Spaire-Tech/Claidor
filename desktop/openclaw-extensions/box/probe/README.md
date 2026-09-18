# The box probe

A measurement, not a feature. It answers one question: **will the engine hold an
agent session on a sandbox backend that is not Docker, and what does each tool
call cost when the backend is on the other side of the internet?**

There is no E2B code here and no E2B key. The probe stands a fake pod in for a
real one and charges an injectable RTT for every trip the host makes to it, so
the *shape* of the cost is measured rather than argued about.

## Running it

The probe imports engine internals, so it runs inside a clone of the engine at
the pin, not in this repository:

```sh
git clone --depth 1 --branch v2026.6.1 https://github.com/openclaw/openclaw.git
cd openclaw && pnpm install --ignore-scripts
cp <claidor>/desktop/openclaw-extensions/box/probe/box-probe.test.ts src/agents/sandbox/
npx vitest run --project agents-core --reporter=verbose src/agents/sandbox/box-probe.test.ts
```

Read the `[probe]` and `[probe-remote]` lines. The numbers they printed on
18 September 2026, and what they mean, are in
`docs/product/agent-computer-plan.md`.

## What it measures

- `resolveSandboxContext` against a backend registered at runtime under a name
  the engine has never heard of — does the engine accept it and hand back a live
  context with a working fs bridge?
- Round trips per operation through the **default** fs bridge (the one Docker
  gets, which assumes the workspace is bind-mounted).
- Round trips per operation through `createRemoteShellSandboxFsBridge` (the one
  an E2B backend would have to supply, because a pod has no bind mount).
- Wall time for the same work at RTT 0 / 40 / 120 ms, which shows whether the
  engine pipelines its trips or serialises them.
