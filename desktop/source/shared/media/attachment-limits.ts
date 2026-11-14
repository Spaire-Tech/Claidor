/**
 * How large a file may be to be attached: one limit for videos, a smaller
 * one for everything else, and the words that say a file is over it.
 */
import { VIDEO_MIME_FROM_EXTENSION, extensionOf } from "./media-extensions.js";

export const BYTES_PER_MB = 1024 * 1024;
export const ATTACHMENT_BYTE_LIMIT = 25 * BYTES_PER_MB;
export const VIDEO_BYTE_LIMIT = 200 * BYTES_PER_MB;

/** A limit, and how the notice names the files it is for. */
interface Limit {
  readonly bytes: number;
  readonly forWhat: string;
}

const LIMIT_FOR_VIDEO: Limit = { bytes: VIDEO_BYTE_LIMIT, forWhat: " for video" };
const LIMIT_FOR_THE_REST: Limit = { bytes: ATTACHMENT_BYTE_LIMIT, forWhat: "" };

/** A name is a video's by its extension alone; the file is not opened. */
export function nameLooksLikeVideo(name: string): boolean {
  return VIDEO_MIME_FROM_EXTENSION[extensionOf(name)] !== undefined;
}

function limitFor(name: string): Limit {
  return nameLooksLikeVideo(name) ? LIMIT_FOR_VIDEO : LIMIT_FOR_THE_REST;
}

export function attachmentByteLimitForName(name: string): number {
  return limitFor(name).bytes;
}

/** Bytes as whole megabytes, to the nearest one. */
export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / BYTES_PER_MB)} MB`;
}

/** What the person is told when a file is over its limit. */
export function formatAttachmentTooLargeNotice(filename: string): string {
  const limit = limitFor(filename);
  return `"${filename}" is too large to attach (max ${formatMegabytes(limit.bytes)}${limit.forWhat}).`;
}

/** Thrown when a file is over its limit; `limitBytes` is the limit it was held to. */
export class AttachmentTooLargeError extends Error {
  readonly limitBytes: number;

  constructor(limitBytes: number) {
    super(`Attachment exceeds ${limitBytes} bytes.`);
    this.limitBytes = limitBytes;
    this.name = "AttachmentTooLargeError";
  }
}
