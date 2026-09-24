# The computerUse child, audited against the reconstruction (24 September 2026, night)

"i cant keep asking, its costing me money. please audit it … just copy
the way cursor did it. maybe we missed something. audit it but dont fix
anything yet."

Nothing here is a fix. Three read-only audits over `desktop/source`
(Grok Bot's own loop; our production shell; the Task dispatch and the
box window), cross-checked against the founder's box log of the Render
test. File:line references are under `desktop/source/host/`.

## What the log established first

- The parent dispatched a `computerUse` child (`subagent=dispatched`).
- The child ran on `gpt-5.6-luna effort=low`, which is selected only by
  `isComputerUseSubagent` (`extensions/inference/provider-session.ts:136-149`),
  so the child's shell knew what it was.
- Seven calls, about 68,000 input tokens each, and on every one the only
  tool used was `Shell` printing a sentence to itself. No Computer call,
  no text, `subagent=result … "(the task finished without producing any
  text output)"`.
- No `429`, no `rate limit`, no `40201`. The "browser-helper rate limit"
  the agent reported three times has nothing behind it.

## Where our path matches Grok Bot's, line for line

| step | Grok Bot's loop (the reconstruction) | our production shell | same? |
| --- | --- | --- | --- |
| Task tool built for the agent only | `runner/tools/turn-toolset.ts:1340-1380` | `host-runner-composition.ts:2507-2511` passes `subagentConfigs` for the agent, none for a child | yes |
| computerUse offered when the box answers | `runner/turn-agent-composition.ts:1696-1699` | `host-runner-composition.ts:2497-2505` | yes |
| window allocated before the child is built; null refuses | `runner/agent-adapters.ts:40`, `runner/computer-use.ts:87-94` | same code; `runner.computerUse` is set because `ctx` and `box` are supplied (`sand-agent-runner.ts:399-411`, `host-runner-composition.ts:1531-1532`) | yes |
| child's first message is the Task prompt verbatim | `agent-adapters.ts:41` → `runner.run(args.prompt)` | `host-runner-composition.ts:2694` | yes |
| Computer pushed iff `isComputerUseSubagent && remoteBoxHasDesktop && getRemoteBoxAvailable()` | `turn-toolset.ts:1462-1469` | all three true for the child (`:2519`, `:2522`, `:2524`) | yes |
| `factories.computer` from the provider's `createComputerToolInputs` | `turn-toolset.ts:1173-1175` | offered since 24 September (`:2235-2239`), gated on `autoReviewGate`, which the shell requires (`:2447`) | yes |
| child's Computer section and box section in the prompt | `runner/prompt-collector-glue.ts:188, 203-208, 216-245` | glue built per identity (`:2489-2495`); fallback to the agent's is logged as `agent-fallback` | yes |
| child's text becomes the Task result; parent revived hidden | `subagent-runtime.ts:396-402`, `completion-revivals.ts:183-191` | same code | yes |
| child's step budget | 5,000 (`shared/inference/turn-step-budget.ts`); no `hidden` on a Task child | same | yes |

`getRemoteBoxAvailable` compares an **async** `isAvailable()` (a
Promise) to `false`, so it is always true (`box/shared-desktop-sand-box.ts:35`).
Harmless here; wrong.

## What we missed, in order of weight

### 1. `isBoxScopedSubagent` is hard-coded `false` for every identity

The reconstruction threads a flag named `isBoxScopedSubagent` through
the whole loop and never computes it; our composition sets it to
`false` three times (`host-runner-composition.ts:1495`, `:2523`, `:2752`),
for the agent and for every child alike. What the flag gates, in Grok
Bot's own code:

| gate | file:line | effect when true |
| --- | --- | --- |
| no ExternalShell, ExternalRead, ExternalAwait, WebSearch, WebFetch | `turn-toolset.ts:1423-1434` | the child cannot reach the user's computer |
| no CloudAgent | `:1441-1447` | |
| no BoxAwait, no CopyToBox/CopyFromBox | `:1454-1459` | |
| no MCP discovery/call pair | `:1493-1498` | |
| no dynamic tools | `:1325` | |
| `userInfoDisplayOptions.disable` | `runner/turn-agent-composition.ts:305` | the user-info block is left out of the prompt |
| no time-zone section | `runner/system-prompt-assembly.ts:197` | |
| **`preserveLatestImage: true`** | `turn-agent-composition.ts:775, 1094` | the last screenshot stays in context between steps |

