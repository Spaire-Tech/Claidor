import { describe, expect, test } from 'vitest';

import { BOX_SANDBOX_SCOPE, resolveSandboxSettings } from './boxSandboxSettings';

const withBox = { boxBrokerBaseUrl: 'http://127.0.0.1:8123', isEnterprise: false };
const withoutBox = { boxBrokerBaseUrl: null, isEnterprise: false };

describe('what the execution mode decides', () => {
  test('local keeps the agent on this Mac', () => {
    const r = resolveSandboxSettings({ executionMode: 'local', ...withBox });
    expect(r.mode).toBe('off');
    expect(r.reason).toMatch(/this Mac/);
  });

  test('sandbox puts every agent on the box', () => {
    const r = resolveSandboxSettings({ executionMode: 'sandbox', ...withBox });
    expect(r).toMatchObject({ mode: 'all', backend: 'box', scope: BOX_SANDBOX_SCOPE });
  });

  test('auto leaves the main agent here and sends the rest to the box', () => {
    const r = resolveSandboxSettings({ executionMode: 'auto', ...withBox });
    expect(r).toMatchObject({ mode: 'non-main', backend: 'box' });
  });

  test('the box is one machine shared by every agent, not one each', () => {
    expect(BOX_SANDBOX_SCOPE).toBe('shared');
    expect(resolveSandboxSettings({ executionMode: 'sandbox', ...withBox }).scope).toBe('shared');
  });
});

describe('what being configured decides', () => {
  /**
   * The engine throws "Sandbox backend is not registered" at the first tool
   * call if it is told to use a backend no plugin provides. Resolving to off
   * puts the reason in the gateway log instead, before a turn is ruined.
   */
  test('no broker means off, with a reason, not a broken session', () => {
    const r = resolveSandboxSettings({ executionMode: 'sandbox', ...withoutBox });
    expect(r.mode).toBe('off');
    expect(r.backend).toBeUndefined();
    expect(r.reason).toMatch(/not reachable/);
  });

  test('an enterprise install with no box keeps the Docker sandbox it had', () => {
    const r = resolveSandboxSettings({
      executionMode: 'sandbox',
      boxBrokerBaseUrl: null,
      isEnterprise: true,
    });
    expect(r).toMatchObject({ mode: 'all', backend: 'docker' });
  });

  test('the box wins over Docker when both are available', () => {
    const r = resolveSandboxSettings({
      executionMode: 'sandbox',
      boxBrokerBaseUrl: 'http://127.0.0.1:8123',
      isEnterprise: true,
    });
    expect(r.backend).toBe('box');
  });

  /**
   * This is the line that used to read `if (!isEnterprise) return 'off'`, which
   * made the sandbox dead code for every ordinary install.
   */
  test('an ordinary install is no longer refused a sandbox', () => {
    expect(resolveSandboxSettings({ executionMode: 'sandbox', ...withBox }).mode).toBe('all');
  });

  test('local stays off even for enterprise with everything configured', () => {
    expect(resolveSandboxSettings({
      executionMode: 'local',
      boxBrokerBaseUrl: 'http://127.0.0.1:8123',
      isEnterprise: true,
    }).mode).toBe('off');
  });
});

describe('every resolution', () => {
  test('carries a reason, so the log can answer "why is it off"', () => {
    for (const executionMode of ['local', 'auto', 'sandbox'] as const) {
      for (const box of [withBox, withoutBox]) {
        for (const isEnterprise of [true, false]) {
          const r = resolveSandboxSettings({ executionMode, ...box, isEnterprise });
          expect(r.reason.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test('never names a backend without a mode to use it in', () => {
    for (const executionMode of ['local', 'auto', 'sandbox'] as const) {
      const r = resolveSandboxSettings({ executionMode, ...withoutBox, isEnterprise: false });
      if (r.mode === 'off') {
        expect(r.backend).toBeUndefined();
      }
    }
  });
});
