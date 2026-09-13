import { ipcMain } from 'electron';

import { McpIpcChannel } from '../../../shared/mcp/constants';
import { normalizeMcpServerUrlInput } from '../../../shared/mcp/url';
import { OpenClawConfigImpact } from '../../libs/openclawConfigImpact';
import type { McpRuntime } from '../../mcp/mcpRuntime';
import type { McpServerFormData } from '../../mcp/mcpStore';

export interface McpHandlerDeps {
  getMcpRuntime: () => McpRuntime;
  syncOpenClawConfig: (options: {
    reason: string;
    restartGatewayIfRunning?: boolean;
    expectedImpact?: OpenClawConfigImpact;
  }) => Promise<{ success: boolean; changed: boolean }>;
}

function syncMcpConfig(
  syncOpenClawConfig: McpHandlerDeps['syncOpenClawConfig'],
  reason: string,
): void {
  syncOpenClawConfig({
    reason,
    expectedImpact: OpenClawConfigImpact.Restart,
  }).catch(err =>
    console.error('[MCP] config sync error:', err),
  );
}

function normalizeMcpServerInput(data: Partial<McpServerFormData>): Partial<McpServerFormData> {
  if (
    (data.transportType === 'sse' || data.transportType === 'http')
    && data.url !== undefined
  ) {
    const normalized = normalizeMcpServerUrlInput(data.url);
    if (!normalized.ok) {
      throw new Error('MCP server URL must be an absolute HTTP or HTTPS URL.');
    }
    return { ...data, url: normalized.url };
  }
  return data;
}

export function registerMcpHandlers(deps: McpHandlerDeps): void {
  const { getMcpRuntime, syncOpenClawConfig } = deps;

  ipcMain.handle(McpIpcChannel.List, () => {
    try {
      const servers = getMcpRuntime().getStore().listServers();
      return { success: true, servers };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list MCP servers',
      };
    }
  });

  ipcMain.handle(
    McpIpcChannel.Create,
    async (
      _event,
      data: {
        name: string;
        description: string;
        transportType: string;
        command?: string;
        args?: string[];
        env?: Record<string, string>;
        url?: string;
        headers?: Record<string, string>;
      },
    ) => {
      try {
        const mcpRuntime = getMcpRuntime();
        const normalizedData = normalizeMcpServerInput(data as McpServerFormData) as McpServerFormData;
        const server = mcpRuntime.getStore().createServer(normalizedData);
        if (server.enabled) {
          mcpRuntime.ensureLaunchResolution(server.id, 'mcp-server-created');
        }
        const servers = mcpRuntime.getStore().listServers();
        syncMcpConfig(syncOpenClawConfig, 'mcp-server-created');
        return { success: true, servers };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create MCP server',
        };
      }
    },
  );

  ipcMain.handle(
    McpIpcChannel.Update,
    async (
      _event,
      id: string,
      data: {
        name?: string;
        description?: string;
        transportType?: string;
        command?: string;
        args?: string[];
        env?: Record<string, string>;
        url?: string;
        headers?: Record<string, string>;
      },
    ) => {
      try {
        const mcpRuntime = getMcpRuntime();
        const normalizedData = normalizeMcpServerInput(data as Partial<McpServerFormData>);
        const server = mcpRuntime.getStore().updateServer(id, normalizedData);
        if (server?.enabled) {
          mcpRuntime.ensureLaunchResolution(server.id, 'mcp-server-updated');
        }
        const servers = mcpRuntime.getStore().listServers();
        syncMcpConfig(syncOpenClawConfig, 'mcp-server-updated');
        return { success: true, servers };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update MCP server',
        };
      }
    },
  );

  ipcMain.handle(McpIpcChannel.Delete, async (_event, id: string) => {
    try {
      const mcpRuntime = getMcpRuntime();
      mcpRuntime.getStore().deleteServer(id);
      const servers = mcpRuntime.getStore().listServers();
      syncMcpConfig(syncOpenClawConfig, 'mcp-server-deleted');
      return { success: true, servers };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete MCP server',
      };
    }
  });

  ipcMain.handle(McpIpcChannel.DeleteByRegistryId, async (_event, registryId: string) => {
    try {
      const normalizedRegistryId = registryId.trim();
      if (!normalizedRegistryId) {
        throw new Error('MCP registry id is required');
      }
      const mcpRuntime = getMcpRuntime();
      const store = mcpRuntime.getStore();
      const matchingServers = store
        .listServers()
        .filter(server => server.registryId === normalizedRegistryId);
      for (const server of matchingServers) {
        store.deleteServer(server.id);
      }
      const servers = store.listServers();
      syncMcpConfig(syncOpenClawConfig, 'mcp-registry-deleted');
      return { success: true, servers };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete MCP registry servers',
      };
    }
  });

  ipcMain.handle(McpIpcChannel.SetEnabled, async (_event, options: { id: string; enabled: boolean }) => {
    try {
      const mcpRuntime = getMcpRuntime();
      mcpRuntime.getStore().setEnabled(options.id, options.enabled);
      if (options.enabled) {
        mcpRuntime.ensureLaunchResolution(options.id, 'mcp-server-enabled');
      }
      const servers = mcpRuntime.getStore().listServers();
      syncMcpConfig(syncOpenClawConfig, 'mcp-server-toggled');
      return { success: true, servers };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update MCP server',
      };
    }
  });

  ipcMain.handle(
    McpIpcChannel.SetEnabledByRegistryId,
    async (_event, options: { registryId: string; enabled: boolean }) => {
      try {
        const normalizedRegistryId = options.registryId.trim();
        if (!normalizedRegistryId) {
          throw new Error('MCP registry id is required');
        }
        const mcpRuntime = getMcpRuntime();
        const store = mcpRuntime.getStore();
        const matchingServers = store
          .listServers()
          .filter(server => server.registryId === normalizedRegistryId);
        for (const server of matchingServers) {
          store.setEnabled(server.id, options.enabled);
          if (options.enabled) {
            mcpRuntime.ensureLaunchResolution(server.id, 'mcp-registry-enabled');
          }
        }
        const servers = store.listServers();
        syncMcpConfig(syncOpenClawConfig, 'mcp-registry-toggled');
        return { success: true, servers };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update MCP registry servers',
        };
      }
    },
  );

  ipcMain.handle(McpIpcChannel.RetryLaunchResolution, async (_event, id: string) => {
    try {
      const mcpRuntime = getMcpRuntime();
      await mcpRuntime.getLaunchResolverManager().retry(id);
      const servers = mcpRuntime.getStore().listServers();
      syncMcpConfig(syncOpenClawConfig, 'mcp-launch-manual-retry');
      return { success: true, servers };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retry MCP launch resolution',
      };
    }
  });

}
