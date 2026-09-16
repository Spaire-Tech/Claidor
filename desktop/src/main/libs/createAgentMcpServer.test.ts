import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { CREATE_AGENT_TOOL } from '../../shared/staffing/constants';
import { resolveCreateAgentMcpStdioLaunch } from './createAgentMcpServer';

let baseDir = '';

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-agent-mcp-'));
});

afterEach(() => {
  fs.rmSync(baseDir, { recursive: true, force: true });
});

const launch = (over: Record<string, unknown> = {}) =>
  resolveCreateAgentMcpStdioLaunch(baseDir, {
    electronNodeRuntimePath: '/Applications/Caisra.app/Contents/MacOS/Caisra',
    bridgeUrl: 'http://127.0.0.1:51515/create-agent',
    bridgeSecret: 'bridge-secret',
    platform: 'darwin',
    ...over,
  } as never);

const serverSource = (): string => {
  const file = path.join(baseDir, 'create-agent-mcp', 'create-agent-mcp-server.mjs');
  if (!fs.existsSync(file)) launch();
  return fs.readFileSync(file, 'utf8');
};

describe('what gets written to disk', () => {
  test('a launcher the gateway can run, and the server beside it', () => {
    const result = launch();
    expect(fs.existsSync(result.command)).toBe(true);
    expect(result.env.ELECTRON_RUN_AS_NODE).toBe('1');
    expect(serverSource()).toContain(CREATE_AGENT_TOOL);
  });

  test('the bridge secret is not world-readable', () => {
    launch();
    const dir = path.join(baseDir, 'create-agent-mcp');
    const config = path.join(dir, 'create-agent-mcp-runtime.json');
    expect(fs.statSync(config).mode & 0o077).toBe(0);
    expect(fs.statSync(dir).mode & 0o077).toBe(0);
  });

  test('it refuses to write half a setup', () => {
    expect(() => launch({ bridgeSecret: '' })).toThrow(/bridge/i);
    expect(() => launch({ electronNodeRuntimePath: '  ' })).toThrow(/runtime path/i);
  });

  test('windows gets a .cmd, posix gets a shell script', () => {
    expect(path.basename(launch({ platform: 'win32' }).command)).toBe('create-agent-mcp.cmd');
    expect(path.basename(launch({ platform: 'linux' }).command)).toBe('create-agent-mcp');
  });
});

describe('what the model is told', () => {
  test('the person is asked first, and a no is final for that agent', () => {
    const source = serverSource();
    expect(source).toMatch(/The person is asked first/);
    expect(source).toMatch(/do not call again for the same agent/);
  });

  test('one job, explicit anti-jobs, no more agents than asked for', () => {
    const source = serverSource();
    expect(source).toMatch(/at least one\s*',\s*'anti-job|Give at least one/);
    expect(source).toMatch(/Never stand up more than the person asked for/);
    expect(source).toContain("required: ['name', 'label', 'job', 'antiJobs']");
  });
});
