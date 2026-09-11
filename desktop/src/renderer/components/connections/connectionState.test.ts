import type { ConnectorsState } from '@shared/connectors/constants';
import { describe, expect, test } from 'vitest';

import type { IMGatewayConfig } from '../../types/im';
import { DEFAULT_IM_CONFIG } from '../../types/im';
import {
  ConnectionCardState,
  findConnectorConnection,
  isChannelConfigured,
  readConnectionCard,
} from './connectionState';

const connectors = (overrides: Partial<ConnectorsState> = {}): ConnectorsState => ({
  entitled: true,
  connections: [],
  loaded: true,
  ...overrides,
});

const gmail = { slug: 'gmail', accountId: 'account-1', connectedAt: '2026-09-11T08:00:00Z' };

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

describe('findConnectorConnection', () => {
  test('finds the account Claidor reports for a service', () => {
    const state = connectors({ connections: [gmail] });
    expect(findConnectorConnection(state, 'gmail')).toBe(gmail);
    expect(findConnectorConnection(state, 'notion')).toBeUndefined();
  });
});

describe('readConnectionCard', () => {
  test('shows nothing until Claidor has answered once', () => {
    expect(readConnectionCard('gmail', connectors({ loaded: false })).state)
      .toBe(ConnectionCardState.Unknown);
  });

  test('offers Connect when the person is entitled and nothing is connected', () => {
    expect(readConnectionCard('gmail', connectors()).state).toBe(ConnectionCardState.Connect);
  });

  test('shows the price when connections are not part of the plan', () => {
    expect(readConnectionCard('gmail', connectors({ entitled: false })).state)
      .toBe(ConnectionCardState.Locked);
  });

  test('shows the account once it is connected', () => {
    const reading = readConnectionCard('gmail', connectors({ connections: [gmail] }));
    expect(reading.state).toBe(ConnectionCardState.Connected);
    expect(reading.connection).toBe(gmail);
  });

  test('a connected account stays connected even when entitlement lapses', () => {
    const reading = readConnectionCard('gmail', connectors({ entitled: false, connections: [gmail] }));
    expect(reading.state).toBe(ConnectionCardState.Connected);
  });

  test('the service being worked on is busy, and only that one', () => {
    const state = connectors();
    expect(readConnectionCard('gmail', state, 'gmail').state).toBe(ConnectionCardState.Busy);
    expect(readConnectionCard('notion', state, 'gmail').state).toBe(ConnectionCardState.Connect);
  });

  test('two cards naming one service read the same', () => {
    const state = connectors({ connections: [{ ...gmail, slug: 'notion' }] });
    expect(readConnectionCard('notion', state).state).toBe(ConnectionCardState.Connected);
  });
});
