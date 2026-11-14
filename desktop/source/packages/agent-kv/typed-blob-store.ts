/**
 * A store that is told what each new blob holds. Whoever writes a blob looks
 * for a callback on the store and tells it the blob's key and kind; the
 * typed store is the wrapper that carries such a callback around any other
 * store and otherwise passes every call through.
 */
import type { BlobStore } from "./blob-store.js";

/**
 * Where a store keeps its callback. The symbol is registered by name, so
 * every build of the engine in one process finds the same key.
 */
export const BLOB_METADATA_CALLBACK_SYMBOL = Symbol.for("sand.blobMetadataCallback");

export interface BlobMetadata {
  blobId: Uint8Array;
  blobType: unknown;
}

export type BlobMetadataCallback = (metadata: BlobMetadata) => void;

/** A store as one that may carry a callback. */
type MayCarryACallback<Context> = BlobStore<Context> & { [BLOB_METADATA_CALLBACK_SYMBOL]?: BlobMetadataCallback };

/** The callback a store carries, if it has the key at all (its own, or from what it was made from). */
export function getBlobMetadataCallback<Context>(blobStore: BlobStore<Context>): BlobMetadataCallback | undefined {
  if (!(BLOB_METADATA_CALLBACK_SYMBOL in blobStore)) return undefined;
  return (blobStore as MayCarryACallback<Context>)[BLOB_METADATA_CALLBACK_SYMBOL];
}

/** The store inside all the typed stores wrapped around it; a store that is not typed is its own. */
export function unwrapBlobStore<Context>(blobStore: BlobStore<Context>): BlobStore<Context> {
  if (!(blobStore instanceof TypedBlobStore)) return blobStore;
  return unwrapBlobStore(blobStore.getInnerBlobStore());
}

/** A store with the call that, by its name, stores a blob and waits for the second copy of it. No store in the engine has it today. */
interface WaitsForSecondCopy<Context> extends BlobStore<Context> {
  setBlobAwaitingSecondary(ctx: Context, blobId: Uint8Array, blobData: Uint8Array): Promise<void>;
}

function waitsForSecondCopy<Context>(blobStore: BlobStore<Context>): blobStore is WaitsForSecondCopy<Context> {
  return typeof (blobStore as Partial<WaitsForSecondCopy<Context>>).setBlobAwaitingSecondary === "function";
}

/**
 * Stores a blob and waits until that is done: the innermost store is asked
 * to store it and wait for its second copy if it has that call; if it has
 * not, the store that was handed in is written and then flushed.
 */
export async function setBlobReadableFromCloudMirror<Context>(options: {
  blobStore: BlobStore<Context>;
  ctx: Context;
  blobId: Uint8Array;
  blobData: Uint8Array;
}): Promise<void> {
  const innermost = unwrapBlobStore(options.blobStore);
  if (!waitsForSecondCopy(innermost)) {
    await options.blobStore.setBlob(options.ctx, options.blobId, options.blobData);
    await options.blobStore.flush(options.ctx);
    return;
  }
  await innermost.setBlobAwaitingSecondary(options.ctx, options.blobId, options.blobData);
}

export class TypedBlobStore<Context = unknown> implements BlobStore<Context> {
  /** Always there, undefined when the store was made without a callback. */
  readonly [BLOB_METADATA_CALLBACK_SYMBOL]: BlobMetadataCallback | undefined;

  constructor(
    private readonly inner: BlobStore<Context>,
    onBlobMetadata?: BlobMetadataCallback,
  ) {
    this[BLOB_METADATA_CALLBACK_SYMBOL] = onBlobMetadata;
  }

  getInnerBlobStore(): BlobStore<Context> {
    return this.inner;
  }

  getBlob(ctx: Context, blobId: Uint8Array): Promise<Uint8Array | undefined> {
    return this.inner.getBlob(ctx, blobId);
  }

  setBlob(ctx: Context, blobId: Uint8Array, blobData: Uint8Array): Promise<void> {
    return this.inner.setBlob(ctx, blobId, blobData);
  }

  setBlobLocallyOnly(ctx: Context, blobId: Uint8Array, blobData: Uint8Array): Promise<void> {
    return this.inner.setBlobLocallyOnly(ctx, blobId, blobData);
  }

  flush(ctx: Context): Promise<void> {
    return this.inner.flush(ctx);
  }

  /** What the store inside says; held for good when it cannot be asked or answers nothing. */
  isBlobDurable(blobId: Uint8Array): boolean {
    const answer = this.inner.isBlobDurable?.(blobId);
    return answer === undefined ? true : answer;
  }
}
