export const SAND_THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type SandThemePreference = (typeof SAND_THEME_PREFERENCES)[number];
export const DEFAULT_SAND_THEME_PREFERENCE: SandThemePreference = "system";
export function isSandThemePreference(value: unknown): value is SandThemePreference { return typeof value === "string" && (SAND_THEME_PREFERENCES as readonly string[]).includes(value); }
export function isSandDeepLinkPluginId(value: unknown): value is string { return typeof value === "string" && /^[0-9]{1,19}$/.test(value); }
/**
 * The URL scheme the app claims and the name it gives the server as
 * `redirectTarget`; the server builds `<scheme>://app/v1/open` from it
 * (server/polar/desktop/app_sign_in.py). It was `sand` until 23 September
 * 2026, which Grok Bot also claims; macOS gives a scheme to one app, so a
 * sign-in could land in the other. The packaged Info.plist claims the same
 * scheme (scripts/lib/config.mjs, reconstructedUrlScheme).
 */
export const SAND_DEEP_LINK_SCHEME = "simeon";
export const SAND_PLUGIN_DEEP_LINK_PATH = "/v1/plugin/add";
export function buildSandPluginDeepLink(pluginId: string): string { return `${SAND_DEEP_LINK_SCHEME}://app${SAND_PLUGIN_DEEP_LINK_PATH}?id=${encodeURIComponent(pluginId)}`; }
