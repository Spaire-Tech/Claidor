/**
 * Service logos, bundled — and never fetched.
 *
 * The canvas resolves a logo it has no file for by asking
 * `icons.duckduckgo.com`, then `www.google.com/s2/favicons`. That must
 * not ship, for three reasons and any one of them is enough:
 *
 * - it tells DuckDuckGo and Google which services the app offers, and on
 *   the installed-connectors row, which ones this person actually uses;
 * - the founder's instruction is to track nothing at all, and an
 *   outbound request per card is tracking whether or not we read the
 *   answer;
 * - a screen that should be instant waits on two third parties.
 *
 * So a logo is a file we ship or it is nothing, and nothing is already
 * designed: the canvas draws a monogram tile — the service's initial on
 * `--fsr-fill-raised` — behind every logo, and reveals it when the image
 * does not load. That fallback is the whole reason this can be strict.
 *
 * Vite resolves these globs at build time into hashed asset urls, so
 * nothing is read from disk at runtime either.
 */

const FILES = import.meta.glob<string>(
  ['./*.webp', './*.svg'],
  { eager: true, import: 'default', query: '?url' },
);

/** `gmail` → the bundled url, or undefined when we ship no file for it. */
const BY_SLUG: ReadonlyMap<string, string> = new Map(
  Object.entries(FILES).map(([path, url]) => [
    path.replace(/^\.\//, '').replace(/\.(webp|svg)$/, ''),
    url,
  ]),
);

/**
 * The slug a service name resolves to: lower case, spaces and punctuation
 * to single hyphens. "Google Calendar" → `google-calendar`, which is what
 * the extracted files are named.
 */
export function logoSlug(serviceName: string): string {
  return serviceName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The bundled logo for a service, or undefined. Never a network call. */
export function logoUrl(serviceName: string): string | undefined {
  return BY_SLUG.get(logoSlug(serviceName));
}

/**
 * The letter shown when there is no file. One character, because the tile
 * is 42px and the design puts the name beside it anyway.
 */
export function logoMonogram(serviceName: string): string {
  return (serviceName.trim()[0] ?? '?').toUpperCase();
}

/** Which services we ship a logo for. Used by the test that lists the gaps. */
export function bundledLogoSlugs(): readonly string[] {
  return [...BY_SLUG.keys()].sort();
}
