/**
 * The agents' small jobs on the person's own Claude plan (11 November 2026,
 * the founder: "small jobs is their own plan and chosen model. and make sure
 * everything else is like that"): the safety review of a command, the
 * memory written after a turn, a long chat's summary, a title. Each is one
 * call that answers in words, made on Simeon's cheap model until then; with
 * Claude chosen it is one `claude -p` on the computer instead, on the model
 * and the effort the person chose, with no tools and nothing kept on disk.
 *
 * When Claude Code can't answer (the plan's limit, the sign-in gone, not
 * installed), the job runs on Simeon's model as before, as the agent's own
 * turn does, and Claude isn't tried again for a while (`pausedUntil`).
 *
 * Nothing here logs the job's words.
 */
import { HOST_LOG_PREFIX, logHostLine } from "../../shared/host-log.js";
import { reportClaudeCodeSignedOut, reportClaudeCodeUsage, simeonModelRoles } from "../extensions/inference/simeon-model-roles.js";
import { runClaudeCodeTurn, usageFromEvent, type ClaudeCodeOutcome, type ClaudeCodePlanWindow, type ClaudeCodeTurnInput } from "./claude-code-turn.js";

/** A message as the engine's executors hold them. */
export interface TextJobMessage {
  readonly role: string;
  readonly content: string | readonly unknown[];
}

/** The longest a small job may take before Simeon's model answers it instead. */
const JOB_TIMEOUT_MS = 5 * 60_000;
const MINUTE = 60_000;

/** How long Claude isn't tried again for small jobs after it couldn't answer one. */
let pausedUntil = 0;

/** The model and effort a small job runs on when Claude is chosen and may be tried now; none otherwise. */
export function claudeCodeTextChoice(now: number = Date.now()): { readonly model: string; readonly effort?: string } | undefined {
  const roles = simeonModelRoles();
  if (roles.claudeCode === undefined || now < pausedUntil) return undefined;
  return { model: roles.claudeCode, ...(roles.claudeCodeEffort === undefined ? {} : { effort: roles.claudeCodeEffort }) };
}

/** For tests: Claude may be tried again at once. */
export function resetClaudeCodeTextPause(): void {
  pausedUntil = 0;
}

function textOf(content: TextJobMessage["content"]): string {
  if (typeof content === "string") return content;
  const words: string[] = [];
  for (const part of content as Array<Record<string, unknown>>) {
    if (part?.type === "text" && typeof part.text === "string") words.push(part.text);
    else if (part?.type === "image" || part?.type === "file") words.push("[a picture]");
  }
  return words.join("\n");
}

/**
 * The job as Claude Code takes it: the system messages as its system prompt
 * (in place of Claude Code's own, which makes it a coding assistant), and the
 * rest as its prompt: the one message alone, or the exchange so far with
 * each speaker named.
 */
export function claudeCodeTextJob(messages: readonly TextJobMessage[]): { readonly system: string; readonly prompt: string } {
  const system = messages.filter((message) => message.role === "system").map((message) => textOf(message.content).trim()).filter((text) => text !== "").join("\n\n");
  const rest = messages.filter((message) => message.role !== "system");
  const only = rest[0];
  if (rest.length === 1 && only !== undefined && only.role === "user") return { system, prompt: textOf(only.content) };
  const prompt = rest
    .map((message) => `<message from="${message.role === "assistant" ? "you" : message.role === "user" ? "user" : message.role}">\n${textOf(message.content).trim()}\n</message>`)
    .join("\n\n");
  return { system, prompt: `${prompt}\n\nWrite your next message.` };
}

export type ClaudeCodeTextOutcome = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly why: ClaudeCodeOutcome["kind"] };

