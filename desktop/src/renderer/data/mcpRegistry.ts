import { McpRegistryEntry } from '../types/mcp';

/**
 * App-managed MCP registry entries.
 *
 * Marketplace content comes from the server (`mcpService.fetchMarketplace`,
 * cached in localStorage between sessions) — it is deliberately NOT mirrored
 * here, so there is a single source of truth for names, descriptions and the
 * server list itself. This file only holds entries the server payload cannot
 * express, such as flows managed by the app, which `mergeMarketplaceRegistry`
 * re-inserts into whatever the server returns. Swen ships none: the upstream
 * Qichacha (Chinese company data) bundle was removed.
 */
export const mcpRegistry: McpRegistryEntry[] = [];

/**
 * Category fallbacks with their i18n keys, used until the server list (which
 * carries its own localized names) has loaded.
 */
export const mcpCategories = [
  { id: 'all', key: 'mcpCategoryAll' },
  { id: 'search', key: 'mcpCategorySearch' },
  { id: 'developer', key: 'mcpCategoryDeveloper' },
  { id: 'productivity', key: 'mcpCategoryProductivity' },
  { id: 'browser', key: 'mcpCategoryBrowser' },
  { id: 'design', key: 'mcpCategoryDesign' },
  { id: 'data-api', key: 'mcpCategoryDataApi' },
] as const;
