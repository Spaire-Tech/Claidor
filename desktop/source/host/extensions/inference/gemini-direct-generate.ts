// Gemini's own wire, spoken by hand, for the one thing no other model of
// ours takes: a video.
//
// The watchVideo / videoReview subagents run on a Gemini model
// (`docs/product/video-served.md`, 25 September 2026). The executor for
// every other model is the AI SDK's OpenAI provider on the Responses wire
// (`provider-session.ts`), and that wire has no video part; `@ai-sdk/google`
// is not in `package.json` (measured: `node_modules/@ai-sdk/` holds openai,
// provider, provider-utils, react, ui-utils), so this file is to Gemini what
// `codex-direct-responses.ts` is to Codex: a small client that writes the
// request in the provider's own JSON, reads its `alt=sse` stream, and yields
// the parts the host loop consumes (`tool-stream-executor.ts`: `text-delta`
// and `tool-call`).
//
// What travels that no translation would carry: the video's bytes as
// `inlineData {mimeType, data}` and its frame rate as `videoMetadata {fps}`,
// read off the loop's own message dialect (`context-processing.ts` ~283:
// `{type: "image", image: <data URI | URL>, mimeType, providerOptions:
// {cursor: {mimeType, videoFps}}}`). Simeon Labs' server forwards the body
// untouched (`proxy_gemini_generate` in `server/polar/desktop/endpoints.py`).
import { claidorProxyBaseUrl } from "../../../shared/node/cursor-backend/claidor-api.js";

type Loose = Record<string, any>;

export interface GeminiLoopMessage { readonly role: string; readonly content: string | readonly unknown[] }

export type GeminiDirectUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly reasoningTokens: number;
};

export type GeminiDirectTool = {
  readonly name: string;
  readonly description?: string;
  readonly parameters: unknown;
  readonly source: Loose;
};

export type GeminiDirectEvent =
  | { readonly type: "text-delta"; readonly delta: string }
  | { readonly type: "tool-call"; readonly toolCallId: string; readonly toolName: string; readonly args: unknown }
  | { readonly type: "done"; readonly text: string; readonly responseId: string; readonly usage: GeminiDirectUsage };

/** One video part of a request, for the host log line. */
export interface GeminiVideoPart { readonly mimeType: string; readonly fps?: number; readonly bytes?: number; readonly uri?: string }

export interface GeminiRequest {
  readonly systemInstruction?: Loose;
  readonly contents: readonly Loose[];
  readonly tools?: readonly Loose[];
  readonly videoParts: readonly GeminiVideoPart[];
}

export type GeminiDirectOptions = {
  readonly fetch: typeof fetch;
  readonly endpoint: string;
  readonly request: GeminiRequest;
  readonly tools?: readonly GeminiDirectTool[];
  readonly executeTool?: (tool: GeminiDirectTool, args: unknown, toolCallId: string) => Promise<unknown>;
  readonly maxSteps?: number;
  readonly signal?: AbortSignal;
};

/** `…/desktop/api/proxy/v1beta/models/{model}:streamGenerateContent?alt=sse` on Simeon Labs' server. */
export function claidorGeminiEndpoint(modelId: string, backendUrl?: string): string {
  const base = claidorProxyBaseUrl(backendUrl).replace(/\/+$/, "").replace(/\/v1$/, "/v1beta");
  return `${base}/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse`;
}

function record(value: unknown): Loose | null {
  return typeof value === "object" && value != null && !Array.isArray(value) ? value as Loose : null;
}

function safeJson(value: unknown): string {
  try { return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item) ?? "null"; }
  catch (error) { return JSON.stringify({ isError: true, error: error instanceof Error ? error.message : String(error) }); }
}

const DATA_URI = /^data:([^;,]+)(;[^,]*)?,(.*)$/s;

function toBase64(value: unknown): string | undefined {
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64");
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value)).toString("base64");
  return undefined;
}

