import { createHash } from "node:crypto";
import { join } from "node:path";

import { createOpenAI } from "@ai-sdk/openai";
import { jsonSchema, streamText, tool, type CoreMessage, type LanguageModelV1, type ToolSet } from "ai";

import { BasePromptBuilder, BasePromptExecutor } from "../../../packages/chat-inference/base.js";
// The key the loop itself sets (`packages/agent/index.ts` imports it from
// here). The reconstruction also has a second `conversationIdKey` in
// `chat-inference-proto/client.ts`, a different symbol the loop never sets;
// #208 read that one, so every request still went out with no cache key
// (`key:-` on every model= line, founder's Mac, 26 September 2026).
import { conversationIdKey } from "../../../packages/agent/utils/request-id.js";
import { asError } from "../../../shared/errors.js";
import { withCheapRateLimitFallback } from "../../../shared/inference/cheap-rate-limit-fallback.js";
import { clipForHostLog, HOST_LOG_PREFIX, logHostLine, setHostLogSink } from "../../../shared/host-log.js";
import { redactSandAutoReviewInlineSecrets } from "../../../shared/sand-auto-review-redact.js";
import { SIMEON_WORKING_CONTEXT_TOKENS } from "../../../shared/inference/simeon-context-window.js";
import { resolveSandAgentStepCap, stepBudgetExceededMessage } from "../../../shared/inference/turn-step-budget.js";
import { readSimeonEnv, type SandInferenceProvider } from "../../../shared/inference-router.js";
import { simeonProxyBaseUrl } from "../../../shared/node/cursor-backend/simeon-api.js";
import { getSandRootDir } from "../../host-paths.js";
import { SandSettingsStore } from "../../../shared/node/settings/sand-settings-store.js";
import { simeonGeminiEndpoint, streamGeminiGenerateContent, toGeminiRequest, type GeminiDirectTool } from "./gemini-direct-generate.js";
import { configuredSimeonVideoModel, isGeminiVideoModelId } from "../../../shared/video-availability.js";
import type { LabelMessage, PromptExecutor } from "./sand-labeling.js";

type Loose = Record<string, any>;
interface ProviderMessage extends LabelMessage { role: string; content: string | readonly unknown[] }
type RoutedProvider = Exclude<SandInferenceProvider, "cursor">;
type UsageRecord = { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number };
type RoutedToolExecutor = (tool: Loose, args: unknown, toolCallId: string) => Promise<unknown>;

// The Codex, Claude Code and OpenRouter executors that sat beside this one
// were the reconstruction author's router experiment ("an inference router
// for Cursor, Claude Code, Codex, and OpenRouter", its README), never the
// upstream app's, and nothing could reach them since the executor was pinned to
// Simeon Labs' proxy; they are gone since 26 September 2026 (ledger F-128).
// The provider names stay in SAND_INFERENCE_PROVIDERS so stored usage reads.
const ROUTER_SYSTEM_PROMPT = [
  "You are Simeon, a warm, concise desktop assistant made by Simeon Labs. If someone asks who made or built you, say Simeon Labs.",
  "The tools supplied with this request are Simeon's already-connected plugins and accounts. Use them whenever they are relevant instead of claiming that a plugin is unavailable or asking the user to reconnect it.",
  "Never ask for an API key for an already-connected plugin. Respond directly to the user in natural language after completing any necessary tool calls.",
].join("\n");

function recordRoutedUsage(provider: RoutedProvider, usage: UsageRecord): void {
  new SandSettingsStore(join(getSandRootDir(), "settings.json")).recordInferenceUsage(provider, usage);
}

export interface SimeonCredentialSource {
  readonly getAccessToken: () => Promise<string>;
  readonly backendUrl?: string;
}

// GPT-6 Sol and Luna since 28 September 2026 (released 22 September at half
// the GPT-5.6 prices; the founder: "lets keep chat gpt"). Simeon Labs' server
// offers them as primary and cheap and keeps serving the GPT-5.6 pair to
// older apps (`ModelRole.retired`, simeon/desktop/pricing.py).
export const DEFAULT_SIMEON_MODEL = "gpt-6-sol";
export const DEFAULT_SIMEON_CHEAP_MODEL = "gpt-6-luna";
// A server not yet deployed with GPT-6 refuses it ("This model is not offered
// by the desktop app."); the step then runs on the model it replaced, once,
// with a `[simeon] model-legacy` line, so the order of a server deploy and an
// app rebuild cannot leave the agent silent.
export const LEGACY_SIMEON_MODELS: Readonly<Record<string, string>> = { "gpt-6-sol": "gpt-5.6-terra", "gpt-6-luna": "gpt-5.6-luna" };
export function isModelNotOfferedError(error: unknown): boolean {
  const record = error as { message?: unknown; responseBody?: unknown } | null;
  const text = `${typeof record?.message === "string" ? record.message : String(error)} ${typeof record?.responseBody === "string" ? record.responseBody : ""}`;
  return /not offered by the desktop app/i.test(text);
}
export const SIMEON_FETCH_TIMEOUT_MS = 45_000;
// The most one model call may write, thinking included (OpenAI's
// `max_output_tokens`). A backstop, not a tuning knob: no reply or tool call
// the loop makes comes near it, and it caps a runaway call at about $0.32 on
// Sol. Until 2 October 2026 no limit was sent at all. A call that reaches it
// writes a `[simeon] model-output-limit` line.
export const SIMEON_MAX_OUTPUT_TOKENS = 32_000;
export function configuredSimeonMaxOutputTokens(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(readSimeonEnv(env, "SAND_SIMEON_MAX_OUTPUT_TOKENS")?.trim());
  return Number.isInteger(value) && value >= 1_024 ? value : SIMEON_MAX_OUTPUT_TOKENS;
}
export const SIMEON_CREDENTIAL_WAIT_MS = 5_000;
export { SIMEON_WORKING_CONTEXT_TOKENS };

