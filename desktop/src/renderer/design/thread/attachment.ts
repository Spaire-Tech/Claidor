import { basename, type KnownFile, PartKind, splitMessageParts } from './parts';
import { type AttachmentItem, FileKind, Speaker, ThreadItemKind } from './types';

/**
 * When a message is a file rather than a sentence about one.
 *
 * The managed prompt tells the agent to link every deliverable it
 * produces by absolute path, at the end of the reply. Most of the time a
 * link sits inside a sentence — *"the summary is in [report.docx](…)"* —
 * and the chip mechanism in `parts.ts` is exactly right for it.
 *
 * But a reply that is **only** the link came out as a bubble containing
 * one chip and nothing else: a text item pretending to be a file. That is
 * the shape `grok-bot-chat.md` §10.3 gives its own message type, and the
 * founder made it the sixth kind on 15 September — and then, the same
 * day, drew it: a card per file with the file's own icon, its name, and
 * a button to save a copy. *"send me the whole pack → all three."*
 *
 * So this is one decision, kept pure: which of a message's trailing lines
 * are files and nothing more? Those come off the end as cards, in order,
 * and whatever was said before them stays a bubble. Punctuation and list
 * markers do not count — a model writes "- [report.docx](…)." and a
 * message is not a sentence because of a bullet.
 */

/** Extensions worth showing rather than naming. */
const IMAGE = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;

/** What a line may carry besides its files and still be "just the files". */
const INCIDENTAL = /^[\s.,;:!?…—–-]*$/;

/** A list marker in front of a link, which a model adds and a card drops. */
const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)])\s+/;

export function isImagePath(path: string): boolean {
  return IMAGE.test(path);
}

/**
 * The kind of file a card shows an icon for, from the name.
 *
 * Only the ones the design drew — PDF, Word, Excel, PowerPoint. Anything
 * else is named and openable, behind a paperclip.
 */
export function fileKindOf(path: string): FileKind | undefined {
  const ext = /\.([a-z0-9]+)$/i.exec(basename(path))?.[1]?.toLowerCase();
  switch (ext) {
    case 'pdf': return FileKind.Pdf;
    case 'doc': case 'docx': return FileKind.Word;
    case 'xls': case 'xlsx': case 'csv': return FileKind.Excel;
    case 'ppt': case 'pptx': return FileKind.Slides;
    default: return undefined;
  }
}

/**
 * The service logo each Office kind draws (`design/logos`). PDF is not a
 * service; its icon is a file beside the card (`pdf-doc.webp`).
 */
export const FILE_LOGO: Readonly<Partial<Record<FileKind, string>>> = {
  [FileKind.Word]: 'word',
  [FileKind.Excel]: 'excel',
  [FileKind.Slides]: 'powerpoint',
};

export interface AttachmentFrom {
  id: string;
  from: Speaker;
  at: number;
  agentId?: string;
  agentName?: string;
}

export interface Peeled {
  /** What was said, with the files taken off the end. Empty when nothing was. */
  text: string;
  /** One card per file, in the order they were written. */
  attachments: AttachmentItem[];
}

/** The files a line amounts to, or nothing if the line says anything else. */
function filesOnLine(line: string, files: readonly KnownFile[]): { name: string; path: string }[] | undefined {
  const parts = splitMessageParts(line.replace(LIST_MARKER, ''), files);
  const named = parts.filter(part => part.kind === PartKind.File);
  if (!named.length) return undefined;
  // A chip with no path behind it is a file the conversation could not
  // find. Naming it as a card would offer to open something that is not
  // there, so the line stays a sentence.
  if (named.some(part => !part.target)) return undefined;
  const rest = parts.filter(part => part.kind !== PartKind.File).map(part => part.text).join('');
  if (!INCIDENTAL.test(rest)) return undefined;
  return named.map(part => ({ name: part.text || basename(part.target as string), path: part.target as string }));
}

/**
 * The cards at the end of a message, and the sentence before them.
 *
 * Trailing lines that are only files come off; the first line that says
 * something stops the peel, so a file named in passing stays a chip in
 * its sentence, which is the canvas's own mechanism and is not replaced.
 */
export function peelAttachments(
  text: string,
  meta: AttachmentFrom,
  files: readonly KnownFile[] = [],
): Peeled {
  const lines = text.split('\n');
  const found: { name: string; path: string }[][] = [];
  let end = lines.length;
  while (end > 0) {
    const line = lines[end - 1];
    if (!line.trim()) { end -= 1; continue; }
    const onLine = filesOnLine(line, files);
    if (!onLine) break;
    found.unshift(onLine);
    end -= 1;
  }
  const flat = found.flat();
  const said = lines.slice(0, end).join('\n').trim();
  const attachments = flat.map((file, index) => ({
    kind: ThreadItemKind.Attachment,
    // A message that is one file keeps the message's id, as it always
    // has; anything more is numbered after it.
    id: flat.length === 1 && !said ? meta.id : `${meta.id}:f${index}`,
    from: meta.from,
    name: file.name,
    path: file.path,
    at: meta.at,
    ...(isImagePath(file.path) ? { image: true } : {}),
    ...(fileKindOf(file.path) ? { file: fileKindOf(file.path) } : {}),
    ...(meta.agentId ? { agentId: meta.agentId } : {}),
    ...(meta.agentName ? { agentName: meta.agentName } : {}),
  } satisfies AttachmentItem));
  return { text: flat.length ? said : text, attachments };
}

/**
 * The one attachment a message amounts to, or nothing.
 *
 * Returns `undefined` for every message that has something to say, or
 * names more than one file. `peelAttachments` is the general form.
 */
export function attachmentFor(
  text: string,
  meta: AttachmentFrom,
  files: readonly KnownFile[] = [],
): AttachmentItem | undefined {
  const peeled = peelAttachments(text, meta, files);
  return !peeled.text && peeled.attachments.length === 1 ? peeled.attachments[0] : undefined;
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
