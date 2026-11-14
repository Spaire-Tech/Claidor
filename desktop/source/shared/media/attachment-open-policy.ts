/**
 * An attachment's extension, as the rest of this folder sorts files by it:
 * what follows the last dot of the name, in small letters and without the
 * dot. Null when the name has no dot after its first character (".env",
 * "README") or ends with its dot ("notes."). Only what comes after the last
 * slash of either kind is the name.
 */
export function attachmentExtension(nameOrPath: string): string | null {
  const lastSlash = Math.max(nameOrPath.lastIndexOf("/"), nameOrPath.lastIndexOf("\\"));
  const lastDot = nameOrPath.lastIndexOf(".");
  const noDotInsideTheName = lastDot <= lastSlash + 1;
  const nothingAfterTheDot = lastDot === nameOrPath.length - 1;
  if (noDotInsideTheName || nothingAfterTheDot) return null;
  return nameOrPath.slice(lastDot + 1).toLowerCase();
}
