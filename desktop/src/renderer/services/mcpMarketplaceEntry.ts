/**
 * One entry of Claidor's MCP catalogue by id, for a card that wants to open
 * the install form without carrying the whole marketplace: the cached copy
 * of the last fetch first, a live fetch when the cache has nothing.
 */
import { mcpRegistry } from '../data/mcpRegistry';
import type { McpRegistryEntry } from '../types/mcp';
import { mcpService } from './mcp';
import { mergeMarketplaceRegistry } from './mcpRegistryPresentation';

const findInRegistry = (registry: McpRegistryEntry[], entryId: string): McpRegistryEntry | undefined => (
  mergeMarketplaceRegistry(registry, mcpRegistry).find((entry) => entry.id === entryId)
);

export const findMcpMarketplaceEntry = async (entryId: string): Promise<McpRegistryEntry | null> => {
  const cached = mcpService.getCachedMarketplace();
  if (cached) {
    const entry = findInRegistry(cached.registry, entryId);
    if (entry) return entry;
  }
  const fetched = await mcpService.fetchMarketplace();
  if (!fetched) return null;
  return findInRegistry(fetched.registry, entryId) ?? null;
};
