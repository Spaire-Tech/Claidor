export const McpIpcChannel = {
  List: 'mcp:list',
  Create: 'mcp:create',
  Update: 'mcp:update',
  Delete: 'mcp:delete',
  DeleteByRegistryId: 'mcp:deleteByRegistryId',
  SetEnabled: 'mcp:setEnabled',
  SetEnabledByRegistryId: 'mcp:setEnabledByRegistryId',
  RetryLaunchResolution: 'mcp:retryLaunchResolution',
  Changed: 'mcp:changed',
} as const;
export type McpIpcChannel = typeof McpIpcChannel[keyof typeof McpIpcChannel];
