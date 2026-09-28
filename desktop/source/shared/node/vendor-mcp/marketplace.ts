import type { SandMarketplacePlugin } from "../mcp/mcp-marketplace.js";
import { VENDOR_MCP_CONNECTORS, type VendorMcpConnector } from "./catalog.js";
import { isAppsServiceAvailable } from "./apps-availability.js";
import { vendorPluginLogoUrl } from "./logos.js";

export function vendorConnectorToPlugin(item: VendorMcpConnector): SandMarketplacePlugin {
  return {
    pluginId: item.id,
    name: item.id,
    displayName: item.name,
    description: item.description,
    category: item.category,
    logoUrl: vendorPluginLogoUrl(item.id),
    // An app our server serves has no homepage of its own; its url is our MCP address.
    homepage: item.appsToolkit == null ? item.url : undefined,
    sourceUrls: [],
    connectors: [{ name: item.name, description: item.description }],
    skills: [],
    variableFields: [],
    ...(item.url == null || item.comingSoon === true ? {} : { vendorMcpUrl: item.url }),
    ...(item.comingSoon === true ? { comingSoon: true } : {}),
  };
}

/** An app shown while our server cannot serve apps: Coming soon, with no address to connect to. */
export function appComingSoon(item: VendorMcpConnector): VendorMcpConnector {
  return { id: item.id, name: item.name, category: item.category, description: `Coming soon. ${item.description}`, comingSoon: true, ...(item.appsToolkit == null ? {} : { appsToolkit: item.appsToolkit }) };
}

export async function fetchVendorMarketplacePlugins(
  getAccessToken?: unknown,
  _getMachineId?: unknown,
  options: { readonly appsAvailable?: (getAccessToken: () => Promise<unknown>) => Promise<boolean> } = {},
): Promise<{ plugins: SandMarketplacePlugin[]; includesPrivateMarketplaces: boolean }> {
  let authenticated = false;
  if (typeof getAccessToken === "function") {
    try {
      const token = await (getAccessToken as () => Promise<unknown>)();
      authenticated = typeof token === "string" && token.length > 0;
    } catch {
      authenticated = false;
    }
  }
  // The apps our server serves offer Connect only when it answers that it serves them (`apps-availability.ts`).
  let appsAvailable = false;
  if (authenticated) {
    const tokenFn = getAccessToken as () => Promise<unknown>;
    try { appsAvailable = await (options.appsAvailable ?? ((get) => isAppsServiceAvailable({ getAccessToken: get })))(tokenFn); } catch { appsAvailable = false; }
  }
  return {
    plugins: VENDOR_MCP_CONNECTORS.map((item) => vendorConnectorToPlugin(item.appsToolkit != null && !appsAvailable ? appComingSoon(item) : item)),
    includesPrivateMarketplaces: authenticated,
  };
}

export async function fetchVendorEffectivePlugins(
  installed: ReadonlySet<string>,
): Promise<Array<{
  pluginId: string;
  name: string;
  displayName: string;
  installMode: "user";
  isEnabled: boolean;
}>> {
  return VENDOR_MCP_CONNECTORS.filter((item) => installed.has(item.id) && item.comingSoon !== true).map((item) => ({
    pluginId: item.id,
    name: item.id,
    displayName: item.name,
    installMode: "user" as const,
    isEnabled: true,
  }));
}
