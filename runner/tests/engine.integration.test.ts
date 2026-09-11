import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { Engine } from '../src/engine.js';
import { buildEngineConfig, buildWorkspaceInstructions } from '../src/engineConfig.js';
import { layOutMemory } from '../src/memory.js';

/**
 * The proof the whole service rests on: a real OpenClaw engine, started
 * from the built runtime, given the config this runner writes, asked one
 * thing, and answering.
 *
 * The engine cannot answer at all without a model, and there is no model in
 * a test, so a stub stands in for Claidor's metered proxy and speaks the
 * same wire the real one does. What that proves is everything on our side
 * of the model: the config loads, the gateway starts and reports itself
 * ready, the tool policy is applied, the model call goes to the address we
 * configured carrying the job's token, and the answer comes back out. The
 * second test goes one further: the stub asks for a file outside the job
 * directory and the engine refuses, which is the file boundary holding
 * rather than being merely configured.
 *
 * What none of this proves is anything about the real proxy or a real
 * model.
 *
 * It is skipped when no runtime is present. Build one with
 * `npm run openclaw:runtime:linux-x64` in `desktop/`, or point
 * CLAIDOR_MATY_ENGINE_ROOT at one.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const engineRoot =
  process.env.CLAIDOR_MATY_ENGINE_ROOT?.trim() ||
  path.join(here, '..', '..', 'desktop', 'vendor', 'openclaw-runtime', 'linux-x64');
const haveEngine = fs.existsSync(path.join(engineRoot, 'openclaw.mjs'));

const JOB_TOKEN = 'a-job-token-that-dies-with-the-lease';

type Turn = { say: string } | { callTool: { name: string; input: unknown } };

interface StubClaidor {
  baseUrl: string;
  /** Every model request the engine made, newest last. */
  requests: any[];
  keysSeen: (string | undefined)[];
  pathsSeen: string[];
  stop: () => Promise<void>;
}

