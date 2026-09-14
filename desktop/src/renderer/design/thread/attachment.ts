import { basename, type KnownFile, PartKind, splitMessageParts } from './parts';
import { type AttachmentItem, Speaker, ThreadItemKind } from './types';

/**
 * When a message is a file rather than a sentence about one.
 *
 * The managed prompt tells the agent to link every deliverable it
 * produces by absolute path. Most of the time that link sits inside a
 * sentence — *"the summary is in [report.docx](…)"* — and the chip
 * mechanism in `parts.ts` is exactly right for it.
 *
 * But a reply that is **only** the link came out as a bubble containing
 * one chip and nothing else: a text item pretending to be a file. That is
 * the shape `grok-bot-chat.md` §10.3 gives its own message type, and the
 * founder made it the sixth kind on 15 September.
 *
 * So this is one decision, kept pure: does this message's text amount to
 * a file and nothing more? Punctuation does not count — a model writes
 * "[report.docx](…)." with a full stop, and a message is not a sentence
 * because of a full stop.
 */

/** Extensions worth showing rather than naming. */
const IMAGE = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;

/** What a message may carry besides the file and still be "just the file". */
const INCIDENTAL = /^[\s.,;:!?…—–-]*$/;

export function isImagePath(path: string): boolean {
  return IMAGE.test(path);
}

export interface AttachmentFrom {
  id: string;
  from: Speaker;
  at: number;
  agentId?: string;
  agentName?: string;
}

/**
 * The attachment a message amounts to, or nothing.
 *
 * Returns `undefined` for every message that has something to say, which
 * is almost all of them. A file named in passing stays a chip inside the
 * sentence, which is the canvas's own mechanism and is not being replaced.
 */
export function attachmentFor(
  text: string,
  meta: AttachmentFrom,
  files: readonly KnownFile[] = [],
): AttachmentItem | undefined {
  const parts = splitMessageParts(text, files);
  const named = parts.filter(part => part.kind === PartKind.File);
  if (named.length !== 1) return undefined;

  const path = named[0].target;
  // A chip with no path behind it is a file the conversation could not
  // find. Naming it as an attachment would offer to open something that
  // is not there, so it stays a sentence.
  if (!path) return undefined;

  const rest = parts
    .filter(part => part.kind !== PartKind.File)
    .map(part => part.text)
    .join('');
  if (!INCIDENTAL.test(rest)) return undefined;

  return {
    kind: ThreadItemKind.Attachment,
    id: meta.id,
    from: meta.from,
    name: named[0].text || basename(path),
    path,
    at: meta.at,
    ...(isImagePath(path) ? { image: true } : {}),
    ...(meta.agentId ? { agentId: meta.agentId } : {}),
    ...(meta.agentName ? { agentName: meta.agentName } : {}),
  };
}

/**
 * A size a person reads, or nothing.
 *
 * "1.4 MB", not "1468006 bytes". Absent rather than "0 B" when the size
 * is unknown, because a file card claiming a file is empty is worse than
 * one that does not mention size at all.
 */
export function readableSize(bytes: number | undefined): string | undefined {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return undefined;
  if (bytes < 1000) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
