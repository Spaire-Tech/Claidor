/**
 * The states of a conversation's subagents. A conversation holds each
 * subagent's state in one of two places: written in the conversation itself,
 * or kept apart as a blob of its own, with only the blob's key in the
 * conversation. This gives all of them by subagent, read from wherever they
 * are; a state kept apart comes before one written in the conversation.
 */
import type { ConversationStateStructure, SubagentPersistedState as SubagentPersistedStateMessage } from "../proto/generated/agent/v1/agent_pb.js";
import { SubagentPersistedState } from "../proto/generated/agent/v1/agent_pb.js";
import { createLogger } from "../context/logger.js";
import { asyncMapValues } from "../utils/promise-extras.js";
import type { BlobStore } from "./blob-store.js";
import { BlobNotFoundError } from "./blob-not-found-error.js";
import { toHex } from "./serde.js";

const logger = createLogger("@sand/agent-kv:subagent-states");

/** How many blobs are asked for at a time. */
const BLOBS_AT_A_TIME = 8;

/** What became of one state kept apart. */
type Outcome =
  | { readonly found: SubagentPersistedStateMessage; readonly subagentId: string }
  /** The blob is not in the store, and the conversation has no state of its own for the subagent. */
  | { readonly missingBlobIdHex: string }
  /** The blob is not in the store, but the conversation has a state for the subagent, which stands. */
  | { readonly leftAsWritten: true }
  /** The blob is there and cannot be read. */
  | { readonly unreadable: unknown };

export async function resolveSubagentPersistedStates<Context>(
  ctx: Context,
  state: ConversationStateStructure,
  blobStore: Pick<BlobStore<Context>, "getBlob">,
): Promise<Record<string, SubagentPersistedStateMessage>> {
  const states: Record<string, SubagentPersistedStateMessage> = { ...state.subagentStates };
  const keptApart = Object.entries(state.subagentStateRefs) as Array<[string, Uint8Array]>;
  if (keptApart.length === 0) return states;

  /** Reads one state kept apart. It never fails for a blob that is missing or unreadable: every blob is asked for before anything is refused. */
  const read = async ([subagentId, blobId]: [string, Uint8Array]): Promise<Outcome> => {
    const blob = await blobStore.getBlob(ctx, blobId);
    if (blob === undefined) {
      if (states[subagentId] === undefined) return { missingBlobIdHex: toHex(blobId) };
      logger.warn(ctx as never, "Subagent state ref blob not found; falling back to inline entry", { subagentId });
      return { leftAsWritten: true };
    }
    try {
      return { found: SubagentPersistedState.fromBinary(blob), subagentId };
    } catch (error) {
      return { unreadable: error };
    }
  };
  const outcomes = await asyncMapValues(keptApart, read, { max: BLOBS_AT_A_TIME });

  // Missing blobs come first, all of them named at once; then the first blob that could not be read.
  const missing: string[] = [];
  let firstUnreadable: { readonly unreadable: unknown } | undefined;
  for (const outcome of outcomes) {
    if ("missingBlobIdHex" in outcome) missing.push(outcome.missingBlobIdHex);
    else if ("unreadable" in outcome) firstUnreadable ??= outcome;
  }
  if (missing.length > 0) throw new BlobNotFoundError(missing);
  if (firstUnreadable !== undefined) throw firstUnreadable.unreadable;

  for (const outcome of outcomes) {
    if ("found" in outcome) states[outcome.subagentId] = outcome.found;
  }
  return states;
}