// The loop's image part, as the video branch of context-processing writes
// it, into Gemini's part: inline bytes with their mime type, or a file URI.
function mediaPart(part: Loose): { readonly gemini: Loose; readonly video: GeminiVideoPart | undefined } | undefined {
  const cursor = record(record(part.providerOptions)?.cursor) ?? {};
  const fps = typeof cursor.videoFps === "number" && Number.isFinite(cursor.videoFps) ? cursor.videoFps : undefined;
  let mimeType: string | undefined = typeof part.mimeType === "string" ? part.mimeType : typeof cursor.mimeType === "string" ? cursor.mimeType : undefined;
  const image = part.image;
  let gemini: Loose | undefined;
  let bytes: number | undefined;
  let uri: string | undefined;
  const text = typeof image === "string" ? image : image instanceof URL ? image.toString() : undefined;
  const match = text === undefined ? null : DATA_URI.exec(text);
  if (match != null) {
    mimeType = mimeType ?? match[1];
    const data = match[3] ?? "";
    const base64 = (match[2] ?? "").includes("base64") ? data : Buffer.from(decodeURIComponent(data), "utf8").toString("base64");
    bytes = Math.floor(base64.length * 3 / 4);
    gemini = { inlineData: { mimeType: mimeType ?? "application/octet-stream", data: base64 } };
  } else if (text !== undefined) {
    if (mimeType === undefined) return undefined;
    uri = text;
    gemini = { fileData: { mimeType, fileUri: text } };
  } else {
    const base64 = toBase64(image);
    if (base64 === undefined) return undefined;
    bytes = Math.floor(base64.length * 3 / 4);
    gemini = { inlineData: { mimeType: mimeType ?? "application/octet-stream", data: base64 } };
  }
  const isVideo = (mimeType ?? "").startsWith("video/");
  if (isVideo && fps !== undefined) gemini.videoMetadata = { fps };
  const video: GeminiVideoPart | undefined = isVideo
    ? { mimeType: mimeType!, ...(fps === undefined ? {} : { fps }), ...(bytes === undefined ? {} : { bytes }), ...(uri === undefined ? {} : { uri }) }
    : undefined;
  return { gemini, video };
}

// Gemini's Schema is an OpenAPI subset and refuses keys it does not know
// (`$schema`, `additionalProperties`, `default`, …). Keep what it takes.
const SCHEMA_KEYS = new Set(["type", "description", "properties", "required", "items", "enum", "nullable", "format", "anyOf", "minimum", "maximum", "minItems", "maxItems", "title"]);

export function sanitizeGeminiSchema(schema: unknown): Loose | undefined {
  const source = record(schema);
  if (source == null) return undefined;
  const out: Loose = {};
  let type = source.type;
  let nullable = source.nullable === true;
  if (Array.isArray(type)) {
    nullable = nullable || type.includes("null");
    type = type.find((one: unknown) => one !== "null");
  }
  if (typeof type === "string") out.type = type;
  if (nullable) out.nullable = true;
  for (const [key, value] of Object.entries(source)) {
    if (!SCHEMA_KEYS.has(key) || key === "type" || key === "nullable") continue;
    if (key === "properties") {
      const properties = record(value);
      if (properties == null) continue;
      const cleaned: Loose = {};
      for (const [name, child] of Object.entries(properties)) { const sanitized = sanitizeGeminiSchema(child); if (sanitized != null) cleaned[name] = sanitized; }
      if (Object.keys(cleaned).length > 0) out.properties = cleaned;
      continue;
    }
    if (key === "items") { const items = sanitizeGeminiSchema(value); if (items != null) out.items = items; continue; }
    if (key === "anyOf") { if (Array.isArray(value)) { const options = value.map(sanitizeGeminiSchema).filter((one): one is Loose => one != null); if (options.length > 0) out.anyOf = options; } continue; }
    if (key === "required") { if (Array.isArray(value)) { const names = value.filter((one: unknown): one is string => typeof one === "string"); if (names.length > 0) out.required = names; } continue; }
    out[key] = value;
  }
  if (out.type === "object" && out.properties == null) delete out.required;
  if (out.type === undefined && out.anyOf === undefined && out.properties !== undefined) out.type = "object";
  return Object.keys(out).length === 0 ? undefined : out;
}

