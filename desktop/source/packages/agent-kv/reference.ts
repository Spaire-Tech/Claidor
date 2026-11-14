/**
 * References to values kept as blobs. An eager reference already has its
 * value; a lazy one has only the blob's key and reads the blob when the
 * value is first asked for. Either writes its value under the hash of its
 * bytes, and only when the value is not the one it last wrote or loaded.
 *
 * A value is told from the one before by being the very same thing, not by
 * what it holds: something changed in place is not written again.
 */
import type { Context as OperationContext } from "../context/core.js";
import { createLogger } from "../context/logger.js";
import { createCounter, createHistogram } from "../metrics/index.js";
import { BlobNotFoundError } from "./blob-not-found-error.js";
import { getBlobId, isBlobDurable, type BlobStore } from "./blob-store.js";
import { toHex, type Serde } from "./serde.js";
import { getBlobMetadataCallback } from "./typed-blob-store.js";

const logger = createLogger("@sand/agent-kv:reference");

/** A blob of this many bytes or more is a large one to load. */
const LARGE_BLOB_BYTES = 512 * 1024;
/** A blob that takes this long or longer to turn into its value is a slow one. */
const SLOW_READ_MS = 100;

const heavyLoads = createCounter("agent_kv.lazy_reference.cache_miss", {
  description: "Number of large or slow LazyReference cache misses that require loading and deserializing a blob",
  labelNames: ["blob_type"],
});
const heavyLoadBytes = createHistogram("agent_kv.lazy_reference.deserialize_bytes", {
  description: "Blob byte size loaded on a large or slow LazyReference deserialize cache miss",
  labelNames: ["blob_type"],
});
const heavyLoadDuration = createHistogram("agent_kv.lazy_reference.deserialize_ms", {
  description: "Time spent deserializing a blob on a large or slow LazyReference cache miss",
  labelNames: ["blob_type"],
});

/**
 * What a serde's blobs are called in the measures: a message by its type's
 * name, a picture or a file by its media type, anything else by its kind.
 */
function blobTypeLabel(serde: Serde<unknown>): string {
  const blobType = serde.getBlobType?.();
  if (blobType === undefined) return "unknown";
  const kind = blobType.kind;
  if (kind === "proto") return blobType.typeName as string;
  if (kind === "image") return `image:${blobType.mimeType as string}`;
  if (kind === "file") return blobType.mimeType ? `file:${blobType.mimeType}` : "file";
  return kind;
}

/** Counts a large or slow load, measures it, and writes a warning. Each measure gets labels of its own. */
function reportHeavyLoad(context: OperationContext, blobType: string, blobBytes: number, deserializeDurationMs: number): void {
  heavyLoads.increment(context, 1, { blob_type: blobType });
  heavyLoadBytes.histogram(context, blobBytes, { blob_type: blobType });
  heavyLoadDuration.histogram(context, deserializeDurationMs, { blob_type: blobType });
  logger.warn(context, "Large lazy reference deserialize", { blobType, blobBytes, deserializeDurationMs });
}

/**
 * Tells the store's callback, if it carries one, the key and kind of a blob
 * about to be stored. A serde that does not say what its blobs are leaves
 * nothing to tell.
 */
function announceBlob<T, Context>(serde: Serde<T>, blobStore: BlobStore<Context>, blobId: Uint8Array): void {
  const onBlobMetadata = getBlobMetadataCallback(blobStore);
  const blobType = serde.getBlobType?.();
  if (onBlobMetadata && blobType) onBlobMetadata({ blobId, blobType });
}

/**
 * The class of values that write themselves: a reference holding one asks
 * it for its key instead of going through a serde. The class holds nothing;
 * the classes built on it have the writing.
 */
export class Writeable<Context = unknown> {}
export interface Writeable<Context = unknown> {
  writeToBlobStore(context: Context): Promise<Uint8Array>;
}

/** What an eager reference last stored: the value, the key it went under, and its bytes. */
interface EagerWrite<T> {
  readonly value: T;
  readonly blobId: Uint8Array;
  readonly blobData: Uint8Array;
}

export class EagerReference<T, Context = unknown> {
  declare readonly serde: Serde<T>;
  declare readonly blobStore: BlobStore<Context>;
  declare lastWrittenValue: EagerWrite<T> | undefined;
  declare value: T;

