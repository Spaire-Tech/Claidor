/**
 * A conversation's messages wrapped for privacy, and unwrapped again.
 *
 * Wrapping puts every text a message carries (its words, a tool call's
 * arguments, a tool's result) into a redacted string held as code, under the
 * mode or context given. Images and files are held as they are, with the
 * context, and hide themselves when written out under enforcement. Unwrapping
 * asks each redacted string for its value for one purpose and gives back a
 * plain message.
 *
 * What is wrapped is remembered: the same message, or the same list of
 * parts, asked again under the same mode and enforcement choice comes back as
 * the very object made the first time.
 */
import { DataClassification, type PrivacyCapability } from "./classification.js";
import { createRedactedString } from "./factory.js";
import { toPrivacyContext, type PrivacyContext } from "./privacy-context.js";
import { PrivacyMode } from "./privacy-mode.js";
import { getRedactionAwareDisplayValue } from "./shouldRedact.js";
import { isRedactedString, RedactedString, type RedactedUnwrapOptions } from "./types.js";

type ProviderOptions = unknown;
type LooseObject = Record<string, unknown>;

/** A message as the model library has it: a role, and text or a list of parts. */
export interface CoreMessageLike extends LooseObject {
  readonly role: string;
  readonly content: unknown;
  readonly providerOptions?: ProviderOptions;
  readonly id?: unknown;
}

interface ContentPart extends LooseObject {
  readonly type: string;
}

/** A wrapped message. It carries the mode it was wrapped under. */
interface RedactedCoreMessageLike extends LooseObject {
  readonly _privacyMode: PrivacyMode;
  readonly role: string;
  readonly content: unknown;
  readonly providerOptions?: ProviderOptions;
  readonly id?: unknown;
}

/** One item of the extra content a tool's result may carry beside the result itself. */
interface ExperimentalContentItem extends LooseObject {
  readonly type: string;
}

// The wrapped parts. Each is an object of its own class, with its fields in a
// fixed order: they are what a wrapped message shows when it is written out.

class RedactedTextPart {
  readonly text: RedactedString;
  readonly providerOptions: ProviderOptions;
  readonly type: "text";

  constructor(text: RedactedString, providerOptions: ProviderOptions) {
    this.text = text;
    this.providerOptions = providerOptions;
    this.type = "text";
  }

  toString(): string {
    return String(this.text);
  }
}

/** The context an image or a file is held with. With none given, the mode is not known. */
function contextFor(modeOrContext: PrivacyMode | PrivacyContext): PrivacyContext {
  return modeOrContext ? toPrivacyContext(modeOrContext) : { privacyMode: PrivacyMode.UNSPECIFIED };
}

/**
 * What an image or a file shows when it is written out: its payload as text,
 * or its placeholder when redaction is enforced under a mode that hides code.
 */
function shownAttachment(fieldName: "image" | "file", payload: string, context: PrivacyContext): string {
  return getRedactionAwareDisplayValue({
    privacyMode: context.privacyMode,
    classification: DataClassification.CODE,
    fieldName,
    unredactedValue: payload,
    enforceRedaction: context.enforceRedaction,
  });
}

class RedactedImagePart {
  readonly image: unknown;
  readonly mimeType: unknown;
  readonly providerOptions: ProviderOptions;
  readonly type: "image";
  readonly __privacyContext: PrivacyContext;

  constructor(
    image: unknown,
    mimeType: unknown,
    providerOptions: ProviderOptions,
    modeOrContext: PrivacyMode | PrivacyContext,
  ) {
    this.image = image;
    this.mimeType = mimeType;
    this.providerOptions = providerOptions;
    this.type = "image";
    this.__privacyContext = contextFor(modeOrContext);
  }

  toString(): string {
    const payload = typeof this.image === "string" ? this.image : (this.image as { toString(): string }).toString();
    return shownAttachment("image", payload, this.__privacyContext);
  }

  toJSON(): string {
    return this.toString();
  }
}

