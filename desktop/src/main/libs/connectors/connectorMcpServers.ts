/**
 * The engine's side of a connection (docs/maties/connectors.md, section 4):
 * one MCP server entry per connected service, pointing at Claidor and at
 * nothing else.
 *
 * Claidor holds the connector service's developer key and pins the external
 * user id to the person the session belongs to. That key is project-wide —
 * whoever holds it can reach every customer's accounts — so it is never on
 * this machine, in this config, or in a log.
 *
 * **The engine carries no credential at all, not even the person's own.** The
 * entries point at the loopback token proxy this app already runs for model
 * calls (`openclawTokenProxy.ts`), which attaches the live Claidor session
 * token per request and refreshes it on a 401. Writing the token into the
 * config instead — even as an environment placeholder — would have broken
 * every connection within the hour, because `DESKTOP_ACCESS_TOKEN_TTL` is one
 * hour and the gateway's environment is fixed when it is spawned; repairing it
 * would have forced a hard gateway restart each time the token turned over.
 */

import { connectorProxyMcpRoute } from '../../../shared/connectors/constants';

/** Every connector server key starts with this, so the managed set is recognisable. */
export const CONNECTOR_SERVER_KEY_PREFIX = 'claidor-';

/** OpenClaw's name for an MCP server reached over HTTP. */
export const CONNECTOR_MCP_TRANSPORT = 'streamable-http';

/** Service names are carried into a config key, so only these characters pass. */
const SAFE_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** The proxy runs on this machine only; anything else means a misconfiguration. */
const LOOPBACK_ORIGIN_PATTERN = /^http:\/\/(127\.0\.0\.1|\[::1\]|localhost):\d{1,5}$/;

export const connectorServerKey = (slug: string): string => (
  `${CONNECTOR_SERVER_KEY_PREFIX}${slug}`
);

/** True when a key in `mcp.servers` is one of ours rather than the person's own. */
export const isConnectorServerKey = (key: string): boolean => (
  key.startsWith(CONNECTOR_SERVER_KEY_PREFIX)
);

/**
 * Pure: the `mcp.servers` entries for the services a person has connected.
 *
 * `proxyBaseUrl` is the loopback token proxy's origin, e.g.
 * `http://127.0.0.1:54321`, and never Claidor's own address: the proxy is
 * what holds the live session token. An https address here would mean the
 * engine talking to Claidor directly with no credential and every call
 * refused, so a non-loopback origin is dropped rather than written.
 */
export const buildConnectorMcpServers = (
  proxyBaseUrl: string,
  slugs: readonly string[],
): Record<string, Record<string, unknown>> => {
  const base = proxyBaseUrl.replace(/\/+$/, '');
  if (!base) return {};
  if (!LOOPBACK_ORIGIN_PATTERN.test(base)) {
    console.warn('[Connectors] refused to write connector servers for a non-loopback proxy origin');
    return {};
  }
  const servers: Record<string, Record<string, unknown>> = {};
  for (const slug of [...new Set(slugs)].sort()) {
    if (!SAFE_SLUG_PATTERN.test(slug)) {
      console.warn(`[Connectors] skipped a connected service whose name is not usable: ${slug}`);
      continue;
    }
    servers[connectorServerKey(slug)] = {
      // No `headers`: the proxy attaches the live token per request.
      url: `${base}${connectorProxyMcpRoute(slug)}`,
      transport: CONNECTOR_MCP_TRANSPORT,
    };
  }
  return servers;
};
