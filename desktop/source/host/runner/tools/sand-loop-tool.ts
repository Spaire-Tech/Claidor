/**
 * Sand-shaped box tools on the loop's calling convention (25 September 2026).
 *
 * The reconstruction builds Grok Bot's box tools in the Sand SDK's shape:
 * Computer and Screenshot as `execute(args, meta)` over a Zod `parameters`
 * (`sand-computer-tool.ts`), the fifteen browser tools as
 * `execute(context, args, metadata)` over a `{required, enum}` schema
 * (`sand-browser-tools.ts`), CloudAgent as `execute(ctx, args)` with no
 * schema at all (`cloud-agents/cloud-agent-tool.ts`). The loop that runs a
 * turn (`packages/agent/tools/core.ts`, `executeToolResultOrError`) calls
 * `execute(ctx, interactionHandler, argsStream, meta)` and, when that
 * throws, `tool.serializeError(error)`; the request builder sends
 * `tool.parameters` to the model as a JSON schema.
 *
 * Until this file the four went into the toolset exactly as built
 * (`turn-toolset.ts`, `asTurnTool`), so the first Computer call a
 * computerUse child made received the loop's context as its arguments, the
 * Zod parse threw, and the loop died on `tool.serializeError is not a
 * function` — the founder's app, 25 September: "The browser handoff hit a
 * desktop error", `tool3.serializeError is not a function`. Every tool
 * that works (`defineCommunicateTool`, SendMessage) goes through
 * `createZodAgentTool`, which is what this file does for these: the Zod
 * schema becomes the JSON schema on the wire, the streamed arguments are
 * parsed once, the tool runs with the meta it expects (`context`,
 * `toolCallId`, the abort signal, the state handler), a screenshot in its
 * result reaches the model as an image part, and a failure is an error
 * result the model reads instead of a crash. The card in the transcript is
 * the communicate-update card the other Sand tools draw.
 */
import { z, type ZodTypeAny } from "zod";

import type { Context } from "../../../packages/context/core.js";
import { createImageResult, createStringResult } from "../../../packages/chat-inference/prompt-executor.js";
import { createZodAgentTool, withSafeParsedArgs } from "../../../packages/agent/tools/common.js";
import { ToolCall } from "../../../packages/proto/generated/agent/v1/agent_pb.js";
import { CommunicateUpdateToolCall } from "../../../packages/proto/generated/agent/v1/communicate_update_tool_pb.js";
import {
  buildErrorResult,
  buildSuccessResult,
  completedToolCall,
  emptyToolCall,
  encodeError,
  toolCallWrapper,
  type CommunicateInteractionHandler,
  type CommunicateResult,
} from "./communicate-tool.js";

/** What a Sand-shaped tool reads from the loop: `sand-computer-tool.ts`'s `meta`. */
export interface SandLoopToolMeta {
  readonly context: Context;
  readonly toolCallId: string;
  readonly signal: AbortSignal;
  readonly stateHandler?: unknown;
  readonly workspacePaths?: readonly string[];
}

/** What the model reads back: text, and the screenshot when there is one. */
export interface SandLoopRendered {
  readonly text: string;
  readonly imageB64?: string;
  readonly mimeType?: string;
  readonly isError?: boolean;
}

export interface SandLoopToolSpec<Args, Output> {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly parameters: ZodTypeAny;
  execute(args: Args, meta: SandLoopToolMeta): Promise<Output>;
  describe(output: Output): SandLoopRendered;
  describeActivity?(args: Args): { readonly detail?: string; readonly target?: string } | undefined;
}

/**
 * What `execute` returns has to be the communicate-update result proto: the
 * loop records `result.toJson()` on the step. The text and screenshot the
 * model reads travel beside it, keyed by that instance, and `render` picks
 * them up; after `serializeError` there is no entry and the proto's own
 * error is rendered.
 */
const renderedByResult = new WeakMap<CommunicateResult, SandLoopRendered>();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toModelResult(rendered: SandLoopRendered) {
  const isError = rendered.isError === true;
  if (rendered.imageB64 != null && rendered.imageB64.length > 0) {
    return createImageResult(rendered.imageB64, rendered.mimeType ?? "image/png", rendered.text, isError);
  }
  return createStringResult(rendered.text, isError);
}