class RedactedFilePart {
  readonly data: unknown;
  readonly mimeType: unknown;
  readonly providerOptions: ProviderOptions;
  readonly type: "file";
  readonly __privacyContext: PrivacyContext;

  constructor(
    data: unknown,
    mimeType: unknown,
    providerOptions: ProviderOptions,
    modeOrContext: PrivacyMode | PrivacyContext,
  ) {
    this.data = data;
    this.mimeType = mimeType;
    this.providerOptions = providerOptions;
    this.type = "file";
    this.__privacyContext = contextFor(modeOrContext);
  }

  toString(): string {
    const payload = typeof this.data === "string" ? this.data : (this.data as { toString(): string }).toString();
    return shownAttachment("file", payload, this.__privacyContext);
  }

  toJSON(): string {
    return this.toString();
  }
}

class RedactedToolCallPart {
  readonly type: "tool-call";
  readonly toolCallId: unknown;
  readonly toolName: unknown;
  /** The arguments, as JSON. */
  readonly args: RedactedString;
  readonly providerOptions: ProviderOptions;

  constructor(call: { toolCallId: unknown; toolName: unknown; args: RedactedString; providerOptions: ProviderOptions }) {
    this.type = "tool-call";
    this.toolCallId = call.toolCallId;
    this.toolName = call.toolName;
    this.args = call.args;
    this.providerOptions = call.providerOptions;
  }

  toString(): string {
    return String(this.args);
  }
}

/** Any part of an assistant's message that is neither text nor a tool call, kept whole. */
class RedactedUnknownPart {
  /** The kind the part said it was. */
  readonly originalType: string;
  /** The whole part, as JSON. */
  readonly data: RedactedString;
  readonly type: "unknown";

  constructor(originalType: string, data: RedactedString) {
    this.originalType = originalType;
    this.data = data;
    this.type = "unknown";
  }

  toString(): string {
    return String(this.data);
  }
}

class RedactedToolResultPart {
  readonly type: "tool-result";
  readonly toolCallId: unknown;
  readonly toolName: unknown;
  /** The result: as it was when it was text, as JSON otherwise. */
  readonly result: RedactedString;
  readonly isError: unknown;
  readonly providerOptions: ProviderOptions;
  readonly experimental_content: readonly ExperimentalContentItem[] | undefined;

  constructor(outcome: {
    toolCallId: unknown;
    toolName: unknown;
    result: RedactedString;
    isError: unknown;
    providerOptions: ProviderOptions;
    experimental_content: readonly ExperimentalContentItem[] | undefined;
  }) {
    this.type = "tool-result";
    this.toolCallId = outcome.toolCallId;
    this.toolName = outcome.toolName;
    this.result = outcome.result;
    this.isError = outcome.isError;
    this.providerOptions = outcome.providerOptions;
    this.experimental_content = outcome.experimental_content;
  }

  toString(): string {
    return String(this.result);
  }
}

// What has been wrapped already.

/**
 * The wrappings made under one mode and one enforcement choice: whole
 * messages, and the lists of parts of each role.
 */
interface Remembered {
  readonly messages: WeakMap<object, RedactedCoreMessageLike>;
  readonly userParts: WeakMap<object, readonly unknown[]>;
  readonly assistantParts: WeakMap<object, readonly unknown[]>;
  readonly toolParts: WeakMap<object, readonly unknown[]>;
}

/**
 * Filed under the mode and the enforcement choice, written as text. "gate"
 * stands for a context that makes no choice.
 */
const rememberedByContext = new Map<string, Remembered>();

function rememberedFor(context: PrivacyContext): Remembered {
  const filedUnder = `${context.privacyMode}:${context.enforceRedaction ?? "gate"}`;
  let remembered = rememberedByContext.get(filedUnder);
  if (remembered === undefined) {
    remembered = {
      messages: new WeakMap(),
      userParts: new WeakMap(),
      assistantParts: new WeakMap(),
      toolParts: new WeakMap(),
    };
    rememberedByContext.set(filedUnder, remembered);
  }
  return remembered;
}

