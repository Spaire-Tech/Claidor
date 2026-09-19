import type { SandMarketplacePlugin } from "../mcp/mcp-marketplace.js";
import { VENDOR_MCP_CONNECTORS, type VendorMcpConnector } from "./catalog.js";

export function vendorConnectorToPlugin(item: VendorMcpConnector): SandMarketplacePlugin {
  return {
    pluginId: item.id,
    name: item.id,
    displayName: item.name,
    description: item.description,
    category: item.category,
    logoUrl: undefined,
    homepage: item.url,
    sourceUrls: [],
    connectors: [{ name: item.name, description: item.description }],
    skills: [],
    variableFields: [],
    ...(item.url == null ? {} : { vendorMcpUrl: item.url }),
    ...(item.comingSoon === true ? { comingSoon: true } : {}),
  };
}

export async function fetchVendorMarketplacePlugins(
  getAccessToken?: unknown,
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
  return {
    plugins: VENDOR_MCP_CONNECTORS.map(vendorConnectorToPlugin),
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
