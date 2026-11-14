/**
 * How a file is shown when the person opens it, told from its name: as a
 * picture, a video, a sound, a PDF, a table, JSON, Markdown, a Word file,
 * plain text, or not at all.
 */
import { AUDIO_MIME_FROM_EXTENSION, IMAGE_MIME_FROM_EXTENSION, VIDEO_MIME_FROM_EXTENSION } from "./media-extensions.js";
import { attachmentExtension } from "./attachment-open-policy.js";
import { isTextPreviewableName } from "./attachment-preview.js";

export type FilePreviewKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "table"
  | "json"
  | "markdown"
  | "docx"
  | "text"
  | "unknown";

/** The extensions a table of media types names, written as `attachmentExtension` gives them: without the dot. */
function extensionsOf(table: Readonly<Record<string, string>>): string[] {
  return Object.keys(table).map((extension) => extension.slice(1));
}

/**
 * The way each known extension is shown. It is filled once, when this file
 * is loaded, from the most particular way to the least: an extension that
 * could be shown two ways (an SVG is a picture and a text) keeps the first.
 */
const KIND_BY_EXTENSION = new Map<string, FilePreviewKind>();

function shownAs(kind: FilePreviewKind, extensions: readonly string[]): void {
  for (const extension of extensions) {
    if (!KIND_BY_EXTENSION.has(extension)) KIND_BY_EXTENSION.set(extension, kind);
  }
}

shownAs("image", extensionsOf(IMAGE_MIME_FROM_EXTENSION));
shownAs("video", extensionsOf(VIDEO_MIME_FROM_EXTENSION));
shownAs("audio", extensionsOf(AUDIO_MIME_FROM_EXTENSION));
shownAs("pdf", ["pdf"]);
shownAs("table", ["csv", "tsv", "xlsx", "xls"]);
shownAs("json", ["json"]);
shownAs("markdown", ["md", "markdown", "mdx"]);
shownAs("docx", ["docx"]);

export function getFilePreviewKind(nameOrPath: string): FilePreviewKind {
  const extension = attachmentExtension(nameOrPath);
  if (extension === null) return "unknown";
  const known = KIND_BY_EXTENSION.get(extension);
  if (known !== undefined) return known;
  // Text is asked last, and of the list of text extensions as it is now.
  return isTextPreviewableName(nameOrPath) ? "text" : "unknown";
}

/** The ways of showing a file that need its bytes read first; a picture, a video and a sound are shown from where they are. */
const KINDS_READ_FIRST: ReadonlySet<FilePreviewKind> = new Set<FilePreviewKind>(["pdf", "table", "docx", "text", "json", "markdown"]);

export function previewKindNeedsBytes(kind: FilePreviewKind): boolean {
  return KINDS_READ_FIRST.has(kind);
}
