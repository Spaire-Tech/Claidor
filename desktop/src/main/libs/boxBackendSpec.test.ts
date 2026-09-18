import { describe, expect, test } from 'vitest';

import {
  assertNoBinds,
  BOX_AGENT_WORKSPACE_ROOT,
  BOX_WORKSPACE_ROOT,
  buildBoxExecSpec,
  readBoxConfig,
  resolveBoxRuntimePaths,
} from '../../../openclaw-extensions/box/backendSpec';
import { BRIDGE_ENV } from '../../../openclaw-extensions/box/execProtocol.mjs';

const execSpecInput = {
  command: 'ls -la',
  env: { FOO: 'bar' },
  usePty: false,
  boxId: 'box_abc123',
  brokerBaseUrl: 'https://api.claidor.com',
  accessToken: 'secret-token',
  execBridgePath: '/apps/box/execBridge.mjs',
  baseEnv: { PATH: '/usr/bin' } as NodeJS.ProcessEnv,
  defaultWorkdir: BOX_WORKSPACE_ROOT,
};

describe('box runtime paths', () => {
  test('the shared scope is one box for every agent', () => {
    expect(resolveBoxRuntimePaths('shared').runtimeLabel).toBe('caisra-box-shared');
    // An empty scope key must not produce a nameless box.
    expect(resolveBoxRuntimePaths('').runtimeLabel).toBe('caisra-box-shared');
  });

  test('an agent scope gets its own box, named from the scope key', () => {
    expect(resolveBoxRuntimePaths('agent:research').runtimeLabel).toBe('caisra-box-agent-research');
  });

  test('a scope key full of punctuation still yields a usable name', () => {
    expect(resolveBoxRuntimePaths('!!! ***').runtimeLabel).toBe('caisra-box-shared');
  });

  test('the workspace is inside the box, never a host path', () => {
    const paths = resolveBoxRuntimePaths('shared');
    expect(paths.remoteWorkspaceDir).toBe(BOX_WORKSPACE_ROOT);
    expect(paths.remoteAgentWorkspaceDir).toBe(BOX_AGENT_WORKSPACE_ROOT);
    expect(paths.remoteWorkspaceDir.startsWith('/')).toBe(true);
    expect(paths.remoteWorkspaceDir).not.toContain('Users');
  });
});

describe('the exec spec the engine spawns', () => {
  test('points at the bridge, because a box has no local argv', () => {
    const spec = buildBoxExecSpec(execSpecInput);
    expect(spec.argv[0]).toBe(process.execPath);
    expect(spec.argv[1]).toBe('/apps/box/execBridge.mjs');
  });

  /**
   * Mirrors the docker backend. A non-pty exec must have its stdin closed by
   * the engine, or the bridge waits forever on a pipe that never ends.
   */
  test('closes stdin for a plain command and leaves it open only for a terminal', () => {
    expect(buildBoxExecSpec(execSpecInput).stdinMode).toBe('pipe-closed');
    expect(buildBoxExecSpec({ ...execSpecInput, usePty: true }).stdinMode).toBe('pipe-open');
  });

  test('never puts the access token in argv, which is readable in ps', () => {
    const spec = buildBoxExecSpec(execSpecInput);
    expect(spec.argv.join(' ')).not.toContain('secret-token');
    expect(spec.env[BRIDGE_ENV.token]).toBe('secret-token');
  });

  test('carries the command, box and workdir to the bridge', () => {
    const spec = buildBoxExecSpec(execSpecInput);
    expect(spec.env[BRIDGE_ENV.command]).toBe('ls -la');
    expect(spec.env[BRIDGE_ENV.boxId]).toBe('box_abc123');
    expect(spec.env[BRIDGE_ENV.workdir]).toBe(BOX_WORKSPACE_ROOT);
    expect(JSON.parse(String(spec.env[BRIDGE_ENV.env]))).toEqual({ FOO: 'bar' });
  });

  test('an explicit workdir wins over the box default', () => {
    const spec = buildBoxExecSpec({ ...execSpecInput, workdir: '/home/user/elsewhere' });
    expect(spec.env[BRIDGE_ENV.workdir]).toBe('/home/user/elsewhere');
  });

  test('passes the pty flag through as a flag the bridge can read', () => {
    expect(buildBoxExecSpec({ ...execSpecInput, usePty: true }).env[BRIDGE_ENV.pty]).toBe('1');
    expect(buildBoxExecSpec(execSpecInput).env[BRIDGE_ENV.pty]).toBe('0');
  });

  test('keeps the sanitized base environment it was handed', () => {
    expect(buildBoxExecSpec(execSpecInput).env.PATH).toBe('/usr/bin');
  });
});

describe('bind mounts', () => {
  test('are refused, because a box is not on this disk', () => {
    expect(() => assertNoBinds(['/Users/me/docs:/data'])).toThrow(/does not support sandbox.docker.binds/);
  });

  test('absent or empty binds are fine', () => {
    expect(() => assertNoBinds(undefined)).not.toThrow();
    expect(() => assertNoBinds([])).not.toThrow();
  });
});

describe('the config gate', () => {
  test('refuses a config with no broker', () => {
    expect(readBoxConfig({ accessToken: 't' })).toEqual({ error: 'no brokerBaseUrl' });
  });

  test('refuses a config with no token', () => {
    expect(readBoxConfig({ brokerBaseUrl: 'https://api.claidor.com' })).toEqual({
      error: 'no accessToken',
    });
  });

  test('refuses whitespace standing in for a value', () => {
    expect(readBoxConfig({ brokerBaseUrl: '   ', accessToken: 't' })).toEqual({
      error: 'no brokerBaseUrl',
    });
  });

  test('refuses nothing at all rather than throwing', () => {
    expect(readBoxConfig(undefined)).toEqual({ error: 'no brokerBaseUrl' });
  });

  test('accepts a complete config and normalizes the optional fields', () => {
    expect(readBoxConfig({
      brokerBaseUrl: ' https://api.claidor.com ',
      accessToken: ' tok ',
      template: '  ',
    })).toEqual({
      brokerBaseUrl: 'https://api.claidor.com',
      accessToken: 'tok',
      template: undefined,
      requestTimeoutMs: undefined,
    });
  });
});
