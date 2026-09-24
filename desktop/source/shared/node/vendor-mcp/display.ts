// Vendor connectors as the MCP manager's account rows (24 September 2026).
// The manager lists servers from an "account servers" provider, which was
// Cursor's dashboard; Claidor serves none, so the answer is empty or
// unavailable. These rows sit beside it: one per installed live vendor
// connector, with the vendor's endpoint as its HTTP config and one account
// slot whose `hasToken` is whether a credential is held. Everything after
// that — the needsAuth status, the connect card, AuthenticateMcpServer, the
// tools on the next message — is the manager's own code.

import { VENDOR_MCP_CONNECTORS, vendorMcpServerId } from "./catalog.js";
import { loadVendorMcpInstalls, type VendorMcpInstall } from "./installs.js";

export const VENDOR_MCP_CACHE_SCOPE = "vendor-mcp";

export interface VendorMcpAccountServer {
  readonly id: string;
  readonly name: string;
  readonly serverIdentifier: string;
  readonly config: { readonly url: string; readonly type: "http" };
  readonly isTeamServer: false;
  readonly disabledByTeamAdminPolicy: false;
  readonly pluginId: string;
  readonly accounts: readonly [{ readonly accountKey: "default"; readonly hasToken: boolean; readonly serverIdentifier: string }];
}

export function vendorAccountServersFromInstalls(installs: readonly VendorMcpInstall[]): VendorMcpAccountServer[] {
  const rows: VendorMcpAccountServer[] = [];
  for (const install of installs) {
    const connector = VENDOR_MCP_CONNECTORS.find((item) => item.id === install.id);
    const id = vendorMcpServerId(install.id);
    if (connector == null || connector.comingSoon === true || id == null) continue;
    rows.push({
      id,
      name: connector.name,
      serverIdentifier: install.id,
      config: { url: install.url, type: "http" },
      isTeamServer: false,
      disabledByTeamAdminPolicy: false,
      pluginId: install.id,
      accounts: [{ accountKey: "default", hasToken: install.credential != null, serverIdentifier: install.id }],
    });
  }
  return rows;
}

export function vendorAccountServers(rootDir: string): VendorMcpAccountServer[] {
  return vendorAccountServersFromInstalls(loadVendorMcpInstalls(rootDir));
}

export interface AccountServersDisplayLike {
  readonly servers: readonly unknown[];
  readonly cacheScope?: string;
  readonly unavailable?: true;
  readonly unresolvedServerIds?: string[];
}

/**
 * The merged provider. The base answer keeps its cache scope (the manager
 * resets on a scope change) and its unavailability when there is nothing of
 * ours to add; with vendor rows present the display is available, since
 * those rows do not depend on any server.
 */
// The manager resets its state, and cancels every pending sign-in watch,
// whenever the cache scope changes. The base scope is the account token's;
// when one read fails before it is known, the last seen scope is kept so a
// flicker in the account call cannot cancel a sign-in in progress.
const lastScopeByRoot = new Map<string, string>();

export async function withVendorAccountServers(
  base: Promise<AccountServersDisplayLike | null> | AccountServersDisplayLike | null,
  rootDir: () => string,
): Promise<AccountServersDisplayLike | null> {
  let resolved: AccountServersDisplayLike | null = null;
  try { resolved = await base; } catch { resolved = null; }
  const root = rootDir();
  if (resolved?.cacheScope != null) lastScopeByRoot.set(root, resolved.cacheScope);
  const vendor = vendorAccountServers(root);
  if (vendor.length === 0) return resolved;
  const baseServers = resolved?.unavailable === true ? [] : resolved?.servers ?? [];
  return {
    servers: [...baseServers, ...vendor],
    cacheScope: resolved?.cacheScope ?? lastScopeByRoot.get(root) ?? VENDOR_MCP_CACHE_SCOPE,
    ...(resolved?.unresolvedServerIds == null ? {} : { unresolvedServerIds: resolved.unresolvedServerIds }),
  };
}
