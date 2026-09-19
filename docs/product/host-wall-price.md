# Pricing the host wall — measured 19 September 2026

The brief ("The goal, in one sentence") makes one claim the whole plan turns on:

> Today five runtimes compile from source and the host does not — it ships as
> Anysphere's compiled bytes, because
> `manifests/reconstruction/host-production-bindings-manifest.json` does not exist.
> **That single missing file is the wall between us and the product.** Producing
> that manifest is the central task of this brief.

**That is wrong, and it is wrong in our favour.** There is no manifest to write.
The bindings the manifest would carry are already in the repository, in code, and
every gate in front of them is already satisfied. What is left is one command on
a machine that has run `npm run bootstrap`.

Phase 1 of the brief asked for "a number, and a decision". Both are below.

## What was measured, and how

All of this was run in the session container on 19 September 2026, on Node
v22.22.2 (the repo pins 26.5.0 — see *What was not run*).

### 1. The file really is absent — and nothing asks for it

```
$ ls desktop/manifests/reconstruction/
electron-main-production-bindings-manifest.json   (5851 bytes)
renderer-closure.json
runner-parity-audit.json

$ grep -rn "host-production-bindings-manifest" .        # whole repo
(no matches)
```

The brief read the absence correctly and the consequence wrongly. `scripts/clean-build.mjs:41`
defines `defaultElectronMainBindingManifestPath` and there is deliberately no host
equivalent, because the host does not take its bindings from a file.
`buildProductionHostIfSupplied` (`scripts/host-production-activation.mjs:575`)
defaults `manifestPath` to `null`, and `assembleHostProductionBindingManifest`
(`:501`) treats a supplied manifest as a *residual* — its own comment says so:

> `/** Assembles built-in recovered providers with an optional residual manifest. */`

### 2. All 8 required bindings are already built in

`requiredHostProductionBindings` (`:13`) lists 8. `hostProductionBindingInventorySpecs`
(`:~60`) carries a complete `binding` for **all 8** — classification, module,
export, access, source anchor and artifact anchors. At `:528`, every spec with a
`binding` is pushed into `builtIn`, so `unboundBindings` is empty and the first
gate at `:577` passes with no manifest at all.

Every provider module those 8 bindings name is present:

| binding | module | lines |
|---|---|---|
| `ports.executeBoxCopyInFromEnv` | `source/host/extensions/box-store-sync/box-copy-in.ts` | 916 |
| `ports.extensionHost.boxGenerated` | `source/host/box/generated-production.ts` | 253 |
| `ports.extensionHost.convertCloudAgentConversationToTrace` | `source/host/production-binding-providers.ts` | 33 |
| `ports.runnerContext` | `source/host/runner-context-production-provider.ts` | 17 |
| `ports.createTranscriptMirror` | `source/host/transcript-mirror/production-provider.ts` | 100 |
| `extensionBindings.stateBackstop` | `source/host/production-binding-providers.ts` | 33 |
| `extensionBindings.localExecCodec` | `source/host/extensions/local-exec/production.ts` | 43 |
| `extensionBindings.secretsContext` | `source/host/production-binding-providers.ts` | 33 |

### 3. The second gate — `runnerRealTurn` — is satisfied on all five conditions

`buildProductionHostIfSupplied:590` refuses unless
`activationEvidence.runnerRealTurn.status === "supported"`. That status is a
five-way `&&` at `:453`. Each condition, measured:

| # | condition | measured | how |
|---|---|---|---|
| 1 | `blockingBindings.length === 0` | **pass** | `ports.runnerContext` and `ports.createTranscriptMirror` are both built-in (see §2) |
| 2 | `semanticGaps.length === 0` | **pass** | `outsideHostGraph` is empty — see below |
| 3 | `recoveredProvidersReachable` | **pass** | all three provider modules are in the host graph |
| 4 | `productionTurnRunShellConnected` | **pass** | `runnerOptions.productionTurnRunShell =` at `host-runner-composition.ts:2342`, between `const runnerOptions:` (`:1390`) and `deps.buildRunner(runnerOptions)` (`:2604`) |
| 5 | `externalRead.status === "supported"` | **pass** | returned unconditionally at `:349`; its three preconditions all hold |

Conditions 2 and 3 were measured by reproducing the esbuild graph the validator
builds at `:403` (entry `source/host/main.ts`, `packages: "external"`):

```
runner modules audited: 70   reachable: 70   outside: 0
total host graph inputs: 776
REACHABLE  source/host/runner/sand-auto-review-tool-escalations.ts
REACHABLE  source/host/runner/sand-shell-auto-review-enrichment.ts
REACHABLE  source/host/runner/tools/tool-input-error.ts
REACHABLE  source/host/runner/turn-agent-composition.ts
REACHABLE  source/host/runner/tools/turn-toolset.ts
REACHABLE  source/host/runner/sand-agent-runner.ts
```

