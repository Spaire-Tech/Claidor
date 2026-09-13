import type { McpServerConfig } from '../types/mcp';

/**
 * How the person's own MCP servers are laid out on the Apps screen.
 *
 * The marketplace is gone, so there is no catalogue to read names and
 * descriptions from. What survives is the grouping: a bundle installed before
 * the clear-out wrote several servers under one `registryId`, and those still
 * belong together on one card rather than scattered as separate servers.
 */
export type McpInstalledItem =
  | { kind: 'server'; id: string; server: McpServerConfig }
  | {
    kind: 'registryGroup';
    id: string;
    registryId: string;
    servers: McpServerConfig[];
  };

export function buildInstalledMcpItems(
  servers: McpServerConfig[],
): McpInstalledItem[] {
  const serversByRegistryId = new Map<string, McpServerConfig[]>();

  for (const server of servers) {
    if (!server.registryId) continue;
    const registryServers = serversByRegistryId.get(server.registryId) ?? [];
    registryServers.push(server);
    serversByRegistryId.set(server.registryId, registryServers);
  }

  const groupedRegistryIds = new Set<string>();
  for (const [registryId, registryServers] of serversByRegistryId) {
    if (registryServers.length > 1) groupedRegistryIds.add(registryId);
  }

  const insertedGroups = new Set<string>();
  const items: McpInstalledItem[] = [];
  for (const server of servers) {
    const registryId = server.registryId;
    if (registryId && groupedRegistryIds.has(registryId)) {
      if (!insertedGroups.has(registryId)) {
        items.push({
          kind: 'registryGroup',
          id: registryId,
          registryId,
          servers: serversByRegistryId.get(registryId) ?? [server],
        });
        insertedGroups.add(registryId);
      }
      continue;
    }
    items.push({ kind: 'server', id: server.id, server });
  }

  return items;
}
