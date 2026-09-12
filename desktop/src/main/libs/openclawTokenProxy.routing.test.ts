import { describe, expect, test } from 'vitest';

import { buildUpstreamPath, CONNECTORS_PATH_PREFIX, SPEECH_PATH_PREFIX } from './openclawTokenProxy';

describe('buildUpstreamPath', () => {
  test('sends a connected service\'s MCP conversation to the connectors routes', () => {
    expect(buildUpstreamPath(`${CONNECTORS_PATH_PREFIX}/mcp/gmail`))
      .toBe('/api/connectors/mcp/gmail');
  });

  test('sends a request to be read aloud to the speech routes', () => {
    // The engine is handed `http://127.0.0.1:<port>/speech` as its
    // ElevenLabs address, so it holds no key and never sees one.
    expect(buildUpstreamPath(`${SPEECH_PATH_PREFIX}/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`))
      .toBe('/api/speech/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM');
    expect(buildUpstreamPath(`${SPEECH_PATH_PREFIX}/v1/voices`))
      .toBe('/api/speech/v1/voices');
  });

  test('does not mistake a lookalike path for a speech one', () => {
    expect(buildUpstreamPath('/speechless')).toBe('/api/proxy/speechless');
    expect(buildUpstreamPath('/v1/speech/voices')).toBe('/api/proxy/v1/speech/voices');
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
