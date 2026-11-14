/**
 * Asking the server for an answer over a connection. An executor holds the
 * messages of a prompt; its `stream` sends them as one request and hands
 * back the answer as it comes: a stream of parts to read, and five promises
 * for what is known only once the answer is whole (the counts of tokens,
 * what the provider adds, the id of the call, and the answer's messages).
 *
 * The connection is given from outside. It takes a request of the wire and
 * answers with the wire's pieces, one after the other; nothing here knows
 * how they travel.
 */
import { createKey, type Context } from "../context/core.js";
import { getSpanContextData } from "../context/otel.js";
import { BasePromptBuilder, BasePromptExecutor, type PromptExecutor } from "../chat-inference/base.js";
import { classifyTokenLimitErrorFromMessage } from "../chat-inference/token-limit-error-classification.js";
import {
  InferenceMessageRole,
  type InferenceExtraData,
  type InferenceImageDescriptionsInfo,
  type InferenceReason,
  type InferenceReasoningPart,
  type InferenceResponseInfo,
  type InferenceResponseMessage,
  type InferenceStreamResponse,
  type InferenceTextStreamPart,
  type InferenceThinkingStreamPart,
  type InferenceToolCallStreamPart,
  type InferenceToolResultPart,
} from "../proto/generated/simeon/v1/inference_pb.js";
import { buildStreamRequest, protoStreamErrorToError, toolCallArgsFromProto } from "./converters.js";
import { providerOptionsFromModelName } from "./modelProviderOptions.js";

/** The engine's messages, parts and tools come from many places; this file reads their fields as they are. */
type Loose = Record<string, any>;
type PromptMessage = Loose;
type Middleware = (executor: PromptExecutor<Loose>) => PromptExecutor<Loose>;

/**
 * What a caller may put on the context for a request: its id, the
 * conversation and the automation it belongs to, and a model to ask in
 * place of the executor's own. Each key is this file's own: a value set
 * under a key of the same name made elsewhere is not read here.
 */
export const requestIdKey = createKey<string | undefined>(Symbol("requestId"), undefined);
export const conversationIdKey = createKey<string | undefined>(Symbol("conversationId"), undefined);
export const automationIdKey = createKey<string | undefined>(Symbol("automationId"), undefined);
export const requestedModelKey = createKey<Loose | undefined>(Symbol("requestedModel"), undefined);

/** The connection, as far as this file uses it. */
interface InferenceClient {
  stream(request: unknown, options: { signal: AbortSignal; headers: Record<string, string> }): AsyncIterable<InferenceStreamResponse>;
}

// ---------------------------------------------------------------------------
// Descriptions of pictures
// ---------------------------------------------------------------------------

/**
 * The picture of a person's message a description points at, with the
 * description on it, or nothing when the description is not for such a
 * picture.
 */
function describedPicture(content: readonly Loose[], entry: Loose): Loose | undefined {
  if (entry.expContentIndex !== undefined) return undefined;
  const part = content[entry.partIndex];
  if (part === undefined || part.type !== "image") return undefined;
  return {
    ...part,
    providerOptions: {
      ...part.providerOptions,
      simeon: { ...part.providerOptions?.simeon, imageDescription: entry.description },
    },
  };
}

/**
 * The tool's result a description points at, with the description of one of
 * the pictures beside it kept under that picture's place among them, or
 * nothing when the description is not for a picture of a result.
 */
function describedResult(content: readonly Loose[], entry: Loose): Loose | undefined {
  const place = entry.expContentIndex;
  if (place === undefined) return undefined;
  const part = content[entry.partIndex];
  if (part === undefined || part.type !== "tool-result") return undefined;
  if (!Array.isArray(part.experimental_content) || part.experimental_content[place]?.type !== "image") return undefined;
  const ours = part.providerOptions?.simeon;
  return {
    ...part,
    providerOptions: {
      ...part.providerOptions,
      simeon: { ...ours, imageDescriptions: { ...ours?.imageDescriptions, [place]: entry.description } },
    },
  };
}

/**
 * Writes descriptions of pictures on a message, under our own provider's
 * name in each part's options. A description without a place inside a
 * result is for a picture of a person's message; one with such a place is
 * for a picture beside a tool's result. The message given is not touched:
 * what comes back is a copy with a new list and new parts where something
 * was written, or nothing when no description found its picture. Messages
 * of any other kind, and messages whose content is no list, get nothing.
 */
