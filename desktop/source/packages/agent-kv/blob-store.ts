/**
 * Where an agent's blobs are kept. A blob is bytes under a key. Most blobs
 * are stored under the SHA-256 of their bytes (`getBlobId`), so the same
 * bytes are found under the same key. This file says what every store
 * offers, and holds the store that keeps everything in memory.
 */
import { toHex } from "./serde.js";
import { createHistogram } from "../metrics/index.js";
import type { Context as OperationContext } from "../context/core.js";

export interface BlobStore<Context = unknown> {
  /** The blob under a key, or undefined when there is none. */
  getBlob(ctx: Context, blobId: Uint8Array): Promise<Uint8Array | undefined>;
  setBlob(ctx: Context, blobId: Uint8Array, blobData: Uint8Array): Promise<void>;
  /** By its name, a write that is not sent on from this machine. The engine's own stores store it as `setBlob` does. */
  setBlobLocallyOnly(ctx: Context, blobId: Uint8Array, blobData: Uint8Array): Promise<void>;
  flush(ctx: Context): Promise<void>;
  /** Whether the store holds this blob for good. No store in the engine answers this today. */
  isBlobDurable?(blobId: Uint8Array): boolean;
}

/**
 * Whether a store holds a blob for good. A store that cannot be asked, or
 * that answers nothing, is taken to hold everything for good; any other
 * answer is handed back as it came.
 */
export function isBlobDurable(blobStore: BlobStore, blobId: Uint8Array): boolean {
  const answer = blobStore.isBlobDurable?.(blobId);
  return answer === undefined ? true : answer;
}

/**
 * The bytes of a view as a plain Uint8Array over the same memory. Where the
 * memory is shared between threads, the answer is a copy in memory of its
 * own instead.
 */
export function toUint8Array(value: Uint8Array): Uint8Array {
  const overSharedMemory = typeof SharedArrayBuffer !== "undefined" && value.buffer instanceof SharedArrayBuffer;
  if (overSharedMemory) return new Uint8Array(value);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

/** The key of a blob: the SHA-256 of its bytes. */
export async function getBlobId(blobData: Uint8Array): Promise<Uint8Array> {
  // Hashed from a copy of exactly the bytes the view shows, taken at the call.
  const copy = toUint8Array(blobData).slice();
  return new Uint8Array(await crypto.subtle.digest("SHA-256", copy.buffer));
}

const readDuration = createHistogram("agent_kv.in_memory.get_blob.duration_ms", {
  description: "Duration of InMemoryBlobStore getBlob operations in milliseconds",
});
const writeDuration = createHistogram("agent_kv.in_memory.set_blob.duration_ms", {
  description: "Duration of InMemoryBlobStore setBlob operations in milliseconds",
});

/** Runs `work` and tells `duration` how long it took, whether it gave an answer or threw. */
function timed<Result>(duration: typeof readDuration, ctx: OperationContext, work: () => Result): Result {
  const startedAt = performance.now();
  try {
    return work();
  } finally {
    duration.histogram(ctx, performance.now() - startedAt);
  }
}

/**
 * A store that keeps every blob in memory, under the hex of its key. It
 * holds the very bytes it was given, not a copy, and hands the same back.
 * The work is done at once: only the answer comes as a promise.
 */
export class InMemoryBlobStore<StoreContext extends OperationContext = OperationContext> implements BlobStore<StoreContext> {
  private readonly blobs = new Map<string, Uint8Array>();

  getBlob(ctx: StoreContext, blobId: Uint8Array): Promise<Uint8Array | undefined> {
    return timed(readDuration, ctx, () => Promise.resolve(this.blobs.get(toHex(blobId))));
  }

  setBlob(ctx: StoreContext, blobId: Uint8Array, blobData: Uint8Array): Promise<void> {
    return timed(writeDuration, ctx, () => {
      this.blobs.set(toHex(blobId), blobData);
      return Promise.resolve();
    });
  }

  /** There is nowhere else for a blob to go: the same as `setBlob`. */
  setBlobLocallyOnly(ctx: StoreContext, blobId: Uint8Array, blobData: Uint8Array): Promise<void> {
    return this.setBlob(ctx, blobId, blobData);
  }

  flush(_ctx: StoreContext): Promise<void> {
    return Promise.resolve();
  }
}
