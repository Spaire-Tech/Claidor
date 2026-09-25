import { randomUUID } from "node:crypto";
import { Struct } from "@bufbuild/protobuf";
import type { Context } from "../../../packages/context/core.js";
import { createContext } from "../../../packages/context/core.js";
import { conversationIdKey, requestIdKey } from "../../../packages/chat-inference-proto/client.js";
import type { PromptExecutor } from "../../../packages/chat-inference/base.js";
import {
  SmartModeClassifierArgs,
  SmartModeClassifierDecision,
  SmartModeClassifierError,
  SmartModeClassifierResult,
  SmartModeClassifierSuccess,
} from "../../../packages/proto/generated/agent/v1/smart_mode_classifier_exec_pb.js";
import { smartModeClassifierModeKey } from "../../../packages/agent/utils/smart-mode-classifier-measurement.js";
import { clipForHostLog, HOST_LOG_PREFIX, logHostLine } from "../../../shared/host-log.js";

// Auto-review's risky-or-safe classifier, on Simeon's own model path.
//
// Grok Bot asked Cursor's server (`DashboardService/ClassifySandAutoReview`,
// `sand-backend-smart-mode-classifier-exec.ts`), which Simeon Labs' server
// does not serve; until 24 September 2026 every classification therefore
// failed and `runSandAutoReviewClassifier` fell closed to `reject`, so an
// enforced review blocked everything. This executor asks the cheap model
// (the same session the memory synthesis uses: summarization flag, so Luna
// at low effort through Simeon Labs' proxy) for a one-word decision and a
// reason, and returns the same generated result the callers already read.
// The wire shape of the arguments (`SmartModeRiskTarget` action + JSON
// arguments, the conversation context) is unchanged.

export const SIMEON_AUTO_REVIEW_CLASSIFIER_TIMEOUT_MS = 30_000;
const MAX_CONTEXT_CHARS = 12_000;
const MAX_ARGUMENTS_CHARS = 6_000;

export const SIMEON_AUTO_REVIEW_SYSTEM_PROMPT = [
  "You are the safety reviewer for Simeon, an assistant that runs actions on a person's computer, browser and connected services on their behalf.",
  "You are shown one action the assistant wants to take (its kind and its arguments, which may include the person's own allow and block instructions), and the recent conversation.",
  "Decide whether the action may run without asking the person first.",
  "Allow ordinary, reversible, in-scope work: reading, searching, drafting, opening pages, editing the person's own files in the project at hand, running build and test commands.",
  "Block anything hard to undo or outside what the person asked for: deleting or overwriting data outside the task, sending messages or money, purchases, changing account or security settings, credentials and secrets, force-pushes, destructive shell commands (rm -rf, drop, format), actions on sensitive personal files, and anything the person's block instructions name.",
  "If the person's allow instructions cover the action, allow it. If their block instructions cover it, block it.",
  "Answer with one JSON object and nothing else: {\"decision\":\"allow\"} or {\"decision\":\"block\",\"reason\":\"<one short sentence the person will read>\",\"proposedAllowRule\":\"<optional one-line rule that would allow this kind of action next time>\"}.",
].join("\n");

export interface SimeonSmartModeClassifierDeps {
  readonly createExecutor: () => PromptExecutor<Record<string, any>>;
  readonly timeoutMs?: number;
  readonly log?: (line: string) => void;
}

export function renderSmartModeClassifierUserPrompt(args: SmartModeClassifierArgs): string {
  const target = args.target;
  const action = target?.action ?? "";
  let argumentsJson = "{}";
  try {
    argumentsJson = JSON.stringify((target?.arguments ?? new Struct()).toJson(), null, 1) ?? "{}";
  } catch {
    argumentsJson = "{}";
  }
  if (argumentsJson.length > MAX_ARGUMENTS_CHARS) argumentsJson = `${argumentsJson.slice(0, MAX_ARGUMENTS_CHARS)}…`;
  const lines: string[] = [];
  let used = 0;
  for (const message of [...args.conversationContext].reverse()) {
    const line = `${message.role}: ${message.content}`;
    if (used + line.length > MAX_CONTEXT_CHARS) break;
    lines.unshift(line);
    used += line.length;
  }
  return [
    `Action kind: ${action}`,
    "Action arguments (JSON):",
    argumentsJson,
    "",
    lines.length === 0 ? "Recent conversation: (none)" : "Recent conversation (oldest first):",
    ...lines,
  ].join("\n");
}