// Reasoning effort follows the role, the way the upstream app sets it: the agent
// loop runs at `effort: high` (`shared/agents/agent-model.ts`,
// SAND_DEFAULT_MODEL_SELECTION) and the computer-use subagent at
// `effort: low` with thinking off (`sand-agent-model.ts`,
// SAND_COMPUTER_USE_MODEL_SELECTION). Until 22 September the executor sent
// no effort at all, so every Terra call ran at OpenAI's default. The proxy
// forwards the Responses body untouched, so the value reaches OpenAI as is.
// GPT-6's levels (none, low, medium, high, xhigh, max). "minimal" was
// GPT-5.6's and reads as low.
export const SIMEON_REASONING_EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"] as const;
export type SimeonReasoningEffort = (typeof SIMEON_REASONING_EFFORTS)[number];
// Medium since 2 October 2026, not high: the person's messages, routines,
// helpers and agents waking each other start at medium and a turn that keeps
// working is raised to high (`simeonEffortForCall`); the turns that only
// react (a reply nudge, a background wake) run at low. One fixed level for
// everything thought as hard about "hello" as about a research task
// (docs/services-core.md, "Spend").
export const DEFAULT_SIMEON_REASONING_EFFORT: SimeonReasoningEffort = "medium";
export const SIMEON_LOW_EFFORT_CALL_REASONS: ReadonlySet<string> = new Set(["nudge", "wake", "background"]);
// A turn's calls after this many run at high: by then it is real work.
export const SIMEON_EFFORT_RAISE_AFTER_CALLS = 4;
export const DEFAULT_SIMEON_CHEAP_REASONING_EFFORT: SimeonReasoningEffort = "low";
export const SAND_SIMEON_REASONING_EFFORT_ENV = "SAND_SIMEON_REASONING_EFFORT";
export const SAND_SIMEON_CHEAP_REASONING_EFFORT_ENV = "SAND_SIMEON_CHEAP_REASONING_EFFORT";

function parseReasoningEffort(value: string | undefined, fallback: SimeonReasoningEffort): SimeonReasoningEffort {
  const raw = value?.trim().toLowerCase();
  const trimmed = raw === "minimal" ? "low" : raw;
  return (SIMEON_REASONING_EFFORTS as readonly string[]).includes(trimmed ?? "") ? trimmed as SimeonReasoningEffort : fallback;
}

export function configuredSimeonReasoningEffort(env: NodeJS.ProcessEnv = process.env): SimeonReasoningEffort {
  return parseReasoningEffort(readSimeonEnv(env, SAND_SIMEON_REASONING_EFFORT_ENV), DEFAULT_SIMEON_REASONING_EFFORT);
}

// The level set in the environment, when one is: it then holds for every
// non-cheap call, with no ladder, as the single level did before 2 October.
function explicitSimeonReasoningEffort(env: NodeJS.ProcessEnv): SimeonReasoningEffort | undefined {
  const raw = readSimeonEnv(env, SAND_SIMEON_REASONING_EFFORT_ENV);
  const valid = raw?.trim().toLowerCase() === "minimal" || (SIMEON_REASONING_EFFORTS as readonly string[]).includes(raw?.trim().toLowerCase() ?? "");
  return valid ? parseReasoningEffort(raw, DEFAULT_SIMEON_REASONING_EFFORT) : undefined;
}

export function configuredSimeonCheapReasoningEffort(env: NodeJS.ProcessEnv = process.env): SimeonReasoningEffort {
  return parseReasoningEffort(readSimeonEnv(env, SAND_SIMEON_CHEAP_REASONING_EFFORT_ENV), DEFAULT_SIMEON_CHEAP_REASONING_EFFORT);
}

// The Simeon provider is the signed-in account. Which process holds that
// credential differs: the host reads it from its auth service, the coordinator
// asks electron-main over the control port. Each registers its source once.
let simeonCredentialSource: SimeonCredentialSource | null = null;

export function setSimeonCredentialSource(source: SimeonCredentialSource | null): void {
  simeonCredentialSource = source;
}

export function configuredSimeonModel(): string {
  return readSimeonEnv(process.env, "SAND_SIMEON_MODEL")?.trim() || DEFAULT_SIMEON_MODEL;
}

export function configuredSimeonCheapModel(): string {
  return readSimeonEnv(process.env, "SAND_SIMEON_CHEAP_MODEL")?.trim() || DEFAULT_SIMEON_CHEAP_MODEL;
}

// The video model (Gemini, `shared/video-availability.ts`) is reached by
// the `isVideoSubagent` flag alone, never by name: the upstream app's
// summarization session names `gemini-2.5-flash` too
// (SAND_SUMMARIZATION_MODEL_ID) and must stay on Luna
// (tests/cheap-model-config.test.mjs).
export { configuredSimeonVideoModel };

export function isConfiguredSimeonModelId(value: string | undefined): boolean {
  const id = value?.trim();
  if (!id) return false;
  return id === configuredSimeonModel()
    || id === configuredSimeonCheapModel()
    || id === DEFAULT_SIMEON_MODEL
    || id === DEFAULT_SIMEON_CHEAP_MODEL;
}

export type SimeonSessionModelOptions = {
  readonly model?: string;
  readonly modelId?: string;
  readonly cheap?: boolean;
  readonly isSummarizationSession?: boolean;
  readonly isComputerUseSubagent?: boolean;
  readonly isBrowserUseSubagent?: boolean;
  // A watchVideo / videoReview child: its turns run on the video model
  // (Gemini through Simeon Labs' proxy) at low effort.
  readonly isVideoSubagent?: boolean;
  // True for a turn nobody asked for (the first-run intro, a reply nudge,
  // an automation). It gets the small model-call budget unless
  // `fullStepBudget` says otherwise.
  readonly hidden?: boolean;
  // A hidden turn that gets the asked-turn budget: the first message and a
  // routine, which the upstream app ran under its one 5,000-call cap (27 September
  // 2026). Reply nudges, wake-ups after a sign-in and memory extraction keep
  // the 40-call hidden budget.
  readonly fullStepBudget?: boolean;
  // Why the call is made, for the server's usage table (`x-simeon-call-reason`,
  // the `reason` column of desktop_usage). Set by the caller that knows (a
  // routine, an agent waking another); otherwise read off the flags above
  // by `simeonCallReason`.
  readonly callReason?: SimeonCallReason;
};

// What each model call was for, as the usage table records it. Short
// lowercase words: the server stores nothing else (`call_reason`,
// server/simeon/desktop/endpoints.py).
export const SIMEON_CALL_REASONS = [
  "chat", "helper", "computer", "browser", "video", "summary", "memory", "safety",
  "routine", "agent_wake", "voice", "nudge", "wake", "first_message", "background", "cheap",
] as const;
export type SimeonCallReason = (typeof SIMEON_CALL_REASONS)[number];
export const SIMEON_CALL_REASON_HEADER = "x-simeon-call-reason";

