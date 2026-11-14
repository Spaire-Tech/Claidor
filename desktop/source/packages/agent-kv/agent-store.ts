/**
 * What is kept of one agent: its metadata (who it is, what mode it is in,
 * where its conversation's root is) and its conversation, stored as a tree
 * of blobs. The root blob is the conversation's structure: the keys of its
 * turns, todos and summary. Each turn names the blobs of its messages in
 * turn. A conversation is read by walking that tree, and a blob that is no
 * longer there is passed over.
 */
import { z } from "zod";
import {
  AgentConversationTurn,
  ConversationState,
  ConversationStateStructure,
  ConversationStep,
  ConversationSummary,
  ConversationTurn,
  ConversationTurnStructure,
  ShellCommand,
  ShellConversationTurn,
  ShellOutput,
  UserMessage,
  type ConversationState as ConversationStateMessage,
  type ConversationStateStructure as ConversationStateStructureMessage,
  type ConversationStep as ConversationStepMessage,
  type ConversationTurn as ConversationTurnMessage,
  type ShellCommand as ShellCommandMessage,
  type ShellOutput as ShellOutputMessage,
  type SubagentPersistedState as SubagentPersistedStateMessage,
  type UserMessage as UserMessageMessage,
} from "../proto/generated/agent/v1/agent_pb.js";
import { TodoItem, type TodoItem as TodoItemMessage } from "../proto/generated/agent/v1/todo_tool_pb.js";
import { Disposable } from "../utils/disposable.js";
import type { BlobStore } from "./blob-store.js";
import { getBlobId } from "./blob-store.js";
import { ProtoSerde, fromHex, toHex, utf8Serde } from "./serde.js";
import { resolveSubagentPersistedStates } from "./subagent-states.js";

// ── Metadata ──

export const AgentModes = ["default", "plan", "debug", "search"] as const;
export const ApprovalModeSettings = ["allowlist", "unrestricted", "auto-review"] as const;
export type AgentMode = (typeof AgentModes)[number];
export type ApprovalModeSetting = (typeof ApprovalModeSettings)[number];

/** What a subagent knows of where it came from. */
export interface AgentSubagentInfo {
  parentAgentId: string;
  rootParentAgentId: string;
  toolCallId: string;
  typeName: string;
}

export interface AgentMetadata {
  agentId: string;
  /** The key of the conversation's root blob; no bytes until a checkpoint was stored. */
  latestRootBlobId: Uint8Array;
  name: string;
  mode: AgentMode;
  isRunEverything: boolean;
  approvalMode?: ApprovalModeSetting | undefined;
  createdAt: number;
  lastUsedModel?: string | undefined;
  lastDebugServerPort?: number | undefined;
  currentPlanUri?: string | undefined;
  subagentInfo?: AgentSubagentInfo | undefined;
  blobEncryptionKey?: string | undefined;
}

export type AgentMetadataKey = keyof AgentMetadata;

export interface AgentMetadataStore {
  subscribe(key: AgentMetadataKey, callback: () => void): () => void;
  set<Key extends AgentMetadataKey>(key: Key, value: AgentMetadata[Key]): unknown;
  get<Key extends AgentMetadataKey>(key: Key): AgentMetadata[Key];
}

/** A key for an agent's blobs is this many random bytes, kept as hex. */
const BLOB_KEY_BYTES = 32;
/** Such a key as it is stored: small hex digits, two for each byte, and nothing else. */
const STORED_BLOB_KEY = /^[0-9a-f]{64}$/;

export function generateBlobEncryptionKeyHex(): string {
  const key = new Uint8Array(BLOB_KEY_BYTES);
  crypto.getRandomValues(key);
  return toHex(key);
}

export function isValidBlobEncryptionKeyHex(value: unknown): value is string {
  return typeof value === "string" && STORED_BLOB_KEY.test(value);
}

/** The schema, made the first time it is asked for. */
let metadataSchema: z.ZodType<AgentMetadata> | null = null;

/**
 * What metadata must look like. The fields are checked, and come out, in
 * the order written here; a field the schema does not know is dropped.
 */
export function getAgentMetadataSchema(): z.ZodType<AgentMetadata> {
  if (metadataSchema === null) {
    const named = z.string().min(1);
    metadataSchema = z.object({
      agentId: z.string(),
      latestRootBlobId: z.custom<Uint8Array>((value) => value instanceof Uint8Array, { message: "Expected Uint8Array" }),
      name: z.string(),
      createdAt: z.number(),
      mode: z.enum(AgentModes),
      isRunEverything: z.boolean(),
      approvalMode: z.enum(ApprovalModeSettings).optional(),
      lastUsedModel: z.string().optional(),
      lastDebugServerPort: z.number().int().positive().optional(),
      currentPlanUri: z.string().optional(),
      subagentInfo: z.union([
        z.object({ parentAgentId: named, rootParentAgentId: named, toolCallId: named, typeName: named }),
        z.undefined(),
      ]),
      blobEncryptionKey: z.string().optional(),
    });
  }
  return metadataSchema;
}

