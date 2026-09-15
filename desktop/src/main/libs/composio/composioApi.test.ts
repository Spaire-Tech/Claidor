import { describe, expect, test, vi } from 'vitest';

import { createComposioApi } from './composioApi';

/**
 * The wire, as `@composio/client` 0.1.0-alpha.76 speaks it. A fake
 * server that answers those paths and records what was asked.
 */
function server(options: {
  status?: string | null;
  linkUrl?: string;
  refuse?: number;
} = {}) {
  const calls: Array<{ method: string; path: string; body?: unknown; key?: string }> = [];
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const call = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
      key: (init?.headers as Record<string, string>)?.['x-api-key'],
    };
    calls.push(call);
    if (options.refuse) return json(options.refuse, { error: { message: 'nope' } });
    if (call.method === 'POST' && call.path === '/api/v3.1/tool_router/session') {
      return json(200, { session_id: 'sess_1' });
    }
    if (call.method === 'POST' && call.path.endsWith('/link')) {
      return json(200, { redirect_url: options.linkUrl ?? 'https://connect.composio.dev/link/abc', connected_account_id: 'ca_1' });
    }
    if (call.method === 'GET' && call.path.endsWith('/toolkits')) {
      return json(200, {
        items: [
          { slug: 'GMAIL', connected_account: options.status === null ? null : { id: 'ca_1', status: options.status ?? 'ACTIVE' } },
          { slug: 'notion', connected_account: null },
        ],
      });
    }
    if (call.method === 'DELETE' && call.path.startsWith('/api/v3.1/connected_accounts/')) {
      return json(200, { success: true });
    }
    return json(404, { error: 'no such path' });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe('talking to Composio', () => {
  test('one session, made once, with the key in the header the SDK uses', async () => {
    const wire = server();
    const api = createComposioApi({ apiKey: 'ck_test', fetch: wire.fetchImpl });
    await api.toolkitState('gmail');
    await api.toolkitState('notion');
    const sessions = wire.calls.filter(one => one.path === '/api/v3.1/tool_router/session');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ method: 'POST', body: { user_id: 'default' }, key: 'ck_test' });
  });

  test('a sign-in link is the redirect_url Composio returns, for the lowercase slug', async () => {
    const wire = server({ linkUrl: 'https://connect.composio.dev/link/xyz' });
    const api = createComposioApi({ apiKey: 'ck_test', fetch: wire.fetchImpl });
    expect(await api.authorizationUrl('Gmail')).toBe('https://connect.composio.dev/link/xyz');
    const link = wire.calls.find(one => one.path.endsWith('/link'));
    expect(link).toMatchObject({ path: '/api/v3.1/tool_router/session/sess_1/link', body: { toolkit: 'gmail' } });
  });

  test('connected means an ACTIVE connected account, whatever case the slug came back in', async () => {
    const api = createComposioApi({ apiKey: 'ck_test', fetch: server({ status: 'ACTIVE' }).fetchImpl });
    expect(await api.toolkitState('gmail')).toEqual({ toolkit: 'gmail', connected: true, connectedAccountId: 'ca_1' });
    expect(await api.toolkitState('notion')).toEqual({ toolkit: 'notion', connected: false });
  });

  test('an account that is not ACTIVE — initiated, expired, failed — is not connected', async () => {
    // The status arrives INITIATED the moment the link is made and
    // stays there until the person finishes. Counting that as connected
    // would say Connected before anybody signed in.
    const api = createComposioApi({ apiKey: 'ck_test', fetch: server({ status: 'INITIATED' }).fetchImpl });
    expect((await api.toolkitState('gmail')).connected).toBe(false);
  });

  test('a toolkit Composio has never heard of is simply not connected', async () => {
    const api = createComposioApi({ apiKey: 'ck_test', fetch: server().fetchImpl });
    expect(await api.toolkitState('nothing')).toEqual({ toolkit: 'nothing', connected: false });
  });

  test('disconnecting deletes the connected account, and says when there was none', async () => {
    const wire = server();
    const api = createComposioApi({ apiKey: 'ck_test', fetch: wire.fetchImpl });
    expect(await api.disconnect('gmail')).toBe(true);
    expect(wire.calls.at(-1)).toMatchObject({ method: 'DELETE', path: '/api/v3.1/connected_accounts/ca_1' });
    expect(await api.disconnect('notion')).toBe(false);
  });

  test('a refused key is said plainly, and a failed session is not remembered', async () => {
    const wire = server({ refuse: 401 });
    const api = createComposioApi({ apiKey: 'ck_bad', fetch: wire.fetchImpl });
    await expect(api.toolkitState('gmail')).rejects.toThrow('Composio refused the API key');
    await expect(api.toolkitState('gmail')).rejects.toThrow('Composio refused the API key');
    // Two attempts, two session requests: the first failure was not cached.
    expect(wire.calls.filter(one => one.path === '/api/v3.1/tool_router/session')).toHaveLength(2);
  });

  test('any other refusal carries Composio\'s own sentence', async () => {
    const api = createComposioApi({ apiKey: 'ck_test', fetch: server({ refuse: 429 }).fetchImpl });
    await expect(api.authorizationUrl('gmail')).rejects.toThrow('Composio HTTP 429: nope');
  });
});