// The helper kinds win: a computer helper started by a routine is computer
// work. Then what the caller said (the safety check and memory run on the
// summarization session and say so), then a summary, then hidden (a turn
// nobody asked for, named by no caller), then cheap work, then a message
// the person sent.
export function simeonCallReason(options?: SimeonSessionModelOptions): SimeonCallReason {
  if (options?.isVideoSubagent === true) return "video";
  if (options?.isComputerUseSubagent === true) return "computer";
  if (options?.isBrowserUseSubagent === true) return "browser";
  if (options?.callReason !== undefined && (SIMEON_CALL_REASONS as readonly string[]).includes(options.callReason)) return options.callReason;
  if (options?.isSummarizationSession === true) return "summary";
  if (options?.hidden === true) return "background";
  if (options?.cheap === true) return "cheap";
  return "chat";
}

// The cheap roles, as the upstream app separates them: summarization and memory
// (their gemini-2.5-flash), the computer-use, browser-use and video
// subagents (their opus at effort low, their gemini for a video), and
// anything a caller marks cheap.
export function isCheapSimeonSession(options?: SimeonSessionModelOptions): boolean {
  return options?.cheap === true
    || options?.isSummarizationSession === true
    || options?.isComputerUseSubagent === true
    || options?.isBrowserUseSubagent === true
    || options?.isVideoSubagent === true;
}

export function simeonModelForSession(options?: SimeonSessionModelOptions): string {
  if (options?.isVideoSubagent === true) return configuredSimeonVideoModel();
  const named = options?.model?.trim();
  if (named && isConfiguredSimeonModelId(named)) return named;
  const sessionModel = options?.modelId?.trim();
  if (sessionModel && isConfiguredSimeonModelId(sessionModel)) return sessionModel;
  if (isCheapSimeonSession(options)) return configuredSimeonCheapModel();
  return configuredSimeonModel();
}

// Effort follows the role, not the model: a loop turn that falls back to
// Luna on a rate limit keeps the loop's effort. The cheap roles run at the
// cheap level; a level set in the environment holds for the rest; otherwise
// a turn that only reacts runs at low and everything else starts at medium.
export function simeonReasoningEffortForSession(options?: SimeonSessionModelOptions, env: NodeJS.ProcessEnv = process.env): SimeonReasoningEffort {
  if (isCheapSimeonSession(options)) return configuredSimeonCheapReasoningEffort(env);
  const explicit = explicitSimeonReasoningEffort(env);
  if (explicit !== undefined) return explicit;
  return SIMEON_LOW_EFFORT_CALL_REASONS.has(simeonCallReason(options)) ? "low" : DEFAULT_SIMEON_REASONING_EFFORT;
}

// Whether a session's effort climbs with its turn: only a session on the
// default ladder (not cheap, no level in the environment, starting at medium).
export function simeonEffortRaises(options?: SimeonSessionModelOptions, env: NodeJS.ProcessEnv = process.env): boolean {
  return !isCheapSimeonSession(options) && explicitSimeonReasoningEffort(env) === undefined && simeonReasoningEffortForSession(options, env) === DEFAULT_SIMEON_REASONING_EFFORT;
}

// The effort of one call: the session's, raised to high from the call after
// SIMEON_EFFORT_RAISE_AFTER_CALLS in a session that climbs. `callNumber`
// counts this session's calls from 1 (the turn's budget counter).
export function simeonEffortForCall(sessionEffort: SimeonReasoningEffort, raises: boolean, callNumber: number): SimeonReasoningEffort {
  return raises && callNumber > SIMEON_EFFORT_RAISE_AFTER_CALLS ? "high" : sessionEffort;
}

// One definition of where the proxy lives, shared with the other three
// Simeon doors; it was `api/proxy/v1` here until 19 September, which the
// API host answers with 404 (`simeon-api.ts`).
export { simeonProxyBaseUrl };

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// The upstream app's loop names the conversation on every model request: the agent
// puts its conversation id in the context (`packages/agent/index.ts`,
// `conversationIdKey`) and the inference client sends it as
// `InferenceStreamRequest.conversationId` (`chat-inference-proto/client.ts`),
// which is what Cursor's server keyed its prompt cache on. This executor
// read the context as `_ctx` and dropped it, so every request reached OpenAI
// with no cache key: on 26 September 2026, the first call of each turn on
// the founder's Mac read 0 of ~50,000 tokens from cache even 48 s after the
// previous turn's call with the same prefix. OpenAI's own form of that key is
// `prompt_cache_key`, which routes requests that share it (and their prefix)
// to the same cache. The id is hashed: OpenAI needs a stable key, not ours.
export function simeonPromptCacheKey(conversationId: unknown): string | undefined {
  if (typeof conversationId !== "string" || conversationId.trim().length === 0) return undefined;
  return `simeon-${createHash("sha256").update(conversationId.trim()).digest("hex").slice(0, 32)}`;
}

// Once OpenAI refuses the key (a 400 naming it), requests stop carrying it
// for the life of the process rather than failing every turn.
let promptCacheKeyRefused = false;
export function resetPromptCacheKeyRefusalForTest(): void { promptCacheKeyRefused = false; }

export function withPromptCacheKey(body: unknown, promptCacheKey: string | undefined): unknown {
  if (promptCacheKey === undefined || promptCacheKeyRefused || typeof body !== "string") return body;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed) || "prompt_cache_key" in parsed) return body;
    return JSON.stringify({ ...parsed, prompt_cache_key: promptCacheKey });
  } catch {
    return body;
  }
}

