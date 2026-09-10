import { describe, expect, test } from 'vitest';

import type { IMGatewayConfig } from '../../types/im';
import { DEFAULT_IM_CONFIG } from '../../types/im';
import type { McpServerConfig } from '../../types/mcp';
import { isChannelConfigured, isMcpEntryInstalled } from './connectionState';

const server = (overrides: Partial<McpServerConfig>): McpServerConfig => ({
  id: 'server-1',
  name: 'Gmail',
  enabled: true,
  transportType: 'stdio',
  ...overrides,
} as McpServerConfig);

describe('isMcpEntryInstalled', () => {
  test('is true when a server for the entry exists, whatever its enabled state', () => {
    const servers = [server({ registryId: 'gmail', enabled: false }), server({ id: 'server-2', name: 'Own' })];
    expect(isMcpEntryInstalled(servers, 'gmail')).toBe(true);
    expect(isMcpEntryInstalled(servers, 'notion')).toBe(false);
    expect(isMcpEntryInstalled([], 'gmail')).toBe(false);
  });
});

describe('isChannelConfigured', () => {
  test('is true when the platform has at least one instance', () => {
    expect(isChannelConfigured(DEFAULT_IM_CONFIG, 'telegram')).toBe(false);
    const config: IMGatewayConfig = {
      ...DEFAULT_IM_CONFIG,
      telegram: { instances: [{ instanceId: 'a', instanceName: 'A', enabled: true, botToken: 'x' } as never] },
    };
    expect(isChannelConfigured(config, 'telegram')).toBe(true);
    expect(isChannelConfigured(config, 'discord')).toBe(false);
  });

  test('is false for a platform without an instance list', () => {
    expect(isChannelConfigured(DEFAULT_IM_CONFIG, 'weixin')).toBe(false);
  });
});
