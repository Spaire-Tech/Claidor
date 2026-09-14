/**
 * Files going with a message.
 *
 * The app already has a convention for this and it predates the design:
 * `prepareCoworkPromptPayload` appends one line per attachment to the end
 * of the prompt — `Input Files: /abs/path` — and
 * `utils/userMessageFileAttachments.ts` parses those lines back out when a
 * message is rendered. Both halves are already here and already tested, so
 * this writes the same lines rather than inventing a second convention
 * that only the new shell would understand.
 *
 * The labels come from i18n at the call site, for the same reason: the
 * extractor matches on the exact strings the payload builder produces.
 */

export interface AttachmentLabels {
  /** `inputFileLabel` — "Input Files". */
  file: string;
  /** `inputFolderLabel` — "Input Folder". */
  folder: string;
}

/** The last segment of a path, on either kind of computer. */
export function basenameOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return (cut >= 0 ? trimmed.slice(cut + 1) : trimmed) || path;
}

/**
 * Whether a path names a folder, as far as its own text can say.
 *
 * A trailing separator, or a last segment with no extension. The picker
 * this reads from selects files, so this is a guard rather than the main
 * case — but a path with no dot in its name is far more likely a folder
 * than a file called `Reports`.
 */
export function looksLikeFolder(path: string): boolean {
  if (/[\\/]$/.test(path)) return true;
  return !/\.[A-Za-z0-9]{1,8}$/.test(basenameOf(path));
}

/**
 * One line per attachment, in the order they were added.
 *
 * Blank paths are dropped rather than written as a label with nothing
 * after it, which the extractor would not match and a person would read as
 * the app losing their file.
 */
export function attachmentLines(
  paths: readonly string[],
  labels: AttachmentLabels,
): string[] {
  return paths
    .map(path => path.trim())
    .filter(Boolean)
    .map(path => `${looksLikeFolder(path) ? labels.folder : labels.file}: ${path}`);
}