function communicateErrorToolCall(message: string): ToolCall {
  return new ToolCall({
    tool: {
      case: "communicateUpdateToolCall",
      value: new CommunicateUpdateToolCall({
        args: encodeError(message),
        result: buildErrorResult(message),
      }),
    },
  });
}

/**
 * The loop-shaped tool for a Sand-shaped spec. `withSafeParsedArgs` parses
 * the streamed JSON against the Zod schema (an invalid call is a
 * `ToolCallArgParseError` the loop already turns into a result), the
 * interaction handler brackets the run so the transcript card starts and
 * completes, and `serializeError` answers the loop's catch.
 */
export function createSandLoopTool<Args, Output>(spec: SandLoopToolSpec<Args, Output>) {
  return createZodAgentTool(spec.id, {
    name: spec.name,
    descriptionGenerator: () => spec.description ?? "",
    parameters: spec.parameters,
    execute: withSafeParsedArgs(
      spec.parameters,
      async (
        ctx: Context,
        interactionHandler: CommunicateInteractionHandler,
        args: Args,
        meta: { readonly toolCallId: string; readonly stateHandler?: unknown; readonly workspacePaths?: readonly string[]; readonly [key: string]: unknown },
      ): Promise<CommunicateResult> => {
        const activity = spec.describeActivity?.(args);
        const initial = toolCallWrapper({
          phase: "executing",
          tool: spec.name,
          ...(activity?.detail != null && activity.detail.length > 0 ? { detail: activity.detail } : {}),
          ...(activity?.target != null && activity.target.length > 0 ? { target: activity.target } : {}),
        });
        return interactionHandler.executeToolCall(
          ctx,
          initial,
          meta.toolCallId,
          async (runCtx: Context): Promise<CommunicateResult> => {
            let rendered: SandLoopRendered;
            try {
              const output = await spec.execute(args, {
                context: runCtx,
                toolCallId: meta.toolCallId,
                signal: runCtx.signal,
                ...(meta.stateHandler === undefined ? {} : { stateHandler: meta.stateHandler }),
                ...(meta.workspacePaths === undefined ? {} : { workspacePaths: meta.workspacePaths }),
              });
              rendered = spec.describe(output);
            } catch (error) {
              rendered = { text: errorMessage(error), isError: true };
            }
            const result = rendered.isError === true ? buildErrorResult(rendered.text) : buildSuccessResult(rendered.text);
            renderedByResult.set(result, rendered);
            return result;
          },
          completedToolCall,
        );
      },
      emptyToolCall(),
      { emitInitialPartialToolCall: false },
    ),
    render: async (_ctx: Context, output: unknown) => {
      const rendered = typeof output === "object" && output !== null ? renderedByResult.get(output as CommunicateResult) : undefined;
      if (rendered !== undefined) return toModelResult(rendered);
      // After `serializeError`, the loop renders the communicate-update
      // result it carries.
      const result = (output as { result?: { case?: string; value?: { error?: string; currentStep?: string } } } | undefined)?.result;
      if (result?.case === "error") return createStringResult(`Error: ${result.value?.error ?? "Tool failed."}`, true);
      if (result?.case === "success") return createStringResult(result.value?.currentStep || "Tool completed.");
      return createStringResult("Tool completed.");
    },
    serializeError: (error: unknown) => communicateErrorToolCall(errorMessage(error)),
  });
}

/** `sand-computer-tool.ts`'s Computer and Screenshot: Zod parameters, `execute(args, meta)`, a `ComputerUseResult`. */
export interface ComputerShapedTool<Output> {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly parameters: ZodTypeAny;
  execute(args: unknown, meta: SandLoopToolMeta): Promise<Output>;
  render(output: Output): { readonly content: string };
}

interface ComputerLikeResult {
  readonly result: { readonly case: string; readonly value?: unknown };
}

const COMPUTER_TOOL_DESCRIPTIONS: Readonly<Record<string, string>> = {
  Computer: "Act on the box desktop: click, move, drag, type, press a key, scroll or wait at screen coordinates, optionally followed by up to nine more actions in `then`. Every call ends with a screenshot of the desktop, returned as an image.",
  Screenshot: "Take a screenshot of the box desktop and return it as an image. Read-only.",
};

