/**
 * The computer tool: its actions counted by kind, the wait before a
 * screenshot, and the tool's resource. The request travels as
 * `computerUseArgs` and its answer comes back as `computerUseResult`.
 */
import type { ComputerUseArgs, ComputerUseResult } from "../proto/generated/agent/v1/computer_use_tool_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

/** An action as far as counting needs it: the kind it is, by the name the messages give it. */
export interface ComputerUseActionLike {
  readonly action: {
    readonly case:
      | "mouseMove"
      | "click"
      | "mouseDown"
      | "mouseUp"
      | "drag"
      | "scroll"
      | "type"
      | "key"
      | "wait"
      | "screenshot"
      | "cursorPosition"
      | undefined;
  };
}

export interface ComputerUseActionCounts {
  readonly mouse_move: number;
  readonly click: number;
  readonly mouse_down: number;
  readonly mouse_up: number;
  readonly drag: number;
  readonly scroll: number;
  readonly type: number;
  readonly key: number;
  readonly wait: number;
  readonly screenshot: number;
  readonly cursor_position: number;
}

type Kind = keyof ComputerUseActionCounts;

/** Each kind of action, by the name the messages give it, with the name it is counted under. The counts are listed in this order. */
const COUNTED_UNDER: ReadonlyMap<string | undefined, Kind> = new Map<string | undefined, Kind>([
  ["mouseMove", "mouse_move"],
  ["click", "click"],
  ["mouseDown", "mouse_down"],
  ["mouseUp", "mouse_up"],
  ["drag", "drag"],
  ["scroll", "scroll"],
  ["type", "type"],
  ["key", "key"],
  ["wait", "wait"],
  ["screenshot", "screenshot"],
  ["cursorPosition", "cursor_position"],
]);

/** How many actions there are, and how many of each kind. An action of no kind, or of a kind not known, is in the total only. */
export function summarizeComputerUseActions(
  actions: readonly ComputerUseActionLike[],
): { readonly actionCount: number; readonly actionCounts: ComputerUseActionCounts } {
  const counts = Object.fromEntries(Array.from(COUNTED_UNDER.values(), (kind) => [kind, 0])) as Record<Kind, number>;
  for (const one of actions) {
    const kind = COUNTED_UNDER.get(one.action.case);
    if (kind !== undefined) counts[kind] += 1;
  }
  return { actionCount: actions.length, actionCounts: counts };
}

/** How long the screen is left to settle after the last action before it is pictured. */
export const COMPUTER_USE_SCREENSHOT_SETTLE_DELAY_MS = 2_000;

/** The names the request and its answer go by in the wire's envelopes. */
const REQUEST = "computerUseArgs";
const ANSWER = "computerUseResult";

export const computerUseExecutorResource = createResource<Executor<ComputerUseArgs, ComputerUseResult>, RemoteExecManager, ControlledExecManager>(
  // The asking side: the request is sent over the connection, and the answer under its name is the result.
  (connection) => new ExecutorResource(connection, createServerSerializer(REQUEST), createClientDeserializer(ANSWER)),
  // The working side: the executor is given every request under that name, and its answer goes home.
  (executor, manager) => manager.register(new SimpleControlledExecHandler(executor, createServerDeserializer(REQUEST), createClientSerializer(ANSWER))),
);
