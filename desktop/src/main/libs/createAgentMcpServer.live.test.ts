import { type ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { CREATE_AGENT_TOOL } from '../../shared/staffing/constants';
import { resolveCreateAgentMcpStdioLaunch } from './createAgentMcpServer';

/**
 * The server, actually run: spawned, spoken to over stdio, with a real
 * HTTP bridge standing in for the app. The same proof the ask-input
 * server has, for the same reason: a stdio MCP server has three ways to
 * be silently broken that no reading catches.
 */

let baseDir = '';
let bridge: http.Server | undefined;
let child: ChildProcess | undefined;
let received: unknown[] = [];
let reply: unknown = { behavior: 'created', agentId: 'agent-42', name: 'Projects Manager' };

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
  return `http://127.0.0.1:${port}/create-agent`;
};

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-agent-live-'));
  reply = { behavior: 'created', agentId: 'agent-42', name: 'Projects Manager' };
});

afterEach(async () => {
  child?.kill();
  child = undefined;
  if (bridge) await new Promise<void>(resolve => bridge!.close(() => resolve()));
  bridge = undefined;
  fs.rmSync(baseDir, { recursive: true, force: true });
});

const talk = async (requests: unknown[]): Promise<Record<string, unknown>[]> => {
  const bridgeUrl = await startBridge();
  const serverDir = path.join(baseDir, 'create-agent-mcp');
  resolveCreateAgentMcpStdioLaunch(baseDir, {
    electronNodeRuntimePath: process.execPath,
    bridgeUrl,
    bridgeSecret: 'live-secret',
    platform: process.platform,
  });

  const proc = spawn(process.execPath, [path.join(serverDir, 'create-agent-mcp-server.mjs')], {
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

const brief = {
  name: 'Projects Manager',
  label: 'Project ops',
  job: 'Runs projects; specialists claim tasks.',
  antiJobs: ["Won't do specialist work itself"],
  voice: 'Short, decision-shaped.',
};

describe('the server, spawned and spoken to', () => {
  test('it introduces itself and lists the one tool', async () => {
    const replies = await talk([
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ]);
    expect((replies[0].result as { serverInfo: { name: string } }).serverInfo.name).toBe('staffing');
    const tools = (replies[1].result as { tools: { name: string }[] }).tools;
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe(CREATE_AGENT_TOOL);
  }, 20_000);

  test('a call reaches the bridge with the brief and the secret, and comes back with the agent', async () => {
    const replies = await talk([{
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: CREATE_AGENT_TOOL, arguments: brief },
    }]);
    expect(received).toHaveLength(1);
    const call = received[0] as { secret: string; body: Record<string, unknown> };
    expect(call.secret).toBe('live-secret');
    expect(call.body).toEqual(brief);

    const result = replies[0].result as { isError?: boolean; content: { text: string }[]; structuredContent?: unknown };
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toMatch(/Projects Manager is in, as agent agent-42/);
    expect(result.structuredContent).toEqual({ agentId: 'agent-42', name: 'Projects Manager' });
  }, 20_000);

  test('a decline comes back as a decision, not an error to retry', async () => {
    reply = { behavior: 'declined' };
    const replies = await talk([{
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: CREATE_AGENT_TOOL, arguments: brief },
    }]);
    const result = replies[0].result as { isError?: boolean; content: { text: string }[]; structuredContent?: unknown };
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toMatch(/Do not ask again/);
    expect(result.structuredContent).toBeUndefined();
  }, 20_000);

  test('a failure is an error with the reason, so the model can say what happened', async () => {
    reply = { behavior: 'failed', reason: 'the engine is restarting' };
    const replies = await talk([{
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: CREATE_AGENT_TOOL, arguments: brief },
    }]);
    const result = replies[0].result as { isError?: boolean; content: { text: string }[] };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/the engine is restarting/);
  }, 20_000);

  test('a brief with no anti-jobs is refused before it reaches the bridge', async () => {
    const replies = await talk([{
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: CREATE_AGENT_TOOL, arguments: { ...brief, antiJobs: [] } },
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
