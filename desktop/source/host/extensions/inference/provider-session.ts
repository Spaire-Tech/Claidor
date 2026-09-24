import { lstatSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { query as queryClaude, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { createOpenAI } from "@ai-sdk/openai";
import { jsonSchema, streamText, tool, type CoreMessage, type LanguageModelV1, type ToolSet } from "ai";

import { BasePromptBuilder, BasePromptExecutor } from "../../../packages/chat-inference/base.js";
import { asError } from "../../../shared/errors.js";
import { withCheapRateLimitFallback } from "../../../shared/inference/cheap-rate-limit-fallback.js";
import { clipForHostLog, HOST_LOG_PREFIX, logHostLine, setHostLogSink } from "../../../shared/host-log.js";
import { CLAIDOR_WORKING_CONTEXT_TOKENS } from "../../../shared/inference/claidor-context-window.js";
import { resolveSandAgentStepCap, stepBudgetExceededMessage } from "../../../shared/inference/turn-step-budget.js";
import type { SandInferenceProvider } from "../../../shared/inference-router.js";
import { claidorProxyBaseUrl } from "../../../shared/node/cursor-backend/claidor-api.js";
import { resolveClaudeCodeCliPath } from "../../../shared/node/inference-router-local.js";
import { getSandRootDir } from "../../host-paths.js";
import { SandSettingsStore } from "../../../shared/node/settings/sand-settings-store.js";
import { getBoxSecretsStorePath } from "../secrets/secrets-service.js";
import { streamCodexDirectResponses, type CodexDirectTool } from "./codex-direct-responses.js";
import type { LabelMessage, PromptExecutor } from "./sand-labeling.js";

type Loose = Record<string, any>;
interface ProviderMessage extends LabelMessage { role: string; content: string | readonly unknown[] }
type RoutedProvider = Exclude<SandInferenceProvider, "cursor">;
type UsageRecord = { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number };
type RoutedToolExecutor = (tool: Loose, args: unknown, toolCallId: string) => Promise<unknown>;

const GROK_ROUTER_SYSTEM_PROMPT = [
  "You are Simeon, a warm, concise desktop assistant.",
  "You are running inside Simeon, not inside Codex CLI or Claude Code.",
  "The tools supplied with this request are Simeon's already-connected plugins and accounts. Use them whenever they are relevant instead of claiming that a plugin is unavailable or asking the user to reconnect it.",
  "Never ask for an API key for an already-connected plugin. Respond directly to the user in natural language after completing any necessary tool calls.",
].join("\n");

function recordRoutedUsage(provider: RoutedProvider, usage: UsageRecord): void {
  new SandSettingsStore(join(getSandRootDir(), "settings.json")).recordInferenceUsage(provider, usage);
}

function persistedSecrets(): Record<string, string> {
  try {
    const parsed = JSON.parse(readFileSync(getBoxSecretsStorePath(), "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) return {};
    const secrets = (parsed as { secrets?: unknown }).secrets;
    if (typeof secrets !== "object" || secrets == null || Array.isArray(secrets)) return {};
    return Object.fromEntries(Object.entries(secrets).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch { return {}; }
}

function openRouterCredential(): string {
  const value = process.env.OPENROUTER_API_KEY?.trim() || persistedSecrets().OPENROUTER_API_KEY?.trim();
  if (value == null || value.length === 0) throw new Error("OpenRouter needs OPENROUTER_API_KEY. Add it in Settings → Router.");
  return value;
}

export interface ClaidorCredentialSource {
  readonly getAccessToken: () => Promise<string>;
  readonly backendUrl?: string;
}

export const DEFAULT_CLAIDOR_MODEL = "gpt-5.6-terra";
export const DEFAULT_CLAIDOR_CHEAP_MODEL = "gpt-5.6-luna";
export const CLAIDOR_FETCH_TIMEOUT_MS = 45_000;
export const CLAIDOR_CREDENTIAL_WAIT_MS = 5_000;
export { CLAIDOR_WORKING_CONTEXT_TOKENS };

// Reasoning effort follows the role, the way Grok Bot sets it: the agent
// loop runs at `effort: high` (`shared/agents/agent-model.ts`,
// SAND_DEFAULT_MODEL_SELECTION) and the computer-use subagent at
// `effort: low` with thinking off (`sand-agent-model.ts`,
// SAND_COMPUTER_USE_MODEL_SELECTION). Until 22 September the executor sent
// no effort at all, so every Terra call ran at OpenAI's default. The proxy
// forwards the Responses body untouched, so the value reaches OpenAI as is.
export const CLAIDOR_REASONING_EFFORTS = ["minimal", "low", "medium", "high"] as const;
export type ClaidorReasoningEffort = (typeof CLAIDOR_REASONING_EFFORTS)[number];
export const DEFAULT_CLAIDOR_REASONING_EFFORT: ClaidorReasoningEffort = "high";
export const DEFAULT_CLAIDOR_CHEAP_REASONING_EFFORT: ClaidorReasoningEffort = "low";
export const SAND_CLAIDOR_REASONING_EFFORT_ENV = "SAND_CLAIDOR_REASONING_EFFORT";
export const SAND_CLAIDOR_CHEAP_REASONING_EFFORT_ENV = "SAND_CLAIDOR_CHEAP_REASONING_EFFORT";

function parseReasoningEffort(value: string | undefined, fallback: ClaidorReasoningEffort): ClaidorReasoningEffort {
  const trimmed = value?.trim().toLowerCase();
  return (CLAIDOR_REASONING_EFFORTS as readonly string[]).includes(trimmed ?? "") ? trimmed as ClaidorReasoningEffort : fallback;
}

export function configuredClaidorReasoningEffort(env: NodeJS.ProcessEnv = process.env): ClaidorReasoningEffort {
  return parseReasoningEffort(env[SAND_CLAIDOR_REASONING_EFFORT_ENV], DEFAULT_CLAIDOR_REASONING_EFFORT);
}

export function configuredClaidorCheapReasoningEffort(env: NodeJS.ProcessEnv = process.env): ClaidorReasoningEffort {
  return parseReasoningEffort(env[SAND_CLAIDOR_CHEAP_REASONING_EFFORT_ENV], DEFAULT_CLAIDOR_CHEAP_REASONING_EFFORT);
}

// The Claidor provider is the signed-in account. Which process holds that
// credential differs: the host reads it from its auth service, the coordinator
// asks electron-main over the control port. Each registers its source once.
let claidorCredentialSource: ClaidorCredentialSource | null = null;

export function setClaidorCredentialSource(source: ClaidorCredentialSource | null): void {
  claidorCredentialSource = source;
}

export function configuredClaidorModel(): string {
  return process.env.SAND_CLAIDOR_MODEL?.trim() || DEFAULT_CLAIDOR_MODEL;
}

export function configuredClaidorCheapModel(): string {
  return process.env.SAND_CLAIDOR_CHEAP_MODEL?.trim() || DEFAULT_CLAIDOR_CHEAP_MODEL;
}

export function isConfiguredClaidorModelId(value: string | undefined): boolean {
  const id = value?.trim();
  if (!id) return false;
  return id === configuredClaidorModel()
    || id === configuredClaidorCheapModel()
    || id === DEFAULT_CLAIDOR_MODEL
    || id === DEFAULT_CLAIDOR_CHEAP_MODEL;
}

export type ClaidorSessionModelOptions = {
  readonly model?: string;
  readonly modelId?: string;
  readonly cheap?: boolean;
  readonly isSummarizationSession?: boolean;
  readonly isComputerUseSubagent?: boolean;
  readonly isBrowserUseSubagent?: boolean;
  // True for a turn nobody asked for (the first-run intro, a reply nudge,
  // an automation). It gets the small model-call budget.
  readonly hidden?: boolean;
};

// The cheap roles, as Grok Bot separates them: summarization and memory
// (their gemini-2.5-flash), the computer-use and browser-use subagents
// (their opus at effort low), and anything a caller marks cheap.
export function isCheapClaidorSession(options?: ClaidorSessionModelOptions): boolean {
  return options?.cheap === true
    || options?.isSummarizationSession === true
    || options?.isComputerUseSubagent === true
    || options?.isBrowserUseSubagent === true;
}

export function claidorModelForSession(options?: ClaidorSessionModelOptions): string {
  const named = options?.model?.trim();
  if (named && isConfiguredClaidorModelId(named)) return named;
  const sessionModel = options?.modelId?.trim();
  if (sessionModel && isConfiguredClaidorModelId(sessionModel)) return sessionModel;
  if (isCheapClaidorSession(options)) return configuredClaidorCheapModel();
  return configuredClaidorModel();
}

// Effort follows the role, not the model: a loop turn that falls back to
// Luna on a rate limit keeps the loop's effort.
export function claidorReasoningEffortForSession(options?: ClaidorSessionModelOptions, env: NodeJS.ProcessEnv = process.env): ClaidorReasoningEffort {
  return isCheapClaidorSession(options) ? configuredClaidorCheapReasoningEffort(env) : configuredClaidorReasoningEffort(env);
}

// One definition of where the proxy lives, shared with the other three
// Claidor doors; it was `api/proxy/v1` here until 19 September, which the
// API host answers with 404 (`claidor-api.ts`).
export { claidorProxyBaseUrl };

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

function claidorAuthenticatedFetch(source: ClaidorCredentialSource): typeof fetch {
  return async (input, init) => {
    const accessToken = await withTimeout(
      source.getAccessToken(),
      CLAIDOR_CREDENTIAL_WAIT_MS,
      "Timed out waiting for a Claidor sign-in.",
    );
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${accessToken}`);
    const timeout = AbortSignal.timeout(CLAIDOR_FETCH_TIMEOUT_MS);
    const signal = init?.signal == null ? timeout : AbortSignal.any([init.signal, timeout]);
    return await fetch(input, { ...init, headers, signal });
  };
}

function providerPrompt(messages: readonly ProviderMessage[]): string {
  const rendered = messages.map(message => {
    const content = typeof message.content === "string" ? message.content : JSON.stringify(message.content);
    return `${message.role.toUpperCase()}: ${content}`;
  }).join("\n\n");
  return `${GROK_ROUTER_SYSTEM_PROMPT}\n\nContinue this Simeon conversation.\n\n${rendered}`;
}

function deferred<T>() { return Promise.withResolvers<T>(); }

function response(text: string, id: string, modelId: string) {
  return { id, modelId, timestamp: new Date(), headers: {}, messages: [{ role: "assistant", content: [{ type: "text", text }] }] };
}

type CodexCredentials = { accessToken: string; refreshToken: string; idToken: string; accountId: string; path: string; document: Loose };

function codexCredentials(): CodexCredentials {
  const path = join(process.env.CODEX_HOME?.trim() || join(homedir(), ".codex"), "auth.json");
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error("Codex login credentials must be a private direct regular file.");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Loose;
  const accessToken = parsed?.tokens?.access_token;
  const refreshToken = parsed?.tokens?.refresh_token;
  const idToken = parsed?.tokens?.id_token;
  const accountId = parsed?.tokens?.account_id;
  if (parsed?.auth_mode !== "chatgpt" || typeof accessToken !== "string" || accessToken.length === 0 || typeof refreshToken !== "string" || refreshToken.length === 0 || typeof idToken !== "string" || idToken.length === 0 || typeof accountId !== "string" || accountId.length === 0) {
    throw new Error("Codex is not signed in with ChatGPT. Run `codex login`, then reopen Simeon.");
  }
  return { accessToken, refreshToken, idToken, accountId, path, document: parsed };
}

function jwtAudience(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as Loose;
    const audience = payload.aud;
    return typeof audience === "string" ? audience : Array.isArray(audience) ? audience.find((value): value is string => typeof value === "string") ?? null : null;
  } catch { return null; }
}

async function refreshCodexCredentials(current: CodexCredentials): Promise<CodexCredentials> {
  const clientId = jwtAudience(current.idToken);
  if (clientId == null) throw new Error("Codex login expired and its refresh identity is invalid. Run `codex login` again.");
  const refresh = await fetch("https://auth.openai.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: current.refreshToken, client_id: clientId }),
  });
  if (!refresh.ok) throw new Error("Codex login expired and could not be refreshed. Run `codex login` again.");
  const payload = await refresh.json() as Loose;
  if (typeof payload.access_token !== "string" || payload.access_token.length === 0) throw new Error("Codex returned an invalid refreshed login. Run `codex login` again.");
  const document = {
    ...current.document,
    tokens: {
      ...current.document.tokens,
      access_token: payload.access_token,
      refresh_token: typeof payload.refresh_token === "string" && payload.refresh_token.length > 0 ? payload.refresh_token : current.refreshToken,
      id_token: typeof payload.id_token === "string" && payload.id_token.length > 0 ? payload.id_token : current.idToken,
    },
    last_refresh: new Date().toISOString(),
  };
  const temporary = `${current.path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  renameSync(temporary, current.path);
  return codexCredentials();
}

function codexAuthenticatedFetch(initial: CodexCredentials): typeof fetch {
  let credentials = initial;
  return async (input, init) => {
    const perform = () => {
      const headers = new Headers(init?.headers);
      headers.set("authorization", `Bearer ${credentials.accessToken}`);
      headers.set("ChatGPT-Account-Id", credentials.accountId);
      return fetch(input, { ...init, headers });
    };
    let result = await perform();
    if (result.status !== 401) return result;
    credentials = await refreshCodexCredentials(credentials);
    result = await perform();
    return result;
  };
}

function configuredCodexModel(): string {
  const selected = process.env.SAND_CODEX_MODEL?.trim();
  if (selected) return selected;
  try {
    const config = readFileSync(join(process.env.CODEX_HOME?.trim() || join(homedir(), ".codex"), "config.toml"), "utf8");
    return /^\s*model\s*=\s*["']([^"']+)["']/m.exec(config)?.[1]?.trim() || "gpt-5.4";
  } catch { return "gpt-5.4"; }
}

function configuredCodexReasoningEffort(): "minimal" | "low" | "medium" | "high" | "xhigh" | undefined {
  const selected = process.env.SAND_CODEX_REASONING_EFFORT?.trim();
  if (selected === "minimal" || selected === "low" || selected === "medium" || selected === "high" || selected === "xhigh") return selected;
  try {
    const config = readFileSync(join(process.env.CODEX_HOME?.trim() || join(homedir(), ".codex"), "config.toml"), "utf8");
    const value = /^\s*model_reasoning_effort\s*=\s*["']([^"']+)["']/m.exec(config)?.[1]?.trim();
    return value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh" ? value : undefined;
  } catch { return undefined; }
}

// The host's tools arrive with `parameters` already wrapped by the AI SDK's
// `jsonSchema()` (packages/agent/tools/common.ts); the coordinator's connector
// tools arrive as bare JSON Schema under `inputSchema`. Both come out bare here.
function toolParameterSchema(definition: Loose): Loose | undefined {
  const parameters = definition.inputSchema ?? definition.parameters;
  if (parameters == null || typeof parameters !== "object") return undefined;
  return "jsonSchema" in parameters && typeof parameters.jsonSchema === "object" && parameters.jsonSchema != null ? parameters.jsonSchema : parameters;
}

function codexTools(definitions: readonly Loose[] | undefined): CodexDirectTool[] | undefined {
  if (definitions == null) return undefined;
  const tools = definitions.flatMap((source): CodexDirectTool[] => {
    const parameters = toolParameterSchema(source);
    return typeof source.name === "string" && source.name.length > 0 && parameters != null ? [{
      name: source.name,
      ...(typeof source.description === "string" ? { description: source.description } : {}),
      parameters,
      source,
    }] : [];
  });
  return tools.length === 0 ? undefined : tools;
}

function codexExecutor(messages: readonly ProviderMessage[], invocationId: string, definitions?: readonly Loose[], executeTool?: RoutedToolExecutor, onUsage?: (usage: UsageRecord) => void) {
  const credentials = codexCredentials();
  const usage = deferred<{ promptTokens: number; completionTokens: number; totalTokens: number }>();
  const extendedUsage = deferred<{ inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; maxTokens: number }>();
  const resultResponse = deferred<ReturnType<typeof response>>();
  const metadata = deferred<Record<string, unknown>>();
  const model = configuredCodexModel();
  const tools = codexTools(definitions);
  const fullStream = (async function* () {
    let text = "";
    try {
      for await (const event of streamCodexDirectResponses({
        fetch: codexAuthenticatedFetch(credentials),
        endpoint: "https://chatgpt.com/backend-api/codex/responses",
        model,
        ...(configuredCodexReasoningEffort() == null ? {} : { reasoningEffort: configuredCodexReasoningEffort()! }),
        instructions: GROK_ROUTER_SYSTEM_PROMPT,
        input: messages.map(message => ({ role: message.role === "assistant" ? "assistant" : "user", content: typeof message.content === "string" ? message.content : JSON.stringify(message.content) })),
        ...(tools == null ? {} : { tools }),
        ...(executeTool == null ? {} : { executeTool: async (selected, args, toolCallId) => await executeTool(selected.source, args, toolCallId) }),
        maxSteps: tools == null ? 1 : 8,
      })) {
        if (event.type === "text-delta") { text += event.delta; yield { type: "text-delta" as const, textDelta: event.delta }; continue; }
        const basic = { promptTokens: event.usage.inputTokens, completionTokens: event.usage.outputTokens, totalTokens: event.usage.inputTokens + event.usage.outputTokens };
        const extended = { ...event.usage, maxTokens: 0 };
        onUsage?.(event.usage);
        usage.resolve(basic);
        extendedUsage.resolve(extended);
        metadata.resolve({ openai: { responseId: event.responseId, direct: true } });
        resultResponse.resolve(response(text, invocationId, model));
      }
    } catch (error) { usage.reject(error); extendedUsage.reject(error); metadata.reject(error); resultResponse.reject(error); throw error; }
  })();
  return { fullStream, response: resultResponse.promise, usage: usage.promise, extendedUsage: extendedUsage.promise, providerMetadata: metadata.promise, invocationId: Promise.resolve(invocationId) };
}

function claudeExecutor(messages: readonly ProviderMessage[], invocationId: string, onUsage?: (usage: UsageRecord) => void, mcpServerUrl?: string) {
  const executable = resolveClaudeCodeCliPath();
  if (executable == null) throw new Error("Claude Code is not installed. Install and sign in to Claude Code, then reopen Simeon.");
  const usage = deferred<{ promptTokens: number; completionTokens: number; totalTokens: number }>();
  const extendedUsage = deferred<{ inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; maxTokens: number }>();
  const resultResponse = deferred<ReturnType<typeof response>>();
  const metadata = deferred<Record<string, unknown>>();
  const fullStream = (async function* () {
    try {
      let final: SDKResultMessage | undefined;
      const selectedModel = process.env.SAND_CLAUDE_MODEL?.trim();
      for await (const message of queryClaude({ prompt: providerPrompt(messages), options: { pathToClaudeCodeExecutable: executable, cwd: getSandRootDir(), tools: mcpServerUrl == null ? [] : ["mcp__grok_bot_plugins__*"], ...(mcpServerUrl == null ? {} : { mcpServers: { grok_bot_plugins: { type: "http" as const, url: mcpServerUrl } }, strictMcpConfig: true }), permissionMode: "default", maxTurns: mcpServerUrl == null ? 1 : 8, persistSession: false, ...(selectedModel == null || selectedModel.length === 0 ? {} : { model: selectedModel }) } })) if (message.type === "result") final = message;
      if (final == null) throw new Error("Claude Code ended without a result.");
      if (final.subtype !== "success") throw new Error(final.errors.join("\n") || `Claude Code failed (${final.subtype}).`);
      const text = final.result;
      if (text.length > 0) yield { type: "text-delta" as const, textDelta: text };
      const input = final.usage.input_tokens, output = final.usage.output_tokens, cacheRead = final.usage.cache_read_input_tokens ?? 0, cacheWrite = final.usage.cache_creation_input_tokens ?? 0;
      onUsage?.({ inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite });
      usage.resolve({ promptTokens: input, completionTokens: output, totalTokens: input + output });
      extendedUsage.resolve({ inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite, maxTokens: 0 });
      metadata.resolve({ anthropic: { sessionId: final.session_id, totalCostUsd: final.total_cost_usd } });
      resultResponse.resolve(response(text, invocationId, "claude-code"));
    } catch (error) { usage.reject(error); extendedUsage.reject(error); metadata.reject(error); resultResponse.reject(error); throw error; }
  })();
  return { fullStream, response: resultResponse.promise, usage: usage.promise, extendedUsage: extendedUsage.promise, providerMetadata: metadata.promise, invocationId: Promise.resolve(invocationId) };
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
}

// One line per model call in the host log, so `docker exec … tail
// /tmp/sand-host.log` shows spend as it happens. Until 22 September 2026
// the executor wrote nothing and a fifty-minute loop left no trace but
// the bill.
export function formatModelCallLogLine(line: ModelCallLogLine): string {
  return `[claidor] model=${line.model} effort=${line.effort} input=${line.inputTokens} cached=${line.cachedTokens} output=${line.outputTokens} reasoning=${line.reasoningTokens} ms=${line.elapsedMs} tools=${line.tools}`;
}

export function summarizeToolCalls(calls: readonly { readonly toolName?: string; readonly args?: unknown }[] | undefined): string {
  if (calls == null || calls.length === 0) return "-";
  return calls.map((call) => {
    let args = "";
    try { args = JSON.stringify(call.args ?? {}); } catch { args = String(call.args); }
    const short = args.length > 400 ? `${args.slice(0, 400)}…` : args;
    return `${call.toolName ?? "?"}(${short.replace(/\s+/g, " ")})`;
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

function logModelCallError(error: unknown, callInfo: { readonly model: string; readonly effort: string } | undefined, tools: ToolSet | undefined): void {
  let event = "";
  try { event = JSON.stringify(error) ?? String(error); } catch { event = String(error); }
  if (event === "{}" && error instanceof Error) event = error.message;
  modelCallLog(`${HOST_LOG_PREFIX} model-error model=${callInfo?.model ?? "?"} effort=${callInfo?.effort ?? "?"} tools=${Object.keys(tools ?? {}).join(",")} event=${clipForHostLog(event, 800)}`);
  modelCallLog(`${HOST_LOG_PREFIX} model-error-schemas ${clipForHostLog(toolSchemaSummary(tools), 6000)}`);
}

function settleAiSdkStream(result: ReturnType<typeof streamText>, invocationId: string, onUsage?: (usage: UsageRecord) => void, maxTokens = 0, callInfo?: { readonly model: string; readonly effort: string }, tools?: ToolSet) {
  const startedAtMs = Date.now();
  const failure = deferred<never>();
  failure.promise.catch(() => undefined);
  const fail = (error: unknown) => failure.reject(asError(error));
  const fullStream = (async function* () {
    let ended = false;
    try {
      for await (const part of result.fullStream) {
        if (part.type === "error") { logModelCallError(part.error, callInfo, tools); const next = asError(part.error); fail(next); throw next; }
        yield part;
      }
      ended = true;
    } finally {
      if (ended) queueMicrotask(() => fail(new Error("The model stream ended without a response.")));
    }
  })();
  const race = <T>(promise: Promise<T>): Promise<T> => Promise.race([promise, failure.promise]);
  const metadata = race(result.providerMetadata).then(value => (value?.openai ?? {}) as Record<string, unknown>, () => ({} as Record<string, unknown>));
  const toolCalls = race(result.toolCalls).then((calls) => calls as readonly { readonly toolName?: string; readonly args?: unknown }[], () => []);
  const extendedUsage = Promise.all([race(result.usage), metadata, toolCalls]).then(([value, openai, calls]) => {
    const cached = typeof openai.cachedPromptTokens === "number" ? openai.cachedPromptTokens : 0;
    const reasoning = typeof openai.reasoningTokens === "number" ? openai.reasoningTokens : 0;
    if (callInfo != null) {
      modelCallLog(formatModelCallLogLine({ model: callInfo.model, effort: callInfo.effort, inputTokens: value.promptTokens, cachedTokens: cached, outputTokens: value.completionTokens, reasoningTokens: reasoning, elapsedMs: Date.now() - startedAtMs, tools: summarizeToolCalls(calls) }));
    }
    return { inputTokens: Math.max(0, value.promptTokens - cached), outputTokens: value.completionTokens, cacheReadTokens: cached, cacheWriteTokens: 0, maxTokens };
  });
  if (onUsage != null) void extendedUsage.then(onUsage, () => undefined);
  return { fullStream, response: race(result.response), usage: race(result.usage), extendedUsage, providerMetadata: race(result.providerMetadata), invocationId: Promise.resolve(invocationId) };
}

function aiSdkExecutor(model: LanguageModelV1, messages: readonly ProviderMessage[], invocationId: string, definitions?: readonly Loose[], executeTool?: RoutedToolExecutor, onUsage?: (usage: UsageRecord) => void, maxTokens = 0, openaiOptions: Record<string, unknown> = {}, callInfo?: { readonly model: string; readonly effort: string }) {
  const tools = toToolSet(definitions, executeTool);
  const coreMessages = toCoreMessages(messages);
  // The host loop's state carries its own system prompt; the router prompt is
  // for the connector-only path, where nothing else says who the agent is.
  const system = coreMessages.some(message => message.role === "system") ? undefined : GROK_ROUTER_SYSTEM_PROMPT;
  // Cursor-era tool schemas (Task included) omit additionalProperties.
  // OpenAI's Responses default is strict:true, which then refuses them.
  const result = streamText({
    model,
    ...(system === undefined ? {} : { system }),
    messages: coreMessages,
    ...(tools === undefined ? {} : { tools }),
    toolCallStreaming: true,
    maxSteps: tools === undefined || executeTool == null ? 1 : 8,
    providerOptions: { openai: { strictSchemas: false, ...openaiOptions } },
  });
  return settleAiSdkStream(result, invocationId, onUsage, maxTokens, callInfo, tools);
}

function openRouterExecutor(messages: readonly ProviderMessage[], invocationId: string, definitions?: readonly Loose[], executeTool?: RoutedToolExecutor, onUsage?: (usage: UsageRecord) => void) {
  const id = process.env.SAND_OPENROUTER_MODEL?.trim() || "openai/gpt-5.2";
  const model: LanguageModelV1 = createOpenAI({ apiKey: openRouterCredential(), baseURL: "https://openrouter.ai/api/v1", compatibility: "compatible", name: "openrouter", headers: { "HTTP-Referer": "https://github.com/grok-bot-reconstructed", "X-Title": "Simeon Reconstructed" } }).chat(id as any);
  return aiSdkExecutor(model, messages, invocationId, definitions, executeTool, onUsage);
}

// Claidor's metered proxy, on the Responses wire: the one that takes reasoning
// and function tools in the same request (server/polar/desktop/endpoints.py).
function claidorLanguageModel(source: ClaidorCredentialSource, id: string): LanguageModelV1 {
  return createOpenAI({ apiKey: "claidor-desktop-access-token", baseURL: claidorProxyBaseUrl(source.backendUrl), name: "claidor", fetch: claidorAuthenticatedFetch(source) }).responses(id);
}

function claidorExecutor(messages: readonly ProviderMessage[], invocationId: string, definitions?: readonly Loose[], executeTool?: RoutedToolExecutor, onUsage?: (usage: UsageRecord) => void, modelId?: string, reasoningEffort: ClaidorReasoningEffort = configuredClaidorReasoningEffort()) {
  const source = claidorCredentialSource;
  if (source == null) throw new Error("Claidor is the selected provider, but this process has no signed-in credential source. Sign in to Claidor and try again.");
  const requested = modelId?.trim() || configuredClaidorModel();
  const cheap = configuredClaidorCheapModel();
  const start = (id: string) => aiSdkExecutor(claidorLanguageModel(source, id), messages, invocationId, definitions, executeTool, onUsage, CLAIDOR_WORKING_CONTEXT_TOKENS, { reasoningEffort }, { model: id, effort: reasoningEffort });
  if (requested === cheap) return start(requested);
  return withCheapRateLimitFallback(start(requested), () => start(cheap));
}

// How many model calls a session may make. Counted across every executor
// the session hands out, because the turn shell asks for a fresh executor
// per step. The cap is Grok Bot's 5,000 for a turn the person asked for
// and SAND_HIDDEN_TURN_MAX_STEPS for one nobody asked for.
export interface ModelCallBudget { readonly limit: number; readonly hidden: boolean; used: number }

export function createModelCallBudget(options?: ClaidorSessionModelOptions, env: NodeJS.ProcessEnv = process.env): ModelCallBudget {
  const hidden = options?.hidden === true;
  return { limit: resolveSandAgentStepCap({ hidden }, env), hidden, used: 0 };
}

export function spendModelCall(budget: ModelCallBudget): void {
  if (budget.used >= budget.limit) throw new Error(stepBudgetExceededMessage(budget.limit, budget.hidden));
  budget.used += 1;
}

class ProviderPromptExecutor extends BasePromptExecutor<ProviderMessage> {
  constructor(readonly provider: RoutedProvider, initialMessages?: readonly ProviderMessage[], readonly onUsage?: (usage: UsageRecord) => void, readonly modelId?: string, readonly reasoningEffort?: ClaidorReasoningEffort, readonly budget?: ModelCallBudget) { super(new BasePromptBuilder(initialMessages)); }
  stream(_ctx: unknown, invocationId = crypto.randomUUID(), definitions?: readonly Loose[]) {
    if (this.budget != null) spendModelCall(this.budget);
    if (this.provider === "claidor") return claidorExecutor(this.getMessages(), invocationId, definitions, undefined, this.onUsage, this.modelId, this.reasoningEffort);
    if (this.provider === "codex") return codexExecutor(this.getMessages(), invocationId, definitions, undefined, this.onUsage);
    if (this.provider === "claude-code") return claudeExecutor(this.getMessages(), invocationId, this.onUsage);
    return openRouterExecutor(this.getMessages(), invocationId, definitions, undefined, this.onUsage);
  }
}

export function createProviderPromptSession(_provider: RoutedProvider, options?: ClaidorSessionModelOptions): { getModelId(): string; getExecutor(state?: unknown): PromptExecutor } {
  const provider: RoutedProvider = "claidor";
  const modelId = claidorModelForSession(options);
  const reasoningEffort = claidorReasoningEffortForSession(options);
  const budget = createModelCallBudget(options);
  return { getModelId: () => modelId, getExecutor: state => new ProviderPromptExecutor(provider, Array.isArray(state) ? state as ProviderMessage[] : undefined, usage => recordRoutedUsage(provider, usage), modelId, reasoningEffort, budget) };
}

export async function runRoutedProviderText(provider: RoutedProvider, messages: readonly ProviderMessage[], options?: {
  readonly mcpServerUrl?: string;
  readonly tools?: readonly Loose[];
  readonly executeTool?: RoutedToolExecutor;
  readonly onTextDelta?: (delta: string, accumulated: string) => void;
  readonly model?: string;
  readonly cheap?: boolean;
}): Promise<string> {
  const invocationId = crypto.randomUUID();
  const onUsage = (usage: UsageRecord) => recordRoutedUsage(provider, usage);
  const result = provider === "claidor"
    ? claidorExecutor(messages, invocationId, options?.tools, options?.executeTool, onUsage, claidorModelForSession(options), claidorReasoningEffortForSession(options))
    : provider === "codex"
      ? codexExecutor(messages, invocationId, options?.tools, options?.executeTool, onUsage)
      : provider === "claude-code"
        ? claudeExecutor(messages, invocationId, onUsage, options?.mcpServerUrl)
        : openRouterExecutor(messages, invocationId, options?.tools, options?.executeTool, onUsage);
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