/** The metadata of an agent made now: a random id unless one is given, and a new key for its blobs. */
export function getDefaultAgentMetadata(agentId?: string | null): AgentMetadata {
  return {
    agentId: agentId ?? crypto.randomUUID(),
    latestRootBlobId: new Uint8Array(),
    name: "New Agent",
    mode: "default",
    isRunEverything: false,
    approvalMode: undefined,
    createdAt: Date.now(),
    lastUsedModel: undefined,
    lastDebugServerPort: undefined,
    currentPlanUri: undefined,
    subagentInfo: undefined,
    blobEncryptionKey: generateBlobEncryptionKeyHex(),
  };
}

const knownModes = new Set<string>(AgentModes);
const knownApprovalModes = new Set<string>(ApprovalModeSettings);

/** A stored value if it is one of the known words, undefined if it is anything else. */
function knownWord<Word extends string>(known: ReadonlySet<string>, stored: unknown): Word | undefined {
  return typeof stored === "string" && known.has(stored) ? (stored as Word) : undefined;
}

const SUBAGENT_FIELDS = ["parentAgentId", "rootParentAgentId", "toolCallId", "typeName"] as const;

/**
 * A subagent's four names as stored, when every one is a text with something
 * in it. Stored with one missing or empty, the agent is read as no subagent
 * at all. Whatever else is stored beside them is dropped.
 */
function storedSubagentInfo(stored: unknown): AgentSubagentInfo | undefined {
  if (!stored || typeof stored !== "object") return undefined;
  const info: Partial<AgentSubagentInfo> = {};
  for (const field of SUBAGENT_FIELDS) {
    const name = (stored as Partial<Record<keyof AgentSubagentInfo, unknown>>)[field];
    if (typeof name !== "string" || name.length === 0) return undefined;
    info[field] = name;
  }
  return info as AgentSubagentInfo;
}

/**
 * Metadata as it is stored: JSON text, with the root blob's key as hex.
 *
 * Reading is forgiving, since what is read may come from an older engine: a
 * field that is missing gets the value a new agent would have, a mode or
 * approval setting this engine does not know becomes the default, and the
 * old "auto-run" mode is read as the default mode with everything allowed
 * to run. The result must still pass the schema: an id, a name or a time of
 * the wrong kind is refused.
 */
export class AgentMetadataSerde {
  serialize(value: AgentMetadata): Uint8Array {
    const stored = { ...value, latestRootBlobId: toHex(value.latestRootBlobId) };
    return utf8Serde.serialize(JSON.stringify(stored));
  }

  deserialize(blob: Uint8Array): AgentMetadata {
    const stored = JSON.parse(utf8Serde.deserialize(blob)) as Record<string, unknown>;
    const fresh = getDefaultAgentMetadata(typeof stored.agentId === "string" ? stored.agentId : undefined);
    const latestRootBlobId = typeof stored.latestRootBlobId === "string" ? fromHex(stored.latestRootBlobId) : fresh.latestRootBlobId;
    const ranEverything = stored.mode === "auto-run";
    return getAgentMetadataSchema().parse({
      ...fresh,
      ...stored,
      mode: ranEverything ? "default" : (knownWord<AgentMode>(knownModes, stored.mode) ?? "default"),
      isRunEverything: ranEverything || stored.isRunEverything === true,
      approvalMode: knownWord<ApprovalModeSetting>(knownApprovalModes, stored.approvalMode),
      latestRootBlobId,
      subagentInfo: storedSubagentInfo(stored.subagentInfo),
      blobEncryptionKey: isValidBlobEncryptionKeyHex(stored.blobEncryptionKey) ? stored.blobEncryptionKey : fresh.blobEncryptionKey,
    });
  }

  getBlobType(): { kind: "json" } {
    return { kind: "json" };
  }
}

// ── A conversation read from its blobs ──

/** A turn of the agent as it is handed out: the user's message and the steps that answered it. */
function agentTurn(userMessage: UserMessageMessage, steps: ConversationStepMessage[]): ConversationTurnMessage {
  return new ConversationTurn({
    turn: { case: "agentConversationTurn", value: new AgentConversationTurn({ userMessage, steps }) },
  });
}

