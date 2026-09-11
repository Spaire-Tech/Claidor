import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { ClaimedJob } from '../src/claidor.js';
import { runJob } from '../src/job.js';
import type { RunnerSettings } from '../src/settings.js';

/**
 * One whole job against a real engine: the memory comes down, the work
 * happens, the memory goes back up, the answer is reported, and the job's
 * directory is gone. The only thing standing in for Claidor is a stub that
 * speaks its three wires — the memory sync, the model list, and the
 * metered proxy.
 *
 * Skipped when there is no built engine. See engine.integration.test.ts.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const engineRoot =
  process.env.CLAIDOR_MATY_ENGINE_ROOT?.trim() ||
  path.join(here, '..', '..', 'desktop', 'vendor', 'openclaw-runtime', 'linux-x64');
const haveEngine = fs.existsSync(path.join(engineRoot, 'openclaw.mjs'));

const JOB_TOKEN = 'the-person-token-for-this-one-job';
const NEW_MEMORY = '- the person likes short answers\n- and dislikes being woken\n';

interface SyncRound {
  auth: string | undefined;
  files: { name: string; content: string; base_version: number }[];
}

const sse = (res: http.ServerResponse, event: string, data: unknown): void => {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

const startStubClaidor = async () => {
  const syncs: SyncRound[] = [];
  let modelCalls = 0;

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const url = req.url ?? '';
      const json = (status: number, body: unknown): void => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };

      if (url === '/desktop/api/memory/sync') {
        const body = JSON.parse(raw || '{}');
        syncs.push({ auth: req.headers.authorization, files: body.files ?? [] });
        json(200, {
          files: [
            { name: 'MEMORY.md', content: '- the person likes short answers\n', version: 4, changed: false },
            { name: 'USER.md', content: '# the person\n', version: 2, changed: false },
          ],
          deleted: [],
        });
        return;
      }

      if (url === '/desktop/api/models/available') {
        json(200, {
          code: 0,
          data: [{ modelId: 'test-model', contextWindow: 200000, maxTokens: 4096, accessible: true }],
        });
        return;
      }

      if (url.endsWith('/desktop/api/proxy/v1/messages')) {
        modelCalls += 1;
        const first = modelCalls === 1;
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
        sse(res, 'message_start', {
          type: 'message_start',
          message: { id: `m${modelCalls}`, type: 'message', role: 'assistant', model: 'stub', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 9, output_tokens: 0 } },
        });
        if (first) {
          // The run learns something and writes it into the durable facts.
          sse(res, 'content_block_start', {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'tool_use', id: 'toolu_write', name: 'write', input: {} },
          });
          sse(res, 'content_block_delta', {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'input_json_delta', partial_json: JSON.stringify({ path: 'MEMORY.md', content: NEW_MEMORY }) },
          });
          sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
          sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 7 } });
        } else {
          sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
          sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Here is the morning briefing.' } });
          sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
          sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 6 } });
        }
        sse(res, 'message_stop', { type: 'message_stop' });
        res.end();
        return;
      }

      json(404, { error: 'not_found', detail: `the runner asked for ${url}` });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    syncs,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};

describe.skipIf(!haveEngine)('one whole job', () => {
  let workRoot = '';

  beforeEach(async () => {
    workRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'maty-job-test-'));
  });

  afterEach(async () => {
    await fsp.rm(workRoot, { recursive: true, force: true });
  });

  test('fetches the memory, does the work, writes it back, and cleans up', async () => {
    const claidor = await startStubClaidor();
    const settings: RunnerSettings = {
      apiBaseUrl: claidor.baseUrl,
      runnerToken: 'the-service-token',
      runnerName: 'runner-under-test',
      engineRoot,
      workRoot,
      pollIntervalMs: 1_000,
      heartbeatIntervalMs: 15_000,
      jobTimeoutMs: 120_000,
      engineStartTimeoutMs: 180_000,
    };
    const claimed: ClaimedJob = {
      job: { id: 'job-42', kind: 'routine', prompt: 'Write the morning briefing.', allow: [] },
      accessToken: JOB_TOKEN,
      expiresAt: null,
    };

    try {
      const result = await runJob(claimed, settings);
      expect(result.answer).toContain('morning briefing');

      // Two rounds of the memory: nothing on the way down, the changed
      // file on the way up, with the version it started from.
      expect(claidor.syncs.length).toBe(2);
      expect(claidor.syncs[0]!.files).toEqual([]);
      expect(claidor.syncs[0]!.auth).toBe(`Bearer ${JOB_TOKEN}`);
      expect(claidor.syncs[1]!.files).toEqual([
        { name: 'MEMORY.md', content: NEW_MEMORY, base_version: 4 },
      ]);

      // The engine wrote its own default profile into the workspace; it is
      // the app's file, so it was not sent up.
      expect(claidor.syncs[1]!.files.map((one) => one.name)).not.toContain('USER.md');

      // Nothing is left behind for the next job to find.
      expect(await fsp.readdir(workRoot)).toEqual([]);
    } finally {
      await claidor.stop();
    }
  });

  test('deletes the job directory when the work fails too', async () => {
    const claidor = await startStubClaidor();
    const settings: RunnerSettings = {
      apiBaseUrl: claidor.baseUrl,
      runnerToken: 'the-service-token',
      runnerName: 'runner-under-test',
      engineRoot: path.join(workRoot, 'there-is-no-engine-here'),
      workRoot,
      pollIntervalMs: 1_000,
      heartbeatIntervalMs: 15_000,
      jobTimeoutMs: 30_000,
      engineStartTimeoutMs: 10_000,
    };
    const claimed: ClaimedJob = {
      job: { id: 'job-43', kind: 'mail', prompt: 'Answer this.', allow: [] },
      accessToken: JOB_TOKEN,
      expiresAt: null,
    };

    try {
      await expect(runJob(claimed, settings)).rejects.toThrow();
      expect(await fsp.readdir(workRoot)).toEqual([]);
    } finally {
      await claidor.stop();
    }
  });
});

describe.skipIf(haveEngine)('one whole job', () => {
  test('is not here, so this proof was not run', () => {
    expect(haveEngine).toBe(false);
  });
});
