# What the reconstruction actually contains

**19 September 2026.** Every number here was measured from the checked-in
manifests and the tree itself, not inferred. Read this before proposing
anything about `desktop/`. It exists because three hours went into
rediscovering facts that were already written down in files nobody had opened:
`manifests/reconstruction/renderer-closure.json`,
`source/electron-main/adapters/EVIDENCE.md`, and the second half of
`desktop/README.md`.

## The one-paragraph version

The **engine is real and audited**. The **renderer's structure is real**. The
**renderer's styling does not exist** and cannot be recovered — it was
machine-generated CSS in the shipped bundle, it was never extracted, and the
DMG that holds it is now a 403 at Cursor and refused by Gitee's LFS. Several
**electron-main binding slots are documented as not activated**, blocked on
joins to Anysphere's cloud. What we have that is genuinely valuable is a
complete, evidence-backed **specification of the product**: 163 IPC claims,
11 routes, 102 UI anchors, and an agent runner with zero high-severity audit
findings.

## The renderer

`manifests/reconstruction/renderer-closure.json`, the reconstructor's own audit.

**Verdict:** `canReplaceShippedBundleWithoutFeatureLoss: true`,
`status: evidence-closure-demonstrated`, `blockers: []`. That is **feature**
closure — every route and IPC call is present. It is not visual fidelity, and
the caveat in the same object says so: *703 of 745 JSX candidates remain
unlinked to reviewed first-party evidence*.

| | shipped 0.18.0 | our clean build |
| --- | ---: | ---: |
| CSS | **530 KB, one file**, classified `unreviewed-stylesheet` | 2,431 lines across 28 files |
| product JS | 5,660 KB (`index-UbX-y3il.js`, the only asset classified `reviewed-product-evidence`) | ~1.6 MB |
| total assets | 131 | 13 |

**Only eight components were ever reviewed at high confidence:** AccountMenu,
AgentSidebarItem, AgentSidebarHeader, ComposerActions, ConversationComposer,
ChatHeader, VirtualTranscript, CommandPaletteActions. All structural.

**The five feature surfaces are reconstructions by method, and the manifest
names each method** — none is original source:

| surface | recovery method |
| --- | --- |
| `overlay:computer` | **`exact-placeholder`** |
| `overlay:hidden-chats` | `semantic-model` |
| `view:org-chart` | `semantic-model` |
| `overlay:plugins` | `semantic-model` |
| `overlay:settings` | `named-upstream-module` |

### Why it looks wrong, precisely

Measured across `frontend/src`:

```
class names the components emit : 1,424
  hashed atoms (sand-104s22n…) :   606   compiled CSS-in-JS; styles never recovered
  real semantic names           :   818
     already styled             :   306
     unstyled                   :   512
```

The original used a compiled CSS-in-JS system. The reconstructor recovered the
*generated class names* out of the bundle but not the rules behind them, which
is exactly why the 530 KB stylesheet is marked `unreviewed`. So the DOM carries
hundreds of meaningless hashed classes with no rules, plus 512 real semantic
names that were never styled.

**The components themselves are substantial.** `ProductionRenderer.tsx` is
3,734 lines wiring roughly sixty real feature modules — composer, sidebar,
transcript, reply threads, find-in-chat, outline panel, spreadsheet viewer,
card resolvers, routines, agent settings, avatar editor, async tasks, shared
rooms. The skeleton is sound. The skin is absent.

**`frontend/` is not the packaged renderer**, and its own README and the
top-level architecture diagram both say so — the diagram has "polished shipped
renderer" at the top of the stack. Building `frontend/` as the product UI is a
deliberate departure from how the reconstruction was meant to be used, taken
because the shipped renderer is unreachable.

## The electron-main bindings are not all activated

`source/electron-main/adapters/EVIDENCE.md`, last paragraph:

> "These are provider constructors, not a fabricated production binding
> manifest. **The erased generated Connect/protobuf exports listed above must be
> supplied by a separate evidence-backed binding module before any slot can be
> marked activated.**"

Per-slot, in the same table:

- **`adapters.coordinator`** — "full promotion remains **blocked on** generated
  gateway/account-authorizer, complete account transition, resync/box-secrets,
  telemetry/event, and renderer-port joins"
- **`adapters.mcpOAuth`** — "activation still requires the zero-input
  authenticated-account/coordinator list-refresh/loopback/telemetry production
  join"
- **`adapters.experiments`** — requires "concrete authenticated account service
  and coordinator feature-override push port"

They construct, which is why the app launches. Several are hollow underneath.
Every one of those blockers is a join to Anysphere's cloud — the exact surface
Claidor replaces — so this is our work rather than a dead end.

## The engine is in good shape

`manifests/reconstruction/runner-parity-audit.json`, scope `src/host/runner/`:

```
modules audited            70
findings                   56      high: 0     medium: 56
directly behaviour-tested  66 of 70
```

Findings by kind: 28 `omitted-artifact-symbol`, 13 `unevidenced-clean-export`,
6 `unevidenced-prompt-or-default`, 6 `source-only-runner-module`,
2 `shallow-state-depth`, 1 `missing-emitted-literals`.

**Nine prompt literals across six modules have no provenance** — invented, not
recovered: `agent-adapters.ts`, `sand-agent-runner.ts`, `stream-attempt.ts`,
`turn-agent-composition.ts`, `turn-run-shell.ts`, `turn-settle.ts`. And
`sand-shell-auto-review-enrichment.ts` is missing 6 of 9 behaviour-bearing
literals. Treat prompt text in those files as suspect.

## What is genuinely valuable: the specification

**163 IPC claims**, recovered and evidence-linked: 95 desktop-bridge,
58 coordinator calls, 10 subscriptions. The 58 coordinator calls are the whole
product surface — agents, routines, workflows, channels, trays, shared rooms,
the forever box, teach recording, skill publishing, subagents, search.

**11 routes**, every one `reviewed: true` and `cleanComposition: present`:
chat, computer, hidden-chats, org-chart, plugins, settings.

**102 UI anchors** tied to byte offsets in the shipped bundle: 64 real class
names, 28 real visible strings, 7 DOM signatures, 3 assets. That is a partial
design brief straight from the original — what the screens were called, what
they said.

## What is gone and is not coming back

- The 0.18.0 DMG. Cursor returns `403 AccessDenied` on the whole `grokbot/`
  prefix; Gitee refuses LFS on free repositories. Both verified 19 September.
- `recovered/`, `recovery/` and `recovered/source-capsules/` — 548 capsules the
  manifests reference. Never published: the Gitee repo is a single commit
  (`a9f633e`), exported by the archive procedure in `docs/PUBLISHING.md`, which
  strips the parent commit that held them.
- The shipped renderer's stylesheet, and with it any chance of pixel fidelity.

## Consequences

1. The UI is ours to design. Not a preference — the only option. But we design
   against a real specification, not a blank page.
2. `frontend/` is reference material: read it for structure, routes and copy.
   Do not treat its appearance as a target.
3. The engine is worth keeping and the audit backs that.
4. Prompt text in the six named runner modules is unverified.
