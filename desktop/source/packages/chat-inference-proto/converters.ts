/**
 * The engine's shape of a prompt, turned into the wire's shape: a message of
 * each kind, a tool, and the whole request the server is sent. The other
 * way, a tool call's arguments read back from the wire, and an error that
 * came down a stream turned into one of the engine's errors.
 *
 * The wire's messages are generated code and a contract with the server.
 * Nothing here decides a name or a number on the wire: it only fills the
 * messages in. Fields the wire has no place for are left out.
 */
import { Struct, Value, type JsonValue } from "@bufbuild/protobuf";
import {
  InferenceAgentTool,
  InferenceAnthropicOptions,
  InferenceCacheControl,
  InferenceContentPart,
  InferenceCoreMessage,
  InferenceContentParts,
  InferenceCustomToolFormat,
  InferenceImagePart,
  InferenceMessageRole,
  InferenceModelConfig,
  InferenceModelParameterValue,
  InferenceNamedProviderDefinedTool,
  InferenceProviderOptions,
  type InferenceReason,
  InferenceReasoningPart,
  InferenceRequestedModel,
  InferenceSimeonOptions,
  type InferenceStreamError,
  InferenceStreamErrorType,
  InferenceStreamRequest,
  InferenceTextPart,
  InferenceToolCall,
  InferenceToolResultContent,
  InferenceToolResultPart,
} from "../proto/generated/simeon/v1/inference_pb.js";
import { classifyTokenLimitErrorFromMessage } from "../chat-inference/token-limit-error-classification.js";
import { InputTokenLimitError, OutputTokensLimitExceededError } from "../chat-inference/prompt-executor.js";
import { getSimeonModelName } from "./modelProviderOptions.js";

/** The engine's messages, parts and tools come from many places; this file reads their fields as they are. */
type Loose = Record<string, any>;

// ---------------------------------------------------------------------------
// A tool call's arguments
// ---------------------------------------------------------------------------

