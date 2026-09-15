import { describe, expect, test, vi } from 'vitest';

import type { ConnectionItem } from '../../../shared/connections/catalog';
import { ConnectionGroupId, ConnectionKind, ConnectVia } from '../../../shared/connections/catalog';
import { ConnectOutcome } from '../connections/connectService';
import type { ComposioApi } from './composioApi';
import { connectThroughComposio, disconnectThroughComposio } from './connectThroughComposio';

const GMAIL: ConnectionItem = {
  id: 'gmail', name: 'Gmail', group: ConnectionGroupId.MailCalendar,
  kind: ConnectionKind.Account,
  connect: { via: ConnectVia.Mcp, url: 'https://gmailmcp.googleapis.com/mcp/v1' },
  composio: 'gmail',
};

const AHREFS: ConnectionItem = {
  id: 'ahrefs', name: 'Ahrefs', group: ConnectionGroupId.Marketing,
  kind: ConnectionKind.Account,
  connect: { via: ConnectVia.Mcp, url: 'https://api.ahrefs.com/mcp/mcp' },
};

/** Composio, as a sequence of answers to "signed in yet?". */
function harness(states: boolean[], options: { linkFails?: string } = {}) {
  const opened: string[] = [];
  const answers = [...states];
  const api: ComposioApi = {
    authorizationUrl: vi.fn(async () => {
      if (options.linkFails) throw new Error(options.linkFails);
      return 'https://connect.composio.dev/link/abc';
    }),
    toolkitState: vi.fn(async (toolkit: string) => ({
      toolkit, connected: answers.length > 1 ? answers.shift()! : answers[0] ?? false,
    })),
    disconnect: vi.fn(async () => true),
  };
  return {
    api,
    opened,
    deps: {
      api,
      openExternal: async (url: string) => { opened.push(url); },
      wait: async () => { /* no waiting in a test */ },
      pollIntervalMs: 1,
      timeoutMs: 50,
    },
  };
}

describe('connecting through Composio', () => {
  test('opens the link, then keeps asking until Composio says yes', async () => {
    const h = harness([false, false, false, true]);
    const result = await connectThroughComposio(GMAIL, h.deps);
    expect(result).toEqual({ outcome: ConnectOutcome.Connected });
    expect(h.opened).toEqual(['https://connect.composio.dev/link/abc']);
    expect(h.api.toolkitState).toHaveBeenCalledTimes(4);
  });

  test('a card already signed in on Composio opens nothing', async () => {
    const h = harness([true]);
    expect(await connectThroughComposio(GMAIL, h.deps)).toEqual({ outcome: ConnectOutcome.Connected });
    expect(h.opened).toEqual([]);
    expect(h.api.authorizationUrl).not.toHaveBeenCalled();
  });

  test('a person who closes the page is refused, not failed, and not connected', async () => {
    const h = harness([false]);
    const result = await connectThroughComposio(GMAIL, h.deps);
    expect(result.outcome).toBe(ConnectOutcome.Refused);
    expect(result.message).toBe('Gmail was not connected.');
  });

  test('Composio\'s own refusal reaches the card in its words', async () => {
    const h = harness([false], { linkFails: 'Composio refused the API key. Check it in Settings.' });
    const result = await connectThroughComposio(GMAIL, h.deps);
    expect(result).toEqual({
      outcome: ConnectOutcome.Failed,
      message: 'Composio refused the API key. Check it in Settings.',
    });
    expect(h.opened).toEqual([]);
  });

  test('a card Composio does not carry is unsupported here, whatever the caller thought', async () => {
    const h = harness([true]);
    const result = await connectThroughComposio(AHREFS, h.deps);
    expect(result.outcome).toBe(ConnectOutcome.Unsupported);
    expect(h.api.toolkitState).not.toHaveBeenCalled();
  });
});

describe('disconnecting through Composio', () => {
  test('asks Composio to drop the account', async () => {
    const h = harness([true]);
    await disconnectThroughComposio(GMAIL, h.api);
    expect(h.api.disconnect).toHaveBeenCalledWith('gmail');
  });

  test('refuses a card it does not carry', async () => {
    const h = harness([true]);
    await expect(disconnectThroughComposio(AHREFS, h.api)).rejects.toThrow('not carried by Composio');
  });
});