/**
 * A list of parts wrapped once. The list is known by being the very same
 * list, not by what it holds: one that changed after it was wrapped still
 * gives its first wrapping.
 */
function wrappedOnce<Part>(
  known: WeakMap<object, readonly Part[]>,
  content: readonly ContentPart[],
  wrapPart: (part: ContentPart) => Part,
): readonly Part[] {
  const before = known.get(content);
  if (before !== undefined) return before;
  const wrapped = content.map((part) => wrapPart(part));
  known.set(content, wrapped);
  return wrapped;
}

// Small helpers.

/** Everything a conversation carries is held as code. */
function asCode(value: string, fieldName: string, context: PrivacyContext): RedactedString {
  return createRedactedString(value, DataClassification.CODE, fieldName, context);
}

/**
 * The fields that have a value, in the order given. One that is undefined is
 * not carried along at all.
 */
function present(fields: LooseObject): LooseObject {
  const kept: LooseObject = {};
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined) kept[name] = value;
  }
  return kept;
}

/** Text read back as the JSON it was written as, or left as text when it is not JSON. */
function readBack(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Wrapping.

export function toRedactedCoreMessage(
  message: CoreMessageLike,
  modeOrContext: PrivacyMode | PrivacyContext,
): RedactedCoreMessageLike {
  const context = toPrivacyContext(modeOrContext);
  const remembered = rememberedFor(context);
  const before = remembered.messages.get(message);
  if (before !== undefined) return before;
  const wrapped = wrapMessage(message, context, remembered);
  remembered.messages.set(message, wrapped);
  return wrapped;
}

export function toRedactedCoreMessages(
  messages: readonly CoreMessageLike[],
  modeOrContext: PrivacyMode | PrivacyContext,
): RedactedCoreMessageLike[] {
  return messages.map((message) => toRedactedCoreMessage(message, modeOrContext));
}

function wrapMessage(
  message: CoreMessageLike,
  context: PrivacyContext,
  remembered: Remembered,
): RedactedCoreMessageLike {
  switch (message.role) {
    case "user":
      return wrapUserMessage(message, context, remembered);
    case "assistant":
      return wrapAssistantMessage(message, context, remembered);
    case "tool":
      return wrapToolMessage(message, context, remembered);
    case "system":
      return wrapSystemMessage(message, context);
    default:
      throw new Error(`Unhandled CoreMessage role: ${message.role}`);
  }
}

/** A user's message keeps its options, set or not, and does not keep its id. */
function wrapUserMessage(
  message: CoreMessageLike,
  context: PrivacyContext,
  remembered: Remembered,
): RedactedCoreMessageLike {
  const content = typeof message.content === "string"
    ? asCode(message.content, "user_content", context)
    : wrappedOnce(
      remembered.userParts,
      message.content as readonly ContentPart[],
      (part) => wrapUserPart(part, context),
    );
  return { _privacyMode: context.privacyMode, role: "user", content, providerOptions: message.providerOptions };
}

function wrapUserPart(part: ContentPart, context: PrivacyContext): unknown {
  switch (part.type) {
    case "text":
      return new RedactedTextPart(asCode(part.text as string, "user_text", context), part.providerOptions);
    case "image":
      return new RedactedImagePart(part.image, part.mimeType, part.providerOptions, context);
    case "file":
      return new RedactedFilePart(part.data, part.mimeType, part.providerOptions, context);
    default:
      throw new Error(`Unhandled user content part type: ${part.type}`);
  }
}

/** An assistant's message keeps its id and its options, each only when it has one. */
function wrapAssistantMessage(
  message: CoreMessageLike,
  context: PrivacyContext,
  remembered: Remembered,
): RedactedCoreMessageLike {
  const content = typeof message.content === "string"
    ? asCode(message.content, "assistant_content", context)
    : wrappedOnce(
      remembered.assistantParts,
      message.content as readonly ContentPart[],
      (part) => wrapAssistantPart(part, context),
    );
  return {
    _privacyMode: context.privacyMode,
    role: "assistant",
    content,
    ...present({ id: message.id, providerOptions: message.providerOptions }),
  };
}

/**
 * Text and tool calls are wrapped field by field. A part of any other kind
 * is kept whole, as JSON, under its own kind's name.
 */
function wrapAssistantPart(part: ContentPart, context: PrivacyContext): unknown {
  switch (part.type) {
    case "text":
      return new RedactedTextPart(asCode(part.text as string, "assistant_text", context), part.providerOptions);
    case "tool-call":
      return new RedactedToolCallPart({
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        args: asCode(JSON.stringify(part.args) as string, "tool_call_args", context),
        providerOptions: part.providerOptions,
      });
    default:
      return new RedactedUnknownPart(part.type, asCode(JSON.stringify(part) as string, `assistant_${part.type}`, context));
  }
}

/**
 * A tool's message is a list of results, whatever each part calls itself. It
 * keeps its id and its options like an assistant's.
 */
function wrapToolMessage(
  message: CoreMessageLike,
  context: PrivacyContext,
  remembered: Remembered,
): RedactedCoreMessageLike {
  const content = wrappedOnce(
    remembered.toolParts,
    message.content as readonly ContentPart[],
    (part) => wrapToolResult(part, context),
  );
  return {
    _privacyMode: context.privacyMode,
    role: "tool",
    content,
    ...present({ id: message.id, providerOptions: message.providerOptions }),
  };
}

function wrapToolResult(part: ContentPart, context: PrivacyContext): RedactedToolResultPart {
  const result = typeof part.result === "string" ? part.result : (JSON.stringify(part.result) as string);
  const experimentalContent = part.experimental_content as readonly ExperimentalContentItem[] | undefined;
  return new RedactedToolResultPart({
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    result: asCode(result, "tool_result", context),
    isError: part.isError,
    providerOptions: part.providerOptions,
    experimental_content: experimentalContent?.map((item) => wrapExtraItem(item, context)),
  });
}

/**
 * Of the extra content, only a text item whose text is text is wrapped, and
 * it keeps nothing else. Any other item stays the object it is, pictures
 * included.
 */
function wrapExtraItem(item: ExperimentalContentItem, context: PrivacyContext): ExperimentalContentItem {
  if (item.type === "text" && typeof item.text === "string") {
    return { type: "text", text: asCode(item.text, "experimental_content_text", context) };
  }
  return item;
}

/** A system message is one text. It keeps its options, set or not, and does not keep its id. */
function wrapSystemMessage(message: CoreMessageLike, context: PrivacyContext): RedactedCoreMessageLike {
  return {
    _privacyMode: context.privacyMode,
    role: "system",
    content: asCode(message.content as string, "system_content", context),
    providerOptions: message.providerOptions,
  };
}

// Unwrapping. The fields of a message are unwrapped in their order, so the
// first one the purpose does not allow is the one that refuses.

export function fromRedactedCoreMessage(
  message: RedactedCoreMessageLike,
  purpose: PrivacyCapability,
  options?: RedactedUnwrapOptions,
): CoreMessageLike {
  switch (message.role) {
    case "user":
      return unwrapUserMessage(message, purpose, options);
    case "assistant":
      return unwrapAssistantMessage(message, purpose, options);
    case "tool":
      return unwrapToolMessage(message, purpose, options);
    case "system":
      return unwrapSystemMessage(message, purpose, options);
    default:
      throw new Error(`Unhandled RedactedCoreMessage role: ${message.role}`);
  }
}

export function fromRedactedCoreMessages(
  messages: readonly RedactedCoreMessageLike[],
  purpose: PrivacyCapability,
  options?: RedactedUnwrapOptions,
): CoreMessageLike[] {
  return messages.map((message) => fromRedactedCoreMessage(message, purpose, options));
}

function unwrapUserMessage(
  message: RedactedCoreMessageLike,
  purpose: PrivacyCapability,
  options?: RedactedUnwrapOptions,
): CoreMessageLike {
  const content = isRedactedString(message.content)
    ? message.content.unwrap(purpose, options)
    : (message.content as readonly ContentPart[]).map((part) => unwrapUserPart(part, purpose, options));
  return { role: "user", content, providerOptions: message.providerOptions };
}

/** An image or a file is passed on as it is held, whatever the purpose. */
function unwrapUserPart(part: ContentPart, purpose: PrivacyCapability, options?: RedactedUnwrapOptions): LooseObject {
  switch (part.type) {
    case "text":
      return {
        type: "text",
        text: (part.text as RedactedString).unwrap(purpose, options),
        providerOptions: part.providerOptions,
      };
    case "image":
      return { type: "image", image: part.image, mimeType: part.mimeType, providerOptions: part.providerOptions };
    case "file":
      return { type: "file", data: part.data, mimeType: part.mimeType, providerOptions: part.providerOptions };
    default:
      throw new Error(`Unhandled redacted user content part type: ${part.type}`);
  }
}

function unwrapAssistantMessage(
  message: RedactedCoreMessageLike,
  purpose: PrivacyCapability,
  options?: RedactedUnwrapOptions,
): CoreMessageLike {
  const content = isRedactedString(message.content)
    ? message.content.unwrap(purpose, options)
    : (message.content as readonly ContentPart[]).map((part) => unwrapAssistantPart(part, purpose, options));
  return { role: "assistant", content, ...present({ id: message.id, providerOptions: message.providerOptions }) };
}

/**
 * A tool call's arguments and a part kept whole are read back from their
 * JSON. When the text is not JSON (a placeholder, for one), the text itself
 * stands where the arguments or the part would.
 */
function unwrapAssistantPart(part: ContentPart, purpose: PrivacyCapability, options?: RedactedUnwrapOptions): unknown {
  switch (part.type) {
    case "text":
      return {
        type: "text",
        text: (part.text as RedactedString).unwrap(purpose, options),
        ...present({ providerOptions: part.providerOptions }),
      };
    case "tool-call":
      return {
        type: "tool-call",
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        args: readBack((part.args as RedactedString).unwrap(purpose, options)),
        ...present({ providerOptions: part.providerOptions }),
      };
    case "unknown":
      return readBack((part.data as RedactedString).unwrap(purpose, options));
    default:
      throw new Error(`Unhandled redacted assistant content part type: ${part.type}`);
  }
}

function unwrapToolMessage(
  message: RedactedCoreMessageLike,
  purpose: PrivacyCapability,
  options?: RedactedUnwrapOptions,
): CoreMessageLike {
  const content = (message.content as readonly ContentPart[]).map((part) => unwrapToolResult(part, purpose, options));
  return { role: "tool", content, ...present({ id: message.id, providerOptions: message.providerOptions }) };
}

/**
 * A result is read back as JSON whenever its text reads as JSON, so a result
 * that was the text "123" comes back as the number. The error flag, the
 * options and the extra content are there only when they have a value.
 */
function unwrapToolResult(part: ContentPart, purpose: PrivacyCapability, options?: RedactedUnwrapOptions): LooseObject {
  const result = readBack((part.result as RedactedString).unwrap(purpose, options));
  const experimentalContent = part.experimental_content as readonly ExperimentalContentItem[] | undefined;
  const extra = experimentalContent?.map((item) => {
    if (item.type === "text" && isRedactedString(item.text)) {
      return { type: "text", text: item.text.unwrap(purpose, options) };
    }
    return item;
  });
  return {
    type: "tool-result",
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    result,
    ...present({ isError: part.isError, providerOptions: part.providerOptions, experimental_content: extra }),
  };
}

function unwrapSystemMessage(
  message: RedactedCoreMessageLike,
  purpose: PrivacyCapability,
  options?: RedactedUnwrapOptions,
): CoreMessageLike {
  return {
    role: "system",
    content: (message.content as RedactedString).unwrap(purpose, options),
    providerOptions: message.providerOptions,
  };
}