const sse = (res: http.ServerResponse, event: string, data: unknown): void => {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

/**
 * Claidor's metered proxy, as far as the engine can tell: the Anthropic
 * messages wire, streamed, one scripted turn per request.
 */
const startStubClaidor = async (turns: Turn[]): Promise<StubClaidor> => {
  const requests: any[] = [];
  const keysSeen: (string | undefined)[] = [];
  const pathsSeen: string[] = [];

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      pathsSeen.push(req.url ?? '');
      keysSeen.push(req.headers['x-api-key'] as string | undefined);
      if (!(req.url ?? '').endsWith('/v1/messages')) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end('{"error":"the runner asked for something the proxy does not serve"}');
        return;
      }
      requests.push(raw ? JSON.parse(raw) : {});
      const turn = turns[requests.length - 1] ?? turns[turns.length - 1]!;

      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
      sse(res, 'message_start', {
        type: 'message_start',
        message: {
          id: `msg_stub_${requests.length}`,
          type: 'message',
          role: 'assistant',
          model: 'stub',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 11, output_tokens: 0 },
        },
      });
      if ('say' in turn) {
        sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
        sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: turn.say } });
        sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
        sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } });
      } else {
        sse(res, 'content_block_start', {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: `toolu_stub_${requests.length}`, name: turn.callTool.name, input: {} },
        });
        sse(res, 'content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: JSON.stringify(turn.callTool.input) },
        });
        sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
        sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 5 } });
      }
      sse(res, 'message_stop', { type: 'message_stop' });
      res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}/desktop/api/proxy`,
    requests,
    keysSeen,
    pathsSeen,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};

/** Everything in a request body, flattened, so a tool result can be found in it. */
const textOf = (value: unknown): string => JSON.stringify(value);

describe.skipIf(!haveEngine)('the real engine', () => {
  let jobDir = '';
  let workspace = '';

  beforeEach(async () => {
    jobDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'maty-engine-test-'));
    workspace = path.join(jobDir, 'workspace');
    await fsp.mkdir(workspace, { recursive: true });
    await layOutMemory(workspace, [
      { name: 'MEMORY.md', content: '- the person likes short answers\n', version: 4 },
    ]);
    await fsp.writeFile(path.join(workspace, 'AGENTS.md'), buildWorkspaceInstructions([]), 'utf8');
  });

  afterEach(async () => {
    await fsp.rm(jobDir, { recursive: true, force: true });
  });

  const startEngine = async (claidor: StubClaidor): Promise<Engine> =>
    await Engine.start({
      engineRoot,
      jobDir,
      config: buildEngineConfig({
        workspacePath: workspace,
        modelProxyBaseUrl: claidor.baseUrl,
        model: { id: 'test-model', contextWindow: 200_000, maxTokens: 4_096 },
      }),
      jobToken: JOB_TOKEN,
      startTimeoutMs: 180_000,
    });

  test('starts, takes one instruction, and answers', async () => {
    const claidor = await startStubClaidor([{ say: 'banana' }]);
    const engine = await startEngine(claidor);
    try {
      const answer = await engine.ask('Say the word banana and nothing else.', 120_000);

      // The answer came back out of the engine.
      expect(answer.text).toContain('banana');
      expect(answer.usage.total_tokens).toBeGreaterThan(0);

      // It went through the address we configured, carrying the job's own
      // token and no other.
      expect(claidor.pathsSeen).toContain('/desktop/api/proxy/v1/messages');
      expect(claidor.keysSeen).toEqual([JOB_TOKEN]);

      // The engine says out loud which tools the policy took away. This is
      // the safety config arriving, not our own copy of it.
      const said = engine.recentOutput(200);
      expect(said).toMatch(/tool policy removed/);
      expect(said).toMatch(/\bexec\b/);

      // The config the engine actually loaded is the one we wrote, and it
      // carries no token.
      const written = JSON.parse(await fsp.readFile(path.join(jobDir, 'openclaw.json'), 'utf8'));
      expect(written.tools.exec.mode).toBe('deny');
      expect(written.models.providers.claidor.apiKey).toBe('${CLAIDOR_JOB_TOKEN}');
      expect(JSON.stringify(written)).not.toContain(JOB_TOKEN);

      // The approvals file next to the engine's state is the deny-first one.
      const approvals = JSON.parse(
        await fsp.readFile(path.join(jobDir, 'engine', '.openclaw', 'exec-approvals.json'), 'utf8'),
      );
      expect(approvals.defaults.security).toBe('deny');
      expect(approvals.defaults.askFallback).toBe('deny');
    } finally {
      await engine.stop();
      await claidor.stop();
    }
  });

  test('reads a file in the job directory and refuses one outside it', async () => {
    await fsp.writeFile(path.join(workspace, 'inside.md'), 'the note that is allowed\n', 'utf8');
    // A file one level up from the workspace, which is still inside the
    // job's own directory — so if the boundary were the container rather
    // than the workspace, this would be readable.
    const outside = path.join(jobDir, 'outside.md');
    await fsp.writeFile(outside, 'PRIVATE-CANARY-9f3b\n', 'utf8');

    const claidor = await startStubClaidor([
      { callTool: { name: 'read', input: { path: 'inside.md' } } },
      { callTool: { name: 'read', input: { path: outside } } },
      { callTool: { name: 'read', input: { path: '../outside.md' } } },
      { say: 'done' },
    ]);
    const engine = await startEngine(claidor);
    try {
      const answer = await engine.ask('Read what you can.', 120_000);
      expect(answer.text).toContain('done');

      // Four model calls: three tool calls and the turn's end. Each tool
      // result comes back in the request that follows its call.
      expect(claidor.requests.length).toBe(4);

      expect(textOf(claidor.requests[1])).toContain('the note that is allowed');

      // Neither the absolute path nor the relative escape got the canary.
      for (const request of [claidor.requests[2], claidor.requests[3]]) {
        expect(textOf(request)).not.toContain('PRIVATE-CANARY-9f3b');
      }
      expect(textOf(claidor.requests[2]).toLowerCase()).toMatch(/workspace|outside|escapes|denied/);
      expect(textOf(claidor.requests[3]).toLowerCase()).toMatch(/workspace|outside|escapes|denied/);

      // Nothing was suggested to the model that it could not do: the
      // engine's bundled skills, all of which want a shell or the web, are
      // not in the instructions.
      const system = textOf(claidor.requests[0]);
      expect(system).not.toContain('<available_skills>');
    } finally {
      await engine.stop();
      await claidor.stop();
    }
  });

  test('will not run a command, however plainly it is asked', async () => {
    const claidor = await startStubClaidor([
      { callTool: { name: 'exec', input: { command: 'id' } } },
      { say: 'it would not' },
    ]);
    const engine = await startEngine(claidor);
    try {
      const answer = await engine.ask('Run the id command.', 120_000);
      expect(answer.text).toContain('it would not');

      // The model was never offered a command tool at all.
      const offered = JSON.stringify(claidor.requests[0].tools ?? []);
      expect(offered).toContain('"name":"read"');
      expect(offered).not.toContain('"name":"exec"');
      expect(offered).not.toContain('"name":"process"');
      expect(offered).not.toContain('"name":"web_fetch"');
      expect(offered).not.toContain('"name":"browser"');
      expect(offered).not.toContain('"name":"message"');
      expect(offered).not.toContain('"name":"cron"');

      // And asking for it anyway ran nothing: no shell output came back,
      // and the engine did not even take the call into the conversation.
      const afterExec = textOf(claidor.requests[1].messages);
      expect(afterExec).not.toMatch(/uid=\d/);
      expect(afterExec).not.toContain('"name":"exec"');
    } finally {
      await engine.stop();
      await claidor.stop();
    }
  });
});

describe.skipIf(haveEngine)('the real engine', () => {
  test('is not here, so this proof was not run', () => {
    expect(haveEngine).toBe(false);
  });
});
