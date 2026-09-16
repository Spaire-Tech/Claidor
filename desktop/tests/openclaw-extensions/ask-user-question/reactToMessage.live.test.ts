import { describe, expect, test } from 'vitest';

import plugin from '../../../openclaw-extensions/ask-user-question/index';
import { McpBridgeServer } from '../../../src/main/libs/mcpBridgeServer';
import type { ReactRequest } from '../../../src/shared/reactions/constants';

/**
 * The real plugin's `ReactToMessage` tool, executed against the real
 * bridge over the loopback socket. Only the engine is stood in for: the
 * `api` it hands a plugin, reduced to the two calls this one makes.
 */

type ToolFactory = (ctx: { sessionKey?: string }) => null | {
  name: string;
  execute(id: string, params: unknown): Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;
};

const load = (config: Record<string, unknown>): ToolFactory[] => {
  const factories: ToolFactory[] = [];
  plugin.register({
    pluginConfig: config,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    registerTool(factory: ToolFactory) { factories.push(factory); },
  } as never);
  return factories;
};

describe('ReactToMessage, live against the bridge', () => {
  test('the emoji and the session reach the app, and the model is told it landed', async () => {
    const secret = 'live-secret';
    const server = new McpBridgeServer(secret);
    const seen: ReactRequest[] = [];
    try {
      await server.start();
      server.onReact(request => { seen.push(request); return { behavior: 'reacted' }; });
      const [, reactFactory] = load({
        callbackUrl: server.askUserCallbackUrl,
        secret,
        reactUrl: server.reactCallbackUrl,
      });
      const tool = reactFactory({ sessionKey: 'agent:main:lobsterai:session-a' });
      expect(tool?.name).toBe('ReactToMessage');
      const result = await tool!.execute('call-1', { emoji: '🙏' });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe('Reacted 🙏 to their last message.');
      expect(seen).toEqual([{ emoji: '🙏', sessionKey: 'agent:main:lobsterai:session-a' }]);
    } finally {
      await server.stop();
    }
  });

  test('nothing to react to is said to the model, not thrown', async () => {
    const secret = 'live-secret';
    const server = new McpBridgeServer(secret);
    try {
      await server.start();
      server.onReact(() => ({ behavior: 'nothing', reason: 'The person has not said anything yet.' }));
      const [, reactFactory] = load({ callbackUrl: server.askUserCallbackUrl, secret, reactUrl: server.reactCallbackUrl });
      const result = await reactFactory({ sessionKey: 'agent:main:lobsterai:session-a' })!.execute('call-2', { emoji: '👍' });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe('No reaction: The person has not said anything yet.');
    } finally {
      await server.stop();
    }
  });

  test('is not offered to a channel session, and not at all without the route', () => {
    const [, reactFactory] = load({ callbackUrl: 'http://127.0.0.1:1/askuser', secret: 's', reactUrl: 'http://127.0.0.1:1/react' });
    expect(reactFactory({ sessionKey: 'agent:main:telegram:direct:123' })).toBeNull();
    const withoutRoute = load({ callbackUrl: 'http://127.0.0.1:1/askuser', secret: 's' });
    expect(withoutRoute).toHaveLength(1);
  });
});