  constructor(serde: Serde<T>, blobStore: BlobStore<Context>, value: T) {
    this.serde = serde;
    this.blobStore = blobStore;
    this.lastWrittenValue = undefined;
    this.value = value;
  }

  get(_context: Context): Promise<T> {
    return Promise.resolve(this.value);
  }

  set(value: T): void {
    this.value = value;
  }

  /** Stores the value if it is not the one last stored, and gives its key. */
  async writeToBlobStore(context: Context): Promise<Uint8Array> {
    if (this.value instanceof Writeable) return this.value.writeToBlobStore(context);

    if (this.value === this.lastWrittenValue?.value) {
      // Nothing new. A store that does not hold the blob for good is handed the same bytes once more.
      if (!isBlobDurable(this.blobStore, this.lastWrittenValue.blobId)) {
        await this.blobStore.setBlob(context, this.lastWrittenValue.blobId, this.lastWrittenValue.blobData);
      }
      return this.lastWrittenValue.blobId;
    }

    const blobData = this.serde.serialize(this.value);
    const blobId = await getBlobId(blobData);
    announceBlob(this.serde, this.blobStore, blobId);
    await this.blobStore.setBlob(context, blobId, blobData);
    this.lastWrittenValue = { value: this.value, blobId, blobData };
    return blobId;
  }
}

export class LazyReference<T, Context extends OperationContext = OperationContext> {
  declare readonly serde: Serde<T>;
  declare readonly blobStore: BlobStore<Context>;
  declare blobId: Uint8Array;
  /** The value, once it was asked for or set; undefined until then. A load that failed stays here as it failed. */
  declare valuePromise: Promise<T> | undefined;
  /** The value last loaded or stored, and the bytes it was read from or stored as. */
  declare lastWrittenValue: T | undefined;
  declare lastWrittenBlobData: Uint8Array | undefined;

  constructor(serde: Serde<T>, blobStore: BlobStore<Context>, blobId: Uint8Array) {
    this.serde = serde;
    this.blobStore = blobStore;
    this.blobId = blobId;
    this.valuePromise = undefined;
    this.lastWrittenValue = undefined;
    this.lastWrittenBlobData = undefined;
  }

  /** The value: read from its blob the first time, the same answer every time after. */
  async get(context: Context): Promise<T> {
    if (this.valuePromise === undefined) {
      const label = blobTypeLabel(this.serde as Serde<unknown>);
      this.valuePromise = this.blobStore.getBlob(context, this.blobId).then((blob) => {
        if (blob === undefined) throw new BlobNotFoundError([toHex(this.blobId)]);
        const startedAt = performance.now();
        const value = this.serde.deserialize(blob);
        this.lastWrittenBlobData = blob;
        const took = performance.now() - startedAt;
        if (blob.byteLength >= LARGE_BLOB_BYTES || took >= SLOW_READ_MS) {
          reportHeavyLoad(context, label, blob.byteLength, took);
        }
        return value;
      });
      // What was loaded is what the store holds: it counts as written. A load that failed is left to whoever asked.
      this.valuePromise.then(
        (value) => {
          this.lastWrittenValue = value;
        },
        () => {},
      );
    }
    return this.valuePromise;
  }

  set(value: T): void {
    this.valuePromise = Promise.resolve(value);
  }

  /** Stores the value if it is not the one loaded or last stored, and gives its key. A reference never read or set has nothing to store. */
  async writeToBlobStore(context: Context): Promise<Uint8Array> {
    if (this.valuePromise === undefined) return this.blobId;
    const value = await this.get(context);
    if (value instanceof Writeable) return value.writeToBlobStore(context);

    if (value === this.lastWrittenValue) {
      // Nothing new. A store that does not hold the blob for good is handed the same bytes once more.
      if (this.lastWrittenBlobData !== undefined && !isBlobDurable(this.blobStore, this.blobId)) {
        await this.blobStore.setBlob(context, this.blobId, this.lastWrittenBlobData);
      }
      return this.blobId;
    }

    const blobData = this.serde.serialize(value);
    const blobId = await getBlobId(blobData);
    announceBlob(this.serde, this.blobStore, blobId);
    await this.blobStore.setBlob(context, blobId, blobData);
    this.lastWrittenValue = value;
    this.lastWrittenBlobData = blobData;
    this.blobId = blobId;
    return blobId;
  }
}