/** A turn of the person's own shell: the command and what it printed. */
function shellTurn(shellCommand: ShellCommandMessage, shellOutput: ShellOutputMessage): ConversationTurnMessage {
  return new ConversationTurn({
    turn: { case: "shellConversationTurn", value: new ShellConversationTurn({ shellCommand, shellOutput }) },
  });
}

/**
 * The conversation a structure stands for: its turns, todos and summary,
 * each read from its blob. The blobs are asked for one at a time, in the
 * order of the conversation.
 *
 * A blob that is not in the store is passed over without a word: a turn
 * whose own blob or user message is gone is left out whole (so is a shell
 * turn missing its command or its output), a missing step or todo is left
 * out alone, a missing summary leaves the conversation without one. A blob
 * that is there and cannot be read fails the whole reading.
 */
export async function deriveConversationStateFromStructure<Context>(
  ctx: Context,
  structure: ConversationStateStructureMessage,
  blobStore: Pick<BlobStore<Context>, "getBlob">,
): Promise<ConversationStateMessage> {
  const state = new ConversationState();

  const turns: ConversationTurnMessage[] = [];
  for (const turnBlobId of structure.turns) {
    const turnBlob = await blobStore.getBlob(ctx, turnBlobId);
    if (!turnBlob) continue;
    const { turn } = ConversationTurnStructure.fromBinary(turnBlob);
    if (turn.case === "agentConversationTurn") {
      const userMessageBlob = await blobStore.getBlob(ctx, turn.value.userMessage);
      if (!userMessageBlob) continue;
      const steps: ConversationStepMessage[] = [];
      for (const stepBlobId of turn.value.steps) {
        const stepBlob = await blobStore.getBlob(ctx, stepBlobId);
        if (stepBlob) steps.push(ConversationStep.fromBinary(stepBlob));
      }
      turns.push(agentTurn(UserMessage.fromBinary(userMessageBlob), steps));
    } else if (turn.case === "shellConversationTurn") {
      const commandBlob = await blobStore.getBlob(ctx, turn.value.shellCommand);
      if (!commandBlob) continue;
      const outputBlob = await blobStore.getBlob(ctx, turn.value.shellOutput);
      if (!outputBlob) continue;
      turns.push(shellTurn(ShellCommand.fromBinary(commandBlob), ShellOutput.fromBinary(outputBlob)));
    }
  }
  state.turns = turns;

  const todos: TodoItemMessage[] = [];
  for (const todoBlobId of structure.todos) {
    const todoBlob = await blobStore.getBlob(ctx, todoBlobId);
    if (todoBlob) todos.push(TodoItem.fromBinary(todoBlob));
  }
  state.todos = todos;

  if (structure.summary) {
    const summaryBlob = await blobStore.getBlob(ctx, structure.summary);
    if (summaryBlob) state.summary = ConversationSummary.fromBinary(summaryBlob);
  }
  return state;
}

// ── The agent's store ──

/** A subagent's own conversation, and what its stored state says of it. */
interface SubagentConversation {
  conversationState: ConversationStateMessage;
  createdTimestampMs: SubagentPersistedStateMessage["createdTimestampMs"];
  lastUsedTimestampMs: SubagentPersistedStateMessage["lastUsedTimestampMs"];
  subagentType: SubagentPersistedStateMessage["subagentType"];
}

/**
 * One agent's conversation and metadata. The store holds the conversation's
 * structure in memory; a checkpoint replaces it and stores it as the root
 * blob, and a reset reads it back from the root the metadata names.
 */
export class AgentStore2<Context = unknown> {
  private readonly serde = new ProtoSerde(ConversationStateStructure);
  private conversationStateStructure = new ConversationStateStructure();
  /** With this set, every checkpoint is stored under this one key instead of the hash of its bytes. */
  private readonly fixedRootBlobId: Uint8Array | undefined;

  constructor(
    private readonly blobStore: BlobStore<Context>,
    private readonly metadataStore: AgentMetadataStore,
    options: { fixedRootBlobId?: Uint8Array } = {},
  ) {
    this.fixedRootBlobId = options.fixedRootBlobId;
  }

  /** Calls back with the value of one piece of metadata each time the metadata store says it changed. */
  subscribeToMetadata<Key extends AgentMetadataKey>(key: Key, callback: (value: AgentMetadata[Key]) => void): () => void {
    return this.metadataStore.subscribe(key, () => callback(this.metadataStore.get(key)));
  }

  setMetadata<Key extends AgentMetadataKey>(key: Key, value: AgentMetadata[Key]): void {
    this.metadataStore.set(key, value);
  }