export function stampImageDescriptionsOnMessage(
  message: PromptMessage,
  entries: readonly Loose[],
): PromptMessage | undefined {
  if (!Array.isArray(message.content)) return undefined;
  const described = message.role === "user" ? describedPicture : message.role === "tool" ? describedResult : undefined;
  if (described === undefined) return undefined;

  const content = [...message.content];
  let written = false;
  for (const entry of entries) {
    // The part is read from the copy, so that a second description of the same part builds on the first.
    const part = described(content, entry);
    if (part === undefined) continue;
    content[entry.partIndex] = part;
    written = true;
  }
  return written ? { ...message, content } : undefined;
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

/** The messages of a prompt, with a way to put one message in the place of another. */
export class ProtoPromptBuilder extends BasePromptBuilder<PromptMessage> {
  /** Replaces a message the builder holds, found by being the very same object. Says whether it was found. */
  replaceMessage(previous: PromptMessage, next: PromptMessage): boolean {
    const at = this.messages.indexOf(previous);
    if (at < 0) return false;
    this.messages[at] = next;
    return true;
  }
}

// ---------------------------------------------------------------------------
// What a piece of the answer becomes
// ---------------------------------------------------------------------------

/** A piece of words: the last one ends the answer, whatever it holds; an empty one gives nothing. */
function partsOfWords(piece: InferenceTextStreamPart): Loose[] {
  if (piece.isFinal) {
    return [{ type: "finish", finishReason: "stop", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }];
  }
  return piece.text ? [{ type: "text-delta", textDelta: piece.text }] : [];
}

/** A piece of thinking: its words, then its signature, each only when there is one. */
function partsOfThinking(piece: InferenceThinkingStreamPart): Loose[] {
  const parts: Loose[] = [];
  if (piece.text) parts.push({ type: "reasoning", textDelta: piece.text });
  if (piece.signature) parts.push({ type: "reasoning-signature", signature: piece.signature });
  return parts;
}

/** The arguments of a whole tool call, read from their text. A text that is not JSON gives no arguments. */
function argumentsRead(written: string): unknown {
  try {
    return JSON.parse(written);
  } catch {
    return {};
  }
}

/**
 * A piece of a tool call. A whole call comes with its arguments read. A
 * piece that names the tool is the start of a call; one that does not is
 * more of the arguments' text.
 */
function partsOfToolCall(piece: InferenceToolCallStreamPart): Loose[] {
  if (piece.isComplete) {
    return [{ type: "tool-call", toolCallId: piece.toolCallId, toolName: piece.toolName, args: argumentsRead(piece.args) }];
  }
  if (piece.toolName) {
    return [{ type: "tool-call-streaming-start", toolCallId: piece.toolCallId, toolName: piece.toolName }];
  }
  return [{ type: "tool-call-delta", toolCallId: piece.toolCallId, toolName: "", argsTextDelta: piece.args }];
}

/** A piece of reasoning of the answer, with the model's name in its options when the wire names it. */
function reasoningOfAnswer(reasoning: InferenceReasoningPart): Loose {
  const namedModel = providerOptionsFromModelName(reasoning.modelName);
  if (reasoning.isRedacted) {
    return { type: "redacted-reasoning", data: reasoning.redactedData ?? "", ...namedModel };
  }
  const part: Loose = { type: "reasoning", text: reasoning.text, ...namedModel };
  if (reasoning.signature !== undefined) part.signature = reasoning.signature;
  return part;
}

/** One result of a tool's message of the answer. Only a result that failed says so. */
function resultOfAnswer(part: InferenceToolResultPart): Loose {
  return {
    type: "tool-result",
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    result: part.result?.toJson(),
    isError: part.isError || undefined,
  };
}

/**
 * A message of the answer in the engine's shape. A tool's message holds its
 * results. Every other message is handed on as the assistant's: its
 * reasoning first, then its words, then its tool calls.
 */
function messageOfAnswer(message: InferenceResponseMessage): Loose {
  if (message.role === InferenceMessageRole.TOOL) {
    return { id: message.id, role: "tool", content: message.toolResult?.parts.map((part) => resultOfAnswer(part)) ?? [] };
  }
  const content: Loose[] = [];
  for (const reasoning of message.reasoningParts) {
    content.push(reasoningOfAnswer(reasoning));
  }
  if (message.content) content.push({ type: "text", text: message.content });
  for (const call of message.toolCalls) {
    content.push({ type: "tool-call", toolCallId: call.toolCallId, toolName: call.toolName, args: toolCallArgsFromProto(call) });
  }
  return { id: message.id, role: "assistant", content };
}

/** A list of lists, each inner list changed by `each`; nothing at all when the outer list is empty. */
function listsOrNothing<Row extends { values: unknown[] }, Out>(rows: readonly Row[], each: (values: Row["values"]) => Out): Out[] | undefined {
  if (rows.length === 0) return undefined;
  return rows.map((row) => each(row.values));
}

/**
 * The numbers that come with an answer for each of its tokens. The lists of
 * chances are handed on as the wire holds them, the very lists; the ids are
 * turned into plain numbers; an empty text in the routing rows means null.
 */
function extraDataOfAnswer(data: InferenceExtraData): Loose {
  const asTheyAre = (values: number[]): number[] => values;
  const asNumbers = (values: bigint[]): number[] => values.map((id) => Number(id));
  return {
    tokenLogprobs: listsOrNothing(data.tokenLogprobs, asTheyAre),
    tokenIds: listsOrNothing(data.tokenIds, asNumbers),
    promptTokenIds: listsOrNothing(data.promptTokenIds, asNumbers),
    extraTokens: listsOrNothing(data.extraTokens, asNumbers),
    extraLogprobs: listsOrNothing(data.extraLogprobs, asTheyAre),
    routingMatrix: listsOrNothing(data.routingMatrix, (values) => values.map((value) => (value === "" ? null : value))),
  };
}

/** What is known of the answer once it is whole. An error said in words is sorted by its sentence. */
function answerOf(info: InferenceResponseInfo): Loose {
  return {
    id: info.id,
    modelId: info.model,
    timestamp: new Date(Number(info.createdAt)),
    messages: info.messages.map((message) => messageOfAnswer(message)),
    error: info.errorMessage ? (classifyTokenLimitErrorFromMessage(info.errorMessage) ?? new Error(info.errorMessage)) : undefined,
    inferenceExtraData: info.inferenceExtraData ? extraDataOfAnswer(info.inferenceExtraData) : undefined,
  };
}

// ---------------------------------------------------------------------------
// The promises of a stream
// ---------------------------------------------------------------------------

/**
 * A promise ended from outside. The first value it is given is the one it
 * keeps. When the stream is over, `finish` ends it if nothing did: with the
 * stream's failure, or with the value that stands for "nothing came".
 */
class Later<Value> {
  readonly promise: Promise<Value>;
  private keep!: (value: Value) => void;
  private fail!: (reason: unknown) => void;
  private given = false;

  constructor() {
    this.promise = new Promise<Value>((keep, fail) => {
      this.keep = keep;
      this.fail = fail;
    });
  }

  give(value: Value): void {
    this.keep(value);
    this.given = true;
  }

  finish(failure: Error | undefined, whenNothingCame: () => Value): void {
    if (this.given) return;
    if (failure) this.fail(failure);
    else this.keep(whenNothingCame());
  }
}

/** The five promises of one stream. */
interface Ends {
  usage: Later<Loose>;
  extendedUsage: Later<Loose>;
  providerMetadata: Later<unknown>;
  invocationId: Later<string>;
  response: Later<Loose>;
}

// ---------------------------------------------------------------------------
// The executor
// ---------------------------------------------------------------------------

/**
 * The headers a request goes with: the request's id when the context names
 * one, and the context's span when it has one, written the way the
 * `traceparent` header is (a version, the trace's id, the span's id, the
 * flags as two letters) and sent under two names. A span that cannot be
 * written down is left out; the request goes all the same.
 */
function headersFor(context: Context): Record<string, string> {
  const headers: Record<string, string> = {};
  const requestId = context.get(requestIdKey);
  if (requestId) headers["x-request-id"] = requestId;
  try {
    const span = getSpanContextData(context);
    if (span !== undefined) {
      const flags = span.traceFlags.toString(16).padStart(2, "0");
      const traceparent = `00-${span.traceId}-${span.spanId}-${flags}`;
      headers.traceparent = traceparent;
      headers["backend-traceparent"] = traceparent;
    }
  } catch {
    // Nothing of the span is sent.
  }
  return headers;
}

export class ProtoPromptExecutor extends BasePromptExecutor<PromptMessage> {
  private readonly client: InferenceClient;
  private readonly requestedModel: Loose;
  private readonly modelConfig: Loose | undefined;
  private readonly inferenceReason: InferenceReason | undefined;
  /** The same builder as the one the base class keeps, known here as one that can replace a message. */
  private readonly protoBuilder: ProtoPromptBuilder;

  constructor(builder: ProtoPromptBuilder, client: InferenceClient, requestedModel: Loose, modelConfig?: Loose, inferenceReason?: InferenceReason) {
    super(builder);
    this.client = client;
    this.requestedModel = requestedModel;
    this.modelConfig = modelConfig;
    this.inferenceReason = inferenceReason;
    this.protoBuilder = builder;
  }

  /**
   * Sends the messages held now as one request and hands back the answer.
   * The request leaves at once. Nothing is read from the connection, and
   * no promise ends, until the stream of parts is read; a reader that stops
   * before the end leaves the promises that were still waiting as they are.
   */
  stream(
    context: Context,
    invocationId?: string,
    tools?: readonly Loose[],
    options?: Loose,
  ): {
    fullStream: AsyncIterable<Loose>;
    usage: Promise<Loose>;
    extendedUsage: Promise<Loose>;
    providerMetadata: Promise<unknown>;
    invocationId: Promise<string>;
    response: Promise<Loose>;
  } {
    // The provider's own tools travel in a list apart from the agent's.
    const ofTheAgent: Loose[] = [];
    const ofTheProvider: Loose[] = [];
    for (const tool of tools ?? []) {
      const defined = "type" in tool && tool.type === "provider-defined";
      (defined ? ofTheProvider : ofTheAgent).push(tool);
    }
    // The most tokens a call names goes in place of the one in the executor's settings.
    const settings = options?.maxTokens === undefined ? this.modelConfig : { ...this.modelConfig, maxTokens: options.maxTokens };
    const model = context.get(requestedModelKey) ?? this.requestedModel;
    const sent = this.builder.getMessages();
    const request = buildStreamRequest({
      messages: sent,
      requestedModel: model,
      tools: ofTheAgent,
      providerDefinedTools: ofTheProvider,
      modelConfig: settings,
      invocationId,
      conversationId: context.get(conversationIdKey),
      automationId: context.get(automationIdKey),
      inferenceReason: this.inferenceReason,
      acceptedUnadvertisedToolNames: options!.acceptedUnadvertisedToolNames,
    });
    const headers = headersFor(context);
    const pieces = this.client.stream(request, { signal: context.signal, headers });

    const ends: Ends = {
      usage: new Later(),
      extendedUsage: new Later(),
      providerMetadata: new Later(),
      invocationId: new Later(),
      response: new Later(),
    };
    return {
      fullStream: this.read(pieces, ends, sent),
      usage: ends.usage.promise,
      extendedUsage: ends.extendedUsage.promise,
      providerMetadata: ends.providerMetadata.promise,
      invocationId: ends.invocationId.promise,
      response: ends.response.promise,
    };
  }

  /**
   * Reads the connection's pieces one by one. A piece gives the reader its
   * parts, or gives one of the promises its value, or writes descriptions
   * of pictures into the builder's messages.
   *
   * An error piece does not stop the reading: the reader gets it as a part
   * and the pieces after it are read as well. Once the pieces are over,
   * every promise that got no value ends, with the failure if there was one
   * (the last error piece, or what the connection or the reader threw), and
   * the failure is thrown to the reader.
   */
  private async *read(pieces: AsyncIterable<InferenceStreamResponse>, ends: Ends, sent: readonly PromptMessage[]): AsyncGenerator<Loose> {
    let failure: Error | undefined;
    try {
      for await (const piece of pieces) {
        const said = piece.response;
        let parts: Loose[] = [];
        switch (said.case) {
          case "textPart":
            parts = partsOfWords(said.value);
            break;
          case "thinkingPart":
            parts = partsOfThinking(said.value);
            break;
          case "toolCallPart":
            parts = partsOfToolCall(said.value);
            break;
          case "error":
            // Two errors are made of the one piece: the reader's part holds one, the stream ends with the other.
            parts = [{ type: "error", error: protoStreamErrorToError(said.value) }];
            failure = protoStreamErrorToError(said.value);
            break;
          case "usage":
            ends.usage.give({
              promptTokens: said.value.promptTokens,
              completionTokens: said.value.completionTokens,
              totalTokens: said.value.totalTokens ?? 0,
            });
            break;
          case "extendedUsage":
            ends.extendedUsage.give({
              inputTokens: said.value.inputTokens,
              outputTokens: said.value.outputTokens,
              cacheReadTokens: said.value.cacheReadTokens,
              cacheWriteTokens: said.value.cacheWriteTokens,
              maxTokens: said.value.maxTokens,
            });
            break;
          case "providerMetadata":
            ends.providerMetadata.give(said.value.metadata?.toJson());
            break;
          case "invocationId":
            ends.invocationId.give(said.value.invocationId);
            break;
          case "responseInfo":
            ends.response.give(answerOf(said.value));
            break;
          case "imageDescriptions":
            this.writeDescriptions(sent, said.value);
            break;
        }
        for (const part of parts) yield part;
      }
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }

    ends.usage.finish(failure, () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }));
    ends.extendedUsage.finish(failure, () => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, maxTokens: 0 }));
    ends.providerMetadata.finish(failure, () => undefined);
    ends.invocationId.finish(failure, () => globalThis.crypto.randomUUID());
    ends.response.finish(failure, () => ({ id: "", modelId: "", timestamp: new Date(), messages: [] }));
    if (failure) throw failure;
  }

  /**
   * Writes descriptions of pictures that came down the stream into the
   * builder's messages, which carry them from then on. A description names
   * its message by its place among the messages that were sent; an empty
   * description is passed over. A message is replaced only while the
   * builder still holds the very one that was sent, so of two pieces of
   * descriptions for one message in one stream only the first is written.
   */
  private writeDescriptions(sent: readonly PromptMessage[], info: InferenceImageDescriptionsInfo): void {
    const byMessage = new Map<number, Loose[]>();
    for (const entry of info.descriptions) {
      if (entry.description.length === 0) continue;
      const ofTheMessage = byMessage.get(entry.messageIndex);
      if (ofTheMessage === undefined) byMessage.set(entry.messageIndex, [entry]);
      else ofTheMessage.push(entry);
    }
    for (const [place, entries] of byMessage) {
      const before = sent[place];
      if (before === undefined) continue;
      const after = stampImageDescriptionsOnMessage(before, entries);
      if (after !== undefined) this.protoBuilder.replaceMessage(before, after);
    }
  }
}