function functionDeclarations(tools: readonly GeminiDirectTool[] | undefined): Loose[] | undefined {
  if (tools == null || tools.length === 0) return undefined;
  const declarations = tools.map((tool) => {
    const parameters = sanitizeGeminiSchema(tool.parameters);
    const hasProperties = parameters?.properties != null && Object.keys(parameters.properties).length > 0;
    return {
      name: tool.name,
      ...(tool.description == null ? {} : { description: tool.description }),
      ...(hasProperties ? { parameters } : {}),
    };
  });
  return [{ functionDeclarations: declarations }];
}

function pushContent(contents: Loose[], role: "user" | "model", parts: Loose[]): void {
  if (parts.length === 0) return;
  const last = contents.at(-1);
  // Gemini wants the roles to alternate; two of ours in a row (a tool's
  // image following its result, say) fold into one.
  if (last != null && last.role === role) { last.parts.push(...parts); return; }
  contents.push({ role, parts });
}

function partText(parts: readonly Loose[]): string {
  return parts.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text as string).join("\n");
}

/**
 * The host loop's messages, in Gemini's request shape. The loop's own
 * dialect is the AI SDK's with Cursor's metadata under
 * `providerOptions.cursor` (the same input `toCoreMessages` reads for the
 * Responses wire).
 */
export function toGeminiRequest(messages: readonly GeminiLoopMessage[], tools?: readonly GeminiDirectTool[]): GeminiRequest {
  const system: string[] = [];
  const contents: Loose[] = [];
  const videoParts: GeminiVideoPart[] = [];
  const toolNames = new Map<string, string>();
  for (const message of messages) {
    const { role, content } = message;
    if (role === "system") { system.push(typeof content === "string" ? content : partText(content as readonly Loose[])); continue; }
    if (typeof content === "string") {
      if (role === "user") pushContent(contents, "user", [{ text: content }]);
      else if (role === "assistant") pushContent(contents, "model", [{ text: content }]);
      continue;
    }
    const parts = content as readonly Loose[];
    if (role === "user") {
      const out: Loose[] = [];
      for (const part of parts) {
        if (part?.type === "text" && typeof part.text === "string") { out.push({ text: part.text }); continue; }
        if (part?.type === "image" || part?.type === "file") {
          const media = mediaPart(part);
          if (media == null) continue;
          out.push(media.gemini);
          if (media.video != null) videoParts.push(media.video);
        }
      }
      pushContent(contents, "user", out);
      continue;
    }
    if (role === "assistant") {
      const out: Loose[] = [];
      for (const part of parts) {
        if (part?.type === "text" && typeof part.text === "string" && part.text.length > 0) out.push({ text: part.text });
        else if (part?.type === "tool-call" && typeof part.toolName === "string") {
          if (typeof part.toolCallId === "string") toolNames.set(part.toolCallId, part.toolName);
          const args = record(part.args) ?? (typeof part.args === "string" ? (() => { try { return record(JSON.parse(part.args)) ?? {}; } catch { return {}; } })() : {});
          out.push({ functionCall: { name: part.toolName, args } });
        }
      }
      pushContent(contents, "model", out);
      continue;
    }
    if (role !== "tool") continue;
    const out: Loose[] = [];
    for (const part of parts) {
      if (part?.type !== "tool-result") continue;
      const name = typeof part.toolName === "string" ? part.toolName : toolNames.get(part.toolCallId) ?? "tool";
      const rendered: readonly Loose[] = Array.isArray(part.experimental_content) ? part.experimental_content : Array.isArray(part.content) ? part.content : [];
      const images: Loose[] = [];
      for (const item of rendered) if (item?.type === "image" && typeof item.data === "string") { const media = mediaPart({ image: item.data.startsWith("data:") ? item.data : `data:${typeof item.mimeType === "string" ? item.mimeType : "image/png"};base64,${item.data}` }); if (media != null) images.push(media.gemini); }
      const text = typeof part.result === "string" ? part.result : part.result === undefined ? partText(rendered) : undefined;
      const response: Loose = text !== undefined
        ? { [part.isError === true ? "error" : "result"]: text.length > 0 ? text : images.length > 0 ? "(the tool returned an image; it follows)" : "(no output)" }
        : record(part.result) ?? { [part.isError === true ? "error" : "result"]: part.result };
      out.push({ functionResponse: { name, response } });
      out.push(...images);
    }
    pushContent(contents, "user", out);
  }
  const declarations = functionDeclarations(tools);
  const systemText = system.join("\n\n").trim();
  return {
    ...(systemText.length === 0 ? {} : { systemInstruction: { parts: [{ text: systemText }] } }),
    contents,
    ...(declarations == null ? {} : { tools: declarations }),
    videoParts,
  };
}

