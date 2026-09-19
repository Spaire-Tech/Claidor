import { lstatSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { query as queryClaude, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { createOpenAI } from "@ai-sdk/openai";
import { jsonSchema, streamText, tool, type CoreMessage, type LanguageModelV1, type ToolSet } from "ai";

import { BasePromptBuilder, BasePromptExecutor } from "../../../packages/chat-inference/base.js";
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
  "You are Caisra, a warm, concise desktop assistant.",
  "You are running inside Caisra, not inside Codex CLI or Claude Code.",
  "The tools supplied with this request are Caisra's already-connected plugins and accounts. Use them whenever they are relevant instead of claiming that a plugin is unavailable or asking the user to reconnect it.",
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

// One definition of where the proxy lives, shared with the other three
// Claidor doors; it was `api/proxy/v1` here until 19 September, which the
// API host answers with 404 (`claidor-api.ts`).
export { claidorProxyBaseUrl };

function claidorAuthenticatedFetch(source: ClaidorCredentialSource): typeof fetch {
  return async (input, init) => {
    const accessToken = await source.getAccessToken();
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${accessToken}`);
    return await fetch(input, { ...init, headers });
  };
}

function providerPrompt(messages: readonly ProviderMessage[]): string {
  const rendered = messages.map(message => {
    const content = typeof message.content === "string" ? message.content : JSON.stringify(message.content);
    return `${message.role.toUpperCase()}: ${content}`;
  }).join("\n\n");
  return `${GROK_ROUTER_SYSTEM_PROMPT}\n\nContinue this Caisra conversation.\n\n${rendered}`;
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
    throw new Error("Codex is not signed in with ChatGPT. Run `codex login`, then reopen Caisra.");
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
  if (executable == null) throw new Error("Claude Code is not installed. Install and sign in to Claude Code, then reopen Caisra.");
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
function settleAiSdkStream(result: ReturnType<typeof streamText>, invocationId: string, onUsage?: (usage: UsageRecord) => void) {
  const failure = deferred<never>();
  failure.promise.catch(() => undefined);
  const fail = (error: unknown) => failure.reject(error instanceof Error ? error : new Error(String(error)));
  const fullStream = (async function* () {
    let ended = false;
    try {
      for await (const part of result.fullStream) {
        if (part.type === "error") { fail(part.error); throw part.error instanceof Error ? part.error : new Error(String(part.error)); }
        yield part;
      }
      ended = true;
    } finally {
      if (ended) queueMicrotask(() => fail(new Error("The model stream ended without a response.")));
    }
  })();
  const race = <T>(promise: Promise<T>): Promise<T> => Promise.race([promise, failure.promise]);
  const extendedUsage = race(result.usage).then(value => ({ inputTokens: value.promptTokens, outputTokens: value.completionTokens, cacheReadTokens: 0, cacheWriteTokens: 0, maxTokens: 0 }));
  if (onUsage != null) void extendedUsage.then(onUsage, () => undefined);
  return { fullStream, response: race(result.response), usage: race(result.usage), extendedUsage, providerMetadata: race(result.providerMetadata), invocationId: Promise.resolve(invocationId) };
}

function aiSdkExecutor(model: LanguageModelV1, messages: readonly ProviderMessage[], invocationId: string, definitions?: readonly Loose[], executeTool?: RoutedToolExecutor, onUsage?: (usage: UsageRecord) => void) {
  const tools = toToolSet(definitions, executeTool);
  const coreMessages = toCoreMessages(messages);
  // The host loop's state carries its own system prompt; the router prompt is
  // for the connector-only path, where nothing else says who the agent is.
  const system = coreMessages.some(message => message.role === "system") ? undefined : GROK_ROUTER_SYSTEM_PROMPT;
  const result = streamText({ model, ...(system === undefined ? {} : { system }), messages: coreMessages, ...(tools === undefined ? {} : { tools }), toolCallStreaming: true, maxSteps: tools === undefined || executeTool == null ? 1 : 8 });
  return settleAiSdkStream(result, invocationId, onUsage);
}

function openRouterExecutor(messages: readonly ProviderMessage[], invocationId: string, definitions?: readonly Loose[], executeTool?: RoutedToolExecutor, onUsage?: (usage: UsageRecord) => void) {
  const id = process.env.SAND_OPENROUTER_MODEL?.trim() || "openai/gpt-5.2";
  const model: LanguageModelV1 = createOpenAI({ apiKey: openRouterCredential(), baseURL: "https://openrouter.ai/api/v1", compatibility: "compatible", name: "openrouter", headers: { "HTTP-Referer": "https://github.com/grok-bot-reconstructed", "X-Title": "Caisra Reconstructed" } }).chat(id as any);
  return aiSdkExecutor(model, messages, invocationId, definitions, executeTool, onUsage);
}

// Claidor's metered proxy, on the Responses wire: the one that takes reasoning
// and function tools in the same request (server/polar/desktop/endpoints.py).
function claidorExecutor(messages: readonly ProviderMessage[], invocationId: string, definitions?: readonly Loose[], executeTool?: RoutedToolExecutor, onUsage?: (usage: UsageRecord) => void) {
  const source = claidorCredentialSource;
  if (source == null) throw new Error("Claidor is the selected provider, but this process has no signed-in credential source. Sign in to Claidor and try again.");
  const model: LanguageModelV1 = createOpenAI({ apiKey: "claidor-desktop-access-token", baseURL: claidorProxyBaseUrl(source.backendUrl), name: "claidor", fetch: claidorAuthenticatedFetch(source) }).responses(configuredClaidorModel());
  return aiSdkExecutor(model, messages, invocationId, definitions, executeTool, onUsage);
}

class ProviderPromptExecutor extends BasePromptExecutor<ProviderMessage> {
  constructor(readonly provider: RoutedProvider, initialMessages?: readonly ProviderMessage[], readonly onUsage?: (usage: UsageRecord) => void) { super(new BasePromptBuilder(initialMessages)); }
  stream(_ctx: unknown, invocationId = crypto.randomUUID(), definitions?: readonly Loose[]) {
    if (this.provider === "claidor") return claidorExecutor(this.getMessages(), invocationId, definitions, undefined, this.onUsage);
    if (this.provider === "codex") return codexExecutor(this.getMessages(), invocationId, definitions, undefined, this.onUsage);
    if (this.provider === "claude-code") return claudeExecutor(this.getMessages(), invocationId, this.onUsage);
    return openRouterExecutor(this.getMessages(), invocationId, definitions, undefined, this.onUsage);
  }
}

export function createProviderPromptSession(provider: RoutedProvider): { getModelId(): string; getExecutor(state?: unknown): PromptExecutor } {
  const modelId = provider === "claidor" ? configuredClaidorModel() : provider === "codex" ? configuredCodexModel() : provider === "claude-code" ? "claude-code" : process.env.SAND_OPENROUTER_MODEL?.trim() || "openai/gpt-5.2";
  return { getModelId: () => modelId, getExecutor: state => new ProviderPromptExecutor(provider, Array.isArray(state) ? state as ProviderMessage[] : undefined, usage => recordRoutedUsage(provider, usage)) };
}

export async function runRoutedProviderText(provider: RoutedProvider, messages: readonly ProviderMessage[], options?: {
  readonly mcpServerUrl?: string;
  readonly tools?: readonly Loose[];
  readonly executeTool?: RoutedToolExecutor;
  readonly onTextDelta?: (delta: string, accumulated: string) => void;
}): Promise<string> {
  const invocationId = crypto.randomUUID();
  const onUsage = (usage: UsageRecord) => recordRoutedUsage(provider, usage);
  const result = provider === "claidor"
    ? claidorExecutor(messages, invocationId, options?.tools, options?.executeTool, onUsage)
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
