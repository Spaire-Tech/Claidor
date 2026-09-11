/**
 * The engine's side of a connection (docs/maties/connectors.md, section 4):
 * one MCP server entry per connected service, pointing at Claidor and at
 * nothing else.
 *
 * Claidor holds the connector service's developer key and pins the external
 * user id to the person the session belongs to. That key is project-wide —
 * whoever holds it can reach every customer's accounts — so it is never on
 * this machine, in this config, or in a log. The engine carries only the
 * person's own Claidor session token, and even that is written as a `${VAR}`
 * placeholder resolved from the gateway's environment, so no token is stored
 * on disk.
 */

import { connectorMcpRoute } from '../../../shared/connectors/constants';

/** The gateway environment variable holding the person's Claidor session token. */
export const CONNECTORS_TOKEN_ENV_VAR = 'LOBSTER_CONNECTORS_TOKEN';

/** The value written into the config; the real token never appears there. */
export const CONNECTORS_TOKEN_PLACEHOLDER = `\${${CONNECTORS_TOKEN_ENV_VAR}}`;

/** Set on the gateway when nobody is signed in, so a stale config cannot crash it. */
export const CONNECTORS_TOKEN_UNCONFIGURED = 'unconfigured';

/** Every connector server key starts with this, so the managed set is recognisable. */
export const CONNECTOR_SERVER_KEY_PREFIX = 'claidor-';

/** OpenClaw's name for an MCP server reached over HTTP. */
export const CONNECTOR_MCP_TRANSPORT = 'streamable-http';

/** Service names are carried into a config key, so only these characters pass. */
const SAFE_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export const connectorServerKey = (slug: string): string => (
  `${CONNECTOR_SERVER_KEY_PREFIX}${slug}`
);

/** True when a key in `mcp.servers` is one of ours rather than the person's own. */
export const isConnectorServerKey = (key: string): boolean => (
  key.startsWith(CONNECTOR_SERVER_KEY_PREFIX)
);

/**
 * Pure: the `mcp.servers` entries for the services a person has connected.
 * `serverBaseUrl` is Claidor's account protocol base, e.g.
 * `https://api.claidor.com/desktop`.
 */
export const buildConnectorMcpServers = (
  serverBaseUrl: string,
  slugs: readonly string[],
): Record<string, Record<string, unknown>> => {
  const base = serverBaseUrl.replace(/\/+$/, '');
  if (!base) return {};
  const servers: Record<string, Record<string, unknown>> = {};
  for (const slug of [...new Set(slugs)].sort()) {
    if (!SAFE_SLUG_PATTERN.test(slug)) {
      console.warn(`[Connectors] skipped a connected service whose name is not usable: ${slug}`);
      continue;
    }
    servers[connectorServerKey(slug)] = {
      url: `${base}${connectorMcpRoute(slug)}`,
      transport: CONNECTOR_MCP_TRANSPORT,
      headers: { authorization: `Bearer ${CONNECTORS_TOKEN_PLACEHOLDER}` },
    };
  }
  return servers;
};
