/**
 * The file marks: four of them, bundled.
 *
 * The founder's 15 September design, *"its pdf excel and word. with their own
 * svg."* A spreadsheet wears the spreadsheet's mark, a deck the deck's. These
 * are shipped rather than fetched because they belong to the design, not to a
 * catalogue, and there are four of them for ever.
 *
 * **Service logos are not here, and are not ours to ship.** An earlier pass
 * bundled forty-one of them beside these four. That was both more code and
 * less coverage: the connector catalogue this app draws from runs to thousands
 * of apps and carries a mark for each one, on `ConnectionCatalogItem.logo` and
 * on the `app_connect` block. Caisra draws the address the catalogue gives it,
 * and falls back to the monogram the block itself carries.
 *
 * Vite resolves the glob at build time into hashed urls, so nothing is read
 * from disk at runtime.
 */

const FILES = import.meta.glob<string>("./filemarks/*.webp", {
  eager: true,
  import: "default",
  query: "?url",
});

const BY_NAME: ReadonlyMap<string, string> = new Map(
  Object.entries(FILES).map(([path, url]) => [
    path.replace(/^\.\/filemarks\//, "").replace(/\.webp$/, ""),
    url,
  ]),
);

/** The bundled mark for a file kind's logo name, or undefined. Never a request. */
export function fileMarkUrl(name: string): string | undefined {
  return BY_NAME.get(name);
}

/** The letter a tile shows when a service has no mark. One character. */
export function monogram(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}