async function responseError(response: Response): Promise<Error> {
  let detail = "";
  try {
    const text = (await response.text()).slice(0, 4_096).trim();
    const parsed = record((() => { try { return JSON.parse(text); } catch { return null; } })());
    const message = record(parsed?.error)?.message;
    detail = typeof message === "string" && message.length > 0 ? message : text;
  } catch {}
  return new Error(`Gemini request failed (${response.status}${detail.length === 0 ? "" : `: ${detail}`}).`);
}

async function* sseEvents(response: Response): AsyncGenerator<Loose> {
  if (response.body == null) throw new Error("Gemini response did not include a stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    // Google ends its lines with CRLF; one form for the boundary search.
    buffer = (buffer + decoder.decode(value, { stream: !done })).replaceAll("\r\n", "\n");
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
      if (data.length === 0) continue;
      let parsed: unknown;
      try { parsed = JSON.parse(data); }
      catch { throw new Error("Gemini response contained malformed SSE JSON."); }
      const event = record(parsed);
      if (event != null) yield event;
    }
    if (done) break;
  }
  const rest = buffer.trim();
  if (rest.length > 0) {
    // A last event without its blank line: Google closes some streams that way.
    const data = rest.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (data.length > 0) { const event = record((() => { try { return JSON.parse(data); } catch { return null; } })()); if (event != null) yield event; else throw new Error("Gemini response ended with an incomplete SSE event."); }
  }
}

export function usageOf(usageMetadata: unknown): GeminiDirectUsage {
  const usage = record(usageMetadata) ?? {};
  const number = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? value : 0;
  const cached = number(usage.cachedContentTokenCount);
  const thoughts = number(usage.thoughtsTokenCount);
  return {
    inputTokens: Math.max(0, number(usage.promptTokenCount) - cached),
    outputTokens: number(usage.candidatesTokenCount) + thoughts,
    cacheReadTokens: cached,
    cacheWriteTokens: 0,
    reasoningTokens: thoughts,
  };
}

function addUsage(total: GeminiDirectUsage, next: GeminiDirectUsage): GeminiDirectUsage {
  return {
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
    cacheReadTokens: total.cacheReadTokens + next.cacheReadTokens,
    cacheWriteTokens: 0,
    reasoningTokens: total.reasoningTokens + next.reasoningTokens,
  };
}

let callCounter = 0;
function nextToolCallId(): string {
  callCounter += 1;
  return `gemini-call-${Date.now().toString(36)}-${callCounter}`;
}

/**
 * One Gemini turn, or a short tool loop when `executeTool` is supplied
 * (the text helper's path); the host loop runs its own tools and asks for
 * a fresh executor per step, so it gets one request per call.
 */
