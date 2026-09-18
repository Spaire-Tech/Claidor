import { describe, expect, test, vi } from 'vitest';

import {
  BoxBrokerClient,
  BoxBrokerError,
  normalizeBrokerBaseUrl,
} from '../../../openclaw-extensions/box/brokerClient';

type Call = { url: string; init: RequestInit };

/** A fetch that records what it was asked and answers with what the test wants. */
function fakeFetch(responses: Array<{ status?: number; body?: unknown; text?: string }>) {
  const calls: Call[] = [];
  let index = 0;
  const impl = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    const status = next.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => next.body ?? {},
      text: async () => next.text ?? '',
    };
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const config = {
  brokerBaseUrl: 'https://api.claidor.com/',
  accessToken: 'desktop-token',
  template: 'caisra-box-base',
};

describe('the broker base URL', () => {
  test('loses its trailing slash so paths do not double up', () => {
    expect(normalizeBrokerBaseUrl('https://api.claidor.com/')).toBe('https://api.claidor.com');
  });

  test('is refused when empty or not http', () => {
    expect(() => normalizeBrokerBaseUrl('')).toThrow(/empty/);
    expect(() => normalizeBrokerBaseUrl('ftp://nope')).toThrow(/http or https/);
  });
});

describe('the client refuses to be half-built', () => {
  test('no token means no client', () => {
    expect(() => new BoxBrokerClient({ ...config, accessToken: '  ' })).toThrow(/token is empty/);
  });
});

describe('talking to the broker', () => {
  test('presents the desktop token as a bearer, never in the URL', async () => {
    const { impl, calls } = fakeFetch([{ body: { boxId: 'box_1', running: true } }]);
    await new BoxBrokerClient(config, impl).ensureBox('shared');
    expect(calls[0].url).toBe('https://api.claidor.com/box/sandboxes');
    expect(calls[0].url).not.toContain('desktop-token');
    expect((calls[0].init.headers as Record<string, string>).Authorization)
      .toBe('Bearer desktop-token');
  });

  test('asks for a box by scope, and carries the template', async () => {
    const { impl, calls } = fakeFetch([{ body: { boxId: 'box_1', running: true } }]);
    const state = await new BoxBrokerClient(config, impl).ensureBox('agent:research');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      scopeKey: 'agent:research',
      template: 'caisra-box-base',
    });
    expect(state.boxId).toBe('box_1');
  });

  test('a broker failure names the status, so the log says what happened', async () => {
    const { impl } = fakeFetch([{ status: 503, text: 'upstream is down' }]);
    await expect(new BoxBrokerClient(config, impl).ensureBox('shared'))
      .rejects.toThrow(/503 upstream is down/);
    await expect(new BoxBrokerClient(config, impl).ensureBox('shared'))
      .rejects.toBeInstanceOf(BoxBrokerError);
  });

  test('removing a box that is already gone is not an error', async () => {
    const { impl } = fakeFetch([{ status: 404 }]);
    await expect(new BoxBrokerClient(config, impl).removeBox('box_1')).resolves.toBeUndefined();
  });

  test('removing a box that fails for any other reason does throw', async () => {
    const { impl } = fakeFetch([{ status: 500, text: 'boom' }]);
    await expect(new BoxBrokerClient(config, impl).removeBox('box_1')).rejects.toThrow(/500 boom/);
  });
});

describe('running one shell command in the box', () => {
  test('is a single round trip — the unit the latency measurement counts', async () => {
    const { impl, calls } = fakeFetch([{
      body: {
        stdoutBase64: Buffer.from('hello\n').toString('base64'),
        stderrBase64: '',
        exitCode: 0,
      },
    }]);
    const result = await new BoxBrokerClient(config, impl).runShell('box_1', { script: 'echo hello' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.claidor.com/box/sandboxes/box_1/shell');
    expect(result.stdout.toString('utf8')).toBe('hello\n');
    expect(result.code).toBe(0);
  });

  test('sends stdin as base64 so binary survives the trip', async () => {
    const { impl, calls } = fakeFetch([{ body: { exitCode: 0 } }]);
    const payload = Buffer.from([0x00, 0xff, 0x10]);
    await new BoxBrokerClient(config, impl).runShell('box_1', { script: 'cat', stdin: payload });
    const body = JSON.parse(String(calls[0].init.body));
    expect(Buffer.from(body.stdinBase64, 'base64')).toEqual(payload);
  });

  test('a non-zero exit throws with the box stderr, as the fs bridge expects', async () => {
    const { impl } = fakeFetch([{
      body: { stderrBase64: Buffer.from('no such file').toString('base64'), exitCode: 2 },
    }]);
    await expect(new BoxBrokerClient(config, impl).runShell('box_1', { script: 'cat missing' }))
      .rejects.toThrow('no such file');
  });

  test('allowFailure returns the failure instead of throwing', async () => {
    const { impl } = fakeFetch([{ body: { exitCode: 2 } }]);
    const result = await new BoxBrokerClient(config, impl)
      .runShell('box_1', { script: 'false', allowFailure: true });
    expect(result.code).toBe(2);
  });
});

describe('file custody', () => {
  test('a file reaches the box only by an explicit import call', async () => {
    const { impl, calls } = fakeFetch([{ body: {} }]);
    await new BoxBrokerClient(config, impl).putFile('box_1', '/home/user/workspace/a.txt', Buffer.from('hi'));
    expect(calls[0].init.method).toBe('PUT');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.path).toBe('/home/user/workspace/a.txt');
    expect(Buffer.from(body.contentBase64, 'base64').toString('utf8')).toBe('hi');
  });

  test('a file comes back out the same way', async () => {
    const { impl, calls } = fakeFetch([{
      body: { contentBase64: Buffer.from('out').toString('base64') },
    }]);
    const data = await new BoxBrokerClient(config, impl).getFile('box_1', '/home/user/workspace/a.txt');
    expect(calls[0].url).toContain('path=%2Fhome%2Fuser%2Fworkspace%2Fa.txt');
    expect(data.toString('utf8')).toBe('out');
  });
});

describe('the machine registry', () => {
  test('lists the box alongside the person’s own machines', async () => {
    const { impl } = fakeFetch([{
      body: {
        machines: [
          { id: 'box_1', kind: 'box', label: 'The box', state: 'running' },
          { id: 'mac-1', kind: 'machine', label: 'This Mac', state: 'running' },
        ],
      },
    }]);
    const machines = await new BoxBrokerClient(config, impl).listMachines();
    expect(machines.map((m) => m.kind)).toEqual(['box', 'machine']);
  });

  test('an answer with no machines is an empty list, not a crash', async () => {
    const { impl } = fakeFetch([{ body: {} }]);
    await expect(new BoxBrokerClient(config, impl).listMachines()).resolves.toEqual([]);
  });
});

describe('timeouts', () => {
  test('an outer abort signal cancels the broker call', async () => {
    const controller = new AbortController();
    const impl = (async (_url: string, init: RequestInit = {}) => {
      controller.abort();
      // Mirror what fetch does once its signal fires.
      if (init.signal?.aborted) {
        throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    }) as unknown as typeof fetch;
    await expect(
      new BoxBrokerClient(config, impl).runShell('box_1', { script: 'sleep 9', signal: controller.signal }),
    ).rejects.toThrow(/Aborted/);
  });
});
