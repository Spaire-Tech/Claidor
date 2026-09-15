import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { ASK_INPUT_TOOL } from '../../shared/askInput/constants';
import { resolveAskInputMcpStdioLaunch } from './askInputMcpServer';

let baseDir = '';

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-input-mcp-'));
});

afterEach(() => {
  fs.rmSync(baseDir, { recursive: true, force: true });
});

const launch = (over: Record<string, unknown> = {}) =>
  resolveAskInputMcpStdioLaunch(baseDir, {
    electronNodeRuntimePath: '/Applications/Caisra.app/Contents/MacOS/Caisra',
    bridgeUrl: 'http://127.0.0.1:51515/ask-input',
    bridgeSecret: 'bridge-secret',
    platform: 'darwin',
    ...over,
  } as never);

/** Writes the server if it is not there yet, then reads it back. */
const serverSource = (): string => {
  const file = path.join(baseDir, 'ask-input-mcp', 'ask-input-mcp-server.mjs');
  if (!fs.existsSync(file)) launch();
  return fs.readFileSync(file, 'utf8');
};

describe('what gets written to disk', () => {
  test('a launcher the gateway can run, and the server beside it', () => {
    const result = launch();
    expect(fs.existsSync(result.command)).toBe(true);
    expect(result.env.ELECTRON_RUN_AS_NODE).toBe('1');
    expect(serverSource()).toContain(ASK_INPUT_TOOL);
  });

  test('the bridge secret is not world-readable', () => {
    // Anything that can read this file can raise a card asking this
    // person for their password.
    launch();
    const dir = path.join(baseDir, 'ask-input-mcp');
    const config = path.join(dir, 'ask-input-mcp-runtime.json');
    expect(fs.statSync(config).mode & 0o077).toBe(0);
    expect(fs.statSync(dir).mode & 0o077).toBe(0);
  });

  test('rewriting is a no-op when nothing changed', () => {
    launch();
    const config = path.join(baseDir, 'ask-input-mcp', 'ask-input-mcp-runtime.json');
    const before = fs.statSync(config).mtimeMs;
    launch();
    expect(fs.statSync(config).mtimeMs).toBe(before);
  });

  test('it refuses to write half a setup', () => {
    expect(() => launch({ bridgeSecret: '' })).toThrow(/bridge/i);
    expect(() => launch({ electronNodeRuntimePath: '  ' })).toThrow(/runtime path/i);
  });

  test('windows gets a .cmd, posix gets a shell script', () => {
    expect(path.basename(launch({ platform: 'win32' }).command)).toBe('ask-input-mcp.cmd');
    expect(path.basename(launch({ platform: 'linux' }).command)).toBe('ask-input-mcp');
  });
});

describe('what the model is told', () => {
  test('the tool says never to ask for a password in chat', () => {
    // The failure mode here is not a crash. It is the agent politely
    // asking somebody to type their password into a chat box, which is
    // the thing this tool exists to stop.
    const source = serverSource();
    expect(source).toMatch(/NEVER ask the person to send a password, key or code as a chat message/);
  });

  test('it says to ask for everything at once', () => {
    expect(serverSource()).toMatch(/one call rather than several/);
  });

  test('it says never to offer to keep a one-time code', () => {
    expect(serverSource()).toMatch(/Never for a one-time code/);
  });

  test('a decline is a decision, not a failure to retry', () => {
    // Asking twice for a password is how software teaches people to stop
    // reading what it asks for.
    const source = serverSource();
    expect(source).toMatch(/Do not ask again/);
  });

  test('the schema names the three kinds of field, and marks which is masked', () => {
    const source = serverSource();
    expect(source).toContain("enum: ['line', 'secret', 'block']");
    expect(source).toMatch(/secret is masked and never enters the conversation/);
  });
});
