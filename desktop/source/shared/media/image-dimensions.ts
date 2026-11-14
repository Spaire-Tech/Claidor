/**
 * The size of a picture, read from the bytes of its file without decoding
 * it: WebP, HEIC, PNG, GIF and JPEG. Each reader looks only where its format
 * writes the two sides, and answers null when the bytes are not that format,
 * are cut too short, or give a side of nothing.
 */

export interface MediaDimensions {
  readonly width: number;
  readonly height: number;
}

/** The two sides as a size, when neither is nothing. */
function sized(width: number, height: number): MediaDimensions | null {
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/** The whole number written on `count` bytes at `at`, its highest byte first. */
function big(bytes: Uint8Array, at: number, count: number): number {
  let value = 0;
  for (let i = 0; i < count; i += 1) value = value * 256 + bytes[at + i]!;
  return value;
}

/** The whole number written on `count` bytes at `at`, its lowest byte first. */
function little(bytes: Uint8Array, at: number, count: number): number {
  let value = 0;
  for (let i = count - 1; i >= 0; i -= 1) value = value * 256 + bytes[at + i]!;
  return value;
}

/** Whether the letters of `word` stand at `at`, one byte each. */
function spells(bytes: Uint8Array, at: number, word: string): boolean {
  for (let i = 0; i < word.length; i += 1) {
    if (bytes[at + i] !== word.charCodeAt(i)) return false;
  }
  return true;
}

/** Where `word` first stands, or -1. */
function find(bytes: Uint8Array, word: string): number {
  const firstLetter = word.charCodeAt(0);
  const last = bytes.length - word.length;
  for (let at = 0; at <= last; at += 1) {
    // Most bytes are not the word's first letter: the rest is only looked at where one is.
    if (bytes[at] === firstLetter && spells(bytes, at, word)) return at;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// HEIC
// ---------------------------------------------------------------------------

/** A box of a HEIC file: where its four-letter name stands, and where its inside starts and ends. */
interface Box {
  readonly nameAt: number;
  readonly start: number;
  readonly end: number;
}

/** Where a picture's two sides are written, and the quarter turns it is shown with. */
interface Found {
  readonly sizeAt: number;
  readonly turns: number;
}

/**
 * The boxes laid end to end between `start` and `end`. A box opens with its
 * size on four bytes (itself included) and its name on four letters. A size
 * of 0 means the box runs to the end; a size of 1 means the size is written
 * on the eight bytes after the name, of which the last four are read. The
 * walk stops at the first box that does not fit where it stands.
 */
function boxesIn(bytes: Uint8Array, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let at = start;
  while (at + 8 <= end) {
    let opening = 8;
    let size = big(bytes, at, 4);
    if (size === 0) {
      size = end - at;
    } else if (size === 1) {
      if (at + 16 > end) break;
      opening = 16;
      size = big(bytes, at + 12, 4);
    }
    if (size < opening || at + size > end) break;
    boxes.push({ nameAt: at + 4, start: at + opening, end: at + size });
    at += size;
  }
  return boxes;
}

/** The first of the boxes that goes by a name. */
function boxNamed(bytes: Uint8Array, boxes: readonly Box[], name: string): Box | undefined {
  return boxes.find((box) => spells(bytes, box.nameAt, name));
}

/**
 * A HEIC file holds several pictures (the photo, a small copy of it…), each
 * an item with its own properties. The size wanted is the size property
 * ("ispe") of the item named as the picture, turned as its turn property
 * ("irot") says.
 */
export class HeicDimensions {
  public static read(buffer: Uint8Array): MediaDimensions | null {
    if (buffer.length < 12 || !spells(buffer, 4, "ftyp")) return null;
    const found = HeicDimensions.inTables(buffer) ?? HeicDimensions.anywhere(buffer);
    if (found === null) return null;
    const width = big(buffer, found.sizeAt, 4);
    const height = big(buffer, found.sizeAt + 4, 4);
    // One quarter turn, or three, lays the picture on its side.
    return found.turns % 2 === 1 ? sized(height, width) : sized(width, height);
  }

  /**
   * The size by the file's own tables: the "meta" box names the picture's
   * item ("pitm") and holds the properties ("iprp"): their list ("ipco")
   * and the table that says which item has which ("ipma"). Null as soon as
   * one of them is missing or cut, or the picture has no size among its
   * properties.
   */
  private static inTables(buffer: Uint8Array): Found | null {
    const meta = boxNamed(buffer, boxesIn(buffer, 0, buffer.length), "meta");
    if (meta === undefined) return null;
    // The meta box opens with a version and flags, four bytes that are no box.
    const inMeta = boxesIn(buffer, meta.start + 4, meta.end);
    const naming = boxNamed(buffer, inMeta, "pitm");
    const holder = boxNamed(buffer, inMeta, "iprp");
    if (naming === undefined || holder === undefined) return null;
    const inHolder = boxesIn(buffer, holder.start, holder.end);
    const list = boxNamed(buffer, inHolder, "ipco");
    const table = boxNamed(buffer, inHolder, "ipma");
    if (list === undefined || table === undefined) return null;
    const picture = HeicDimensions.pictureItem(buffer, naming);
    if (picture === null) return null;
    const numbers = HeicDimensions.propertiesOf(buffer, table, picture);
    if (numbers === null) return null;

    const properties = boxesIn(buffer, list.start, list.end);
    let sizeAt: number | null = null;
    let turns = 0;
    for (const number of numbers) {
      // Properties are numbered from 1; a number with no property is passed over.
      const property = properties[number - 1];
      if (property === undefined) continue;
      if (spells(buffer, property.nameAt, "ispe")) {
        // The first size counts. After a version and flags it holds the width, then the height.
        if (sizeAt === null && property.start + 12 <= property.end) sizeAt = property.start + 4;
      } else if (spells(buffer, property.nameAt, "irot") && property.start < property.end) {
        // The last turn counts.
        turns = buffer[property.start]! & 3;
      }
    }
    return sizeAt === null ? null : { sizeAt, turns };
  }

  /**
   * The size where the tables do not lead to one: the first "ispe" found
   * anywhere in the bytes, and the first "irot" as its turn, whichever
   * picture they belong to.
   */
  private static anywhere(buffer: Uint8Array): Found | null {
    const size = find(buffer, "ispe");
    if (size === -1 || size + 16 > buffer.length) return null;
    const turn = find(buffer, "irot");
    const turns = turn !== -1 && turn + 4 < buffer.length ? buffer[turn + 4]! & 3 : 0;
    return { sizeAt: size + 8, turns };
  }

  /** The number of the item that is the picture: after a version and flags, on two bytes in version 0 and on four in any other. */
  private static pictureItem(buffer: Uint8Array, naming: Box): number | null {
    const numberAt = naming.start + 4;
    const length = buffer[naming.start] === 0 ? 2 : 4;
    if (numberAt + length > naming.end) return null;
    return big(buffer, numberAt, length);
  }

  /**
   * The numbers of an item's properties, from the table. After a version
   * and flags the table holds how many items it lists, then for each its
   * number (two bytes in version 0, four in any other), how many properties
   * it has, and their numbers: one byte each, or two when the flags' last
   * bit is set. A number's top bit says whether the property is needed and
   * is not part of the number. Null when the item is not listed, or the
   * table is cut before it is reached.
   */
  private static propertiesOf(buffer: Uint8Array, table: Box, item: number): number[] | null {
    let at = table.start + 8;
    if (at > table.end) return null;
    const itemLength = buffer[table.start]! >= 1 ? 4 : 2;
    const numberLength = (buffer[table.start + 3]! & 1) === 1 ? 2 : 1;
    const withoutTopBit = numberLength === 2 ? 0x7fff : 0x7f;
    const listed = big(buffer, table.start + 4, 4);
    for (let seen = 0; seen < listed; seen += 1) {
      if (at + itemLength + 1 > table.end) return null;
      const number = big(buffer, at, itemLength);
      const count = buffer[at + itemLength]!;
      const numbersAt = at + itemLength + 1;
      at = numbersAt + count * numberLength;
      if (at > table.end) return null;
      if (number === item) return Array.from({ length: count }, (_, nth) => big(buffer, numbersAt + nth * numberLength, numberLength) & withoutTopBit);
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// WebP
// ---------------------------------------------------------------------------

/**
 * A WebP is a RIFF file whose first chunk is one of three kinds, each with
 * its own way of writing the size.
 */
export function readWebpDimensions(buffer: Uint8Array): MediaDimensions | null {
  if (buffer.length < 30) return null;
  if (!spells(buffer, 0, "RIFF") || !spells(buffer, 8, "WEBP")) return null;
  if (spells(buffer, 12, "VP8 ")) {
    // Lossy: each side on fourteen bits; the two bits above them say how it is scaled.
    return sized(little(buffer, 26, 2) & 0x3fff, little(buffer, 28, 2) & 0x3fff);
  }
  if (spells(buffer, 12, "VP8L")) {
    // Lossless: one number that packs each side, less one, on fourteen bits.
    const packed = little(buffer, 21, 4);
    return sized((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1);
  }
  if (spells(buffer, 12, "VP8X")) {
    // Extended: each side, less one, on three bytes.
    return sized(little(buffer, 24, 3) + 1, little(buffer, 27, 3) + 1);
  }
  return null;
}

export function readWebpOrHeicDimensions(buffer: Uint8Array): MediaDimensions | null {
  return readWebpDimensions(buffer) ?? HeicDimensions.read(buffer);
}

// ---------------------------------------------------------------------------
// PNG, GIF and JPEG
// ---------------------------------------------------------------------------

/** The eight bytes every PNG starts with. */
const PNG_START = "\u0089PNG\r\n\u001a\n";

/** A PNG's first chunk is its header ("IHDR"), which opens with the width and the height on four bytes each. */
export function readPngDimensions(buffer: Uint8Array): MediaDimensions | null {
  if (buffer.length < 24) return null;
  if (!spells(buffer, 0, PNG_START) || !spells(buffer, 12, "IHDR")) return null;
  return sized(big(buffer, 16, 4), big(buffer, 20, 4));
}

/** A GIF starts with one of two six-letter marks, then its width and its height on two bytes each, the low byte first. */
export function readGifDimensions(buffer: Uint8Array): MediaDimensions | null {
  if (buffer.length < 10) return null;
  if (!spells(buffer, 0, "GIF87a") && !spells(buffer, 0, "GIF89a")) return null;
  return sized(little(buffer, 6, 2), little(buffer, 8, 2));
}

/** Markers that stand alone, with no length and nothing inside: 01, the eight restarts, the picture's start and its end. */
function standsAlone(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9);
}

/** A frame header is one of the markers C0 to CF, save three that are other things (C4, C8, CC). */
function opensAFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/**
 * A JPEG is a run of segments, each an FF byte, a marker, a length on two
 * bytes that counts itself, and that many bytes. The size is in the first
 * frame header: a precision byte, then the height, then the width. Nothing
 * is found once the picture's data starts (marker DA).
 */
export function readJpegDimensions(buffer: Uint8Array): MediaDimensions | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let at = 2;
  while (at + 3 < buffer.length) {
    const marker = buffer[at + 1]!;
    if (buffer[at] !== 0xff || marker === 0xff) {
      // Not at a marker, or at a filling FF: one byte further.
      at += 1;
      continue;
    }
    if (standsAlone(marker)) {
      at += 2;
      continue;
    }
    if (marker === 0xda) return null;
    const length = big(buffer, at + 2, 2);
    if (length < 2) return null;
    if (opensAFrame(marker)) {
      if (at + 9 > buffer.length) return null;
      return sized(big(buffer, at + 7, 2), big(buffer, at + 5, 2));
    }
    at += 2 + length;
  }
  return null;
}

/** The readers a file of unknown kind is handed to, in turn. */
const READERS = [readWebpOrHeicDimensions, readPngDimensions, readGifDimensions, readJpegDimensions];

/** The size by the first reader that knows the bytes. */
export function readImageFileDimensions(buffer: Uint8Array): MediaDimensions | null {
  for (const read of READERS) {
    const size = read(buffer);
    if (size !== null) return size;
  }
  return null;
}
