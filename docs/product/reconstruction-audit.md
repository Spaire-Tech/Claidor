# What the reconstruction actually contains

**19 September 2026.** Every number here was measured from the checked-in
manifests and the tree itself, not inferred. Read this before proposing
anything about `desktop/`. It exists because three hours went into
rediscovering facts that were already written down in files nobody had opened:
`manifests/reconstruction/renderer-closure.json`,
`source/electron-main/adapters/EVIDENCE.md`, and the second half of
`desktop/README.md`.

## The one-paragraph version

> **Corrected 19 September 2026. The paragraph below said the renderer's
> styling "does not exist". That is false, and it cost six hours.** It was
> written without once grepping the built stylesheet. Measured: `dist/renderer/
> assets/index-BWGNfflp.css` is 142 KB and 1,122 rules; 448 of the 734 atoms
> the components emit are defined, 40 of 50 semantic classes, and 123 of the
> 131 theme tokens — and the eight that are not almost all carry inline
> fallbacks. The app looked unstyled for a different reason entirely, in the
> emitted `index.html` and not in the CSS at all. See **Why it looked wrong**
> below, which is now a measurement rather than a conclusion.

The **engine is real and audited**. The **renderer's structure is real**. The
**renderer's styling is largely present** — see the correction above. What is
genuinely gone is the 543 KB original stylesheet and the 26 binary assets, and
the DMG that holds them is a 403 at Cursor and refused by Gitee's LFS. Several
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

### Why it looked wrong — measured 19 September, and it was not the CSS

The app rendered in Times New Roman on a white page with no spacing, and this
document told everyone that was because the styling had never been recovered.
It had. The cause was **one attribute in the emitted `index.html`**.

Electron loads the renderer with `loadFile` (`source/electron-main/main.ts:343`),
which gives the document the opaque origin `null`. Vite marks the emitted entry
script and stylesheet `crossorigin`. A `crossorigin` subresource fetched from a
null origin can never satisfy CORS, so Chromium refuses the stylesheet before
parsing it.

Headless Chromium on `dist/renderer/index.html` over `file://`, same build,
one attribute apart:

| | `--cursor-font-family-sans` | computed `font-family` | `--cursor-spacing-5-5` | background |
| --- | --- | --- | --- | --- |
| with `crossorigin` | *(empty)* | `"Times New Roman"` | *(empty)* | transparent |
| without | `-apple-system, …` | `-apple-system, …` | `22px` | `rgb(24,24,24)` |

The first row is exactly the screenshot. `scripts/build-caisra.mjs` now strips
the attribute and `tests/renderer-file-url.test.mjs` fails if it returns.

**What the stylesheet actually holds**, same build:

```
atoms the components emit   : 734     defined in the built CSS : 448  (61%)
semantic class names        :  50     defined                  :  40  (80%)
--cursor-* tokens used      : 131     defined by the installer : 123  (94%)
```

`runtime-theme-token-installer.ts` is a complete 130-entry palette with exact
light and dark values, hash-locked against the shipped bundle, and it runs
(`ProductionRenderer.tsx:2758`). Of the eight undefined tokens, six carry inline
fallbacks (`var(--cursor-font-weight-medium,500)` and so on) and are harmless;
only `--cursor-icon-content` and `--cursor-border-secondary`'s light mode are
worth anything, and `--cursor-border-secondary` has a dark-grey fallback that
is simply wrong in light mode.

**What is genuinely missing is the remaining 286 atoms.** They are single
declarations each. The original 543 KB stylesheet held them; we have 142 KB. I
tried to recover them by hash — these are Stylex-style atoms whose class name
is a hash of the declaration — and it does not work: 337 known
class-to-declaration pairs were tested against murmurhash2 in twelve input
formats and four seeds, with zero matches. The reconstruction re-hashed. They
have to be written, not recovered.

### The 18 runtime assets

`frontend/manifests/renderer-runtime-assets.json` names eighteen files and
gives each one's sha256 as 0.18.0 shipped it. **None was ever in this
repository** — the entire vendored reconstruction contains two binary files, a
docs screenshot and the icon webfont. The recovered source does not `import`
them; it hard-codes the emitted filename
(`rendererRuntimeAssetUrl("app-icon-C7NKj2u7.png")`), so no bundler emits them
and no bundler warns. The onboarding screen drew eighteen broken-image boxes.

`scripts/make-runtime-assets.mjs` draws replacements from the app's own palette
and Chromium rasterises them; the build copies them beside the bundle and the
test above fails if any named asset is not emitted. The twenty-nine other tool
logos in that grid are inline data URIs and were never affected.

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
