/**
 * An agent's transcript: a conversation written to files beside the
 * conversation itself, in up to three forms. The text form is the
 * conversation as it reads, the JSON form is one document with the
 * conversation's mode, and the lines form holds one JSON line per message,
 * which is the only form that can be added to.
 *
 * The store reads the messages from a blob store and hands the text of each
 * file to the functions it was given: it opens no file and no database
 * itself. A stored message that cannot be read is passed over, and a write
 * that fails is told to the console and answered with false, or with zero.
 *
 * A few names inside are the ones they were before (`options`, `blobStore`,
 * `appendFile`, `state`, `content`, `part`, `visible`, `text`, `span.span`).
 * Where the store is handed something that is not what it asks for, the
 * runtime's own error quotes the code it failed in ("this.options.pathResolver
 * is not a function"), and the console is told that sentence: with the same
 * names it reads the same.
 */
import { AgentMode, ConversationSummaryArchive } from "../proto/generated/agent/v1/agent_pb.js";
import type { Context } from "../context/core.js";
import { createSpan, withSuppressedChildSpans, type DisposableSpan } from "../context/otel.js";
import { stripContextTags } from "./context-stripping.js";
import { getTranscriptRelativePath } from "./paths.js";

/** One part of a message that is made of parts. Which fields it has depends on its type. */
type Part = {
  readonly type: string;
  readonly text?: string;
  readonly filename?: string;
  readonly toolName?: string;
  readonly args?: unknown;
};

/** A message as it is stored: JSON, of which only these fields are read. */
interface StoredMessage {
  readonly role: string;
  readonly content?: string | readonly Part[];
  readonly providerOptions?: { readonly simeon?: { readonly isSummary?: boolean } };
}

/** What the store reads of a conversation's state: its mode, the ids of its own messages, and the ids of its summary archives. */
interface ConversationState {
  readonly mode?: AgentMode;
  readonly rootPromptMessagesJson: readonly Uint8Array[];
  readonly summaryArchives: readonly Uint8Array[];
}

interface BlobSource {
  getBlob(ctx: Context, blobId: Uint8Array): Promise<Uint8Array | undefined>;
}

interface StoreOptions {
  /** The text form. Written unless told not to. */
  readonly writeText?: boolean | undefined;
  readonly writeJson?: boolean | undefined;
  readonly writeJsonl?: boolean | undefined;
  /** Where a conversation's file of one extension goes, instead of the transcript's own place in the project. */
  readonly pathResolver?: ((conversationId: string, ext: string) => string) | undefined;
  /** Adds text to the end of a file. Without it every write is a whole one. */
  readonly appendFile?: ((path: string, content: string) => Promise<void>) | undefined;
  /** Whether a failed adding is followed by a whole write. It is, unless told not to. */
  readonly fallbackToFullWriteOnIncrementalFailure?: boolean | undefined;
}

/** How a turn ended. */
interface TurnEnd {
  readonly status: "success" | "error" | "aborted" | string;
  readonly error?: string;
}

interface WriteOptions {
  /** Makes an overview of the conversation from its text form; it becomes the first of the lines. */
  readonly overviewFactory?: ((formatted: string) => Promise<string>) | undefined;
  readonly turnEnded?: TurnEnd | undefined;
}

/** The options that are always there once the store is made, each with its own default. */
type Defaulted = "writeText" | "writeJson" | "writeJsonl" | "fallbackToFullWriteOnIncrementalFailure";
/** The options as the store keeps them. */
type Settings = Required<Pick<StoreOptions, Defaulted>> & Omit<StoreOptions, Defaulted>;

// ---------------------------------------------------------------------------
// Reading the stored messages
// ---------------------------------------------------------------------------

const decoder = new TextDecoder();
/** How bytes inside a stored message are written: an object with this mark, and the bytes as hex. */
const BYTES_MARK = '"__type":"Uint8Array"';
/** A stored message of more bytes than this is not read: a note of its size stands in its place. */
const LARGEST_MESSAGE_READ = 5_000_000;

