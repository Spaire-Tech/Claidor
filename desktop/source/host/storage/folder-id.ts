/**
 * Which ids may name a folder under the data root. An id is joined to a
 * path as it is, so it has to be one plain name: nothing in it may lead
 * out of the folder it is meant for.
 */

/** What a name cannot hold: either path separator, or the zero byte that ends a path. */
const NOT_IN_A_NAME = ["/", "\\", "\0"] as const;

/** The two names every folder already has, for itself and for the folder above it. */
const TAKEN_NAMES: ReadonlySet<string> = new Set([".", ".."]);

export function isSafeFolderId(id: unknown): id is string {
  if (typeof id !== "string" || id === "") return false;
  if (TAKEN_NAMES.has(id)) return false;
  return NOT_IN_A_NAME.every((mark) => !id.includes(mark));
}
