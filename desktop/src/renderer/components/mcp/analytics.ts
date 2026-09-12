import { LogReporterAction, reportYdAnalyzer } from '../../services/logReporter';
import type { McpServerConfig, McpServerFormData } from '../../types/mcp';

type AnalyticsValue = string | number | boolean | null | undefined;
type AnalyticsParams = Record<string, AnalyticsValue>;

export function getMcpSource(server: Pick<McpServerConfig, 'isBuiltIn' | 'registryId'>): string {
  if (server.isBuiltIn) return 'built_in';
  if (server.registryId) return 'marketplace';
  return 'custom';
}

export function getServerAnalyticsParams(server: McpServerConfig): AnalyticsParams {
  const envKeyCount = server.env ? Object.keys(server.env).length : 0;
  const headerKeyCount = server.headers ? Object.keys(server.headers).length : 0;
  return {
    mcpId: server.id,
    mcpName: server.name,
    mcpSource: getMcpSource(server),
    registryId: server.registryId,
    transportType: server.transportType,
    isBuiltIn: server.isBuiltIn,
    enabled: server.enabled,
    envKeyCount,
    headerKeyCount,
    argCount: server.args?.length ?? 0,
    hasUrl: Boolean(server.url),
    launchStatus: server.launchResolution?.status,
    resolverKind: server.launchResolution?.resolverKind,
    packageName: server.launchResolution?.packageName,
    requestedVersion: server.launchResolution?.requestedVersion,
    resolvedVersion: server.launchResolution?.resolvedVersion,
    hasLaunchError: Boolean(server.launchResolution?.error),
  };
}

export function getFormAnalyticsParams(data: McpServerFormData): AnalyticsParams {
  return {
    mcpName: data.name,
    mcpSource: data.isBuiltIn ? 'marketplace' : 'custom',
    registryId: data.registryId,
    transportType: data.transportType,
    isBuiltIn: Boolean(data.isBuiltIn),
    envKeyCount: data.env ? Object.keys(data.env).length : 0,
    headerKeyCount: data.headers ? Object.keys(data.headers).length : 0,
    argCount: data.args?.length ?? 0,
    hasUrl: Boolean(data.url),
  };
}

export function reportMcpAction(
  actionType: string,
  params: AnalyticsParams = {},
): void {
  console.debug('[MCP] reporting analytics action', actionType);
  void reportYdAnalyzer({
    action: LogReporterAction.McpAction,
    actionType,
    ...params,
  });
}
