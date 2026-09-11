import { describe, expect, test } from 'vitest';

import {
  buildConnectorMcpServers,
  CONNECTOR_MCP_TRANSPORT,
  CONNECTORS_TOKEN_ENV_VAR,
  connectorServerKey,
  isConnectorServerKey,
} from './connectorMcpServers';

const BASE = 'https://api.claidor.com/desktop';

describe('buildConnectorMcpServers', () => {
  test('writes one entry per connected service, pointing at Claidor', () => {
    const servers = buildConnectorMcpServers(BASE, ['gmail']);
    expect(servers).toEqual({
      'claidor-gmail': {
        url: 'https://api.claidor.com/desktop/api/connectors/mcp/gmail',
        transport: CONNECTOR_MCP_TRANSPORT,
        headers: { authorization: `Bearer \${${CONNECTORS_TOKEN_ENV_VAR}}` },
      },
    });
  });

  test('never writes a credential of its own into the config', () => {
    const written = JSON.stringify(buildConnectorMcpServers(BASE, ['gmail', 'slack_v2', 'notion']));
    expect(written).not.toMatch(/pipedream/i);
    expect(written).not.toMatch(/project|client_secret|developer/i);
    // The only secret named is a placeholder the gateway resolves from its env.
    expect(written.match(/Bearer [^"]*/g)).toEqual(
      new Array(3).fill(`Bearer \${${CONNECTORS_TOKEN_ENV_VAR}}`),
    );
  });

  test('reaches only Claidor, whatever the service', () => {
    const servers = buildConnectorMcpServers(BASE, ['gmail', 'microsoft_teams']);
    for (const entry of Object.values(servers)) {
      expect(new URL(entry.url as string).origin).toBe('https://api.claidor.com');
    }
  });

  test('is stable: same services, same entries, whatever the order', () => {
    expect(buildConnectorMcpServers(BASE, ['notion', 'gmail', 'notion']))
      .toEqual(buildConnectorMcpServers(BASE, ['gmail', 'notion']));
    expect(Object.keys(buildConnectorMcpServers(BASE, ['notion', 'gmail'])))
      .toEqual(['claidor-gmail', 'claidor-notion']);
  });

  test('tolerates a base URL with a trailing slash, and refuses an empty one', () => {
    expect(buildConnectorMcpServers(`${BASE}/`, ['gmail'])['claidor-gmail'].url)
      .toBe('https://api.claidor.com/desktop/api/connectors/mcp/gmail');
    expect(buildConnectorMcpServers('', ['gmail'])).toEqual({});
    expect(buildConnectorMcpServers(BASE, [])).toEqual({});
  });

  test('drops a service name that would not be safe in a config key or a URL', () => {
    expect(buildConnectorMcpServers(BASE, ['../evil', 'a b', ''])).toEqual({});
  });
});

describe('connectorServerKey', () => {
  test('marks our entries apart from the person\'s own servers', () => {
    expect(connectorServerKey('gmail')).toBe('claidor-gmail');
    expect(isConnectorServerKey('claidor-gmail')).toBe(true);
    expect(isConnectorServerKey('My Server')).toBe(false);
  });
});
