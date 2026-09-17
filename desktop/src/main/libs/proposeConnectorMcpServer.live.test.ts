import { type ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
  PROPOSE_CONNECTOR_ROUTE,
  PROPOSE_CONNECTOR_TOOL,
  ProposeConnectorBehavior,
} from '../../shared/connections/proposal';
import { resolveProposeConnectorMcpStdioLaunch } from './proposeConnectorMcpServer';

/**
 * The server, actually run: spawned, spoken to over stdio, with a real
 * HTTP bridge standing in for the app. The same proof the staffing
 * server has, for the same reason: a stdio MCP server has three ways to
 * be silently broken that no reading catches.
 */

let baseDir = '';
let bridge: http.Server | undefined;
let child: ChildProcess | undefined;
let received: unknown[] = [];
let reply: { status?: number; body: unknown } = { body: { behavior: ProposeConnectorBehavior.Connected, connectionId: 'gmail', name: 'Gmail' } };

const startBridge = async (): Promise<string> => {
  received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      received.push({ secret: req.headers['x-mcp-bridge-secret'], body: JSON.parse(body || '{}'), url: req.url });
      res.writeHead(reply.status ?? 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply.body));
    });
  });
  bridge = server;
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return `http://127.0.0.1:${port}${PROPOSE_CONNECTOR_ROUTE}`;
};

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'propose-connector-live-'));
  reply = { body: { behavior: ProposeConnectorBehavior.Connected, connectionId: 'gmail', name: 'Gmail' } };
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
  const serverDir = path.join(baseDir, 'propose-connector-mcp');
  resolveProposeConnectorMcpStdioLaunch(baseDir, {
    electronNodeRuntimePath: process.execPath,
    bridgeUrl,
    bridgeSecret: 'live-secret',
    platform: process.platform,
  });

  const proc = spawn(process.execPath, [path.join(serverDir, 'propose-connector-mcp-server.mjs')], {
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

const call = (args: unknown) => ({
  jsonrpc: '2.0', id: 1, method: 'tools/call',
  params: { name: PROPOSE_CONNECTOR_TOOL, arguments: args },
});

type ToolResult = { isError?: boolean; content: { text: string }[]; structuredContent?: unknown };

describe('the server, spawned and spoken to', () => {
  test('it introduces itself and lists its one tool, with the catalogue in the schema', async () => {
    const replies = await talk([
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ]);
    expect((replies[0].result as { serverInfo: { name: string } }).serverInfo.name).toBe('connectors');
    const tools = (replies[1].result as { tools: { name: string; inputSchema: { properties: { connectionId: { enum: string[] } } } }[] }).tools;
    expect(tools.map(one => one.name)).toEqual([PROPOSE_CONNECTOR_TOOL]);
    expect(tools[0].inputSchema.properties.connectionId.enum).toContain('gmail');
  }, 20_000);

  test('a call reaches the bridge with the id, the reason and the secret, and comes back connected', async () => {
    const replies = await talk([call({ connectionId: 'gmail', reason: 'To read the thread you named.' })]);
    expect(received).toHaveLength(1);
    const request = received[0] as { secret: string; body: Record<string, unknown>; url: string };
    expect(request.secret).toBe('live-secret');
    expect(request.url).toBe(PROPOSE_CONNECTOR_ROUTE);
    expect(request.body).toEqual({ connectionId: 'gmail', reason: 'To read the thread you named.' });

    const result = replies[0].result as ToolResult;
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('Gmail is connected now.');
    expect(result.structuredContent).toEqual({ connectionId: 'gmail', name: 'Gmail' });
  }, 20_000);

  test('a decline comes back as a decision, not an error to retry', async () => {
    reply = { body: { behavior: ProposeConnectorBehavior.Declined } };
    const replies = await talk([call({ connectionId: 'notion' })]);
    const result = replies[0].result as ToolResult;
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toMatch(/^They said not now\./);
    expect(result.content[0].text).toMatch(/Do not raise the card for this service again/);
    expect(result.structuredContent).toBeUndefined();
  }, 20_000);

  test('a failure is an error with the reason, so the model can say what happened', async () => {
    reply = { body: { behavior: ProposeConnectorBehavior.Failed, reason: 'Notion said no to that account' } };
    const replies = await talk([call({ connectionId: 'notion' })]);
    const result = replies[0].result as ToolResult;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('The sign-in failed: Notion said no to that account.');
  }, 20_000);

  test('a refusal from the bridge (a bad id) carries its reason back, list and all', async () => {
    reply = { status: 400, body: { behavior: ProposeConnectorBehavior.Failed, reason: '"myspace" is not a connector this app can connect. Use one of: gmail, notion.' } };
    const replies = await talk([call({ connectionId: 'myspace' })]);
    const result = replies[0].result as ToolResult;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/"myspace" is not a connector this app can connect/);
  }, 20_000);

  test('no id is refused before it reaches the bridge', async () => {
    const replies = await talk([call({})]);
    expect(received).toHaveLength(0);
    expect((replies[0].result as ToolResult).isError).toBe(true);
  }, 20_000);

  test('an unknown tool is refused rather than passed through', async () => {
    const replies = await talk([{
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'something_else', arguments: {} },
    }]);
    expect(received).toHaveLength(0);
    expect((replies[0].result as ToolResult).isError).toBe(true);
  }, 20_000);
});