export function adaptComputerTool<Output extends ComputerLikeResult>(tool: ComputerShapedTool<Output>) {
  return createSandLoopTool<unknown, Output>({
    id: tool.id,
    name: tool.name,
    description: tool.description ?? COMPUTER_TOOL_DESCRIPTIONS[tool.name] ?? "",
    parameters: tool.parameters,
    execute: (args, meta) => tool.execute(args, meta),
    describe: (output) => {
      const text = tool.render(output).content;
      if (output.result.case === "error") return { text, isError: true };
      const screenshot = output.result.case === "success"
        ? (output.result.value as { screenshot?: string } | undefined)?.screenshot
        : undefined;
      return screenshot == null || screenshot.length === 0
        ? { text }
        : { text, imageB64: screenshot, mimeType: "image/webp" };
    },
    describeActivity: (args) => {
      const record = typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
      const action = typeof record.action === "string" ? record.action : undefined;
      const description = typeof record.description === "string" ? record.description.trim() : "";
      return action === undefined && description.length === 0
        ? undefined
        : { ...(action === undefined ? {} : { detail: action }), ...(description.length === 0 ? {} : { target: description }) };
    },
  });
}

/** `sand-browser-tools.ts`'s fifteen tools: a `{required, enum}` schema, `execute(context, args, metadata)`, a rendered `{kind, text, imageB64}`. */
export interface BrowserShapedTool<Context> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly schema: { readonly required?: readonly string[]; readonly enum?: Readonly<Record<string, readonly string[]>> };
  execute(
    context: Context,
    args: Record<string, unknown>,
    metadata: { readonly toolCallId: string; readonly stateHandler?: unknown; readonly workspacePaths?: readonly string[] },
  ): Promise<unknown>;
  render(output: never): { readonly kind: "text" | "image"; readonly text: string; readonly imageB64?: string; readonly isError?: boolean };
}

/** The browser tools' own schema is a required-key list and an enum map; the model needs a JSON schema, so this is the same thing as Zod, keys it does not name allowed through. */
export function browserToolParameters(schema: BrowserShapedTool<unknown>["schema"]): ZodTypeAny {
  const shape: Record<string, ZodTypeAny> = {};
  const enums = schema.enum ?? {};
  for (const key of schema.required ?? []) {
    const values = enums[key];
    shape[key] = values !== undefined && values.length > 0 ? z.enum(values as [string, ...string[]]) : z.any();
  }
  for (const [key, values] of Object.entries(enums)) {
    if (shape[key] === undefined && values.length > 0) shape[key] = z.enum(values as [string, ...string[]]).optional();
  }
  return z.object(shape).passthrough();
}

export function adaptBrowserTool<Context>(tool: BrowserShapedTool<Context>) {
  return createSandLoopTool<Record<string, unknown>, unknown>({
    id: tool.id,
    name: tool.name,
    description: tool.description,
    parameters: browserToolParameters(tool.schema),
    execute: (args, meta) => tool.execute(meta.context as unknown as Context, args, {
      toolCallId: meta.toolCallId,
      ...(meta.stateHandler === undefined ? {} : { stateHandler: meta.stateHandler }),
      ...(meta.workspacePaths === undefined ? {} : { workspacePaths: meta.workspacePaths }),
    }),
    describe: (output) => {
      const rendered = tool.render(output as never);
      return {
        text: rendered.text,
        ...(rendered.imageB64 == null || rendered.imageB64.length === 0 ? {} : { imageB64: rendered.imageB64, mimeType: "image/png" }),
        ...(rendered.isError === true ? { isError: true } : {}),
      };
    },
  });
}

/** `cloud-agents/cloud-agent-tool.ts`: `execute(ctx, args)` returning the sentence the model reads; the schema is supplied by the caller. */
export interface ContextFirstShapedTool<Args> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  describeActivity?(args: Args): { readonly detail?: string; readonly target?: string } | undefined;
  execute(ctx: Context, args: Args): Promise<string>;
}

export function adaptContextFirstTool<Args>(tool: ContextFirstShapedTool<Args>, parameters: ZodTypeAny) {
  return createSandLoopTool<Args, string>({
    id: tool.id,
    name: tool.name,
    description: tool.description,
    parameters,
    execute: (args, meta) => tool.execute(meta.context, args),
    describe: (text) => ({ text }),
    ...(tool.describeActivity === undefined ? {} : { describeActivity: (args: Args) => tool.describeActivity!(args) }),
  });
}
