import { describe, expect, test } from 'vitest';

import {
  buildConnectorMcpServers,
  CONNECTOR_MCP_TRANSPORT,
  connectorServerKey,
  isConnectorServerKey,
} from './connectorMcpServers';

/** The loopback token proxy's origin: what the engine is pointed at. */
const PROXY = 'http://127.0.0.1:54321';

describe('buildConnectorMcpServers', () => {
  test('writes one entry per connected service, pointing at the loopback proxy', () => {
    expect(buildConnectorMcpServers(PROXY, ['gmail'])).toEqual({
      'claidor-gmail': {
        url: 'http://127.0.0.1:54321/connectors/mcp/gmail',
        transport: CONNECTOR_MCP_TRANSPORT,
      },
    });
  });

  test('writes no credential at all, not even the person\'s own', () => {
    // The session token lives an hour and the gateway's environment is fixed
    // at spawn, so a token here — even as a placeholder — would go stale and
    // force a hard restart to repair. The proxy attaches the live one instead.
    const written = JSON.stringify(
      buildConnectorMcpServers(PROXY, ['gmail', 'slack_v2', 'notion']),
    );
    expect(written).not.toMatch(/pipedream/i);
    expect(written).not.toMatch(/project|client_secret|developer/i);
    expect(written).not.toMatch(/bearer|authorization|token|\$\{/i);
    for (const entry of Object.values(buildConnectorMcpServers(PROXY, ['gmail']))) {
      expect(entry).not.toHaveProperty('headers');
    }
  });

  test('reaches only this machine, whatever the service', () => {
    const servers = buildConnectorMcpServers(PROXY, ['gmail', 'microsoft_teams']);
    expect(Object.keys(servers)).toHaveLength(2);
    for (const entry of Object.values(servers)) {
      expect(new URL(entry.url as string).hostname).toBe('127.0.0.1');
    }
  });

  test('refuses to write entries for anywhere but the loopback proxy', () => {
    // Claidor's own address here would mean the engine calling it with no
    // credential and every request refused, so nothing is written at all.
    expect(buildConnectorMcpServers('https://api.claidor.com/desktop', ['gmail'])).toEqual({});
    expect(buildConnectorMcpServers('http://10.0.0.5:54321', ['gmail'])).toEqual({});
    expect(buildConnectorMcpServers('http://127.0.0.1.evil.com:80', ['gmail'])).toEqual({});
  });

  test('is stable: same services, same entries, whatever the order', () => {
    expect(buildConnectorMcpServers(PROXY, ['notion', 'gmail', 'notion']))
      .toEqual(buildConnectorMcpServers(PROXY, ['gmail', 'notion']));
    expect(Object.keys(buildConnectorMcpServers(PROXY, ['notion', 'gmail'])))
      .toEqual(['claidor-gmail', 'claidor-notion']);
  });

  test('tolerates a trailing slash, and refuses an empty origin', () => {
    expect(buildConnectorMcpServers(`${PROXY}/`, ['gmail'])['claidor-gmail'].url)
      .toBe('http://127.0.0.1:54321/connectors/mcp/gmail');
    expect(buildConnectorMcpServers('', ['gmail'])).toEqual({});
    expect(buildConnectorMcpServers(PROXY, [])).toEqual({});
  });

  test('drops a service name that would not be safe in a config key or a URL', () => {
    expect(buildConnectorMcpServers(PROXY, ['../evil', 'a b', ''])).toEqual({});
  });
});

describe('connectorServerKey', () => {
  test('marks our entries apart from the person\'s own servers', () => {
    expect(connectorServerKey('gmail')).toBe('claidor-gmail');
    expect(isConnectorServerKey('claidor-gmail')).toBe(true);
    expect(isConnectorServerKey('My Server')).toBe(false);
  });
});
