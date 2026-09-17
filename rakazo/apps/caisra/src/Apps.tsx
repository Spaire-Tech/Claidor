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
 * The mark on each tile is the address the provider serves on the catalogue
 * item; Caisra ships no service logos.
 *
 * Caisra's part is the surface: the five, then everything else behind a
 * search, on the thread's card.
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
  const rest = useMemo(() => filterConnectionCatalogItems(catalog, query), [catalog, query]);
  const shown = rest.slice(0, CONNECTION_CATALOG_PAGE_SIZE);

  return (
    <div className="apps">
      <div className="apps__lead">
        {featured.map((tile) => (
          <Tile
            key={tile.id}
            name={tile.label}
            {...(() => {
              const mark = markFor(tile.item?.logo, tile.id, tile.label);
              return mark ? { logo: mark } : {};
            })()}
            connected={tile.item?.connected ?? false}
            // A featured app the catalogue does not carry cannot be connected,
            // and says so rather than offering a button that fails.
            missing={tile.missing}
            onConnect={
              tile.item && onConnect
                ? () => onConnect(tile.item as ConnectionCatalogItem)
                : undefined
            }
          />
        ))}
      </div>

      <label className="apps__search">
        <span className="apps__searchmark">⌕</span>
        <input
          type="search"
          value={query}
          placeholder="Search apps"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {catalog.length === 0 ? (
        <p className="apps__empty">{EMPTY_PLUGIN_CATALOG_MESSAGE}</p>
      ) : (
        <div className="apps__grid">
          {shown.map((item) => (
            <Tile
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
        </div>
      )}
      {rest.length > shown.length ? (
        <p className="apps__more">
          {rest.length - shown.length} more. Keep typing to narrow it down.
        </p>
      ) : null}
    </div>
  );
}

function Tile({
  name,
  logo,
  connected,
  missing,
  onConnect,
}: {
  name: string;
  logo?: string;
  connected: boolean;
  missing?: boolean;
  onConnect?: () => void;
}) {
  // A catalogue address can be dead — a service drops its mark, a CDN moves
  // it — and the browser's broken-image glyph in a 38px tile looks like our
  // bug. The monogram is already the design's answer for a service with no
  // mark, so a failed one becomes a service with no mark.
  const [broken, setBroken] = useState(false);
  return (
    <div className={`apptile ${connected ? "apptile--on" : ""}`}>
      <span className="tile tile--app">
        {logo && !broken ? (
          <img src={logo} alt="" width={26} height={26} onError={() => setBroken(true)} />
        ) : (
          monogram(name)
        )}
      </span>
      <span className="apptile__name">{name}</span>
      {missing ? (
        <span className="apptile__state">Not in the catalogue</span>
      ) : connected ? (
        <span className="apptile__state apptile__state--on">Connected</span>
      ) : (
        <button type="button" className="apptile__connect" onClick={onConnect}>
          Connect
        </button>
      )}
    </div>
  );
}
