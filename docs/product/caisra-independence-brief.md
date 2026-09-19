# Caisra, wholly ours — the brief

**Written 19 September 2026 for whoever does the work, including me.**
This is what the founder wants, in enough detail to execute without asking.
It is not a plan; `docs/product/owning-the-server.md` is the audit the plan
comes from, and every file:line here traces back to it.

---

## 1. The goal, in one sentence

**Caisra is a complete product that belongs to us: it runs the full agent —
shell, files, computer use, browser, every native tool — with every byte of
server it talks to being Claidor's, and nothing at runtime reaching Cursor or
Anysphere.**

Two words in that sentence do the work.

**"Full."** Not a reduced agent. The audit found a cheap path (about seventy
lines) that produces a Cursor-free turn where the agent has only connector
tools — no shell, no file editing, no computer use. `listRoutedMcpTools` maps
`mcp.listTools()` and nothing else (`host/host-gateway-api.ts:141-151`). **That
version is explicitly not what is wanted.** It may ship as a milestone. It is
not the product.

**"Ours."** Not "configured to point at us". Ours: the code compiles from source
we hold, the servers it calls are ours, and no third party can change what runs
on a customer's machine.

---

## 2. What separates, and where the line falls

Four buckets. Everything in the tree belongs to exactly one.

### A. Ours already — do not rebuild
Verified in the audit. Touching these is wasted work.

- Every backend URL resolves to `api.claidor.com` (`scripts/lib/config.mjs:69-72`)
- A metered, authenticated, OpenAI-compatible proxy is deployed
  (`server/polar/desktop/endpoints.py:749-811`)
- **Luna and Terra are already served** — `gpt-5.6-terra`, `gpt-5.6-luna`
  (`pricing.py:380-385`)
- The provider abstraction, its Settings panel, its persistence, the local
  transcript store
- Escaping Cursor's box: one setting, wired end to end
  (`local-docker-host-connector.ts:245`)
- Skill store, MCP marketplace, text-to-speech, sign-in

### B. Ours to take — code we must own outright
The heart of the job. Today five runtimes compile from source and **the host
does not** — it ships as Anysphere's compiled bytes, because
`manifests/reconstruction/host-production-bindings-manifest.json` does not
exist (`clean-build.mjs:60`, `clean-build.mjs:218`).

**That single missing file is the wall between us and the product.** Behind it
sit the agent's native tools, the hardcoded `api3.cursor.sh`, the `cursor.com`
links we cannot edit, and every one of the five must-build endpoints.

Producing that manifest is the central task of this brief.

### C. Theirs to cut — delete, do not replace
Nothing of ours is lost. Full list with evidence in the audit.

- Cloud agents (21 BackgroundComposer methods) — Cursor's product
- Cursor billing and trials — we meter independently
- Team methods — unreachable for a teamless account
- Telemetry (7 methods) — all swallow their own failures
- Multiplayer, box object store — off by default, outside the direction
- **`BootstrapStatsig` — delete, and specifically never serve it.** Serving a
  config is the only thing that constructs a client whose upload host is
  hardcoded and not redirectable (`statsig-bootstrap.ts:12`). The 404 is
  load-bearing.

### D. Ours to build — real capability that costs real money
Not plumbing. Each is a product decision with a bill.

- **Web search.** No search backend exists. Buy one, or remove the tool.
  Leaving it failing silently is the Rakazo blindness failure again
  (`turn-toolset.ts:1414-1417` hands it to the agent on every model).
- **Web fetch.** Cheaper — the client already does SSRF blocking.
- **Image generation.** Needs a provider. Note the real call is
  `RunGenerateImage`, not `/desktop/api/media/images/models` — which means
  `docs/product/images-state.md` has been measuring the wrong door.
- **Audio transcription.**

---

## 3. The fork, and which way we go

The audit gives three routes. The founder has chosen the full product, so:

**Route (b) — recover the host from source — is the target.**
Produce `host-production-bindings-manifest.json` so the host compiles from
`source/host`. Then every native tool works on our own provider, every
hardcoded Cursor string becomes editable, and the five protobuf endpoints stop
being mandatory because their callers become ours.

**Route (a) — serve `InferenceService/Stream` in binary protobuf — is the
fallback**, and may be the faster interim. It keeps the full agent loop by
answering Cursor's own wire from Claidor. It does not make the code ours.

**Cost of (b) is unknown and that is the first thing to settle.**
`clean-build.mjs:60` says the recovered host "requires concrete host factories
and process bootstrap dependencies". The electron-main equivalent is a 5,851-byte
manifest that already exists and works — that is the worked example to measure
against.

**Nobody should start building until (b) has been priced.** If it is a week,
it is obviously right. If it is a month, (a) first is obviously right. The
answer is a morning's work: run `buildProductionHostIfSupplied`
(`clean-build.mjs:77`) with a stub manifest and read the first failure.

---

## 4. Order of work

**Phase 0 — free wins, today.** Five lines, all pure gain, no decisions.
1. Close the host-bundle update channel (2 lines) — the last path by which an
   Anysphere server ships executable code into the product, **on by default**.
2. Fix the token leak (1 line) — a lost 3-second race sends a Claidor bearer
   token to `api2.cursor.sh` (`local-docker-host-connector.ts:192-196`).
3. Box defaults to local Docker (1 line).
4. Stop a box failure killing a turn (~5 lines).

**Phase 1 — price the wall.** Settle route (b). Output: a number, and a
decision.

**Phase 2 — the provider.** Add `claidor` (~60 lines, 4 files). Two
independent hardcoded provider lists must both be edited; missing the second
(`node-agent-coordinator/inference-router.ts:37`) silently discards every
conversation's history on reload and TypeScript will not catch it.

**Phase 3 — the wall.** Either the host manifest, or the protobuf transport.

**Phase 4 — capability.** Search, fetch, images, transcription. Product
decisions, one at a time.

**Phase 5 — the name.** Every visible "Cursor" and "Grok Bot". Cosmetic, and
deliberately last: it is the only phase that changes nothing about what the
product can do. Note `CFBundleName` and `CFBundleExecutable` must stay
`Grok Bot` — the four helper bundles in `Contents/Frameworks` are named after
it, verified by listing them.

---

## 5. How the work is done

Non-negotiable, because every one of these was learned by getting it wrong in
this repository.

- **Measure, never assert.** A claim without a file:line or command output is
  not a finding. "X does not exist" requires a search, and the search gets
  quoted.
- **Read the built artifact, not the source, when asking what ships.** Six
  hours were lost to `frontend/` being confidently described as the product's
  UI when the project's own docs say in one line that it never is.
- **The pinned renderer is not ours to rewrite.** Changes to the shipped UI go
  through `router-renderer-patch.mjs`'s anchored `replaceExactlyOnce` — exact
  match or throw.
- **Never break the gates.** `npm run verify` checks the bundle against its
  pins. A change that makes it fail is wrong until proven otherwise.
- **Say what was not run.** Untested is a fine answer. A confident wrong answer
  is not.

---

## 6. Done looks like

- The app completes a real turn — one that edits a file, runs a command and
  uses the computer — with **zero packets to any Cursor or Anysphere host**,
  verified by watching the network, not by reading code.
- `npm run package && npm run verify` green.
- Every tool the agent advertises either works or is removed. **Nothing is
  advertised and silently broken.**
- No string a person or the agent can read says Cursor, Anysphere or Grok Bot.
- The host compiles from source we hold.
