import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildRequest, buildSystemPrompt, Engine, EngineError, JobCancelled, readAnswer } from './engine.js';

/**
 * The runner's model call goes straight to Claidor's proxy (25 September
 * 2026): a fake proxy here records what it was asked and answers on the
 * three wires the real one serves.
 */

let server: http.Server;
let baseUrl: string;
const seen: { path: string; auth: string | undefined; body: Record<string, unknown> }[] = [];
let answer: (path: string) => { status: number; body: unknown } = () => ({ status: 200, body: {} });

beforeAll(async () => {
  server = http.createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => {
      seen.push({ path: request.url ?? '', auth: request.headers.authorization, body: JSON.parse(raw || '{}') });
      const reply = answer(request.url ?? '');
      response.writeHead(reply.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

const workspaceWith = async (files: Record<string, string>): Promise<string> => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'maty-engine-'));
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(workspace, name)), { recursive: true });
    await fs.writeFile(path.join(workspace, name), content, 'utf8');
  }
  return workspace;
};

describe('the system prompt', () => {
  test('is the instructions, then every memory file under its name, and nothing else', async () => {
    const workspace = await workspaceWith({
      'AGENTS.md': '# How this run works\nRules.',
      'MEMORY.md': '- likes tea',
      'USER.md': 'Bass',
      'memory/2026-09-25.md': 'today',
      'notes.txt': 'not memory',
    });
    const system = await buildSystemPrompt(workspace);
    expect(system.startsWith('# How this run works')).toBe(true);
    expect(system).toContain('## MEMORY.md\n\n- likes tea');
    expect(system).toContain('## USER.md\n\nBass');
    expect(system).toContain('## memory/2026-09-25.md\n\ntoday');
    expect(system).not.toContain('not memory');
  });
});

describe('the request, per wire', () => {
  const messages = [{ role: 'user' as const, content: 'hi' }, { role: 'assistant' as const, content: 'hello' }, { role: 'user' as const, content: 'go on' }];
  test('OpenAI Responses carries the system prompt as instructions', () => {
    const { path: route, body } = buildRequest({ id: 'gpt-5.6-terra', transportApi: 'openai-responses', maxTokens: 8_192 }, 'SYS', messages);
    expect(route).toBe('/v1/responses');
    expect(body).toEqual({ model: 'gpt-5.6-terra', instructions: 'SYS', input: messages.map((m) => ({ role: m.role, content: m.content })) });
  });
  test('Anthropic Messages carries it as system with a max_tokens', () => {
    const { path: route, body } = buildRequest({ id: 'claude-x', transportApi: 'anthropic-messages', maxTokens: 64_000 }, 'SYS', messages);
    expect(route).toBe('/v1/messages');
    expect(body).toMatchObject({ model: 'claude-x', system: 'SYS', max_tokens: 8_192 });
  });
  test('chat completions carries it as the system message', () => {
    const { path: route, body } = buildRequest({ id: 'm', transportApi: 'openai-completions', maxTokens: 8_192 }, 'SYS', messages);
    expect(route).toBe('/v1/chat/completions');
    expect((body.messages as unknown[])[0]).toEqual({ role: 'system', content: 'SYS' });
  });
});

describe('the answer, per wire', () => {
  test('reads each shape and refuses an empty one', () => {
    expect(readAnswer(JSON.stringify({ output_text: 'A', usage: { input_tokens: 1 } }), 'openai-responses')).toEqual({ text: 'A', usage: { input_tokens: 1 } });
    expect(readAnswer(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'B' }] }] }), 'openai-responses').text).toBe('B');
    expect(readAnswer(JSON.stringify({ content: [{ type: 'text', text: 'C' }], usage: {} }), 'anthropic-messages').text).toBe('C');
    expect(readAnswer(JSON.stringify({ choices: [{ message: { content: 'D' } }] }), 'openai-completions').text).toBe('D');
    expect(() => readAnswer(JSON.stringify({ output: [] }), 'openai-responses')).toThrow(EngineError);
    expect(() => readAnswer('nope', 'openai-responses')).toThrow(EngineError);
  });
});

describe('one turn through the proxy', () => {
  test('posts on the person\'s job token with the memory in the prompt, and returns the text', async () => {
    seen.length = 0;
    answer = () => ({ status: 200, body: { output_text: 'Done.', usage: { input_tokens: 12, output_tokens: 2 } } });
    const workspace = await workspaceWith({ 'AGENTS.md': 'Rules.', 'MEMORY.md': '- likes tea' });
    const engine = await Engine.start({ modelProxyBaseUrl: `${baseUrl}/desktop/api/proxy`, model: { id: 'gpt-5.6-terra', transportApi: 'openai-responses', maxTokens: 8_192 }, jobToken: 'job-token', workspace });
    const result = await engine.ask('summarise the morning', 5_000);
    expect(result).toEqual({ text: 'Done.', usage: { input_tokens: 12, output_tokens: 2 } });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.path).toBe('/desktop/api/proxy/v1/responses');
    expect(seen[0]!.auth).toBe('Bearer job-token');
    expect(seen[0]!.body.instructions).toContain('- likes tea');
    expect(seen[0]!.body.input).toEqual([{ role: 'user', content: 'summarise the morning' }]);
    await engine.stop();
  });

  test('a refusal names the status and the proxy\'s sentence; a cancel is a cancel', async () => {
    answer = () => ({ status: 429, body: { error: 'DesktopQuotaExceeded', detail: 'Over the hour.' } });
    const workspace = await workspaceWith({});
    const engine = await Engine.start({ modelProxyBaseUrl: `${baseUrl}/desktop/api/proxy`, model: { id: 'm', transportApi: 'openai-responses', maxTokens: 1 }, jobToken: 't', workspace });
    await expect(engine.ask('x', 5_000)).rejects.toThrow(/refused the turn \(429\): .*Over the hour/);
    const controller = new AbortController();
    controller.abort();
    await expect(engine.ask('x', 5_000, controller.signal)).rejects.toThrow(JobCancelled);
  });
});
