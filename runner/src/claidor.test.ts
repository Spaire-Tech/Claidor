import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { ClaidorError, JOB_KINDS, PersonClient, RunnerQueue, refusalOf } from './claidor.js';
import { readAnswer } from './engine.js';

interface Seen {
  method: string;
  url: string;
  auth: string | undefined;
  body: unknown;
}

let server: http.Server;
let baseUrl = '';
let seen: Seen[] = [];
let reply: (seen: Seen) => { status: number; body: unknown } = () => ({ status: 200, body: {} });

beforeEach(async () => {
  seen = [];
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const entry: Seen = {
        method: req.method ?? '',
        url: req.url ?? '',
        auth: req.headers.authorization,
        body: raw ? JSON.parse(raw) : undefined,
      };
      seen.push(entry);
      const answer = reply(entry);
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(answer.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('the queue', () => {
  test('claims with the service\'s own token and hears "nothing to do"', async () => {
    reply = () => ({ status: 200, body: { job: null } });
    const queue = new RunnerQueue(baseUrl, 'runner-token', 'runner-1');
    expect(await queue.claim()).toBeNull();
    expect(seen[0]!.url).toBe('/maty/runner/claim');
    expect(seen[0]!.auth).toBe('Bearer runner-token');
    expect(seen[0]!.body).toEqual({ runner: 'runner-1' });
  });

  test('reads a job and the person\'s token off the claim', async () => {
    reply = () => ({
      status: 200,
      body: {
        job: { id: 'j1', kind: 'briefing', prompt: 'summarise', deliver: { channel: 'email' }, allow: ['send email'] },
        access_token: 'person-token',
        expires_at: '2026-09-11T05:00:00Z',
      },
    });
    const claimed = await new RunnerQueue(baseUrl, 'runner-token', 'runner-1').claim();
    expect(claimed?.job.id).toBe('j1');
    expect(claimed?.job.allow).toEqual(['send email']);
    expect(claimed?.accessToken).toBe('person-token');
    expect(claimed?.expiresAt).toBe('2026-09-11T05:00:00Z');
  });

  test('refuses a claim with no token for the person', async () => {
    reply = () => ({ status: 200, body: { job: { id: 'j1', kind: 'briefing', prompt: 'do it' } } });
    await expect(new RunnerQueue(baseUrl, 'runner-token', 'runner-1').claim()).rejects.toThrow(/no access token/);
  });

  test('turns a refusal into a real error', async () => {
    reply = () => ({ status: 401, body: { error: 'unauthorized', detail: 'unknown runner token' } });
    await expect(new RunnerQueue(baseUrl, 'bad', 'runner-1').claim()).rejects.toBeInstanceOf(ClaidorError);
  });

  test('says why when the lease is no longer ours', async () => {
    // 409 is Claidor saying the lease ran out or belongs to another runner.
    reply = () => ({ status: 409, body: { error: 'lease_lost', detail: 'the lease expired' } });
    await expect(
      new RunnerQueue(baseUrl, 'runner-token', 'runner-1').complete('j1', 'done', {}),
    ).rejects.toThrow(/409.*lease_lost: the lease expired/);
  });

  test('reports the answer and the usage', async () => {
    reply = () => ({ status: 200, body: {} });
    await new RunnerQueue(baseUrl, 'runner-token', 'runner-1').complete('j1', 'here it is', { total_tokens: 12 });
    expect(seen[0]!.url).toBe('/maty/runner/jobs/j1/complete');
    expect(seen[0]!.body).toEqual({ runner: 'runner-1', result: 'here it is', usage: { total_tokens: 12 } });
  });

  test('reports a failure and whether it is worth another try', async () => {
    reply = () => ({ status: 200, body: {} });
    await new RunnerQueue(baseUrl, 'runner-token', 'runner-1').fail('j1', 'the engine would not start', true);
    expect(seen[0]!.body).toEqual({ runner: 'runner-1', reason: 'the engine would not start', retryable: true });
  });

  test('beats', async () => {
    reply = () => ({ status: 200, body: {} });
    await new RunnerQueue(baseUrl, 'runner-token', 'runner-1').heartbeat('j 1/2');
    expect(seen[0]!.url).toBe('/maty/runner/jobs/j%201%2F2/heartbeat');
    expect(seen[0]!.body).toEqual({ runner: 'runner-1' });
  });
});

describe('what a refusal said', () => {
  test('is the reason and the detail, not the whole body', () => {
    expect(refusalOf('{"error":"not_found","detail":"no such job"}')).toBe('not_found: no such job');
    expect(refusalOf('a gateway page, not JSON')).toBe('a gateway page, not JSON');
    expect(refusalOf('')).toBe('(no body)');
  });
});

describe('the kinds of job', () => {
  test('are the three Claidor sends', () => {
    expect([...JOB_KINDS]).toEqual(['routine', 'mail', 'task']);
  });
});

describe('the person\'s side', () => {
  test('asks for the whole memory by sending nothing, with the job\'s token', async () => {
    reply = () => ({
      status: 200,
      body: {
        files: [
          { name: 'MEMORY.md', content: 'facts', version: 8, changed: true },
          { name: 'memory/2026-09-11.md', content: 'notes', version: 1, changed: false },
        ],
        deleted: [],
      },
    });
    const files = await new PersonClient(baseUrl, 'person-token').syncMemory([]);
    expect(seen[0]!.url).toBe('/desktop/api/memory/sync');
    expect(seen[0]!.auth).toBe('Bearer person-token');
    expect(seen[0]!.body).toEqual({ files: [] });
    expect(files).toEqual([
      { name: 'MEMORY.md', content: 'facts', version: 8 },
      { name: 'memory/2026-09-11.md', content: 'notes', version: 1 },
    ]);
  });

  test('takes the model list from Claidor rather than naming one', async () => {
    reply = () => ({
      status: 200,
      body: {
        code: 0,
        data: [
          { modelId: 'first-one', contextWindow: 200000, maxTokens: 16384, accessible: true },
          { modelId: 'second-one', contextWindow: 200000, maxTokens: 8192, accessible: true },
        ],
      },
    });
    const models = await new PersonClient(baseUrl, 'person-token').models();
    expect(models[0]).toEqual({ id: 'first-one', contextWindow: 200000, maxTokens: 16384 });
  });

  test('skips a model this person may not use', async () => {
    reply = () => ({
      status: 200,
      body: { code: 0, data: [{ modelId: 'shut-off', accessible: false }, { modelId: 'open', accessible: true }] },
    });
    const models = await new PersonClient(baseUrl, 'person-token').models();
    expect(models.map((one) => one.id)).toEqual(['open']);
  });
});

describe('reading the engine\'s answer', () => {
  test('takes the text and the usage', () => {
    const answer = readAnswer(
      JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'banana' } }],
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
      }),
    );
    expect(answer.text).toBe('banana');
    expect(answer.usage).toEqual({ prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 });
  });

  test('refuses an empty answer rather than reporting one', () => {
    expect(() => readAnswer(JSON.stringify({ choices: [{ message: { content: '  ' } }] }))).toThrow(/no text/);
    expect(() => readAnswer('not json')).toThrow(/not JSON/);
  });
});
