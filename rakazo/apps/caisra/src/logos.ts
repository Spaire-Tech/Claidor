/**
 * Service and file logos, bundled — and never fetched.
 *
 * Moved across from `desktop/src/renderer/design/logos`, where the rule was
 * set and the reason for it written down: the founder's canvas resolved a
 * missing logo by asking `icons.duckduckgo.com` and then Google's favicon
 * service, and that must not ship. It tells two third parties which services
 * the app offers and, on a connected row, which ones this person uses; the
 * instruction is to track nothing at all; and a screen that should be instant
 * would wait on someone else's server.
 *
 * So a logo is a file we ship or it is nothing, and nothing is already
 * designed: the tile draws the service's initial instead. Vite resolves the
 * glob at build time into hashed urls, so nothing is read from disk at
 * runtime either.
 */

const FILES = import.meta.glob<string>("./logos/*.{webp,svg,jpg}", {
  eager: true,
  import: "default",
  query: "?url",
});

const BY_SLUG: ReadonlyMap<string, string> = new Map(
  Object.entries(FILES).map(([path, url]) => [
    path.replace(/^\.\/logos\//, "").replace(/\.(webp|svg|jpg)$/, ""),
    url,
  ]),
);

/**
 * The slug a service name resolves to: lower case, anything that is not a
 * letter or a digit becomes a single hyphen. "Google Calendar" →
 * `google-calendar`, which is what the files are named.
 */
export function logoSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The bundled logo for a service or a file kind, or undefined. Never a request. */
export function logoUrl(name: string): string | undefined {
  return BY_SLUG.get(logoSlug(name));
}

/** The letter a tile shows when we ship no file. One character; the name is beside it. */
export function logoMonogram(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}
