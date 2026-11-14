/**
 * How a value becomes the bytes of a blob, and comes back from them: a text
 * as UTF-8, a protobuf message as its own binary form. Also bytes as hex,
 * for wherever a key or a blob has to be written as text.
 */

/** What a blob holds, as its serde tells it: enough to label the blob without reading it. */
export interface BlobType {
  kind: string;
  typeName?: string;
  mimeType?: string;
}

/** Turns values of one kind into a blob's bytes and back. */
export interface Serde<T> {
  serialize(value: T): Uint8Array;
  deserialize(blob: Uint8Array): T;
  getBlobType?(): BlobType;
}

const utf8Writer = new TextEncoder();
/**
 * Reads leniently: a byte order mark at the start is dropped, and bytes that
 * are no UTF-8 come out as the replacement character instead of an error.
 */
const utf8Reader = new TextDecoder();

export class Utf8Serde implements Serde<string> {
  serialize(value: string): Uint8Array {
    return utf8Writer.encode(value);
  }

  deserialize(blob: Uint8Array): string {
    return utf8Reader.decode(blob);
  }

  getBlobType(): BlobType {
    return { kind: "string" };
  }
}

/** The one text serde everything shares. It keeps nothing between two calls. */
export const utf8Serde = new Utf8Serde();

/** A message that can write itself as bytes. */
export interface BinaryMessage {
  toBinary(): Uint8Array;
}

/** A message's type: its full name, and how one is read from bytes. */
export interface BinaryMessageType<T extends BinaryMessage> {
  typeName: string;
  fromBinary(blob: Uint8Array): T;
}

/** The serde of one message type. The message writes itself; its type reads it. */
export class ProtoSerde<T extends BinaryMessage> implements Serde<T> {
  constructor(private readonly proto: BinaryMessageType<T>) {}

  serialize(value: T): Uint8Array {
    return value.toBinary();
  }

  deserialize(blob: Uint8Array): T {
    return this.proto.fromBinary(blob);
  }

  getBlobType(): BlobType {
    return { kind: "proto", typeName: this.proto.typeName };
  }
}

/** One byte as two hex digits. */
function twoDigits(byte: number): string {
  return byte.toString(16).padStart(2, "0");
}

/** Bytes as small hex digits, two for each byte. */
export function toHex(value: Uint8Array): string {
  try {
    return Buffer.from(value).toString("hex");
  } catch {
    // Where there is no Buffer, or Buffer will not take what it was handed: one member at a time.
    return Array.from(value, (byte) => twoDigits(byte)).join("");
  }
}

/**
 * The bytes a hex text stands for. Spaces around the text and capitals are
 * accepted. Two characters that are no hex number count as a zero byte; a
 * text of an odd length is refused.
 */
export function fromHex(hex: string): Uint8Array {
  const digits = hex.trim().toLowerCase();
  if (digits.length % 2 !== 0) throw new Error("Invalid hex string length");
  const bytes = new Uint8Array(digits.length / 2);
  for (let at = 0; at < bytes.length; at += 1) {
    bytes[at] = Number.parseInt(digits.slice(at * 2, at * 2 + 2), 16);
  }
  return bytes;
}
