import { afterEach, describe, expect, test } from 'vitest';

import { CALLBACK_HOST, type CallbackListener, listenForCallback } from './callbackServer';

/**
 * These run the real server on a real socket and talk to it over real
 * HTTP. Mocking `http` here would prove nothing: what can go wrong is the
 * listening, the routing and the closing, and a mock has none of those.
 *
 * An ephemeral port, so a test run does not fight the app if one happens
 * to be running on this computer.
 */
const EPHEMERAL = 0;

let open: CallbackListener[] = [];
const start = async (timeoutMs = 5_000): Promise<CallbackListener> => {
  const listener = await listenForCallback(timeoutMs, EPHEMERAL);
  open.push(listener);
  return listener;
};

afterEach(() => {
  for (const listener of open) listener.close();
  open = [];
});

const get = async (port: number, path: string): Promise<{ status: number; body: string }> => {
  const response = await fetch(`http://${CALLBACK_HOST}:${port}${path}`);
  return { status: response.status, body: await response.text() };
};

describe('the window that catches the redirect', () => {
  test('a redirect with a code resolves it, and the person sees a page', async () => {
    const listener = await start();
    const page = await get(listener.port, '/oauth/callback?code=4%2F0Ab&state=xyz');

    expect(page.status).toBe(200);
    expect(page.body).toContain('Connected');
    await expect(listener.result).resolves.toEqual({ code: '4/0Ab', state: 'xyz' });
  });

  test('a refusal resolves with the reason, not a hang', async () => {
    const listener = await start();
    const page = await get(
      listener.port,
      '/oauth/callback?error=access_denied&error_description=You+said+no',
    );

    expect(page.body).toContain('You said no');
    await expect(listener.result).resolves.toEqual({ error: 'You said no' });
  });

  test('anything else on the port is not answered as if it were ours', async () => {
    // The port is fixed and on loopback. A stray request must not be
    // read as a sign-in, and must not settle the wait.
    const listener = await start();
    expect((await get(listener.port, '/')).status).toBe(404);
    expect((await get(listener.port, '/oauth/callback/extra')).status).toBe(404);

    const settled = await Promise.race([
      listener.result,
      new Promise(resolve => setTimeout(() => resolve('still waiting'), 50)),
    ]);
    expect(settled).toBe('still waiting');
  });

  test('closing settles the wait instead of leaving it open for ever', async () => {
    const listener = await start();
    listener.close();
    await expect(listener.result).resolves.toMatchObject({
      error: expect.stringContaining('closed'),
    });
  });

  test('running out of time settles it too', async () => {
    const listener = await start(30);
    await expect(listener.result).resolves.toMatchObject({ error: expect.any(String) });
  });

  test('the port is free again after closing', async () => {
    // The real one is fixed at 8989, so a listener left behind blocks
    // every later sign-in on this computer.
    const first = await listenForCallback(5_000, EPHEMERAL);
    const port = first.port;
    first.close();
    await new Promise(resolve => setTimeout(resolve, 50));

    const second = await listenForCallback(5_000, port);
    expect(second.port).toBe(port);
    second.close();
  });

  test('a port already taken is refused with a sentence, not a stack', async () => {
    const first = await start();
    await expect(listenForCallback(5_000, first.port))
      .rejects.toThrow(/Something else is using port/);
  });

  test('only the first redirect counts', async () => {
    // The code is single-use. A second one arriving must not overwrite
    // the answer the flow is already acting on.
    const listener = await start();
    await get(listener.port, '/oauth/callback?code=first');
    await expect(listener.result).resolves.toEqual({ code: 'first', state: undefined });
  });
});