/** Bytes are not written to a transcript: where a stored message holds some, a note of how many takes their place. */
function bytesAsNote(_key: string, value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const marked = value as { readonly __type?: unknown; readonly hex?: unknown };
  if (marked.__type !== "Uint8Array" || typeof marked.hex !== "string") return value;
  return `[Binary data omitted from transcript: ${marked.hex.length / 2} bytes]`;
}

/** A stored message read back. Each value is looked at for bytes only when the mark is somewhere in the text. */
function parseStored(blob: Uint8Array): StoredMessage {
  const json = decoder.decode(blob);
  return JSON.parse(json, json.includes(BYTES_MARK) ? bytesAsNote : undefined) as StoredMessage;
}

/** The message that stands in for one too large to read. */
function tooLargeNote(bytes: number): StoredMessage {
  return { role: "assistant", content: `[Oversize transcript blob omitted: ${(bytes / 1e6).toFixed(1)} MB]` };
}

function isSummary(message: StoredMessage): boolean {
  return message.providerOptions?.simeon?.isSummary === true;
}

/** How many blobs, their bytes together, and the bytes of the largest. */
interface Tally {
  count: number;
  bytes: number;
  largest: number;
}

/** What reading a list of stored messages came to: the messages, those read and those too large as tallies, and the time spent parsing. */
interface Reading {
  readonly messages: StoredMessage[];
  readonly read: Tally;
  readonly tooLarge: Tally;
  parseMs: number;
}

function nothingRead(): Reading {
  return { messages: [], read: { count: 0, bytes: 0, largest: 0 }, tooLarge: { count: 0, bytes: 0, largest: 0 }, parseMs: 0 };
}

/** One more blob of `bytes` bytes in a tally. */
function count(tally: Tally, bytes: number): void {
  tally.count += 1;
  tally.bytes += bytes;
  tally.largest = Math.max(tally.largest, bytes);
}

function addTally(sum: Tally, part: Tally): void {
  sum.count += part.count;
  sum.bytes += part.bytes;
  sum.largest = Math.max(sum.largest, part.largest);
}

/** Adds one reading to another: its messages after those there, its numbers into the sums. */
function add(sum: Reading, part: Reading): void {
  sum.messages.push(...part.messages);
  addTally(sum.read, part.read);
  addTally(sum.tooLarge, part.tooLarge);
  sum.parseMs += part.parseMs;
}

/**
 * The stored messages under `blobIds`, asked for one after the other. An id
 * with nothing under it gives nothing, a blob that is not a message gives
 * nothing, and neither is counted. A blob store that fails is not caught
 * here.
 */
async function readMessages(ctx: Context, blobStore: BlobSource, blobIds: readonly Uint8Array[]): Promise<Reading> {
  const reading = nothingRead();
  for (const blobId of blobIds) {
    const blob = await blobStore.getBlob(ctx, blobId);
    if (!blob) continue;
    const bytes = blob.length;
    if (bytes > LARGEST_MESSAGE_READ) {
      reading.messages.push(tooLargeNote(bytes));
      count(reading.tooLarge, bytes);
      continue;
    }
    try {
      const before = performance.now();
      reading.messages.push(parseStored(blob));
      reading.parseMs += performance.now() - before;
      count(reading.read, bytes);
    } catch {
      // Not a message: passed over.
    }
  }
  return reading;
}

/** Says on a span what a reading came to, under the names these numbers had before. */
function tell(span: DisposableSpan, reading: Reading): void {
  span.span.setAttribute("hydratedBlobCount", reading.read.count);
  span.span.setAttribute("hydratedBlobBytes", reading.read.bytes);
  span.span.setAttribute("largestHydratedBlobBytes", reading.read.largest);
  span.span.setAttribute("totalDeserializeDurationMs", reading.parseMs);
  span.span.setAttribute("omittedOversizeBlobCount", reading.tooLarge.count);
  span.span.setAttribute("omittedOversizeBlobBytes", reading.tooLarge.bytes);
  span.span.setAttribute("largestOmittedOversizeBlobBytes", reading.tooLarge.largest);
}

