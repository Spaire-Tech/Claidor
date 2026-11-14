/**
 * The sorts of attachment the product tells apart, and the words that say
 * how many of which were sent: "3 images", "Sent 2 files · 1 image, 1 PDF".
 */

export const SAND_ATTACHMENT_KINDS = ["image", "video", "audio", "pdf", "markdown", "table", "json", "text", "document", "archive", "file"] as const;

export type SandAttachmentKind = (typeof SAND_ATTACHMENT_KINDS)[number];

/** How many attachments of a sort there are. The sort is whatever the sender called it, known here or not. */
export interface AttachmentKindCount {
  readonly kind: string;
  readonly count: number;
}

/** What one attachment of a sort is called, and what several are. */
const WORDS: Readonly<Record<SandAttachmentKind, { readonly one: string; readonly several: string }>> = {
  image: { one: "image", several: "images" },
  video: { one: "video", several: "videos" },
  audio: { one: "audio file", several: "audio files" },
  pdf: { one: "PDF", several: "PDFs" },
  markdown: { one: "Markdown file", several: "Markdown files" },
  table: { one: "spreadsheet", several: "spreadsheets" },
  json: { one: "JSON file", several: "JSON files" },
  text: { one: "text file", several: "text files" },
  document: { one: "document", several: "documents" },
  archive: { one: "archive", several: "archives" },
  file: { one: "file", several: "files" },
};

/** A count and its sort in words: "1 image", "3 images". Only a count of exactly one takes the singular. */
export function kindPhrase(kind: SandAttachmentKind, count: number): string {
  const words = WORDS[kind];
  return `${count} ${count === 1 ? words.one : words.several}`;
}

/**
 * The counts added up by sort, in the order each sort first comes. A count
 * that is not above zero is left out, and a sort that is not one of ours
 * counts as "file".
 */
export function mergeKindCounts(kinds: readonly AttachmentKindCount[] | null | undefined): Array<{ kind: SandAttachmentKind; count: number }> {
  if (kinds == null || kinds.length === 0) {
    return [];
  }
  const totals = new Map<SandAttachmentKind, number>();
  for (const entry of kinds.filter((counted) => counted.count > 0)) {
    const sort = Object.hasOwn(WORDS, entry.kind) ? (entry.kind as SandAttachmentKind) : "file";
    totals.set(sort, (totals.get(sort) ?? 0) + entry.count);
  }
  return Array.from(totals, ([kind, count]) => ({ kind, count }));
}

/**
 * The line that says what was sent. The count is taken as a whole number of
 * at least one. With one sort it is a count of that sort ("Sent 3 images");
 * with none it is a count of files ("Sent 3 files"); with several, the sorts
 * follow the count of files, each with its own count
 * ("Sent 3 files · 2 images, 1 PDF").
 */
export function formatAttachmentSentSummary(count: number, kinds?: readonly AttachmentKindCount[] | null): string {
  const total = Math.max(1, Math.floor(count));
  const sorts = mergeKindCounts(kinds);
  const [only] = sorts;
  if (sorts.length === 1 && only !== undefined) {
    return `Sent ${kindPhrase(only.kind, total)}`;
  }
  const files = `Sent ${kindPhrase("file", total)}`;
  if (sorts.length === 0) {
    return files;
  }
  return `${files} · ${sorts.map((sort) => kindPhrase(sort.kind, sort.count)).join(", ")}`;
}
