import { rememberPluginLogoUrl } from "../marketplace/marketplace-logo-registry.js";
import { CONNECTOR_LOGOS } from "./logo-data.js";

// Each connector's own product mark, embedded (6 October 2026). Until then
// four Google products carried the same Google "G" and 45 connectors were
// fetched live from Google's favicon service, which answers a generic icon
// for a product domain such as slides.google.com. The pictures live in
// brand/connector-logos/ and `scripts/make-connector-logos.mjs` writes them
// into logo-data.ts; `tests/connector-logos.test.mjs` keeps every catalog
// id covered.
export function vendorPluginLogoUrl(id: string): string | undefined {
  const dataUrl = CONNECTOR_LOGOS[id];
  if (dataUrl == null) return undefined;
  rememberPluginLogoUrl(dataUrl);
  return dataUrl;
}
