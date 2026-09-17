/**
 * The marks: ours first, the provider's second, a monogram last.
 *
 * Two kinds of file live in `logos/`, and they arrived for two reasons.
 *
 * **The four file marks** — Word, Excel, PowerPoint, PDF — are the founder's
 * 15 September design: *"its pdf excel and word. with their own svg."* They
 * belong to the design and there will always be four of them.
 *
 * **The service logos** are the ones cut for the connector cards, and they are
 * better than anything a catalogue returns: the right crop, the right weight,
 * no network. They are used wherever we have one.
 *
 * **The order matters, and it is the point of this file.** A connector draws
 * our mark when we ship one; otherwise the address the provider serves on the
 * catalogue item (Composio's `toolkit.logo`, Pipedream's `app.img_src`);
 * otherwise the monogram, which is what the design already draws for a service
 * with none. So the apps we care about look cut for the product, and a
 * catalogue of thousands still draws.
 *
 * No logo is ever fetched from an icon CDN or a favicon service. That was the
 * rule when these were cut and it still is: it would tell a third party which
 * services this person uses.
 *
 * Vite resolves the glob at build time into hashed urls, so nothing is read
 * from disk at runtime.
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
 * The slug a name resolves to: lower case, anything that is not a letter or a
 * digit becomes one hyphen. "Google Calendar" → `google-calendar`, which is
 * what the files are named and also what the catalogue's own slugs look like.
 */
export function slugOf(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A mark we ship, by slug or by name. Never a request. */
export function ourMark(...names: (string | undefined)[]): string | undefined {
  for (const name of names) {
    if (!name) continue;
    const found = BY_SLUG.get(slugOf(name));
    if (found) return found;
  }
  return undefined;
}

/**
 * What a tile should draw: our mark, else the catalogue's address, else
 * nothing and the caller shows the monogram.
 */
export function markFor(
  provided: string | null | undefined,
  ...names: (string | undefined)[]
): string | undefined {
  return ourMark(...names) ?? provided ?? undefined;
}

/** The letter shown when there is no mark at all. One character. */
export function monogram(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}