`conditionalRunnerSemanticGaps` and `toolLocalSemanticMismatches` are computed as
the intersection of their catalogues with `outsideHostGraph`. `outsideHostGraph`
is empty, so both are empty.

Condition 5's preconditions (`:330`–`:345`): `piscina` is `4.9.0` in both
`package.json:120` and `package-lock.json`; no `src/app/dist/host/pdf-worker.*`
is present; both source needles resolve exactly once. Note that
`pdfTextExtraction` is separately reported `blocked-missing-shipped-worker` —
that is recorded as an unavailable capability and does **not** feed `supported`.

### 4. The clean host compiles

The compile step at `:605` was reproduced verbatim — same entry template
(`productionEntrySource`), same 8 bindings, same esbuild options, same two graph
assertions:

```
COMPILE: OK
output bytes:        19,972,210
graph inputs:        2,311
forbiddenInputs:     0
forbiddenOutputRefs: []
unexpectedExternal:  1  ['node:sqlite']
```

The single `unexpectedExternal` is an artefact of the container, not a defect.
`builtinSet` (`:81`) is derived from `node:module`'s `builtinModules`, and
`node:sqlite` is absent from that list on Node 22 (verified: `builtinModules.includes('sqlite')`
→ `false`). The repo pins Node **26.5.0**, where it is a listed builtin.

## The number

**Route (b) — recover the host from source — is not a week and not a month. It is
one command, on a machine that has bootstrapped.**

```
npm ci && npm run bootstrap && npm run check && npm run package && npm run verify
```

The work the brief budgeted for — writing a bindings manifest by hand, finding
exact line anchors in a ~670,000-line compiled artifact for 8 bindings — was done
already and committed as code, not as JSON.

## What was not run, and what could still bite

Being exact about the edge of the measurement:

1. **Artifact-anchor validation did not run.** `assembleHostProductionBindingManifest:502`
   reads `src/app/dist/host/host-main.cjs` first. In this container `src/app/`
   holds only `package.json` — bootstrap has never run here, and the pinned DMG
   is unreachable:

   ```
   $ curl -I https://downloads.cursor.com/grokbot/stable/darwin-arm64/0.18.0/Grok_Bot_0.18.0.dmg
   HTTP/2 403
   ```

   So the probe stops at `ENOENT` before any binding is checked. Roughly 30
   artifact anchors across the 8 specs, plus 6 producer anchors for the PDF
   evidence, are each pinned to an exact line *and* needle *and* derived source
   marker. If any has drifted, `validateArtifactAnchor` throws rather than
   returning "unbound". **This is the one real unknown**, and it is cheap to
   settle: `node scripts/host-production-activation.mjs` prints the whole
   inventory without building anything.

   Against drift: the anchors are pinned to 0.18.0, which is checksum-pinned
   (`upstreamAsarSha256` in `scripts/lib/config.mjs`) and immutable. Anchors
   cannot rot underneath an immutable artifact. The `electron-main` manifest,
   which uses the identical anchor machinery against the same pinned release,
   works today — that is the worked example, and it is evidence the scheme holds.

2. **Node 26.5.0 was not used.** `engine-strict=true` in `desktop/.npmrc` rejects
   the install; it was done with `--engine-strict=false` on Node 22.22.2. The
   only observed consequence is the `node:sqlite` line above.

3. **Nothing was packaged and nothing was run.** `npm run package` and
   `npm run verify` both need bootstrap. No claim here is about a running app.

## The decision

**Take route (b) now. Do not build route (a).**

Route (a) — serving `InferenceService/Stream` in binary protobuf from Claidor —
was the fallback for a host we could not compile. We can compile it. Building (a)
would be building a Cursor-wire compatibility layer for a wire we are about to
stop using, and the brief is explicit that (a) "does not make the code ours".

Phase 1 collapses to a single task that needs a bootstrapped Mac, not a
container:

1. `npm run bootstrap` on a Mac with a real 0.18.0 app.
2. `node scripts/host-production-activation.mjs` — reads the inventory, validates
   every anchor, builds nothing. Expected: `8 bound, 0 mandatory unbound`.
3. If an anchor has drifted, it names the file and line. Repair is per-anchor and
   local.
4. `npm run package && npm run verify`.

Phase 2 (the `claidor` provider) and Phase 3 (the wall) can then be done in
either order, since the wall is no longer a blocker for anything.

## One correction to carry forward

The brief's central premise was assembled from a true observation (the file is
absent) and an assumption about what that meant (that the file was required).
Nobody ran `buildProductionHostIfSupplied`. The brief itself said that was "a
morning's work" and put it in Phase 1 for exactly this reason — the fault is not
that the guess was made, it is that the plan's Phase 3 was sized from the guess.

This is the third time in this repository's own record that a "does not exist"
claim was made without the search: the Mac tasks, the renderer atom rules, and
now the host bindings. `CLAUDE.md` already says it. It is said here again because
it cost the shape of a whole plan.
