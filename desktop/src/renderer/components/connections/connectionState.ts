/**
 * « Connected » is never a stored flag: it is read from the app's real
 * state. These are the two readings, pure so they can be tested.
 */
import type { Platform } from '@shared/platform/constants';

import type { IMGatewayConfig } from '../../types/im';
import type { McpServerConfig } from '../../types/mcp';

/** A catalogue server is installed when a server for that entry exists. */
export const isMcpEntryInstalled = (servers: readonly McpServerConfig[], entryId: string): boolean => (
  servers.some((server) => server.registryId === entryId)
);

/** A channel is configured when at least one instance exists in IM settings. */
export const isChannelConfigured = (config: IMGatewayConfig, platform: Platform): boolean => {
  const platformConfig = config[platform as keyof IMGatewayConfig] as { instances?: unknown } | undefined;
  return Array.isArray(platformConfig?.instances) && platformConfig.instances.length > 0;
};