function simeonAuthenticatedFetch(source: SimeonCredentialSource, promptCacheKey?: string, callReason?: SimeonCallReason): typeof fetch {
  const authenticated: typeof fetch = async (input, rawInit) => {
    const init = rawInit?.body == null ? rawInit : { ...rawInit, body: withRealModelName(rawInit.body) as BodyInit };
    const accessToken = await withTimeout(
      source.getAccessToken(),
      SIMEON_CREDENTIAL_WAIT_MS,
      "Timed out waiting for a Simeon sign-in.",
    );
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${accessToken}`);
    if (callReason !== undefined) headers.set(SIMEON_CALL_REASON_HEADER, callReason);
    // The deadline is on the connect and the headers only. Until 25
    // September 2026 it was an `AbortSignal.timeout` on the whole request,
    // so a Responses stream that ran past 45 s end to end (a Terra step at
    // effort high) died mid-body, read as "the operation was aborted", and
    // was retried from scratch: the loop's own first-token budget is 150 s
    // (DEFAULT_FIRST_TOKEN_STALL_DEADLINE_MS). The body stays on the caller's
    // signal (ledger F-002).
    const headersDeadline = new AbortController();
    const timer = setTimeout(() => headersDeadline.abort(new Error(`Simeon Labs' server did not answer within ${SIMEON_FETCH_TIMEOUT_MS / 1000} s.`)), SIMEON_FETCH_TIMEOUT_MS);
    const signal = init?.signal == null ? headersDeadline.signal : AbortSignal.any([init.signal, headersDeadline.signal]);
    try {
      return await fetch(input, { ...init, headers, signal });
    } finally {
      clearTimeout(timer);
    }
  };
  if (promptCacheKey === undefined) return authenticated;
  return async (input, init) => {
    const keyed = withPromptCacheKey(init?.body, promptCacheKey);
    if (keyed === init?.body) return await authenticated(input, init);
    const answer = await authenticated(input, { ...init, body: keyed as BodyInit });
    if (answer.status !== 400) return answer;
    const text = await answer.clone().text().catch(() => "");
    if (!text.includes("prompt_cache_key")) return answer;
    promptCacheKeyRefused = true;
    modelCallLog(`${HOST_LOG_PREFIX} prompt-cache-key refused, requests continue without it: ${clipForHostLog(text, 300)}`);
    return await authenticated(input, init);
  };
}

function deferred<T>() { return Promise.withResolvers<T>(); }

function response(text: string, id: string, modelId: string) {
  return { id, modelId, timestamp: new Date(), headers: {}, messages: [{ role: "assistant", content: [{ type: "text", text }] }] };
}

function toolParameterSchema(definition: Loose): Loose | undefined {
  const parameters = definition.inputSchema ?? definition.parameters;
  if (parameters == null || typeof parameters !== "object") return undefined;
  return "jsonSchema" in parameters && typeof parameters.jsonSchema === "object" && parameters.jsonSchema != null ? parameters.jsonSchema : parameters;
}

function toToolSet(definitions: readonly Loose[] | undefined, executeTool?: RoutedToolExecutor): ToolSet | undefined {
  if (definitions == null || definitions.length === 0) return undefined;
  const tools: ToolSet = {};
  for (const definition of definitions) {
    if (typeof definition.name !== "string" || definition.name.length === 0) continue;
    const parameters = toolParameterSchema(definition);
    if (parameters == null) continue;
    const routedTool: any = {
      ...(typeof definition.description === "string" ? { description: definition.description } : {}),
      parameters: jsonSchema(parameters),
    };
    if (executeTool != null) routedTool.execute = async (args: unknown, options: { toolCallId: string }) => await executeTool(definition, args, options.toolCallId);
    tools[definition.name] = tool(routedTool);
  }
  return Object.keys(tools).length === 0 ? undefined : tools;
}

function partText(parts: readonly Loose[]): string {
  return parts.filter(part => part?.type === "text" && typeof part.text === "string").map(part => part.text as string).join("\n");
}

// The host loop appends messages in its own dialect of the AI SDK shape:
// Cursor wire metadata under `providerOptions.cursor` (with `undefined` fields
// the SDK's JSON validator refuses), tool results whose text may be empty and
// whose images live in `experimental_content`, reasoning parts with signatures.
// This is the copy the wire sees; the loop keeps its own.
export function toCoreMessages(messages: readonly ProviderMessage[]): CoreMessage[] {
  const out: Loose[] = [];
  for (const message of messages) {
    const { role, content } = message;
    if (typeof content === "string") {
      if (role === "system" || role === "user" || role === "assistant") out.push({ role, content });
      continue;
    }
    const parts = content as readonly Loose[];
    if (role === "system") { out.push({ role, content: partText(parts) }); continue; }
    if (role === "user") {
      out.push({ role, content: parts.flatMap((part): Loose[] => part?.type === "text" ? [{ type: "text", text: part.text }] : part?.type === "image" ? [{ type: "image", image: part.image, ...(typeof part.mimeType === "string" ? { mimeType: part.mimeType } : {}) }] : []) });
      continue;
    }
    if (role === "assistant") {
      out.push({ role, content: parts.flatMap((part): Loose[] => part?.type === "text" ? [{ type: "text", text: part.text }] : part?.type === "tool-call" ? [{ type: "tool-call", toolCallId: part.toolCallId, toolName: part.toolName, args: part.args }] : part?.type === "reasoning" && typeof part.text === "string" ? [{ type: "reasoning", text: part.text }] : []) });
      continue;
    }
    if (role !== "tool") continue;
    const images: Loose[] = [];
    const results = parts.flatMap((part): Loose[] => {
      if (part?.type !== "tool-result") return [];
      const rendered: readonly Loose[] = Array.isArray(part.experimental_content) ? part.experimental_content : Array.isArray(part.content) ? part.content : [];
      for (const item of rendered) if (item?.type === "image" && typeof item.data === "string") images.push({ type: "image", image: item.data, ...(typeof item.mimeType === "string" ? { mimeType: item.mimeType } : {}) });
      const text = typeof part.result === "string" ? part.result : part.result === undefined ? partText(rendered) : undefined;
      const result = text === undefined ? part.result : text.length > 0 ? text : images.length > 0 ? "(the tool returned an image; it follows as an attachment)" : "(no output)";
      return [{ type: "tool-result", toolCallId: part.toolCallId, toolName: part.toolName, result, ...(part.isError === true ? { isError: true } : {}) }];
    });
    if (results.length > 0) out.push({ role, content: results });
    // The Responses wire takes no images inside a function output; the person's
    // model must still see the screenshot, so it follows as the next user turn.
    if (images.length > 0) out.push({ role: "user", content: [{ type: "text", text: "Image output of the tool call(s) above." }, ...images] });
  }
  return out as CoreMessage[];
}