Every one of those is the shape of a computerUse or browserUse child
(the Computer section itself says "the user's computer is a separate
machine you have no tools for", `prompt-collector-glue.ts:205`), and
`preserveLatestImage` is the see-act-verify loop's memory. With the
flag false our child got the user's-computer tools, cloud agents, file
transfers, MCP, the user-info block and the time zone on top of Computer,
and its screenshots would not be preserved. **Not established:** where
Grok Bot derived the flag. `grep -rn "isBoxScopedSubagent\s*[:=]"` finds
only its declarations and our three `false`s; the reconstruction never
recovered the line that computes it. The name and the gates say
`isSubagentRunner && (isComputerUseSubagent || isBrowserUseSubagent)`;
that is a reading, not a citation.

### 2. The child reads the agent's whole brief

`runner/system-prompt-assembly.ts:249-265`: for a subagent the assembly
drops the agent directory (`:239`), multitask (`:259`) and MCP
multi-account (`:261`) and keeps the base prompt, the profile section
(`:254`, not gated), user identity, **memory, automations, workflows,
channels** (`:263`, ungated) and the MCP custom instructions. The
production `createPromptAssemblyFor` (`host-runner-composition.ts:1472-1520`)
hands a child the same `DEFAULT_SAND_SYSTEM_PROMPT` base and the parent's
stores. That is the 68,000 tokens per call, seven times, and it is why
the child spoke as the parent ("Waiting for the delegated browser
result", "The read-only Render check is already running"): it read a
brief about delegating browser work and a memory of the conversation
that had just delegated it. Whether Grok Bot's child read the same brief
is not decidable from the reconstruction, which is the only source; the
reconstruction's own branches are what we run.

### 3. The Chrome prewarm never runs

`runner/computer-use.ts:101-136` (`prepareRemoteBox`, `box-chrome
--new-window`) has no caller outside its file. The child's prompt
promises "Chrome prewarms a visible window when this task starts"
(`prompt-collector-glue.ts:230`) and nothing does it.

### 4. The child is told nothing about its window

`resolveBoxBrowser` is not supplied to the child's glue
(`host-runner-composition.ts:1347-1412`; the runner's own needs
`getBoxWindowIndex`, which nothing supplies, `sand-agent-runner.ts:1056-1068`),
so the prompt falls back to "make your first Shell command `echo
$DISPLAY`" (`prompt-collector-glue.ts:232`). Workable, but a Shell-first
instruction to a child that then never left Shell.

### 5. The child's box accessor is built on the parent's identity

`createRemoteBoxResourceAccessor` is inherited from the parent
(`:1729`), and its `resolveDisplayNumber` and the fallback branch use
`session.id` and the parent's `computerUse` coordination (`:1048-1052`,
`:1649-1657`, `builtRunner` is the parent, `:2851`). The window slot is
allocated under the child's id. Whether that mismatch would put the
child on the wrong display is not established; it never called Computer.

### 6. Model behaviour

Given the Computer tool, the Computer section and the parent's brief, a
low-effort Luna chose Shell `printf` seven times. That is not decidable
from source. Points 1 and 2 are the two things that make the child's
context look like the parent's.

## What only the next log can settle

The two lines added tonight (`docs/product/ai-does-not-answer-measured.md`,
last section): `offered=` on the child's `model=` lines (was Computer in
the request at all) and `[claidor] prompt … identity=computerUse
glue=own assembly=own` (no fallback). The audit above assumes Computer
was offered, because every condition for it reads true; the line proves
or refutes that in one run.

## Cost of one such test, from the log

Seven child calls at ~68k input (about 65k cached) plus the parent's
calls at ~78k (cached). The child's calls are the avoidable part: a
box-scoped child with a child-sized prompt would carry a few thousand
tokens, not 68,000.