/** Whether a value is a record of fields: an object that is neither null nor a list. */
function isRecord(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Puts a tool call's arguments on the call. The wire has two places for
 * them: fields, for arguments that are a record, and a text, for anything
 * else (words stay as they are, other values are written as JSON).
 *
 * `explicitRawToolCallArgs` is the arguments' own text, when the caller has
 * it. Beside a record it is kept as the call's text too, whatever it is,
 * unless it is undefined; in place of anything else it is the text that
 * goes, unless it is null or undefined. Arguments that are neither a record
 * nor something JSON can write (undefined, a function, a symbol) are
 * refused.
 */
export function applyToolCallArgs(toolCall: InferenceToolCall, args: unknown, explicitRawToolCallArgs?: string): void {
  if (isRecord(args)) {
    toolCall.args = Struct.fromJson(args as JsonValue);
    if (explicitRawToolCallArgs !== undefined) {
      toolCall.rawToolCallArgs = explicitRawToolCallArgs;
    }
    return;
  }

  const written = typeof args === "string" ? args : JSON.stringify(args);
  if (written === undefined) {
    throw new Error(`cannot represent tool call arguments of type ${typeof args} as a JSON object or raw text`);
  }
  toolCall.rawToolCallArgs = explicitRawToolCallArgs ?? written;
}

/** A tool call's arguments as they came off the wire: its fields when it has them, else its text, else no fields at all. */
export function toolCallArgsFromProto(toolCall: InferenceToolCall): unknown {
  const fields = toolCall.args?.toJson();
  if (fields !== undefined && fields !== null) return fields;
  return toolCall.rawToolCallArgs ?? {};
}

// ---------------------------------------------------------------------------
// A part's options
// ---------------------------------------------------------------------------

/**
 * The descriptions of pictures a part carries, as the wire holds them: one
 * for the part itself, and one for each picture inside a tool's result,
 * kept under the picture's place in the result. A description counts when
 * it is a text that is not empty; a place counts when its name reads as a
 * whole number from zero up. Nothing comes back when nothing counts.
 */
function descriptionsToProto(given: unknown): InferenceSimeonOptions | undefined {
  if (!given || typeof given !== "object") return undefined;
  const { imageDescription: ofThePart, imageDescriptions: byPlace } = given as Loose;

  const proto = new InferenceSimeonOptions();
  let filled = false;
  if (typeof ofThePart === "string" && ofThePart.length > 0) {
    proto.imageDescription = ofThePart;
    filled = true;
  }
  if (byPlace !== null && typeof byPlace === "object") {
    for (const [name, description] of Object.entries(byPlace as Loose)) {
      if (typeof description !== "string" || description.length === 0) continue;
      const place = Number(name);
      if (!Number.isInteger(place) || place < 0) continue;
      proto.imageDescriptions[place] = description;
      filled = true;
    }
  }
  return filled ? proto : undefined;
}

/**
 * What the wire carries of a part's options: the cache control kept under
 * `anthropic`, of which only the kind travels, and the descriptions of
 * pictures. The descriptions are read under the name the wire itself gives
 * their field (`cursor`), not under the name the engine's own options go by
 * (`simeon`). Nothing comes back when the part has neither.
 */
function partOptionsToProto(given: unknown): InferenceProviderOptions | undefined {
  if (!given || typeof given !== "object") return undefined;
  const options = given as Loose;
  const cache = options.anthropic?.cacheControl;
  const descriptions = descriptionsToProto(options.cursor);
  if (!cache && descriptions === undefined) return undefined;

  const proto = new InferenceProviderOptions();
  if (cache) {
    proto.anthropic = new InferenceAnthropicOptions({ cacheControl: new InferenceCacheControl({ type: cache.type }) });
  }
  if (descriptions !== undefined) {
    proto.cursor = descriptions;
  }
  return proto;
}

/** The same part of the wire with its options on it, when the part given has any the wire carries. */
function withOptions<Part extends InferenceTextPart | InferenceImagePart>(proto: Part, given: unknown): Part {
  const options = partOptionsToProto(given);
  if (options !== undefined) proto.providerOptions = options;
  return proto;
}

// ---------------------------------------------------------------------------
// Words, pictures and files
// ---------------------------------------------------------------------------

/** The kind a picture given as bytes is said to be when its own kind is missing, empty or no text. */
const KIND_WHEN_NOT_SAID = "image/png";

/** Bytes of a picture as an address that holds them. The kind is written as given, spaces and all. */
function asDataAddress(bytes: Uint8Array, kind: unknown): string {
  const said = typeof kind === "string" && kind.trim() !== "";
  return `data:${said ? kind : KIND_WHEN_NOT_SAID};base64,${Buffer.from(bytes).toString("base64")}`;
}

/**
 * A picture as the one text the wire holds for it: a text goes as it is, an
 * address as its text, bytes as an address that holds them. Anything else
 * becomes an empty text.
 */
function pictureAsText(picture: unknown, kind: unknown): string {
  if (typeof picture === "string") return picture;
  if (picture instanceof URL) return picture.toString();
  if (picture instanceof Uint8Array) return asDataAddress(picture, kind);
  if (picture instanceof ArrayBuffer) return asDataAddress(new Uint8Array(picture), kind);
  return "";
}

/** A piece of content of the wire that holds words. */
function wordsPart(words: InferenceTextPart): InferenceContentPart {
  const proto = new InferenceContentPart();
  proto.part = { case: "text", value: words };
  return proto;
}

/** A piece of content of the wire that holds a picture. */
function picturePart(picture: InferenceImagePart): InferenceContentPart {
  const proto = new InferenceContentPart();
  proto.part = { case: "image", value: picture };
  return proto;
}

/**
 * One part of a person's message. A file does not travel: the model is told
 * its name in words. A part of a kind not known here becomes empty words.
 */
function personPartToProto(part: Loose): InferenceContentPart {
  switch (part.type) {
    case "text":
      return wordsPart(withOptions(new InferenceTextPart({ text: part.text }), part.providerOptions));
    case "image": {
      const picture = new InferenceImagePart({ data: pictureAsText(part.image, part.mimeType), mimeType: part.mimeType });
      return picturePart(withOptions(picture, part.providerOptions));
    }
    case "file":
      return wordsPart(new InferenceTextPart({ text: `[File: ${part.name ?? "unnamed"}]` }));
    default:
      return wordsPart(new InferenceTextPart({ text: "" }));
  }
}

/** What stands beside a tool's result: pictures as pictures, everything else as the words it holds. */
function besideResultToProto(content: readonly Loose[]): InferenceContentPart[] {
  return content.map((item) => {
    if (item.type === "image") {
      return picturePart(new InferenceImagePart({ data: item.data, mimeType: item.mimeType }));
    }
    return wordsPart(new InferenceTextPart({ text: item.text }));
  });
}

// ---------------------------------------------------------------------------
// A message
// ---------------------------------------------------------------------------

/** The four kinds of message the wire has a name for. Any other kind goes as "not said". */
const KIND_ON_THE_WIRE = new Map<unknown, InferenceMessageRole>([
  ["user", InferenceMessageRole.USER],
  ["assistant", InferenceMessageRole.ASSISTANT],
  ["tool", InferenceMessageRole.TOOL],
  ["system", InferenceMessageRole.SYSTEM],
]);

/** A person's message: its words as they are, or its parts one by one. Any other content is left out. */
function fillFromPerson(proto: InferenceCoreMessage, content: unknown): void {
  if (typeof content === "string") {
    proto.content = { case: "text", value: content };
  } else if (Array.isArray(content)) {
    proto.content = { case: "parts", value: new InferenceContentParts({ parts: content.map((part) => personPartToProto(part)) }) };
  }
}

/** A tool call of an assistant's message, with the text of its arguments when the part keeps one in its options. */
function toolCallToProto(part: Loose): InferenceToolCall {
  const call = new InferenceToolCall({ toolCallId: part.toolCallId, toolName: part.toolName });
  const asWritten = part.providerOptions?.simeon?.rawToolCallArgs;
  applyToolCallArgs(call, part.args, typeof asWritten === "string" ? asWritten : undefined);
  return call;
}

/** A piece of reasoning, shown or hidden, with the name of the model that wrote it when the piece carries one. */
function reasoningToProto(part: Loose, hidden: boolean): InferenceReasoningPart {
  const proto = hidden
    ? new InferenceReasoningPart({ isRedacted: true, redactedData: part.data })
    : new InferenceReasoningPart({ isRedacted: false, text: part.text, signature: part.signature });
  const modelName = getSimeonModelName(part);
  if (modelName !== undefined) proto.modelName = modelName;
  return proto;
}

/**
 * An assistant's message. What the provider knows the message by (its id,
 * its phase) is read from the message's own options. The wire holds an
 * assistant's words as one text, so the pieces of words are joined; tool
 * calls and reasoning go in lists of their own, each in the order it came.
 * Parts of any other kind are left out.
 */
function fillFromAssistant(proto: InferenceCoreMessage, message: Loose): void {
  const ours = message.providerOptions?.simeon;
  const id = ours?.modelProviderMessageId;
  if (typeof id === "string") proto.modelProviderMessageId = id;
  // A phase said to be null is not the same as no phase, and the wire's text cannot say null: a mark of its own does.
  const phase = ours?.openaiPhase;
  if (typeof phase === "string") proto.openaiPhase = phase;
  else if (phase === null) proto.openaiPhaseNull = true;

  const content = message.content;
  if (typeof content === "string") {
    proto.content = { case: "text", value: content };
    return;
  }
  if (!Array.isArray(content)) return;

  const words: string[] = [];
  for (const part of content as Loose[]) {
    switch (part.type) {
      case "text":
        words.push(part.text);
        break;
      case "tool-call":
        proto.toolCalls.push(toolCallToProto(part));
        break;
      case "reasoning":
        proto.reasoningParts.push(reasoningToProto(part, false));
        break;
      case "redacted-reasoning":
        proto.reasoningParts.push(reasoningToProto(part, true));
        break;
    }
  }
  // One piece of words is enough for the message to have a text, even an empty one.
  if (words.length > 0) proto.content = { case: "text", value: words.join("") };
}

/**
 * One result of a tool. A result that is words goes as it is; any other
 * goes through JSON first, which drops what JSON does not write. The field
 * for options is set on every result, to nothing when there are none.
 */
function toolResultToProto(part: Loose): InferenceToolResultPart {
  const proto = new InferenceToolResultPart({ toolCallId: part.toolCallId, toolName: part.toolName });
  if (part.result !== undefined) {
    const result = typeof part.result === "string" ? part.result : (JSON.parse(JSON.stringify(part.result)) as JsonValue);
    proto.result = Value.fromJson(result);
  }
  if (part.isError) proto.isError = true;
  if (part.experimental_content?.length > 0) {
    proto.experimentalContent = besideResultToProto(part.experimental_content);
  }
  proto.providerOptions = partOptionsToProto(part.providerOptions) as InferenceProviderOptions;
  return proto;
}

/** A tool's message: its results, in order. Parts that are no result are passed over before any result is read. */
function fillFromTool(proto: InferenceCoreMessage, content: unknown): void {
  if (!Array.isArray(content)) return;
  const results = (content as Loose[]).filter((part) => part.type === "tool-result");
  const parts = results.map((part) => toolResultToProto(part));
  proto.content = { case: "toolContent", value: new InferenceToolResultContent({ parts }) };
}

/**
 * A message of the engine as a message of the wire. Each kind is filled in
 * its own way; a message of a kind the wire has no name for goes with no
 * content at all.
 */
export function coreMessageToProto(message: Loose): InferenceCoreMessage {
  const kind = message.role;
  const proto = new InferenceCoreMessage({ role: KIND_ON_THE_WIRE.get(kind) ?? InferenceMessageRole.UNSPECIFIED });
  switch (kind) {
    case "user":
      fillFromPerson(proto, message.content);
      break;
    case "assistant":
      fillFromAssistant(proto, message);
      break;
    case "tool":
      fillFromTool(proto, message.content);
      break;
    case "system":
      // The first words of a conversation go as they are, whatever they are.
      proto.content = { case: "text", value: message.content };
      break;
  }
  return proto;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/** A tool the agent offers: its name, what it is for, the shape of its parameters, and a format of its own if it has one. */
function agentToolToProto(tool: Loose): InferenceAgentTool {
  const proto = new InferenceAgentTool({
    name: tool.name,
    description: tool.description,
    parameters: Struct.fromJsonString(JSON.stringify(tool.parameters)),
  });
  if (tool.customToolFormat) {
    proto.customToolFormat = new InferenceCustomToolFormat(tool.customToolFormat);
  }
  return proto;
}

/** A tool the provider itself defines: the engine only names it and hands on its options. */
function providerToolToProto(tool: Loose): InferenceNamedProviderDefinedTool {
  const options = tool.options ? Struct.fromJson(tool.options as JsonValue) : undefined;
  const proto = new InferenceNamedProviderDefinedTool({ name: tool.name, id: tool.id, type: tool.type });
  if (options !== undefined) proto.options = options;
  return proto;
}

// ---------------------------------------------------------------------------
// An error that came down a stream
// ---------------------------------------------------------------------------

/**
 * The engine's error for an error of the wire. The wire says "too much went
 * in" and "too much came out" by the error's kind, or by an older mark of
 * its own; too much in is looked for first. An error that says neither is
 * sorted by its sentence, and is a plain error when the sentence says
 * neither as well.
 */
export function protoStreamErrorToError(error: InferenceStreamError): Error {
  const tooMuchIn = error.errorType === InferenceStreamErrorType.INPUT_TOKEN_LIMIT || error.isInputTokenLimitError;
  if (tooMuchIn) return new InputTokenLimitError(error.message);
  const tooMuchOut = error.errorType === InferenceStreamErrorType.OUTPUT_TOKEN_LIMIT || error.isOutputTokenLimitError;
  if (tooMuchOut) return new OutputTokensLimitExceededError(error.message);
  return classifyTokenLimitErrorFromMessage(error.message) ?? new Error(error.message);
}

// ---------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------

export interface StreamRequestOptions {
  messages: readonly Loose[];
  requestedModel: Loose;
  tools?: readonly Loose[];
  providerDefinedTools?: readonly Loose[];
  modelConfig?: Loose | undefined;
  invocationId?: string | undefined;
  conversationId?: string | undefined;
  automationId?: string | undefined;
  inferenceReason?: InferenceReason | undefined;
  acceptedUnadvertisedToolNames?: readonly string[] | undefined;
}

/** One parameter of the model that is asked for, as the pair of an id and a value the wire holds. */
function parameterToProto(parameter: Loose): InferenceModelParameterValue {
  return new InferenceModelParameterValue({ id: parameter.id, value: parameter.value });
}

/** The ids a request may carry. Each goes only when it is there and not empty. */
const IDS = ["invocationId", "conversationId", "automationId"] as const;

/**
 * The whole request: the messages, the tools of both kinds, the names of
 * tools taken though not offered, and the model that is asked for (its id,
 * its marks and its parameters). The ids, the reason and the model's
 * settings are added only when they are given; a reason that says "none"
 * and an empty id count as not given.
 */
export function buildStreamRequest(options: StreamRequestOptions): InferenceStreamRequest {
  const messages = options.messages.map((message) => coreMessageToProto(message));
  const tools = (options.tools ?? []).map((tool) => agentToolToProto(tool));
  const providerDefinedTools = (options.providerDefinedTools ?? []).map((tool) => providerToolToProto(tool));
  const acceptedUnadvertisedToolNames = [...(options.acceptedUnadvertisedToolNames ?? [])];
  const requestedModel = new InferenceRequestedModel({
    modelId: options.requestedModel.modelId,
    maxMode: options.requestedModel.maxMode,
    parameters: options.requestedModel.parameters.map((parameter: Loose) => parameterToProto(parameter)),
    builtInModel: options.requestedModel.builtInModel,
    isVariantStringRepresentation: options.requestedModel.isVariantStringRepresentation,
  });
  const request = new InferenceStreamRequest({ messages, tools, providerDefinedTools, acceptedUnadvertisedToolNames, requestedModel });

  for (const name of IDS) {
    const id = options[name];
    if (id) request[name] = id;
  }
  if (options.inferenceReason) {
    request.inferenceReason = options.inferenceReason;
  }
  const settings = options.modelConfig;
  if (settings) {
    request.modelConfig = new InferenceModelConfig({
      maxTokens: settings.maxTokens,
      temperature: settings.temperature,
      topP: settings.topP,
      stopSequences: settings.stopSequences ?? [],
    });
  }
  return request;
}
