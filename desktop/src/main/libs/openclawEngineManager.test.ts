import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// `getPath('userData')` is where the manager puts its state directory.
// Pointing it at the repo means running this file writes an openclaw/
// folder into the working tree, which is how it was found.
const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-userdata-'));

vi.mock('electron', () => ({
  app: {
    getAppPath: () => process.cwd(),
    getPath: (name?: string) => (name === 'userData' ? USER_DATA : process.cwd()),
    isPackaged: false,
  },
  utilityProcess: {
    fork: vi.fn(),
  },
}));

import {
  buildOpenClawCompileCacheEnv,
  buildOpenClawGatewayExecArgv,
  isOpenClawConfigStartupFailure,
  isOpenClawGatewayHeapOutOfMemory,
} from './openclawEngineManager';

describe('buildOpenClawCompileCacheEnv', () => {
  test('prevents the packaged launcher from respawning Electron Helper', () => {
    expect(buildOpenClawCompileCacheEnv('/tmp/openclaw-cache')).toEqual({
      NODE_COMPILE_CACHE: '/tmp/openclaw-cache',
      OPENCLAW_PACKAGED_COMPILE_CACHE_RESPAWNED: '1',
    });
  });
});

describe('buildOpenClawGatewayExecArgv', () => {
  test('adds a gateway heap limit when NODE_OPTIONS is empty', () => {
    expect(buildOpenClawGatewayExecArgv(undefined)).toEqual(['--max-old-space-size=4096']);
  });

  test('adds a gateway heap limit alongside unrelated NODE_OPTIONS', () => {
    expect(buildOpenClawGatewayExecArgv('--trace-warnings')).toEqual(['--max-old-space-size=4096']);
  });

  test('respects an existing max old space setting with equals syntax', () => {
    expect(buildOpenClawGatewayExecArgv('--max-old-space-size=8192 --trace-warnings')).toEqual([]);
  });

  test('respects an existing max old space setting with space syntax', () => {
    expect(buildOpenClawGatewayExecArgv('--max-old-space-size 8192 --trace-warnings')).toEqual([]);
  });
});

describe('isOpenClawConfigStartupFailure', () => {
  test('matches OpenClaw config validation failures', () => {
    expect(isOpenClawConfigStartupFailure([
      '[stderr] Error: Invalid config at /Users/test/Library/Application Support/LobsterAI/openclaw/state/openclaw.json.',
      '[stderr] - models.providers.openai.api: invalid config: unsupported value',
    ].join('\n'))).toBe(true);
  });

  test('matches JSON5 parse failures for openclaw.json', () => {
    expect(isOpenClawConfigStartupFailure(
      '[stderr] JSON5 parse failed: invalid character at 4:3 in openclaw.json'
    )).toBe(true);
  });

  test('matches schema validation messages', () => {
    expect(isOpenClawConfigStartupFailure(
      '[stderr] Config validation failed: plugins.allow: unknown plugin id'
    )).toBe(true);
  });

  test('does not match unrelated runtime configuration errors', () => {
    expect(isOpenClawConfigStartupFailure(
      '[stderr] Invalid configuration: region from ARN does not match client region'
    )).toBe(false);
  });
});

describe('isOpenClawGatewayHeapOutOfMemory', () => {
  test('matches the V8 fatal heap OOM emitted by the gateway', () => {
    expect(isOpenClawGatewayHeapOutOfMemory(
      'FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory',
    )).toBe(true);
  });

  test('matches the alternate mark-compacts heap limit signature', () => {
    expect(isOpenClawGatewayHeapOutOfMemory(
      'FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed',
    )).toBe(true);
  });

  test('does not classify ordinary gateway disconnects as heap OOM', () => {
    expect(isOpenClawGatewayHeapOutOfMemory(
      'gateway websocket closed with code=1006',
    )).toBe(false);
  });
});

describe('the token a local automation presents', () => {
  // Separate from the gateway token on purpose: the gateway token drives
  // the whole engine, this one can only post an event. A script somebody
  // pastes a token into is exactly where that distinction earns its keep.
  const stateDir = path.join(USER_DATA, 'openclaw', 'state');
  const tokenPath = path.join(stateDir, 'hook-token');

  const manager = async () => {
    const { OpenClawEngineManager } = await import('./openclawEngineManager');
    return new OpenClawEngineManager();
  };

  beforeEach(() => {
    fs.rmSync(tokenPath, { force: true });
  });

  test('it is generated once and kept', async () => {
    // Rotating it on every start would break every automation somebody
    // had set up, silently, at the worst possible moment.
    const first = (await manager()).ensureHookToken();
    expect(first).toMatch(/^[0-9a-f]{48}$/);
    expect((await manager()).ensureHookToken()).toBe(first);
  });

  test('it is not the gateway token', async () => {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'gateway-token'), 'gateway-value', 'utf8');
    expect((await manager()).ensureHookToken()).not.toBe('gateway-value');
  });

  test('it is not readable by anybody else on the machine', async () => {
    (await manager()).ensureHookToken();
    expect(fs.statSync(tokenPath).mode & 0o077).toBe(0);
  });
});