// The AI SDK (v4) never settles `response` when the first request fails: the
// stream yields one `error` part and closes, and the host loop then waits on
// `response` forever. Fail everything the loop awaits, with the provider's
// own sentence, and throw from the stream the way the loop expects.
export interface ModelCallLogLine {
  readonly model: string;
  readonly effort: string;
  readonly inputTokens: number;
  readonly cachedTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly elapsedMs: number;
  // What the step asked for: tool names with the first characters of
  // their arguments, or "-" for a step that only wrote text. This is
  // the line that says what a loop is doing.
  readonly tools: string;
  // What the step was offered: every tool name in the request, or "-" for
  // none. Added 24 September 2026, when a computerUse child ran seven steps
  // on Shell alone and nothing said whether Computer was in its request.
  readonly offered?: string;
  // The session's model-call budget and whether the turn is hidden, from
  // ModelCallBudget. Added 25 September 2026: the 40-call hidden cap was
  // found unwired on the production path and nothing in the log said which
  // cap a call ran under (design-audit-ledger.md F-001).
  readonly budget?: string;
  // What the cache can match, per call: a short hash of the system prompt and
  // of the tool definitions, and of the prompt cache key ("-" for none). Two
  // consecutive calls of one conversation with the same sys and tools hashes
  // share their whole prefix; a `cached=0` with unchanged hashes is a cache
  // routing miss, not a prompt that moved. Added 26 September 2026.
  readonly prefix?: string;
}

