import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { connectorIds, PROPOSE_CONNECTOR_TOOL } from '../../shared/connections/proposal';
import { resolveProposeConnectorMcpStdioLaunch } from './proposeConnectorMcpServer';

let baseDir = '';

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'propose-connector-mcp-'));
});

afterEach(() => {
  fs.rmSync(baseDir, { recursive: true, force: true });
});

const launch = (over: Record<string, unknown> = {}) =>
  resolveProposeConnectorMcpStdioLaunch(baseDir, {
    electronNodeRuntimePath: '/Applications/Caisra.app/Contents/MacOS/Caisra',
    bridgeUrl: 'http://127.0.0.1:51515/propose-connector',
    bridgeSecret: 'bridge-secret',
    platform: 'darwin',
    ...over,
  } as never);

const serverSource = (): string => {
  const file = path.join(baseDir, 'propose-connector-mcp', 'propose-connector-mcp-server.mjs');
  if (!fs.existsSync(file)) launch();
  return fs.readFileSync(file, 'utf8');
};

describe('what gets written to disk', () => {
  test('a launcher the gateway can run, and the server beside it', () => {
    const result = launch();
    expect(fs.existsSync(result.command)).toBe(true);
    expect(result.env.ELECTRON_RUN_AS_NODE).toBe('1');
    expect(serverSource()).toContain(PROPOSE_CONNECTOR_TOOL);
  });

  test('the bridge secret is not world-readable', () => {
    launch();
    const dir = path.join(baseDir, 'propose-connector-mcp');
    const config = path.join(dir, 'propose-connector-mcp-runtime.json');
    expect(fs.statSync(config).mode & 0o077).toBe(0);
    expect(fs.statSync(dir).mode & 0o077).toBe(0);
    expect(JSON.parse(fs.readFileSync(config, 'utf8')).bridgeUrl).toBe('http://127.0.0.1:51515/propose-connector');
  });

  test('it refuses to write half a setup', () => {
    expect(() => launch({ bridgeSecret: '' })).toThrow(/bridge/i);
    expect(() => launch({ electronNodeRuntimePath: '  ' })).toThrow(/runtime path/i);
  });

  test('windows gets a .cmd, posix gets a shell script', () => {
    expect(path.basename(launch({ platform: 'win32' }).command)).toBe('propose-connector-mcp.cmd');
    expect(path.basename(launch({ platform: 'linux' }).command)).toBe('propose-connector-mcp');
  });
});

describe('what the model is told', () => {
  test('when to raise the card, and never to send them to Apps', () => {
    const source = serverSource();
    // The description is JSON-stringified into the source, so a line
    // break between its joined lines is the two characters `\n`.
    expect(source).toMatch(/whenever(\\n|\s)the person asks about a service that is not connected/);
    expect(source).toMatch(/Never tell them to go to Apps/);
    expect(source).toMatch(/the card does the whole of it/);
  });

  test('a no holds for the conversation, and the outcome is one of three', () => {
    const source = serverSource();
    expect(source).toMatch(/do not raise the card for that service again in this/);
    expect(source).toMatch(/connected, declined, or failed/);
  });

  test('only the catalogue: the schema lists every id and nothing else', () => {
    const source = serverSource();
    expect(source).toContain(`enum: ${JSON.stringify(connectorIds())}`);
    expect(source).toContain("required: ['connectionId']");
    // No model names, no engine names, nothing but Caisra's own words.
    expect(source).not.toMatch(/openclaw|lobster|netease|youdao/i);
  });
});
