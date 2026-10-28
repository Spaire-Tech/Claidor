// Files for the apps Simeon Labs' server serves (28 October 2026). A tool
// that takes a file (Gmail's and Outlook's `attachment`, a Drive upload,
// a file posted to Slack) wants the provider's own reference to a file it
// already holds, `{name, mimetype, s3key}`, and nothing the agent could
// write. The server lists such a field as the path of a file on the
// computer (`file_uploadable`, server `apps.py`); here, before the call, each
// path is read from the agent's computer, uploaded through the server
// (`POST …/apps/<toolkit>/files`) and swapped for the reference it returns.
// Until then the agent had no way to attach a file at all: the founder's
// reply carrying a company document was sent by Outlook calls that could
// not have attached it.

/** The most a file may weigh: Gmail's and Outlook's limit for a whole message. */
export const APP_FILE_MAX_BYTES = 25 * 1024 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value != null && !Array.isArray(value);

/** A schema node and the variants it may stand for (`anyOf`, `oneOf`, `allOf`), flattened. */
function variants(schema: unknown): Record<string, unknown>[] {
  if (!isRecord(schema)) return [];
  const nested = ["anyOf", "oneOf", "allOf"].flatMap((key) => (Array.isArray(schema[key]) ? (schema[key] as unknown[]).flatMap(variants) : []));
  return [schema, ...nested];
}

/** Whether a tool's arguments carry any absolute path at all: most calls carry none and skip the rest. */
export function carriesPath(value: unknown): boolean {
  if (typeof value === "string") return value.startsWith("/");
  if (Array.isArray(value)) return value.some(carriesPath);
  if (isRecord(value)) return Object.values(value).some(carriesPath);
  return false;
}

/**
 * The arguments with every path its schema marks as a file replaced by what
 * `upload` makes of it. A list of files is each uploaded. Anything else is
 * passed as it came, so a field that is not a file is never read.
 */
export async function withAppFiles(schema: unknown, value: unknown, upload: (path: string) => Promise<unknown>): Promise<unknown> {
  const nodes = variants(schema);
  if (typeof value === "string") return nodes.some((node) => node.file_uploadable === true) ? await upload(value) : value;
  if (Array.isArray(value)) {
    const items = nodes.flatMap((node) => variants(node.items));
    if (items.length === 0) return value;
    const out: unknown[] = [];
    for (const item of value) out.push(await withAppFiles({ anyOf: items }, item, upload));
    return out;
  }
  if (isRecord(value)) {
    const properties: Record<string, unknown[]> = {};
    for (const node of nodes) {
      if (!isRecord(node.properties)) continue;
      for (const [key, property] of Object.entries(node.properties)) (properties[key] ??= []).push(property);
    }
    if (Object.keys(properties).length === 0) return value;
    const out: Record<string, unknown> = { ...value };
    for (const [key, item] of Object.entries(value)) {
      const property = properties[key];
      if (property != null) out[key] = await withAppFiles({ anyOf: property }, item, upload);
    }
    return out;
  }
  return value;
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pages: "application/vnd.apple.pages",
  numbers: "application/vnd.apple.numbers",
  key: "application/vnd.apple.keynote",
  rtf: "application/rtf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  html: "text/html",
  htm: "text/html",
  json: "application/json",
  xml: "application/xml",
  ics: "text/calendar",
  vcf: "text/vcard",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

/** A file's type from its name, as the provider asks for it ("application/pdf", never "pdf"). */
export function appFileMimeType(name: string): string {
  const dot = name.lastIndexOf(".");
  return (dot < 0 ? undefined : MIME_TYPES[name.slice(dot + 1).toLowerCase()]) ?? "application/octet-stream";
}

/** The file's own name, the last part of its path. */
export function appFileName(path: string): string {
  return path.split("/").filter((part) => part.length > 0).pop() ?? path;
}