/** One small job in Claude Code; never throws. */
export async function runClaudeCodeText(
  messages: readonly TextJobMessage[],
  choice: { readonly model: string; readonly effort?: string },
  options: { readonly signal?: AbortSignal; readonly run?: (input: ClaudeCodeTurnInput) => Promise<ClaudeCodeOutcome>; readonly now?: () => number; readonly onUsage?: (windows: readonly ClaudeCodePlanWindow[]) => void } = {},
): Promise<ClaudeCodeTextOutcome> {
  const now = options.now ?? Date.now;
  const run = options.run ?? runClaudeCodeTurn;
  const job = claudeCodeTextJob(messages);
  const started = now();
  let usage: readonly ClaudeCodePlanWindow[] | undefined;
  const outcome = await run({
    prompt: job.prompt.trim() === "" ? "(Nothing to read.)" : job.prompt,
    model: choice.model,
    ...(choice.effort === undefined ? {} : { effort: choice.effort }),
    systemPrompt: job.system.trim() === "" ? "Answer the message below." : job.system,
    tools: [],
    noSessionPersistence: true,
    timeoutMs: JOB_TIMEOUT_MS,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    onEvent: (event) => { usage = usageFromEvent(event) ?? usage; },
  });
  if (usage !== undefined) {
    try { (options.onUsage ?? ((windows) => void reportClaudeCodeUsage(windows)))(usage); } catch { /* never in the way of the job */ }
  }
  logHostLine(`${HOST_LOG_PREFIX} claude-code job model=${choice.model}${choice.effort === undefined ? "" : ` effort=${choice.effort}`} outcome=${outcome.kind} ms=${now() - started}`);
  switch (outcome.kind) {
    case "done": return { ok: true, text: outcome.text };
    case "aborted": return { ok: false, why: "aborted" };
    case "limited": pausedUntil = Math.max(pausedUntil, outcome.until !== undefined && outcome.until > now() ? outcome.until : now() + 60 * MINUTE); break;
    case "signed_out": pausedUntil = Math.max(pausedUntil, now() + 5 * MINUTE); void reportClaudeCodeSignedOut(); break;
    case "not_installed": pausedUntil = Math.max(pausedUntil, now() + 60 * MINUTE); break;
    case "no_session":
    case "failed": pausedUntil = Math.max(pausedUntil, now() + MINUTE); break;
  }
  return { ok: false, why: outcome.kind };
}

/** What the engine reads from a model call's result (the AI SDK's `streamText`), here made from Claude Code's answer. */
export interface TextJobStreamResult {
  readonly fullStream: AsyncIterable<Record<string, unknown>>;
  readonly [key: string]: unknown;
}

/** A promise whose failure, if nobody waits on it, is not an unhandled rejection. */
function quiet<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => {});
  return promise;
}

/**
 * A small job's result, shaped as the engine's model calls return theirs:
 * Claude Code's answer as one piece of text, or, when Claude Code couldn't
 * answer, Simeon's model's own result (`onSimeon`), made only then.
 */
export function claudeCodeTextResult(
  messages: readonly TextJobMessage[],
  choice: { readonly model: string; readonly effort?: string },
  onSimeon: () => TextJobStreamResult,
  options: { readonly signal?: AbortSignal; readonly run?: (input: ClaudeCodeTurnInput) => Promise<ClaudeCodeOutcome> } = {},
): TextJobStreamResult {
  type Settled = { readonly kind: "claude"; readonly text: string } | { readonly kind: "simeon"; readonly result: TextJobStreamResult };
  const settled: Promise<Settled> = quiet(runClaudeCodeText(messages, choice, options).then((outcome) =>
    outcome.ok ? { kind: "claude" as const, text: outcome.text } : { kind: "simeon" as const, result: onSimeon() }));
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const field = (name: string, claude: (text: string) => unknown): Promise<unknown> =>
    quiet(settled.then((one) => (one.kind === "claude" ? claude(one.text) : one.result[name])));
  return {
    fullStream: (async function* () {
      const one = await settled;
      if (one.kind === "simeon") {
        yield* one.result.fullStream;
        return;
      }
      if (one.text !== "") yield { type: "text-delta", textDelta: one.text };
      yield { type: "step-finish", finishReason: "stop", usage, isContinued: false };
      yield { type: "finish", finishReason: "stop", usage };
    })(),
    text: field("text", (text) => text),
    usage: field("usage", () => usage),
    finishReason: field("finishReason", () => "stop"),
    response: field("response", (text) => ({ messages: [{ role: "assistant", content: [{ type: "text", text }] }] })),
  };
}
