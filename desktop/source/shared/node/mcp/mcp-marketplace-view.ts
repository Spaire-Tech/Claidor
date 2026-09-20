import type { SandMarketplacePlugin } from "./mcp-marketplace.js";

export function marketplacePluginToView(plugin: SandMarketplacePlugin) {
  return {
    id: plugin.pluginId,
    name: plugin.name,
    displayName: plugin.displayName,
    description: plugin.description,
    category: plugin.category,
    homepage: plugin.homepage,
    iconUrl: plugin.logoUrl,
    connectors: plugin.connectors,
    skills: plugin.skills,
    ...(plugin.variableFields.length > 0
      ? { fields: plugin.variableFields }
      : {}),
    ...(plugin.marketplace == null ? {} : { marketplace: plugin.marketplace }),
    ...(plugin.publisher == null ? {} : { publisher: plugin.publisher }),
    ...(plugin.composioToolkit == null ? {} : { composioToolkit: plugin.composioToolkit }),
    ...(plugin.vendorMcpUrl == null ? {} : { vendorMcpUrl: plugin.vendorMcpUrl }),
    ...(plugin.comingSoon === true ? { comingSoon: true } : {}),
  };
}

export async function bestEffortCatalogToken(getAccessToken: unknown): Promise<string | undefined> {
  if (typeof getAccessToken !== "function") return undefined;
  try {
    const token = await (getAccessToken as () => Promise<unknown>)();
    return typeof token === "string" && token.length > 0 ? token : undefined;
  } catch {
    return undefined;
  }
}