// ---------------------------------------------------------------------------
// The session and its provider
// ---------------------------------------------------------------------------

/** Makes executors that all ask the same model over the same connection, each with messages of its own. */
export class ProtoPromptSession {
  private readonly client: InferenceClient;
  private readonly requestedModel: Loose;
  private readonly middleware: Middleware | undefined;
  private readonly modelConfig: Loose | undefined;
  private readonly inferenceReason: InferenceReason | undefined;

  constructor(client: InferenceClient, requestedModel: Loose, middleware?: Middleware, modelConfig?: Loose, inferenceReason?: InferenceReason) {
    this.client = client;
    this.requestedModel = requestedModel;
    this.middleware = middleware;
    this.modelConfig = modelConfig;
    this.inferenceReason = inferenceReason;
  }

  /** An executor that starts with the messages given. The session's wrapper, when it has one, is put around it. */
  getExecutor(state?: PromptMessage | readonly PromptMessage[]): PromptExecutor<Loose> {
    const executor = new ProtoPromptExecutor(new ProtoPromptBuilder(state), this.client, this.requestedModel, this.modelConfig, this.inferenceReason);
    if (!this.middleware) return executor;
    return this.middleware(executor);
  }

  getModelId(): string {
    return this.requestedModel.modelId;
  }
}

/** Makes sessions over one connection, for one model. */
export class ProtoSessionProvider {
  private readonly client: InferenceClient;
  private readonly requestedModel: Loose;
  private readonly modelConfig: Loose | undefined;
  private readonly inferenceReason: InferenceReason | undefined;

  constructor(client: InferenceClient, requestedModel: Loose, modelConfig?: Loose, inferenceReason?: InferenceReason) {
    this.client = client;
    this.requestedModel = requestedModel;
    this.modelConfig = modelConfig;
    this.inferenceReason = inferenceReason;
  }

  getSession(middleware?: Middleware): ProtoPromptSession {
    return new ProtoPromptSession(this.client, this.requestedModel, middleware, this.modelConfig, this.inferenceReason);
  }

  getProviderName(): string {
    return "proto";
  }

  getModelId(): string {
    return this.requestedModel.modelId;
  }

  getThinkingDetails(): undefined {
    return undefined;
  }
}

export function createProtoSessionProvider(
  client: InferenceClient,
  requestedModel: Loose,
  modelConfig?: Loose,
  inferenceReason?: InferenceReason,
): ProtoSessionProvider {
  return new ProtoSessionProvider(client, requestedModel, modelConfig, inferenceReason);
}