// One line per model call in the host log, so `docker exec … tail
// /tmp/sand-host.log` shows spend as it happens. Until 22 September 2026
// the executor wrote nothing and a fifty-minute loop left no trace but
// the bill.
export function formatModelCallLogLine(line: ModelCallLogLine): string {
  return `[simeon] model=${line.model} effort=${line.effort} input=${line.inputTokens} cached=${line.cachedTokens} output=${line.outputTokens} reasoning=${line.reasoningTokens} ms=${line.elapsedMs} tools=${line.tools}${line.offered === undefined ? "" : ` offered=${line.offered}`}${line.budget === undefined ? "" : ` budget=${line.budget}`}${line.prefix === undefined ? "" : ` prefix=${line.prefix}`}`;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

export function promptPrefixFingerprint(messages: readonly CoreMessage[], definitions: readonly Loose[] | undefined, promptCacheKey: string | undefined): string {
  let tools = "";
  try { tools = JSON.stringify((definitions ?? []).map((definition) => [definition.name, definition.description, toolParameterSchema(definition)])); } catch { tools = "?"; }
  return `sys:${shortHash(systemPromptText(messages))},tools:${shortHash(tools)},key:${promptCacheKey === undefined ? "-" : promptCacheKeyRefused ? "refused" : promptCacheKey.slice(7, 15)}`;
}

export function summarizeToolCalls(calls: readonly { readonly toolName?: string; readonly args?: unknown }[] | undefined): string {
  if (calls == null || calls.length === 0) return "-";
  return calls.map((call) => {
    let args = "";
    try { args = JSON.stringify(call.args ?? {}); } catch { args = String(call.args); }
    const short = args.length > 400 ? `${args.slice(0, 400)}…` : args;
    return `${call.toolName ?? "?"}(${redactSandAutoReviewInlineSecrets(short.replace(/\s+/g, " "))})`;
  }).join(" ");
}

// The line travels the host-log channel (`shared/host-log.ts`), the same
// one the tool-result and send-message lines use. `setModelCallLog` is the
// older name for the sink setter and still points at that one channel.
const modelCallLog = (line: string): void => logHostLine(line);
export function setModelCallLog(log: ((line: string) => void) | null): void {
  setHostLogSink(log);
}

// What a failed model call looked like, for /tmp/sand-host.log. Until 24
// September 2026 an in-stream `error` event from the provider surfaced as
// one sentence ("An error occurred while processing the request.") with
// nothing else: not the event, not which tools were on the request. The
// proxy relays the stream as a 200, so the server logs nothing either.
function toolSchemaSummary(tools: ToolSet | undefined): string {
  if (tools == null) return "{}";
  const summary: Record<string, unknown> = {};
  for (const [name, definition] of Object.entries(tools)) {
    const parameters = (definition as { parameters?: { jsonSchema?: unknown } }).parameters;
    summary[name] = parameters?.jsonSchema ?? parameters ?? null;
  }
  try { return JSON.stringify(summary); } catch { return "[unserialisable]"; }
}

function messageShapeSummary(messages: readonly CoreMessage[] | undefined): string {
  if (messages == null) return "";
  const parts: string[] = [];
  for (const message of messages) {
    const content = message.content;
    const size = typeof content === "string" ? content.length : Array.isArray(content) ? content.map(part => JSON.stringify(part).length).reduce((a, b) => a + b, 0) : 0;
    const kinds = Array.isArray(content) ? content.map(part => (part as { type?: string }).type ?? "?").join("+") : "text";
    parts.push(`${message.role}:${kinds}:${size}`);
  }
  return parts.join(" ");
}

function systemPromptText(messages: readonly CoreMessage[] | undefined): string {
  const system = messages?.find(message => message.role === "system");
  return system == null ? "" : typeof system.content === "string" ? system.content : JSON.stringify(system.content);
}

function logModelCallError(error: unknown, callInfo: { readonly model: string; readonly effort: string } | undefined, tools: ToolSet | undefined, messages?: readonly CoreMessage[]): void {
  let event = "";
  try { event = JSON.stringify(error) ?? String(error); } catch { event = String(error); }
  if (event === "{}" && error instanceof Error) event = error.message;
  modelCallLog(`${HOST_LOG_PREFIX} model-error model=${callInfo?.model ?? "?"} effort=${callInfo?.effort ?? "?"} tools=${Object.keys(tools ?? {}).join(",")} event=${clipForHostLog(redactSandAutoReviewInlineSecrets(event), 800)}`);
  modelCallLog(`${HOST_LOG_PREFIX} model-error-messages ${messageShapeSummary(messages)}`);
  modelCallLog(`${HOST_LOG_PREFIX} model-error-system ${clipForHostLog(redactSandAutoReviewInlineSecrets(systemPromptText(messages)), 12000)}`);
  modelCallLog(`${HOST_LOG_PREFIX} model-error-schemas ${clipForHostLog(toolSchemaSummary(tools), 6000)}`);
}

function settleAiSdkStream(result: ReturnType<typeof streamText>, invocationId: string, onUsage?: (usage: UsageRecord) => void, maxTokens = 0, callInfo?: { readonly model: string; readonly effort: string; readonly budget?: string; readonly prefix?: string }, tools?: ToolSet, messages?: readonly CoreMessage[], onRequestId?: (requestId: string) => void) {
  const startedAtMs = Date.now();
  const failure = deferred<never>();
  failure.promise.catch(() => undefined);
  const fail = (error: unknown) => failure.reject(asError(error));
  const fullStream = (async function* () {
    let ended = false;
    try {
      for await (const part of result.fullStream) {
        if (part.type === "error") { logModelCallError(part.error, callInfo, tools, messages); const next = asError(part.error); fail(next); throw next; }
        yield part;
      }
      ended = true;
    } finally {
      if (ended) queueMicrotask(() => fail(new Error("The model stream ended without a response.")));
    }
  })();
  const race = <T>(promise: Promise<T>): Promise<T> => Promise.race([promise, failure.promise]);
  // The provider's response id is the request id the loop records and the
  // tray error names; until 25 September 2026 nothing on this executor
  // ever reported one (F-005).
  if (onRequestId != null) void race(result.response).then((response) => { const id = (response as { id?: unknown } | undefined)?.id; if (typeof id === "string" && id.length > 0) onRequestId(id); }, () => undefined);
  const metadata = race(result.providerMetadata).then(value => (value?.openai ?? {}) as Record<string, unknown>, () => ({} as Record<string, unknown>));
  const toolCalls = race(result.toolCalls).then((calls) => calls as readonly { readonly toolName?: string; readonly args?: unknown }[], () => []);
  void race(result.finishReason).then((reason) => { if (reason === "length") modelCallLog(`${HOST_LOG_PREFIX} model-output-limit model=${callInfo?.model ?? "?"} limit=${configuredSimeonMaxOutputTokens()}`); }, () => undefined);
  const extendedUsage = Promise.all([race(result.usage), metadata, toolCalls]).then(([value, openai, calls]) => {
    const cached = typeof openai.cachedPromptTokens === "number" ? openai.cachedPromptTokens : 0;
    const reasoning = typeof openai.reasoningTokens === "number" ? openai.reasoningTokens : 0;
    if (callInfo != null) {
      modelCallLog(formatModelCallLogLine({ model: callInfo.model, effort: callInfo.effort, inputTokens: value.promptTokens, cachedTokens: cached, outputTokens: value.completionTokens, reasoningTokens: reasoning, elapsedMs: Date.now() - startedAtMs, tools: summarizeToolCalls(calls), offered: Object.keys(tools ?? {}).join(",") || "-", ...(callInfo.budget === undefined ? {} : { budget: callInfo.budget }), ...(callInfo.prefix === undefined ? {} : { prefix: callInfo.prefix }) }));
    }
    return { inputTokens: Math.max(0, value.promptTokens - cached), outputTokens: value.completionTokens, cacheReadTokens: cached, cacheWriteTokens: 0, maxTokens };
  });
  if (onUsage != null) void extendedUsage.then(onUsage, () => undefined);
  return { fullStream, response: race(result.response), usage: race(result.usage), extendedUsage, providerMetadata: race(result.providerMetadata), invocationId: Promise.resolve(invocationId) };
}

function aiSdkExecutor(model: LanguageModelV1, messages: readonly ProviderMessage[], invocationId: string, definitions?: readonly Loose[], executeTool?: RoutedToolExecutor, onUsage?: (usage: UsageRecord) => void, maxTokens = 0, openaiOptions: Record<string, unknown> = {}, callInfo?: { readonly model: string; readonly effort: string; readonly budget?: string }, onRequestId?: (requestId: string) => void, promptCacheKey?: string) {
  const tools = toToolSet(definitions, executeTool);
  const coreMessages = toCoreMessages(messages);
  const prefixedCallInfo = callInfo === undefined ? undefined : { ...callInfo, prefix: promptPrefixFingerprint(coreMessages, definitions, promptCacheKey) };
  // The host loop's state carries its own system prompt; the router prompt is
  // for the connector-only path, where nothing else says who the agent is.
  const system = coreMessages.some(message => message.role === "system") ? undefined : ROUTER_SYSTEM_PROMPT;
  // Cursor-era tool schemas (Task included) omit additionalProperties.
  // OpenAI's Responses default is strict:true, which then refuses them.
  const result = streamText({
    model,
    ...(system === undefined ? {} : { system }),
    messages: coreMessages,
    ...(tools === undefined ? {} : { tools }),
    toolCallStreaming: true,
    maxTokens: configuredSimeonMaxOutputTokens(),
    maxSteps: tools === undefined || executeTool == null ? 1 : 8,
    providerOptions: { openai: { strictSchemas: false, ...openaiOptions } },
  });
  return settleAiSdkStream(result, invocationId, onUsage, maxTokens, prefixedCallInfo, tools, coreMessages, onRequestId);
}

// Simeon's metered proxy, on the Responses wire: the one that takes reasoning
// and function tools in the same request (server/simeon/desktop/endpoints.py).
// @ai-sdk/openai 1.3 decides a model reasons by its name alone
// (`getResponsesModelConfig`: "o…" or "gpt-5…"), so for gpt-6-sol it would
// drop the reasoning effort without a word and send the brief as a "system"
// message instead of "developer" (found 28 September 2026, moving to GPT-6).
// A GPT model of a later generation is handed to the SDK under a name it
// recognises and renamed back on the wire (`withRealModelName`), so the
// request OpenAI sees is the SDK's reasoning request for the real model.
export const SDK_REASONING_ALIAS = "gpt-5-as:";
export function sdkModelIdFor(id: string): string {
  return /^gpt-(\d+)/.test(id) && Number(/^gpt-(\d+)/.exec(id)?.[1]) > 5 ? `${SDK_REASONING_ALIAS}${id}` : id;
}
export function withRealModelName(body: unknown): unknown {
  if (typeof body !== "string" || !body.includes(SDK_REASONING_ALIAS)) return body;
  try {
    const parsed = JSON.parse(body) as { model?: unknown };
    if (typeof parsed.model !== "string" || !parsed.model.startsWith(SDK_REASONING_ALIAS)) return body;
    return JSON.stringify({ ...parsed, model: parsed.model.slice(SDK_REASONING_ALIAS.length) });
  } catch {
    return body;
  }
}

function simeonLanguageModel(source: SimeonCredentialSource, id: string, promptCacheKey?: string, callReason?: SimeonCallReason): LanguageModelV1 {
  return createOpenAI({ apiKey: "simeon-desktop-access-token", baseURL: simeonProxyBaseUrl(source.backendUrl), name: "simeon", fetch: simeonAuthenticatedFetch(source, promptCacheKey, callReason) }).responses(sdkModelIdFor(id));
}

function geminiTools(definitions: readonly Loose[] | undefined): GeminiDirectTool[] | undefined {
  if (definitions == null) return undefined;
  const tools = definitions.flatMap((source): GeminiDirectTool[] => {
    const parameters = toolParameterSchema(source);
    return typeof source.name === "string" && source.name.length > 0 ? [{
      name: source.name,
      ...(typeof source.description === "string" ? { description: source.description } : {}),
      parameters,
      source,
    }] : [];
  });
  return tools.length === 0 ? undefined : tools;
}

// A Gemini model through Simeon Labs' proxy, on Gemini's own wire: the
// watchVideo / videoReview children (`docs/services-agents.md`). The
// request is written by `gemini-direct-generate.ts`, which is where the
// video's bytes, mime type and frame rate come off the loop's message and
// onto the wire; no other executor of ours carries them. The stream is the
// same shape the Codex executor returns, and the same `[simeon] model=`
// line is written, plus one `[simeon] video` line naming what was sent.
function geminiExecutor(source: SimeonCredentialSource, messages: readonly ProviderMessage[], invocationId: string, definitions?: readonly Loose[], executeTool?: RoutedToolExecutor, onUsage?: (usage: UsageRecord) => void, modelId: string = configuredSimeonVideoModel(), reasoningEffort: SimeonReasoningEffort = configuredSimeonCheapReasoningEffort(), budget?: ModelCallBudget, onRequestId?: (requestId: string) => void, callReason?: SimeonCallReason) {
  const usage = deferred<{ promptTokens: number; completionTokens: number; totalTokens: number }>();
  const extendedUsage = deferred<{ inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; maxTokens: number }>();
  const resultResponse = deferred<ReturnType<typeof response>>();
  const metadata = deferred<Record<string, unknown>>();
  const tools = geminiTools(definitions);
  const request = toGeminiRequest(messages, tools);
  const startedAtMs = Date.now();
  const fullStream = (async function* () {
    let text = "";
    const calls: { toolName: string; args: unknown }[] = [];
    try {
      modelCallLog(`${HOST_LOG_PREFIX} video model=${modelId} parts=${request.videoParts.length} ${request.videoParts.map((part) => `${part.mimeType}${part.fps === undefined ? "" : `@${part.fps}fps`}${part.bytes === undefined ? "" : ` ${Math.round(part.bytes / 1024)}KB`}${part.uri === undefined ? "" : " uri"}`).join(",") || "-"} offered=${tools?.map((tool) => tool.name).join(",") || "-"}`);
      for await (const event of streamGeminiGenerateContent({
        fetch: simeonAuthenticatedFetch(source, undefined, callReason),
        endpoint: simeonGeminiEndpoint(modelId, source.backendUrl),
        request,
        ...(tools == null ? {} : { tools }),
        ...(executeTool == null ? {} : { executeTool: async (selected, args, toolCallId) => await executeTool(selected.source, args, toolCallId) }),
      })) {
        if (event.type === "text-delta") { text += event.delta; yield { type: "text-delta" as const, textDelta: event.delta }; continue; }
        if (event.type === "tool-call") { calls.push({ toolName: event.toolName, args: event.args }); yield { type: "tool-call" as const, toolCallId: event.toolCallId, toolName: event.toolName, args: event.args }; continue; }
        const basic = { promptTokens: event.usage.inputTokens + event.usage.cacheReadTokens, completionTokens: event.usage.outputTokens, totalTokens: event.usage.inputTokens + event.usage.cacheReadTokens + event.usage.outputTokens };
        const extended = { inputTokens: event.usage.inputTokens, outputTokens: event.usage.outputTokens, cacheReadTokens: event.usage.cacheReadTokens, cacheWriteTokens: 0, maxTokens: SIMEON_WORKING_CONTEXT_TOKENS };
        modelCallLog(formatModelCallLogLine({ model: modelId, effort: reasoningEffort, inputTokens: basic.promptTokens, cachedTokens: event.usage.cacheReadTokens, outputTokens: event.usage.outputTokens, reasoningTokens: event.usage.reasoningTokens, elapsedMs: Date.now() - startedAtMs, tools: summarizeToolCalls(calls), offered: tools?.map((tool) => tool.name).join(",") || "-", ...(budget === undefined ? {} : { budget: `${budget.limit}${budget.hidden ? " hidden=true" : ""}` }) }));
        if (event.responseId.length > 0) onRequestId?.(event.responseId);
        onUsage?.(extended);
        usage.resolve(basic);
        extendedUsage.resolve(extended);
        metadata.resolve({ gemini: { responseId: event.responseId } });
        resultResponse.resolve(response(text, invocationId, modelId));
      }
    } catch (error) {
      modelCallLog(`${HOST_LOG_PREFIX} model-error model=${modelId} effort=${reasoningEffort} tools=${tools?.map((tool) => tool.name).join(",") ?? ""} event=${clipForHostLog(redactSandAutoReviewInlineSecrets(error instanceof Error ? error.message : String(error)), 800)}`);
      usage.reject(error); extendedUsage.reject(error); metadata.reject(error); resultResponse.reject(error); throw error;
    }
  })();
  return { fullStream, response: resultResponse.promise, usage: usage.promise, extendedUsage: extendedUsage.promise, providerMetadata: metadata.promise, invocationId: Promise.resolve(invocationId) };
}

function simeonExecutor(messages: readonly ProviderMessage[], invocationId: string, definitions?: readonly Loose[], executeTool?: RoutedToolExecutor, onUsage?: (usage: UsageRecord) => void, modelId?: string, reasoningEffort: SimeonReasoningEffort = configuredSimeonReasoningEffort(), budget?: ModelCallBudget, onRequestId?: (requestId: string) => void, promptCacheKey?: string, callReason?: SimeonCallReason) {
  const source = simeonCredentialSource;
  if (source == null) throw new Error("Simeon runs on the signed-in account, but this process has no credential source. Sign in to Simeon and try again.");
  const requested = modelId?.trim() || configuredSimeonModel();
  // A Gemini id goes on Gemini's wire. No rate-limit fallback to Luna: a
  // model that cannot see the video is not an answer to a video question.
  if (isGeminiVideoModelId(requested)) return geminiExecutor(source, messages, invocationId, definitions, executeTool, onUsage, requested, reasoningEffort, budget, onRequestId, callReason);
  const cheap = configuredSimeonCheapModel();
  const start = (id: string) => aiSdkExecutor(simeonLanguageModel(source, id, promptCacheKey, callReason), messages, invocationId, definitions, executeTool, onUsage, SIMEON_WORKING_CONTEXT_TOKENS, { reasoningEffort }, { model: id, effort: reasoningEffort, ...(budget === undefined ? {} : { budget: `${budget.limit}${budget.hidden ? " hidden=true" : ""}` }) }, onRequestId, promptCacheKey);

  const startOrLegacy = (id: string) => {
    const legacy = LEGACY_SIMEON_MODELS[id];
    if (legacy == null) return start(id);
    return withCheapRateLimitFallback(start(id), () => start(legacy), () => modelCallLog(`${HOST_LOG_PREFIX} model-legacy from=${id} to=${legacy} reason=the server does not offer ${id} yet`), isModelNotOfferedError);
  };

  if (requested === cheap) return startOrLegacy(requested);
  // A relayed rate limit re-runs the step on the cheap model. The swap used
  // to be silent; it now leaves a line beside the `[simeon] model=` lines,
  // and the model= line of the retried step names the cheap model (F-003).
  return withCheapRateLimitFallback(startOrLegacy(requested), () => startOrLegacy(cheap), (error) => modelCallLog(`${HOST_LOG_PREFIX} model-fallback from=${requested} to=${cheap} reason=${clipForHostLog(redactSandAutoReviewInlineSecrets(error instanceof Error ? error.message : String(error)), 300)}`));
}

// How many model calls a session may make. Counted across every executor
// the session hands out, because the turn shell asks for a fresh executor
// per step. The cap is the upstream app's 5,000 for a turn the person asked for
// and SAND_HIDDEN_TURN_MAX_STEPS for one nobody asked for.
export interface ModelCallBudget { readonly limit: number; readonly hidden: boolean; readonly fullStepBudget?: boolean; used: number }

export function createModelCallBudget(options?: SimeonSessionModelOptions, env: NodeJS.ProcessEnv = process.env): ModelCallBudget {
  const hidden = options?.hidden === true;
  const capped = hidden && options?.fullStepBudget !== true;
  return { limit: resolveSandAgentStepCap({ hidden: capped }, env), hidden, used: 0, ...(hidden && !capped ? { fullStepBudget: true } : {}) };
}

export function spendModelCall(budget: ModelCallBudget): void {
  if (budget.used >= budget.limit) throw new Error(stepBudgetExceededMessage(budget.limit, budget.hidden && budget.fullStepBudget !== true));
  budget.used += 1;
}

function conversationIdFromContext(ctx: unknown): unknown {
  const get = (ctx as { get?: unknown } | null | undefined)?.get;
  if (typeof get !== "function") return undefined;
  try { return get.call(ctx, conversationIdKey); } catch { return undefined; }
}

class ProviderPromptExecutor extends BasePromptExecutor<ProviderMessage> {
  constructor(readonly provider: RoutedProvider, initialMessages?: readonly ProviderMessage[], readonly onUsage?: (usage: UsageRecord) => void, readonly modelId?: string, readonly reasoningEffort?: SimeonReasoningEffort, readonly budget?: ModelCallBudget, readonly onRequestId?: (requestId: string) => void, readonly callReason?: SimeonCallReason, readonly effortRaises = false) { super(new BasePromptBuilder(initialMessages)); }
  stream(ctx: unknown, invocationId = crypto.randomUUID(), definitions?: readonly Loose[]) {
    if (this.budget != null) spendModelCall(this.budget);
    const effort = this.reasoningEffort === undefined ? undefined : simeonEffortForCall(this.reasoningEffort, this.effortRaises, this.budget?.used ?? 1);
    return simeonExecutor(this.getMessages(), invocationId, definitions, undefined, this.onUsage, this.modelId, effort, this.budget, this.onRequestId, simeonPromptCacheKey(conversationIdFromContext(ctx)), this.callReason);
  }
}

export function createProviderPromptSession(_provider: RoutedProvider, options?: SimeonSessionModelOptions, onRequestId?: (requestId: string) => void): { getModelId(): string; getExecutor(state?: unknown): PromptExecutor } {
  const provider: RoutedProvider = "simeon";
  const modelId = simeonModelForSession(options);
  const reasoningEffort = simeonReasoningEffortForSession(options);
  const budget = createModelCallBudget(options);
  const callReason = simeonCallReason(options);
  const effortRaises = simeonEffortRaises(options);
  return { getModelId: () => modelId, getExecutor: state => new ProviderPromptExecutor(provider, Array.isArray(state) ? state as ProviderMessage[] : undefined, usage => recordRoutedUsage(provider, usage), modelId, reasoningEffort, budget, onRequestId, callReason, effortRaises) };
}

export async function runRoutedProviderText(provider: RoutedProvider, messages: readonly ProviderMessage[], options?: {
  readonly mcpServerUrl?: string;
  readonly tools?: readonly Loose[];
  readonly executeTool?: RoutedToolExecutor;
  readonly onTextDelta?: (delta: string, accumulated: string) => void;
  readonly model?: string;
  readonly cheap?: boolean;
  /** The caller's model-call budget (F-133): spent once per call here, and the AI SDK's `maxSteps` caps the tool steps inside one. */
  readonly budget?: ModelCallBudget;
  /** What the call is for, for the usage table; `cheap` when unsaid on a cheap call, else `background`. */
  readonly callReason?: SimeonCallReason;
}): Promise<string> {
  const invocationId = crypto.randomUUID();
  const onUsage = (usage: UsageRecord) => recordRoutedUsage(provider, usage);
  if (options?.budget != null) spendModelCall(options.budget);
  const result = simeonExecutor(messages, invocationId, options?.tools, options?.executeTool, onUsage, simeonModelForSession(options), simeonReasoningEffortForSession(options), options?.budget, undefined, undefined, options?.callReason ?? (options?.cheap === true ? "cheap" : "background"));
  let text = "";
  for await (const event of result.fullStream) {
    if (event.type === "text-delta" && typeof event.textDelta === "string") {
      text += event.textDelta;
      options?.onTextDelta?.(event.textDelta, text);
    }
  }
  await result.response;
  return text;
}