export async function* streamGeminiGenerateContent(options: GeminiDirectOptions): AsyncGenerator<GeminiDirectEvent> {
  const maxSteps = options.executeTool == null ? 1 : options.maxSteps ?? 8;
  const toolsByName = new Map((options.tools ?? []).map((tool) => [tool.name, tool]));
  let contents: Loose[] = options.request.contents.map((content) => ({ ...content, parts: [...content.parts] }));
  let text = "";
  let responseId = "";
  let usage: GeminiDirectUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 };

  for (let step = 0; step < maxSteps; step += 1) {
    const response = await options.fetch(options.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({
        ...(options.request.systemInstruction == null ? {} : { systemInstruction: options.request.systemInstruction }),
        contents,
        ...(options.request.tools == null ? {} : { tools: options.request.tools }),
      }),
      ...(options.signal == null ? {} : { signal: options.signal }),
    });
    if (!response.ok) throw await responseError(response);

    let lastUsage: unknown;
    let finishReason = "";
    const modelParts: Loose[] = [];
    const calls: { readonly id: string; readonly name: string; readonly args: Loose }[] = [];
    for await (const event of sseEvents(response)) {
      if (typeof event.responseId === "string" && event.responseId.length > 0) responseId = event.responseId;
      if (event.usageMetadata != null) lastUsage = event.usageMetadata;
      const feedback = record(event.promptFeedback);
      if (typeof feedback?.blockReason === "string") throw new Error(`Gemini refused the request: ${feedback.blockReason}.`);
      const candidate = record(Array.isArray(event.candidates) ? event.candidates[0] : null);
      if (candidate == null) { const error = record(event.error); if (error != null) throw new Error(`Gemini request failed: ${safeJson(error).slice(0, 4_096)}`); continue; }
      if (typeof candidate.finishReason === "string") finishReason = candidate.finishReason;
      const parts = record(candidate.content)?.parts;
      if (!Array.isArray(parts)) continue;
      for (const raw of parts) {
        const part = record(raw);
        if (part == null) continue;
        if (typeof part.text === "string") {
          if (part.thought === true) continue;
          if (part.text.length === 0) continue;
          text += part.text;
          modelParts.push({ text: part.text });
          yield { type: "text-delta", delta: part.text };
          continue;
        }
        const call = record(part.functionCall);
        if (call != null && typeof call.name === "string") {
          const args = record(call.args) ?? {};
          const id = nextToolCallId();
          calls.push({ id, name: call.name, args });
          modelParts.push({ functionCall: { name: call.name, args } });
          yield { type: "tool-call", toolCallId: id, toolName: call.name, args };
        }
      }
    }
    usage = addUsage(usage, usageOf(lastUsage));
    if (calls.length === 0 && text.length === 0 && finishReason.length > 0 && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
      throw new Error(`Gemini ended the answer without text (finishReason ${finishReason}).`);
    }
    if (calls.length === 0 || options.executeTool == null) {
      yield { type: "done", text, responseId, usage };
      return;
    }

    const results: Loose[] = [];
    for (const call of calls) {
      const selected = toolsByName.get(call.name);
      if (selected == null) { results.push({ functionResponse: { name: call.name, response: { error: `Unknown Simeon tool: ${call.name}` } } }); continue; }
      try {
        const result = await options.executeTool(selected, call.args, call.id);
        results.push({ functionResponse: { name: call.name, response: record(result) ?? { result: typeof result === "string" ? result : safeJson(result) } } });
      } catch (error) {
        results.push({ functionResponse: { name: call.name, response: { error: error instanceof Error ? error.message : String(error) } } });
      }
    }
    contents = [...contents, { role: "model", parts: modelParts }, { role: "user", parts: results }];
  }
  throw new Error(`Gemini exceeded Simeon's ${maxSteps}-step tool limit.`);
}
