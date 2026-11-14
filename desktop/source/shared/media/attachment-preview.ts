/**
 * Whether an attachment can be shown as text: first by its name, then by a
 * look at its first bytes, since a file named like text may hold anything.
 */
import { attachmentExtension } from "./attachment-open-policy.js";

/** The extensions whose files are shown as text. */
export const TEXT_PREVIEWABLE_EXTENSIONS = new Set([
  // Plain text, notes and writing.
  "txt", "text", "log", "md", "markdown", "mdx", "rst", "adoc", "tex",
  // Data and settings.
  "json", "jsonc", "json5", "ndjson", "csv", "tsv", "xml", "yaml", "yml", "toml", "ini", "cfg", "conf", "env", "properties", "plist", "gradle",
  // Pages and their styles.
  "html", "htm", "css", "scss", "sass", "less", "svg",
  // Code.
  "js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts",
  "py", "pyi", "rb", "go", "rs", "java", "kt", "kts", "c", "h", "cc", "cpp", "cxx", "hpp", "hh", "cs", "php", "swift", "scala", "dart", "lua", "pl", "pm", "r",
  "sql", "graphql", "gql", "proto", "vue", "svelte", "astro",
  // Scripts, and what describes a machine or a change.
  "sh", "bash", "zsh", "fish", "bat", "ps1", "tf", "tfvars", "dockerfile", "diff", "patch",
]);

/** By the name alone, and by the list as it is when asked. A name with no extension ("Dockerfile") is not text here. */
export function isTextPreviewableName(nameOrPath: string): boolean {
  const extension = attachmentExtension(nameOrPath);
  return extension !== null && TEXT_PREVIEWABLE_EXTENSIONS.has(extension);
}

/** How many of a file's first bytes are looked at. */
export const BINARY_SNIFF_BYTE_WINDOW = 8 * 1024;
/** The share of control bytes above which those bytes are not text. */
export const BINARY_CONTROL_BYTE_RATIO = 0.3;

/** A byte below a space that is neither a tab, a line end, nor one of the three between them. */
function isControlByte(byte: number): boolean {
  return byte < 32 && (byte < 9 || byte > 13);
}

/**
 * Whether bytes are something other than text: one zero byte among the
 * first 8,192 is enough, and so are control bytes in more than three of ten.
 * No bytes at all are not binary.
 */
export function looksLikeBinary(bytes: Uint8Array): boolean {
  const looked = bytes.subarray(0, BINARY_SNIFF_BYTE_WINDOW);
  if (looked.length === 0) return false;
  if (looked.includes(0)) return true;
  let controlBytes = 0;
  for (const byte of looked) {
    if (isControlByte(byte)) controlBytes += 1;
  }
  return controlBytes / looked.length > BINARY_CONTROL_BYTE_RATIO;
}
