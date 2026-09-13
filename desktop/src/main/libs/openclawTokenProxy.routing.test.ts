import { describe, expect, test } from 'vitest';

import { buildUpstreamPath, CONNECTORS_PATH_PREFIX } from './openclawTokenProxy';

describe('buildUpstreamPath', () => {
  test('sends a connected service\'s MCP conversation to the connectors routes', () => {
    expect(buildUpstreamPath(`${CONNECTORS_PATH_PREFIX}/mcp/gmail`))
      .toBe('/api/connectors/mcp/gmail');
  });

  test('sends everything else to the model proxy, as before', () => {
    expect(buildUpstreamPath('/v1/messages')).toBe('/api/proxy/v1/messages');
    expect(buildUpstreamPath('/v1/chat/completions')).toBe('/api/proxy/v1/chat/completions');
    expect(buildUpstreamPath(undefined)).toBe('/api/proxy/');
  });

  test('does not mistake a lookalike path for a connector one', () => {
    // `/connectorsomething` must not become `/api/connectorsomething`: only
    // the prefix itself, or a path below it, is connector traffic.
    expect(buildUpstreamPath('/connectorsomething')).toBe('/api/proxy/connectorsomething');
    expect(buildUpstreamPath('/v1/connectors/mcp/gmail')).toBe('/api/proxy/v1/connectors/mcp/gmail');
  });
});