export function parseSmartModeClassifierAnswer(text: string): SmartModeClassifierSuccess | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed == null) return null;
  const decision = String((parsed as { decision?: unknown }).decision ?? "").trim().toLowerCase();
  if (decision === "allow") return new SmartModeClassifierSuccess({ decision: SmartModeClassifierDecision.ALLOW });
  if (decision !== "block") return null;
  const reason = (parsed as { reason?: unknown }).reason;
  const rule = (parsed as { proposedAllowRule?: unknown }).proposedAllowRule;
  return new SmartModeClassifierSuccess({
    decision: SmartModeClassifierDecision.BLOCK,
    ...(typeof reason === "string" && reason.trim().length > 0 ? { blockReason: reason.trim() } : {}),
    ...(typeof rule === "string" && rule.trim().length > 0 ? { proposedAllowRule: rule.trim() } : {}),
  });
}

async function streamText(executor: PromptExecutor<Record<string, any>>, system: string, user: string, signal: AbortSignal | undefined, timeoutMs: number): Promise<string> {
  const [context, cancel] = createContext().with(conversationIdKey, randomUUID()).with(requestIdKey, randomUUID()).withCancel();
  const timer = setTimeout(() => cancel({ intentional: false, reason: "auto-review classifier deadline" }), timeoutMs);
  const abort = () => cancel({ intentional: true, reason: "auto-review classifier aborted" });
  if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
  try {
    executor.appendMessages([{ role: "system", content: system }, { role: "user", content: user }]);
    const result = executor.stream(context, undefined, undefined, {}) as { fullStream: AsyncIterable<Record<string, any>> };
    let text = "";
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") text += part.textDelta;
      else if (part.type === "error") throw part.error instanceof Error ? part.error : new Error(String(part.error));
    }
    return text;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export function createSimeonSmartModeClassifierExecutor(deps: SimeonSmartModeClassifierDeps) {
  const log = deps.log ?? logHostLine;
  return {
    async execute(ctx: Context, args: SmartModeClassifierArgs): Promise<SmartModeClassifierResult> {
      const mode = ctx.get(smartModeClassifierModeKey) ?? "enforce";
      const action = args.target?.action ?? "";
      try {
        const text = await streamText(
          deps.createExecutor(),
          SIMEON_AUTO_REVIEW_SYSTEM_PROMPT,
          renderSmartModeClassifierUserPrompt(args),
          ctx.signal,
          deps.timeoutMs ?? SIMEON_AUTO_REVIEW_CLASSIFIER_TIMEOUT_MS,
        );
        const success = parseSmartModeClassifierAnswer(text);
        if (success == null) {
          log(`${HOST_LOG_PREFIX} auto-review action=${action} mode=${mode} verdict=unparseable answer=${clipForHostLog(text, 200)}`);
          return new SmartModeClassifierResult({ result: { case: "error", value: new SmartModeClassifierError({ error: "The reviewer's answer could not be read." }) } });
        }
        const verdict = success.decision === SmartModeClassifierDecision.ALLOW ? "allow" : "block";
        log(`${HOST_LOG_PREFIX} auto-review action=${action} mode=${mode} verdict=${verdict}${success.blockReason == null ? "" : ` reason=${clipForHostLog(success.blockReason, 160)}`}`);
        return new SmartModeClassifierResult({ result: { case: "success", value: success } });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        const message = error instanceof Error ? error.message : String(error);
        log(`${HOST_LOG_PREFIX} auto-review action=${action} mode=${mode} verdict=error error=${clipForHostLog(message, 200)}`);
        return new SmartModeClassifierResult({ result: { case: "error", value: new SmartModeClassifierError({ error: message }) } });
      }
    },
  };
}
