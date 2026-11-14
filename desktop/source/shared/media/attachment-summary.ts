/**
 * What sort of thing an attachment is (a picture, a PDF, a table…), for the
 * line that says what was sent: told from its media type when it has one
 * that tells, else from its name, else from its address or path.
 */
import { attachmentExtension } from "./attachment-open-policy.js";
import { getFilePreviewKind, type FilePreviewKind } from "./file-preview-kind.js";
import type { SandAttachmentKind } from "./attachments.js";

/** Every sort but "file", which is what is left when nothing tells. */
type ToldKind = Exclude<SandAttachmentKind, "file">;

/** Media types sorted by how they start, whatever follows the slash. */
const KIND_BY_TYPE_START: ReadonlyArray<readonly [string, ToldKind]> = [
  ["image/", "image"],
  ["video/", "video"],
  ["audio/", "audio"],
];

/** Media types sorted by their whole name. */
const KIND_BY_TYPE = new Map<string, ToldKind>([
  ["application/pdf", "pdf"],
  ["text/markdown", "markdown"],
  ["text/csv", "table"],
  ["text/tab-separated-values", "table"],
  ["application/vnd.ms-excel", "table"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "table"],
  ["application/json", "json"],
  ["application/msword", "document"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "document"],
  ["application/zip", "archive"],
  ["application/x-zip-compressed", "archive"],
  ["application/gzip", "archive"],
  ["application/x-tar", "archive"],
  ["application/x-bzip2", "archive"],
  ["application/x-xz", "archive"],
  ["application/zstd", "archive"],
  ["application/x-7z-compressed", "archive"],
  ["application/x-rar-compressed", "archive"],
  ["application/vnd.rar", "archive"],
]);

/**
 * The sort a media type tells, or null when it tells none. The type is read
 * up to its first semicolon, without the spaces around it, in any capitals.
 * A picture, a video or a sound is known by how the type starts; then come
 * the types known by their whole name, any type that ends in "+json", and
 * last any other text.
 */
export function classifyMimeType(rawMimeType: string): Exclude<SandAttachmentKind, "file"> | null {
  const parameters = rawMimeType.indexOf(";");
  const named = parameters === -1 ? rawMimeType : rawMimeType.slice(0, parameters);
  const type = named.trim().toLowerCase();
  for (const [start, kind] of KIND_BY_TYPE_START) {
    if (type.startsWith(start)) return kind;
  }
  const byName = KIND_BY_TYPE.get(type);
  if (byName !== undefined) return byName;
  if (type.endsWith("+json")) return "json";
  if (type.startsWith("text/")) return "text";
  return null;
}

/** The path of an address, or null for what does not read as one. */
function pathOfAddress(source: string): string | null {
  try {
    return new URL(source).pathname;
  } catch {
    return null;
  }
}

/** A path with its "%20" and the like read as the characters they stand for; left as it is when one of them is broken. */
function withEscapesRead(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * What an extension is looked for in. Of an address it is the path, with
 * its escapes read where they can be; anything that is no address is taken
 * as it is.
 */
export function extensionSubject(source: string): string {
  const path = pathOfAddress(source);
  return path === null ? source : withEscapesRead(path);
}

/** The ways a file is shown that are also what it is called here. A Word file is a document. */
const KIND_BY_PREVIEW: Readonly<Record<Exclude<FilePreviewKind, "text" | "unknown">, ToldKind>> = {
  image: "image",
  video: "video",
  audio: "audio",
  pdf: "pdf",
  markdown: "markdown",
  table: "table",
  json: "json",
  docx: "document",
};

/** Text files that are JSON all the same. */
const JSON_TEXT_EXTENSIONS = new Set(["json", "jsonc", "json5", "ndjson"]);
/** Files that are shown no way at all and are known as packed files. */
const ARCHIVE_EXTENSIONS = new Set(["zip", "tar", "gz", "tgz", "bz2", "tbz2", "xz", "txz", "zst", "7z", "rar"]);

/** Whether the name's extension is one of a set; a name with no extension is in none. */
function hasExtensionIn(extensions: ReadonlySet<string>, nameOrPath: string): boolean {
  const extension = attachmentExtension(nameOrPath);
  return extension !== null && extensions.has(extension);
}

/** The sort a name, a path or an address tells by its extension, or null when it tells none. */
export function classifyPathLike(source: string): Exclude<SandAttachmentKind, "file"> | null {
  const subject = extensionSubject(source);
  const shown = getFilePreviewKind(subject);
  if (shown === "text") return hasExtensionIn(JSON_TEXT_EXTENSIONS, subject) ? "json" : "text";
  if (shown === "unknown") return hasExtensionIn(ARCHIVE_EXTENSIONS, subject) ? "archive" : null;
  return KIND_BY_PREVIEW[shown];
}

export interface AttachmentClassificationSource {
  readonly mimeType?: string | null;
  readonly fileName?: string | null;
  readonly urlOrPath?: string | null;
}

/** What a clue tells, when there is a clue: one that is missing or empty tells nothing. */
function toldBy(clue: string | null | undefined, sort: (clue: string) => ToldKind | null): ToldKind | null {
  return clue != null && clue.length > 0 ? sort(clue) : null;
}

/** The first of the type, the name and the address that tells; a later one is not looked at. A plain file when none does. */
export function classifyAttachment(source: AttachmentClassificationSource): SandAttachmentKind {
  return toldBy(source.mimeType, classifyMimeType) ?? toldBy(source.fileName, classifyPathLike) ?? toldBy(source.urlOrPath, classifyPathLike) ?? "file";
}

/** How many attachments there are of each sort, each sort once, in the order it first came. */
export function countAttachmentKinds(kinds: readonly SandAttachmentKind[]): Array<{ kind: SandAttachmentKind; count: number }> {
  const counts = new Map<SandAttachmentKind, number>();
  for (const kind of kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  return Array.from(counts, ([kind, count]) => ({ kind, count }));
}
