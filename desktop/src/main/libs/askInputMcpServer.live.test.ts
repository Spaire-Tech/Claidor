import { type ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { ASK_INPUT_TOOL } from '../../shared/askInput/constants';
import { resolveAskInputMcpStdioLaunch } from './askInputMcpServer';

/**
 * The server, actually run.
 *
 * Not "does the source contain the right string" — that is the other test
 * file. This spawns the process, speaks JSON-RPC to its stdin, stands up
 * a real HTTP bridge for it to call, and reads what comes back.
 *
 * It exists because the founder's rule is *run it, or say you did not*,
 * and because a stdio MCP server has three ways to be silently broken —
 * bad JSON framing, a bridge call that never fires, and an answer shaped
 * wrongly — that no amount of reading catches.
 */

let baseDir = '';
let bridge: http.Server | undefined;
let child: ChildProcess | undefined;
let received: unknown[] = [];
let reply: unknown = { behavior: 'provide', values: { password: 'hunter2' }, remember: false };

const startBridge = async (): Promise<string> => {
  received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      received.push({ secret: req.headers['x-mcp-bridge-secret'], body: JSON.parse(body || '{}') });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply));
    });
  });
  bridge = server;
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return `http://127.0.0.1:${port}/ask-input`;
};

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-input-live-'));
});

afterEach(async () => {
  child?.kill();
  child = undefined;
  if (bridge) await new Promise<void>(resolve => bridge!.close(() => resolve()));
  bridge = undefined;
  fs.rmSync(baseDir, { recursive: true, force: true });
});

/** Speak to the server over stdio and collect one reply per request. */
const talk = async (requests: unknown[]): Promise<Record<string, unknown>[]> => {
  const bridgeUrl = await startBridge();
  const { serverDir } = { serverDir: path.join(baseDir, 'ask-input-mcp') };
  resolveAskInputMcpStdioLaunch(baseDir, {
    electronNodeRuntimePath: process.execPath,
    bridgeUrl,
    bridgeSecret: 'live-secret',
    platform: process.platform,
  });

  const proc = spawn(process.execPath, [path.join(serverDir, 'ask-input-mcp-server.mjs')], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child = proc;

  const replies: Record<string, unknown>[] = [];
  const done = new Promise<void>((resolve, reject) => {
    let buffer = '';
    proc.stdout.on('data', chunk => {
      buffer += String(chunk);
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) replies.push(JSON.parse(line));
        if (replies.length === requests.length) resolve();
        newline = buffer.indexOf('\n');
      }
    });
    proc.on('error', reject);
    setTimeout(() => reject(new Error(`timed out with ${replies.length}/${requests.length} replies`)), 15_000);
  });

  for (const request of requests) proc.stdin.write(`${JSON.stringify(request)}\n`);
  await done;
  return replies;
};

describe('the server, spawned and spoken to', () => {
  test('it introduces itself and lists the one tool', async () => {
    const replies = await talk([
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ]);

    expect((replies[0].result as { serverInfo: { name: string } }).serverInfo.name).toBe('ask-input');
    const tools = (replies[1].result as { tools: { name: string }[] }).tools;
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe(ASK_INPUT_TOOL);
  }, 20_000);

  test('a call reaches the bridge with the fields, and the secret in the header', async () => {
    const replies = await talk([{
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: {
        name: ASK_INPUT_TOOL,
        arguments: {
          prompt: 'Sign in to Acme to pull the invoice',
          note: 'acme.example.com',
          fields: [{ name: 'password', label: 'Password', kind: 'secret' }],
        },
      },
    }]);

    expect(received).toHaveLength(1);
    const call = received[0] as { secret: string; body: Record<string, unknown> };
    expect(call.secret).toBe('live-secret');
    expect(call.body.prompt).toBe('Sign in to Acme to pull the invoice');
    expect(call.body.fields).toEqual([{ name: 'password', label: 'Password', kind: 'secret' }]);

    const result = replies[0].result as { structuredContent?: { values: Record<string, string> } };
    expect(result.structuredContent?.values).toEqual({ password: 'hunter2' });
  }, 20_000);

  test('a decline comes back as a decision, not an error to retry', async () => {
    reply = { behavior: 'decline' };
    const replies = await talk([{
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: {
        name: ASK_INPUT_TOOL,
        arguments: { prompt: 'Your password', fields: [{ name: 'p', label: 'Password', kind: 'secret' }] },
      },
    }]);
    reply = { behavior: 'provide', values: { password: 'hunter2' }, remember: false };

    const result = replies[0].result as { isError?: boolean; content: { text: string }[] };
    // Not an error: an error invites a retry, and asking twice for a
    // password teaches people to stop reading what software asks them.
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toMatch(/Do not ask again/);
    expect(result.structuredContent).toBeUndefined();
  }, 20_000);

  test('a call with no fields is refused before it reaches the bridge', async () => {
    const replies = await talk([{
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: ASK_INPUT_TOOL, arguments: { prompt: 'Something' } },
    }]);

    expect(received).toHaveLength(0);
    expect((replies[0].result as { isError: boolean }).isError).toBe(true);
  }, 20_000);

  test('an unknown tool is refused rather than passed through', async () => {
    const replies = await talk([{
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'something_else', arguments: {} },
    }]);
    expect(received).toHaveLength(0);
    expect((replies[0].result as { isError: boolean }).isError).toBe(true);
  }, 20_000);
});
