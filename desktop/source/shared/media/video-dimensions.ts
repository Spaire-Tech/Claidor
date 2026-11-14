/**
 * The size of a video, read from an MP4 or QuickTime file without decoding
 * it. The file is made of boxes; the film box ("moov") holds one box for
 * each track ("trak"), whose header ("tkhd") ends with the track's width and
 * height, after a matrix that says how the picture is turned.
 */
import type { MediaDimensions } from "./image-dimensions.js";

/** A stretch of the bytes: the inside of a box. */
interface Span {
  readonly start: number;
  readonly end: number;
}

/** A box as it is measured where it stands: its inside, and where the box after it would start. */
interface Measured {
  readonly inside: Span;
  readonly next: number;
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

/** Whether the letters of `word` stand at `at`, one byte each. */
function spells(bytes: Uint8Array, at: number, word: string): boolean {
  for (let i = 0; i < word.length; i += 1) {
    if (bytes[at + i] !== word.charCodeAt(i)) return false;
  }
  return true;
}

/** Where `word` first stands at or after `from`, or -1. */
function find(bytes: Uint8Array, word: string, from: number): number {
  const firstLetter = word.charCodeAt(0);
  const last = bytes.length - word.length;
  for (let at = from; at <= last; at += 1) {
    // Most bytes are not the word's first letter: the rest is only looked at where one is.
    if (bytes[at] === firstLetter && spells(bytes, at, word)) return at;
  }
  return -1;
}

export class Mp4Dimensions {
  /**
   * The size of the video in `window`, a stretch of the file from its start
   * or up to its end, so a box may be cut by where the window stops. The
   * film box is found by its name wherever it stands, and since the word
   * "moov" may also stand in the film's data, each place is tried until one
   * gives a size.
   */
  public static read(window: Uint8Array): MediaDimensions | null {
    // A box's name comes after its four bytes of size: never before the fifth byte.
    let from = 4;
    for (;;) {
      const name = find(window, "moov", from);
      if (name === -1) return null;
      const size = Mp4Dimensions.sizeInFilm(window, name - 4);
      if (size !== null) return size;
      from = name + 4;
    }
  }

  /** The first size a track header gives, among the tracks of the film box that starts at `at`. */
  private static sizeInFilm(bytes: Uint8Array, at: number): MediaDimensions | null {
    const film = Mp4Dimensions.measure(bytes, at, bytes.length);
    if (film === null) return null;
    for (const track of Mp4Dimensions.insidesOf(bytes, film.inside, "trak")) {
      for (const header of Mp4Dimensions.insidesOf(bytes, track, "tkhd")) {
        const size = Mp4Dimensions.sizeInHeader(bytes, header);
        if (size !== null) return size;
      }
    }
    return null;
  }

  /**
   * The box at `at`, in something that ends at `end`. A box opens with its
   * size on four bytes (itself included) and its name on four letters. A
   * size of 0 means it runs to the end; a size of 1 means the size is
   * written on the eight bytes after the name, of which the last four are
   * read. A box that says it is longer than what holds it is cut there.
   * Null when the long size is cut, or the size is smaller than the opening.
   */
  private static measure(bytes: Uint8Array, at: number, end: number): Measured | null {
    let opening = 8;
    let size = big(bytes, at, 4);
    if (size === 0) {
      size = end - at;
    } else if (size === 1) {
      if (at + 16 > end) return null;
      opening = 16;
      size = big(bytes, at + 12, 4);
    }
    if (size < opening) return null;
    return { inside: { start: at + opening, end: Math.min(at + size, end) }, next: at + size };
  }

  /** The insides of the boxes of one name, among those laid end to end in `span`. The walk stops at a box that cannot be measured. */
  private static insidesOf(bytes: Uint8Array, span: Span, name: string): Span[] {
    const insides: Span[] = [];
    let at = span.start;
    while (at + 8 <= span.end) {
      const box = Mp4Dimensions.measure(bytes, at, span.end);
      if (box === null) break;
      if (spells(bytes, at + 4, name)) insides.push(box.inside);
      at = box.next;
    }
    return insides;
  }

  /**
   * The size a track header gives. Before its matrix the header holds 40
   * bytes, or 52 in version 1, which writes its two dates and its duration
   * on eight bytes each. The matrix is 36 bytes; the width and the height
   * follow, each a number whose first two bytes are its whole part. Null
   * when the header is cut before them, or a side is nothing (a sound track).
   */
  private static sizeInHeader(bytes: Uint8Array, header: Span): MediaDimensions | null {
    const matrixAt = header.start + (bytes[header.start] === 1 ? 52 : 40);
    const sidesAt = matrixAt + 36;
    if (sidesAt + 8 > header.end) return null;
    const width = big(bytes, sidesAt, 2);
    const height = big(bytes, sidesAt + 4, 2);
    return Mp4Dimensions.isOnItsSide(bytes, matrixAt) ? sized(height, width) : sized(width, height);
  }

  /**
   * Whether the matrix is a quarter turn, either way. Its first six numbers
   * are a, b, u, c, d, v: upright, a and d are one and b and c nothing; on
   * its side, a and d are nothing and b and c are not.
   */
  private static isOnItsSide(bytes: Uint8Array, matrixAt: number): boolean {
    const nothingAt = (at: number): boolean => big(bytes, at, 4) === 0;
    return nothingAt(matrixAt) && nothingAt(matrixAt + 16) && !nothingAt(matrixAt + 4) && !nothingAt(matrixAt + 12);
  }
}
