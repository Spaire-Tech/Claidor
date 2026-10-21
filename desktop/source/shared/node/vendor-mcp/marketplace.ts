import type { SandMarketplacePlugin } from "../mcp/mcp-marketplace.js";
import { say } from "../../say.js";
import { languageCode, normalizeUserLanguage } from "../../user-language.js";
import { CATALOG_FR, CATALOG_GROUPS_FR } from "../../words/areas/catalog.js";
import { VENDOR_MCP_CONNECTORS, VENDOR_MCP_GROUP, type VendorMcpConnector } from "./catalog.js";
import { isAppsServiceAvailable } from "./apps-availability.js";
import { vendorPluginLogoUrl } from "./logos.js";
import { VENDOR_MCP_SOURCES } from "./sources.js";

export function vendorConnectorToPlugin(item: VendorMcpConnector): SandMarketplacePlugin {
  return {
    pluginId: item.id,
    name: item.id,
    displayName: item.name,
    description: item.description,
    category: item.category,
    logoUrl: vendorPluginLogoUrl(item.id),
    // View Source: where the vendor's server comes from (`sources.ts`), never the server's own address, which a
    // browser cannot open; Link's and Shop's own pages; nothing for an app our server serves.
    homepage: item.appsToolkit != null ? undefined : (VENDOR_MCP_SOURCES[item.id] ?? (item.boxCli == null ? undefined : item.url)),
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
  return { id: item.id, name: item.name, category: item.category, description: say(undefined, "catalog.comingSoon", { description: item.description }), comingSoon: true, ...(item.appsToolkit == null ? {} : { appsToolkit: item.appsToolkit }) };
}

/** Each language's connector words, by connector id and group key; English is the catalog's own. */
const CATALOG_WORDS: Readonly<Record<string, { readonly descriptions: Readonly<Record<string, string>>; readonly groups: Readonly<Record<string, string>> }>> = {
  fr: { descriptions: CATALOG_FR, groups: CATALOG_GROUPS_FR },
};
const GROUP_KEYS: ReadonlyMap<string, string> = new Map(Object.entries(VENDOR_MCP_GROUP).map(([key, name]) => [name, key]));
const CONNECTORS_BY_ID: ReadonlyMap<string, VendorMcpConnector> = new Map(VENDOR_MCP_CONNECTORS.map((item) => [item.id, item]));

/**
 * The connectors list the apps show, in the person's language (20 October
 * 2026, docs/localization.md): each connector's description and group, and
 * an app not served yet with its "Coming soon." in front. English, no
 * language, a connector with no translation and anything not from the
 * catalog (the person's own servers) stay as they are; the views given are
 * not changed (the catalog keeps them cached).
 */
export function vendorCatalogInLanguage<View extends { readonly id: string; readonly description?: string; readonly category?: string; readonly connectors?: unknown[] }>(views: readonly View[], language: string | null | undefined): View[] {
  const tag = normalizeUserLanguage(language);
  const words = tag == null ? undefined : (CATALOG_WORDS[tag] ?? CATALOG_WORDS[languageCode(tag)]);
  if (words == null) return [...views];
  return views.map((view) => {
    const item = CONNECTORS_BY_ID.get(view.id);
    if (item == null) return view;
    const translated = words.descriptions[item.id];
    const describe = (text: string): string => {
      if (translated == null) return text;
      if (text === item.description) return translated;
      if (text === say(undefined, "catalog.comingSoon", { description: item.description })) return say(tag, "catalog.comingSoon", { description: translated });
      return text;
    };
    const groupKey = view.category == null ? undefined : GROUP_KEYS.get(view.category);
    const group = groupKey == null ? undefined : words.groups[groupKey];
    const connectors = view.connectors?.map((connector) => {
      const row = connector as { readonly description?: unknown } | null;
      return row != null && typeof row === "object" && typeof row.description === "string" ? { ...row, description: describe(row.description) } : connector;
    });
    return {
      ...view,
      ...(view.description == null ? {} : { description: describe(view.description) }),
      ...(group == null ? {} : { category: group }),
      ...(connectors == null ? {} : { connectors }),
    };
  });
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