  getMetadata<Key extends AgentMetadataKey>(key: Key): AgentMetadata[Key] {
    return this.metadataStore.get(key);
  }

  getId(): string {
    return this.getMetadata("agentId");
  }

  getBlobStore(): BlobStore<Context> {
    return this.blobStore;
  }

  getConversationStateStructure(): ConversationStateStructureMessage {
    return this.conversationStateStructure;
  }

  /**
   * The request the newest agent turn was answered under, or null. Turns
   * whose blob is gone and shell turns are passed over; the first agent turn
   * found from the end decides, even when it carries no request.
   */
  async getLastRequestIdFromConversation(ctx: Context): Promise<string | null> {
    const turnBlobIds = this.conversationStateStructure.turns;
    for (let at = turnBlobIds.length - 1; at >= 0; at -= 1) {
      const turnBlob = await this.blobStore.getBlob(ctx, turnBlobIds[at]!);
      if (!turnBlob) continue;
      const { turn } = ConversationTurnStructure.fromBinary(turnBlob);
      if (turn.case === "agentConversationTurn") return turn.value.requestId ?? null;
    }
    return null;
  }

  async getFullConversation(ctx: Context): Promise<ConversationStateMessage> {
    return this.deserializeConversationStateStructure(ctx, this.conversationStateStructure);
  }

  async deserializeConversationStateStructure(ctx: Context, structure: ConversationStateStructureMessage): Promise<ConversationStateMessage> {
    return deriveConversationStateFromStructure(ctx, structure, this.blobStore);
  }

  /** The conversation, and the conversation of each subagent that has one. */
  async getFullConversationWithSubagents(ctx: Context): Promise<{
    conversationState: ConversationStateMessage;
    subagentStates: Record<string, SubagentConversation>;
  }> {
    const structure = this.conversationStateStructure;
    const conversationState = await this.deserializeConversationStateStructure(ctx, structure);
    const subagentStates: Record<string, SubagentConversation> = {};
    const persisted = await resolveSubagentPersistedStates(ctx, structure, this.blobStore);
    for (const [agentId, persistedState] of Object.entries(persisted)) {
      if (!persistedState.conversationState) continue;
      subagentStates[agentId] = {
        conversationState: await this.deserializeConversationStateStructure(ctx, persistedState.conversationState),
        createdTimestampMs: persistedState.createdTimestampMs,
        lastUsedTimestampMs: persistedState.lastUsedTimestampMs,
        subagentType: persistedState.subagentType,
      };
    }
    return { conversationState, subagentStates };
  }

  getLatestCheckpoint(): ConversationStateStructureMessage {
    return this.getConversationStateStructure();
  }

  /**
   * Takes a checkpoint as the conversation's structure, stores it as the
   * root blob and tells the metadata the root's key. The structure in memory
   * is replaced first: it stays replaced when the store refuses the blob.
   */
  async handleCheckpoint(ctx: Context, checkpoint: ConversationStateStructureMessage): Promise<void> {
    this.conversationStateStructure = checkpoint;
    const rootBlob = this.serde.serialize(checkpoint);
    const rootBlobId = this.fixedRootBlobId ?? (await getBlobId(rootBlob));
    await this.blobStore.setBlob(ctx, rootBlobId, rootBlob);
    this.setMetadata("latestRootBlobId", rootBlobId);
  }

  async resetFromDb(ctx: Context): Promise<void> {
    await this.tryResetFromDb(ctx);
  }

  /**
   * Reads the conversation's structure back from the root blob the metadata
   * names, and says whether there was one to read. With no root named, no
   * such blob, or anything failing on the way, the store is left holding an
   * empty structure.
   */
  async tryResetFromDb(ctx: Context): Promise<boolean> {
    let stored: ConversationStateStructureMessage | undefined;
    try {
      const rootBlobId = this.getMetadata("latestRootBlobId");
      if (rootBlobId && rootBlobId.length !== 0) {
        const rootBlob = await this.blobStore.getBlob(ctx, rootBlobId);
        if (rootBlob) stored = this.serde.deserialize(rootBlob);
      }
    } catch {
      // Unreadable metadata, a failing store and a damaged root all read as no conversation.
    }
    this.conversationStateStructure = stored ?? new ConversationStateStructure();
    return stored !== undefined;
  }

  /** Disposes of the blob store when it is one that can be disposed of. */
  async dispose(): Promise<void> {
    if (!(this.blobStore instanceof Disposable)) return;
    await (this.blobStore as unknown as Disposable & { dispose(): void | Promise<void> }).dispose();
  }
}
