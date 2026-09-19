import { COMPOSIO_CONNECTORS, type ComposioConnector } from "./catalog.js";
import type { ComposioApi } from "./composio-api.js";
import type { SandMarketplacePlugin } from "../mcp/mcp-marketplace.js";

export function composioConnectorToPlugin(item: ComposioConnector): SandMarketplacePlugin {
  return {
    pluginId: item.id,
    name: item.toolkit,
    displayName: item.name,
    description: item.description,
    category: item.category,
    logoUrl: undefined,
    homepage: `https://composio.dev/toolkits/${item.toolkit}`,
    sourceUrls: [],
    connectors: [{ name: item.name, description: item.description }],
    skills: [],
    variableFields: [],
    composioToolkit: item.toolkit,
  };
}

export async function fetchComposioMarketplacePlugins(
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
    plugins: COMPOSIO_CONNECTORS.map(composioConnectorToPlugin),
    includesPrivateMarketplaces: authenticated,
  };
}

export async function fetchComposioEffectivePlugins(api: ComposioApi): Promise<
  Array<{
    pluginId: string;
    name: string;
    displayName: string;
    installMode: "user";
    isEnabled: boolean;
  }>
> {
  try {
    const states = await api.listToolkitState();
    const connected = new Set(states.filter((state) => state.connected).map((state) => state.toolkit));
    return COMPOSIO_CONNECTORS.filter((item) => connected.has(item.toolkit)).map((item) => ({
      pluginId: item.id,
      name: item.toolkit,
      displayName: item.name,
      installMode: "user" as const,
      isEnabled: true,
    }));
  } catch {
    return [];
  }
}
