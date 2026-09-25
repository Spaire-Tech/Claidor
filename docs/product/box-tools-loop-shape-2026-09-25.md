# The box tools were never in the loop's shape (25 September 2026)

## What the founder saw

Simeon, asked to open Render in its browser and suspend a service:

> The browser handoff hit a desktop error before it reached Render.
> … The first browser attempt failed with an internal desktop
> serialization error: `tool3.serializeError is not a function`.

## What it is

The turn's loop (`desktop/source/packages/agent/tools/core.ts`,
`executeToolResultOrError`) runs a tool as
`tool.execute(ctx, interactionHandler, argsStream, meta)` and, when that
throws, calls `tool.serializeError(error)` to draw the error card; the
request builder (`host/extensions/inference/provider-session.ts`,
`toolParameterSchema`) sends `tool.parameters` to the model as a JSON
schema. Every tool that works is built through `createZodAgentTool`
(`packages/agent/tools/common.ts`), which supplies that shape:
SendMessage, and every `defineCommunicateTool` tool (CreateAgent,
UpdateAgent, request_box_help, the drafts, file transfer, UpdateState,
ReactToMessage, the MCP management tools).

Four of the reconstruction's box tools were not, and `turn-toolset.ts`
pushed them into the toolset as built (`asTurnTool` checks only that
`name` and `execute` exist):

| Tool | Built as | What happened on the loop |
|---|---|---|
| Computer, Screenshot (`sand-computer-tool.ts`) | `execute(args, meta)` over a Zod `parameters` | `args` was the loop's context, the Zod parse threw, the loop called the missing `serializeError`: the founder's error, on the computerUse child's first Computer call. The Zod object itself was serialised as the schema on the wire, which is the one thing that distinguished Screenshot from RestartMcpServers in the 24 September bisect (`AGENT_SCREENSHOT_TOOL`). |
| The fifteen browser tools (`sand-browser-tools.ts`) | `execute(context, args, metadata)` over a `{required, enum}` list | Same crash, and no JSON schema at all. |
| CloudAgent (`cloud-agents/cloud-agent-tool.ts`) | `execute(ctx, args)`, no `parameters` | `toolParameterSchema` found nothing and the tool was left out of every request: the agent could never launch a cloud agent, whatever the brief said. |

So the earlier reads of the computerUse child ("seven Luna calls, every
one Shell, no Computer call", `computer-use-child-audit-2026-09-24.md`)
described a child whose Computer tool could not have run even once it was
offered; and the ledger's `box-substrate` note (which exec daemon serves
Computer) is still open but was not what stopped the child today.

## What changed

`desktop/source/host/runner/tools/sand-loop-tool.ts` is the bridge, used
by the four factories in `turn-toolset.ts`
(`createTurnComputerToolFactory`, `createTurnScreenshotToolFactory`,
`createTurnBrowserToolFactory`, `createTurnCloudAgentToolFactory`):

- the Zod schema becomes the JSON schema on the wire (`createZodAgentTool`);
  a browser tool's `{required, enum}` list becomes a Zod object with those
  keys and enums, other keys allowed through (`browserToolParameters`);
  CloudAgent gets `CloudAgentToolArgs` as Zod
  (`cloud-agents/cloud-agent-tool-parameters.ts`, the same thirteen actions);
- the streamed arguments are parsed once (`withSafeParsedArgs`; an invalid
  call is the loop's own `ToolCallArgParseError` result);
- the tool runs with the meta it was written for: `context`, `toolCallId`,
  the context's abort signal, the state handler and workspace paths when
  the loop carries them;
- the transcript card is the communicate-update card the other Sand tools
  draw, started and completed through `interactionHandler.executeToolCall`
  (the loop records `result.toJson()`, so `execute` returns that proto and
  the model-facing text and image ride beside it);
- a screenshot in the result reaches the model as an image part
  (`createImageResult`; `image/webp` from the computer executor, `image/png`
  from the browser driver) after the text;
- a failure inside the tool (the box refusing the call) is an error result
  the model reads, and a throw the loop catches is answered by
  `serializeError` with the same card.

`AGENT_SCREENSHOT_TOOL_OFFERED` (`system-prompt.ts`) is now
`SAND_AGENT_SCREENSHOT_TOOL=1`, forwarded into the local Docker box
(`SERVED_SWITCH_ENVS`). It stays off by default: the cause of the 24
September `server_error` is explained by the shape above, not measured,
and a wrong guess there breaks every turn.

## Measured offline

`desktop/tests/sand-loop-tool.test.mjs`, through the host's real tool loop
against a fake Responses server (the harness of
`claidor-host-loop.test.mjs`):

1. the model calls `Computer` with a click; the box dependency receives the
   parsed click and the trailing screenshot action under the loop's tool-call
   id, the card starts and completes, and the next request carries the text
   result and the screenshot as `input_image` (`data:image/webp;base64,…`);
   the request's tool schema is a JSON object with the eight actions, not a
   Zod object;
2. a box dependency that throws yields an error result with its sentence on
   the next request; the stream does not error and nothing says
   `serializeError`;
3. `serializeError` answers a throw with the communicate-update error card,
   and the loop's own catch renders it as an error the model reads;
4. a browser tool's schema carries its required key and enum, its
   screenshot renders as `image/png`, and its `execute` receives the loop's
   context, tool-call id and state handler;
5. CloudAgent goes on the wire with the action schema and runs on the
   loop's context.

## Not yet run on a Mac

The line to read is in the box's `/tmp/sand-host.log`: a
`[claidor] tool=Computer` line on a Luna turn, followed by a model call
whose `[claidor] model=` line shows a larger `input=` (the screenshot). If
the Computer call answers an error naming the exec daemon, the
`box-substrate` note applies (`docker exec simeon-box ps aux | grep
box-exec-daemon`).