/**
 * All the messages of a conversation: those its summary archives put away,
 * archive by archive, then its own without the system's and the summaries.
 * The messages of an archive are kept whatever they are; the forms leave
 * out what they do not write.
 *
 * The archives are asked for all at once, the conversation's own messages
 * after them. Every blob is asked for with the context of the archives'
 * span, marked so that no span is started under it. Whatever fails on the
 * way, the answer is undefined.
 */
async function readConversation(ctx: Context, blobStore: BlobSource, state: ConversationState): Promise<StoredMessage[] | undefined> {
  try {
    using archivesSpan = createSpan(ctx.withName("hydrateSummaryArchives"));
    const quiet = withSuppressedChildSpans(archivesSpan.ctx);
    let askedFor = 0;
    const archives = await Promise.all(
      state.summaryArchives.map(async (archiveId) => {
        askedFor += 1;
        const blob = await blobStore.getBlob(quiet, archiveId);
        if (blob) {
          try {
            const archive = ConversationSummaryArchive.fromBinary(blob);
            askedFor += archive.summarizedMessages.length;
            // Not waited for inside this try: a blob store that fails on one of these messages fails the whole reading.
            return readMessages(quiet, blobStore, archive.summarizedMessages);
          } catch {
            // Not an archive: left out.
          }
        }
        return nothingRead();
      }),
    );
    const putAway = nothingRead();
    for (const archive of archives) add(putAway, archive);
    archivesSpan.span.setAttribute("getBlobCount", askedFor);
    tell(archivesSpan, putAway);

    using ownSpan = createSpan(ctx.withName("hydratePromptMessages"));
    const own = await readMessages(quiet, blobStore, state.rootPromptMessagesJson);
    ownSpan.span.setAttribute("getBlobCount", state.rootPromptMessagesJson.length);
    tell(ownSpan, own);

    const all = putAway.messages;
    all.push(...own.messages.filter((message) => message.role !== "system" && !isSummary(message)));
    return all;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// The three forms
// ---------------------------------------------------------------------------

/** The messages a form goes through: none of the system's, and of two from the user at the very start only the second. */
function shown(messages: readonly StoredMessage[]): StoredMessage[] {
  const kept = messages.filter((message) => message.role !== "system");
  const startsWithTwoFromTheUser = kept.length >= 2 && kept[0]?.role === "user" && kept[1]?.role === "user";
  return startsWithTwoFromTheUser ? kept.slice(1) : kept;
}

function withoutHiddenThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The words of a message as a transcript keeps them: the user's without the blocks of context, the assistant's without its hidden thinking, anyone else's as they are. */
function wordsToKeep(role: string, words: string): string {
  if (role === "user") return stripContextTags(words);
  if (role === "assistant") return withoutHiddenThinking(words);
  return words;
}

/** What stands for a picture or a file, which are not written themselves. */
function attachmentNote(part: Part): string {
  if (part.type === "image") return "[Image]";
  return part.filename ? `[File: ${part.filename}]` : "[File]";
}

/** A tool call's arguments under its name, one to a line. Arguments that are no list of names and values follow the name as they are. */
function argsAsText(args: unknown): string {
  if (args === null || args === undefined) return "";
  if (typeof args !== "object") return String(args);
  const lines = Object.entries(args).map(([name, value]) => {
    if (typeof value === "string") return `  ${name}: ${value}`;
    return `  ${name}: ${typeof value === "object" && value !== null ? JSON.stringify(value) : String(value)}`;
  });
  return lines.length === 0 ? "" : `\n${lines.join("\n")}`;
}

function partAsText(role: string, part: Part): string {
  switch (part.type) {
    case "text":
      return wordsToKeep(role, part.text as string);
    case "image":
    case "file":
      return attachmentNote(part);
    case "reasoning":
      return `[Thinking] ${part.text}`;
    case "redacted-reasoning":
      return "[Thinking]";
    case "tool-call":
      return `[Tool call] ${part.toolName}${argsAsText(part.args)}`;
    case "tool-result":
      return `[Tool result] ${part.toolName}`;
    default:
      return "";
  }
}

/** A message in the text form: under its role, or alone when a tool said it. Empty when it comes to nothing. */
function messageAsText(message: StoredMessage): string {
  const { role, content } = message;
  let said = "";
  if (typeof content === "string") said = wordsToKeep(role, content);
  else if (content !== undefined) said = content.map((part) => partAsText(role, part)).filter(Boolean).join("\n");
  if (!said.trim()) return "";
  return role === "tool" ? said : `${role}:\n${said}`;
}

/** The text form: the messages that come to something, a blank line between them. */
function conversationAsText(messages: readonly StoredMessage[]): string {
  return shown(messages).map(messageAsText).filter(Boolean).join("\n\n");
}

/** A message as the JSON form holds it. Only what the message has is there. */
interface Outline {
  role: string;
  toolResult?: { toolName?: string };
  text?: string;
  thinking?: string;
  toolCalls?: { toolName?: string; args?: unknown }[];
}

/**
 * A message's outline: its words and notes of what it carried as one text,
 * its reasoning as another, its tool calls by name with their arguments,
 * and the name of the last tool result in it. The tool result comes right
 * after the role.
 */
function outlineOf(message: StoredMessage): Outline {
  const { role, content } = message;
  if (typeof content === "string") {
    const visible = wordsToKeep(role, content);
    return visible.trim() ? { role, text: visible } : { role };
  }
  if (!Array.isArray(content)) return { role };

  const words: string[] = [];
  const reasoning: string[] = [];
  const toolCalls: { toolName?: string; args?: unknown }[] = [];
  let toolResult: { toolName?: string } | undefined;
  for (const part of content as readonly Part[]) {
    switch (part.type) {
      case "text": {
        const visible = wordsToKeep(role, part.text as string);
        if (visible.trim()) words.push(visible);
        break;
      }
      case "reasoning":
        if ((part.text as string).trim()) reasoning.push(part.text as string);
        break;
      case "redacted-reasoning":
        reasoning.push("[REDACTED]");
        break;
      case "image":
      case "file":
        words.push(attachmentNote(part));
        break;
      case "tool-call":
        toolCalls.push({ toolName: part.toolName as string, args: part.args });
        break;
      case "tool-result":
        toolResult = { toolName: part.toolName as string };
        break;
    }
  }
  const outline: Outline = { role };
  if (toolResult !== undefined) outline.toolResult = toolResult;
  if (words.length > 0) outline.text = words.join("\n");
  if (reasoning.length > 0) outline.thinking = reasoning.join("\n");
  if (toolCalls.length > 0) outline.toolCalls = toolCalls;
  return outline;
}

/** The messages of the JSON form: the outlines that hold more than a role. */
function conversationAsOutlines(messages: readonly StoredMessage[]): Outline[] {
  return shown(messages)
    .map(outlineOf)
    .filter((outline) => outline.text || outline.thinking || outline.toolCalls || outline.toolResult);
}

/**
 * A message as one of the lines: its words and its reasoning as one text,
 * then its tool calls. Nothing for the system's messages, for summaries,
 * and for a message that has neither words nor calls; tool results are not
 * among the lines.
 */
function messageAsLine(message: StoredMessage): string | undefined {
  if (message.role === "system" || isSummary(message)) return undefined;
  const outline = outlineOf(message);
  const content: { type: string; text?: string | undefined; name?: string | undefined; input?: unknown }[] = [];
  const said = [outline.text, outline.thinking].filter(Boolean);
  if (said.length > 0) content.push({ type: "text", text: said.join("\n\n") });
  for (const call of outline.toolCalls ?? []) content.push({ type: "tool_use", name: call.toolName, input: call.args });
  if (content.length === 0) return undefined;
  return JSON.stringify({ role: message.role, message: { content } });
}

const isLine = (line: string | undefined): line is string => line !== undefined;

/** The lines form, without the line break that ends it. */
function conversationAsLines(messages: readonly StoredMessage[]): string {
  return shown(messages)
    .map((message) => messageAsLine(message))
    .filter(isLine)
    .join("\n");
}

function endedWithLineBreak(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

/** The names of the modes in the JSON form. A conversation with no mode, or one not listed here, is an agent's. */
const MODE_NAMES = new Map<unknown, string>([
  [AgentMode.AGENT, "agent"],
  [AgentMode.ASK, "ask"],
  [AgentMode.PLAN, "plan"],
  [AgentMode.DEBUG, "debug"],
  [AgentMode.TRIAGE, "triage"],
  [AgentMode.PROJECT, "project"],
  [AgentMode.MULTITASK, "multitask"],
  [AgentMode.CUSTOM, "custom"],
]);

// ---------------------------------------------------------------------------
// How a turn ended
// ---------------------------------------------------------------------------

/**
 * The ending as the text form says it. A status that is none of the three
 * gives the ending itself and not a sentence: it is written as JavaScript
 * turns it into text. Kept as it was.
 */
function endingAsText(turnEnded: TurnEnd): string {
  switch (turnEnded.status) {
    case "success":
      return "Turn ended: success.";
    case "error":
      return `Turn ended: error: ${turnEnded.error}`;
    case "aborted":
      return turnEnded.error ? `Turn ended: aborted: ${turnEnded.error}` : "Turn ended: aborted.";
    default:
      return turnEnded as unknown as string;
  }
}

/** How a turn ended, ready for each form: what follows the text, what is added to the JSON document, and the line. All three are empty when no ending was given. */
interface Ending {
  readonly text: string[];
  readonly fields: Record<string, unknown>;
  readonly lines: string[];
}

function endingOf(options: WriteOptions): Ending {
  const ending: Ending = { text: [], fields: {}, lines: [] };
  const turnEnded = options.turnEnded;
  if (turnEnded === undefined) return ending;
  ending.text.push(endingAsText(turnEnded));
  ending.fields.turnEnded = turnEnded;
  ending.lines.push(JSON.stringify({ type: "turn_ended", ...turnEnded }));
  return ending;
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

export class TranscriptStore {
  private readonly options: Settings;

  constructor(
    private readonly projectDir: string,
    private readonly blobStore: BlobSource,
    private readonly writeFile: (path: string, content: string) => Promise<void>,
    options: StoreOptions = {},
  ) {
    this.options = {
      writeText: options.writeText ?? true,
      writeJson: options.writeJson ?? false,
      writeJsonl: options.writeJsonl ?? false,
      pathResolver: options.pathResolver,
      appendFile: options.appendFile,
      fallbackToFullWriteOnIncrementalFailure: options.fallbackToFullWriteOnIncrementalFailure ?? true,
    };
  }

  /** The file of one extension for a conversation: where the store was told, or the transcript's own place in the project. */
  resolveFilePath(conversationId: string, ext: string): string {
    if (this.options.pathResolver !== undefined) return this.options.pathResolver(conversationId, ext);
    return `${this.projectDir}/${getTranscriptRelativePath({ conversationId, ext, kind: "primary" })}`;
  }

  /**
   * Writes the whole conversation, in each form the store writes, one file
   * after the other: the text, the JSON, the lines. A form with nothing in
   * it is not written, and with no message and no ending no file is
   * touched. Answers whether it went well; a failure is told to the console
   * and leaves the files written before it.
   */
  async writeFromStateFull(ctx: Context, state: ConversationState, conversationId: string, options: WriteOptions = {}): Promise<boolean> {
    try {
      using span = createSpan(ctx.withName("writeFromState"));
      try {
        // A reading that failed gives nothing back, and that is not looked at: asking its length below then throws, and it
        // is this that the console is told, not what the blob store said. Kept as it was.
        const messages = (await readConversation(span.ctx, this.blobStore, state)) as StoredMessage[];
        const ending = endingOf(options);
        if (messages.length === 0 && ending.lines.length === 0) return true;

        // The text form is also what an overview is made from, so it is put together even when it is not written.
        let asText: string | undefined;
        if (this.options.writeText || options.overviewFactory !== undefined) asText = conversationAsText(messages);

        if (this.options.writeText) {
          let text = asText as string;
          if (ending.text.length > 0) text = text.trim().length > 0 ? `${text}\n\n${ending.text.join("\n")}` : ending.text.join("\n");
          if (text.trim()) await this.writeFile(this.resolveFilePath(conversationId, "txt"), text);
        }

        if (this.options.writeJson) {
          const outlines = conversationAsOutlines(messages);
          if (outlines.length > 0 || ending.lines.length > 0) {
            const document = JSON.stringify({ mode: MODE_NAMES.get(state.mode) ?? "agent", messages: outlines, ...ending.fields }, null, 2);
            await this.writeFile(this.resolveFilePath(conversationId, "json"), document);
          }
        }

        if (this.options.writeJsonl) {
          let lines = [conversationAsLines(messages), ...ending.lines].filter((line) => line.length > 0).join("\n");
          if (lines && options.overviewFactory !== undefined && asText?.trim()) {
            try {
              const overview = (await options.overviewFactory(asText)).trim();
              if (overview) lines = `${JSON.stringify({ type: "metadata", metadata: { overview } })}\n${lines}`;
            } catch (error) {
              console.error("[TranscriptStore] Failed to generate transcript overview:", error);
            }
          }
          if (lines) await this.writeFile(this.resolveFilePath(conversationId, "jsonl"), endedWithLineBreak(lines));
        }
        return true;
      } catch (error) {
        console.error("[TranscriptStore] Failed to write transcript:", error);
        return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Writes what came since `previousRootPromptCount` of the conversation's
   * own messages had been written, and answers how many are written now
   * (zero when it did not go well).
   *
   * The new messages are added to the lines when the store writes the lines
   * and nothing else, has a function to add with, something was written
   * before and nothing was taken away since, and no overview is asked for.
   * Otherwise the whole is written again. When there is nothing new and no
   * ending to write, nothing is done at all.
   */
  async writeFromStateIncremental(ctx: Context, state: ConversationState, conversationId: string, previousRootPromptCount: number, options: WriteOptions = {}): Promise<number> {
    const currentCount = state.rootPromptMessagesJson.length;
    const ending = endingOf(options);
    const hasEnding = ending.lines.length > 0;
    const nothingNew = currentCount === previousRootPromptCount;
    if (nothingNew && !hasEnding && options.overviewFactory === undefined) return currentCount;

    const appendFile = this.options.appendFile;
    const onlyLines = this.options.writeJsonl && !this.options.writeText && !this.options.writeJson;
    const somethingToAdd = previousRootPromptCount > 0 && currentCount >= previousRootPromptCount && (currentCount > previousRootPromptCount || hasEnding);
    if (appendFile === undefined || !onlyLines || !somethingToAdd || options.overviewFactory !== undefined) {
      return (await this.writeFromStateFull(ctx, state, conversationId, options)) ? currentCount : 0;
    }

    /** What is done when adding failed: the console is told, and the whole is written instead unless the store was told not to. */
    const afterFailing = async (error: unknown): Promise<number> => {
      const writeWhole = this.options.fallbackToFullWriteOnIncrementalFailure;
      console.error(writeWhole ? "[TranscriptStore] Failed to append transcript, falling back to full write:" : "[TranscriptStore] Failed to append transcript:", error);
      if (!writeWhole) return 0;
      return (await this.writeFromStateFull(ctx, state, conversationId, options)) ? currentCount : 0;
    };

    try {
      using span = createSpan(ctx.withName("writeFromStateIncremental"));
      try {
        const lines: string[] = [];
        if (!nothingNew) {
          const added = await readMessages(span.ctx, this.blobStore, state.rootPromptMessagesJson.slice(previousRootPromptCount));
          tell(span, added);
          for (const message of added.messages) {
            const line = messageAsLine(message);
            if (line !== undefined) lines.push(line);
          }
        }
        lines.push(...ending.lines);
        if (lines.length > 0) await appendFile(this.resolveFilePath(conversationId, "jsonl"), endedWithLineBreak(lines.join("\n")));
        return currentCount;
      } catch (error) {
        return await afterFailing(error);
      }
    } catch {
      return 0;
    }
  }
}
