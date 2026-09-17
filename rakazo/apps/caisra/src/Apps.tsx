import type { ConnectionCatalogItem } from "@rakazo/contracts";
import {
  buildFeaturedConnectorTiles,
  CONNECTION_CATALOG_PAGE_SIZE,
  EMPTY_PLUGIN_CATALOG_MESSAGE,
  filterConnectionCatalogItems,
} from "@rakazo/core";
import { useMemo, useState } from "react";
import { markFor, monogram } from "./marks.js";
import "./apps.css";

/**
 * Apps: what this account can reach.
 *
 * **The connectors are the fork's, whole.** Which five lead, how a catalogue
 * entry matches one of them, how search filters, how many come back in a page,
 * and what to say when the server has no catalogue configured — all of it is
 * `@rakazo/core`'s `featured-connectors`, called rather than reimplemented.
 *
 * **The screen is the founder's**, read out of
 * `desktop/src/renderer/design/shell/Apps.tsx` and `connections/Connections.tsx`
 * rather than arranged here: the title and the search on one row with the
 * search pinned right at `min(300px, 42%)`, then a sentence saying what a
 * connector is, then sections of cards on a `minmax(320px, 1fr)` grid. A card
 * is a 34px logo tile, the name, and a word on the right — blue "Connect",
 * green "Connected". Their note on that word is worth keeping: *"a word, not a
 * pill … the first build put grey statements where the button goes, and the
 * founder said it was 100% different from what they drew. It was."* An earlier
 * pass here shipped pill buttons and a full-width search under the featured
 * row, which is the same mistake a second time.
 *
 * The canvas also carries a Plugins/Agents segment beside the title. It is not
 * here because the second shelf is not: a tab that leads nowhere is the dead
 * control the whole design forbids.
 */
export function Apps({
  catalog,
  onConnect,
}: {
  catalog: readonly ConnectionCatalogItem[];
  onConnect?: (item: ConnectionCatalogItem) => void;
}) {
  const [query, setQuery] = useState("");
  const featured = useMemo(() => buildFeaturedConnectorTiles(catalog), [catalog]);
  const matched = useMemo(() => filterConnectionCatalogItems(catalog, query), [catalog, query]);
  const featuredIds = new Set(featured.map((tile) => tile.item?.connectorId).filter(Boolean));
  const rest = matched.filter((item) => !featuredIds.has(item.connectorId));
  const shown = rest.slice(0, CONNECTION_CATALOG_PAGE_SIZE);

  return (
    <div className="apps">
      <header className="apps__head">
        <h1 className="apps__title">Apps</h1>
        <label className="apps__search">
          <Search />
          <input
            type="search"
            value={query}
            placeholder="Search"
            aria-label="Search connectors"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </header>

      <div className="apps__body">
        <div className="apps__lede">
          <span className="apps__lede-name">Connectors</span>
          <span className="apps__lede-count">{catalog.length}</span>
        </div>
        <p className="apps__blurb">
          A connector lets your agent act inside a service you already use. Where there’s no
          connector it uses your computer and your browser instead, so nothing is out of reach.
        </p>

        {catalog.length === 0 ? (
          <p className="apps__empty">{EMPTY_PLUGIN_CATALOG_MESSAGE}</p>
        ) : (
          <>
            {/* The canvas puts a section per category with its count. The
                fork's catalogue item carries no category, so the two sections
                are the ones its own data supports: the five it features, and
                the rest. */}
            <Section title="Popular" count={featured.length}>
              {featured.map((tile) => (
                <Card
                  key={tile.id}
                  name={tile.label}
                  {...(() => {
                    const mark = markFor(tile.item?.logo, tile.id, tile.label);
                    return mark ? { logo: mark } : {};
                  })()}
                  connected={tile.item?.connected ?? false}
                  // A featured app the catalogue does not carry cannot be
                  // connected, and says so in the tag line rather than offering
                  // a button that fails.
                  {...(tile.missing ? { note: "Not in the catalogue" } : {})}
                  {...(tile.item && onConnect
                    ? { onConnect: () => onConnect(tile.item as ConnectionCatalogItem) }
                    : {})}
                />
              ))}
            </Section>

            {shown.length > 0 ? (
              <Section title="Everything else" count={rest.length}>
                {shown.map((item) => (
                  <Card
                    key={item.connectorId}
                    name={item.name}
                    {...(() => {
                      const mark = markFor(item.logo, item.slug, item.name);
                      return mark ? { logo: mark } : {};
                    })()}
                    connected={item.connected}
                    {...(onConnect ? { onConnect: () => onConnect(item) } : {})}
                  />
                ))}
              </Section>
            ) : (
              <p className="apps__empty">Nothing matches that search.</p>
            )}

            {rest.length > shown.length ? (
              <p className="apps__more">
                {rest.length - shown.length} more. Keep typing to narrow it down.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** A shelf: its name at 14.5 with a count beside it, then the grid of cards. */
function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="shelf">
      <div className="shelf__head">
        <span className="shelf__title">{title}</span>
        <span className="shelf__count">{count}</span>
      </div>
      <div className="shelf__grid">{children}</div>
    </section>
  );
}

function Card({
  name,
  logo,
  connected,
  note,
  onConnect,
}: {
  name: string;
  logo?: string;
  connected: boolean;
  /** Said under the name when there is no button, and only then. */
  note?: string;
  onConnect?: () => void;
}) {
  // A catalogue address can be dead — a service drops its mark, a CDN moves it
  // — and the browser's broken-image glyph in a 34px tile looks like our bug.
  // The monogram is already the design's answer for a service with no mark, so
  // a failed one becomes a service with no mark.
  const [broken, setBroken] = useState(false);
  return (
    <div className="appcard">
      <span className="appcard__mark">
        {logo && !broken ? (
          <img src={logo} alt="" width={21} height={21} onError={() => setBroken(true)} />
        ) : (
          monogram(name)
        )}
      </span>
      <span className="appcard__stack">
        <span className="appcard__name">{name}</span>
        {note ? <span className="appcard__note">{note}</span> : null}
      </span>
      {note ? null : connected ? (
        <button type="button" className="appcard__word appcard__word--on">
          Connected
        </button>
      ) : (
        <button type="button" className="appcard__word" onClick={onConnect}>
          Connect
        </button>
      )}
    </div>
  );
}

/** The canvas's search glyph. A glyph from a font is not an icon: `⌕` has no
 *  drawing in the faces macOS and Linux ship, which is how a header button once
 *  rendered as an empty rectangle. */
function Search() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      style={{ flex: "0 0 auto", display: "block" }}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}
