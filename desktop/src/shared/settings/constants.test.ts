import { describe, expect, test } from 'vitest';

import {
  asExecPolicy,
  DEFAULT_EXEC_POLICY,
  enginePolicyFor,
  ExecPolicy,
} from './constants';

describe('the exec policy', () => {
  test('asks by default', () => {
    // `direction.md`: every action on the computer asks first. Upstream
    // pinned this to the opposite and the approval card could not fire.
    expect(DEFAULT_EXEC_POLICY).toBe(ExecPolicy.Ask);
  });

  test('Ask is the engine\'s `ask` mode, exactly', () => {
    // resolveExecPolicyForMode("ask") in infra/exec-approvals.ts.
    expect(enginePolicyFor(ExecPolicy.Ask))
      .toEqual({ security: 'allowlist', ask: 'on-miss', autoReview: false });
  });

  test('Auto is the engine\'s `auto` mode, exactly', () => {
    expect(enginePolicyFor(ExecPolicy.Auto))
      .toEqual({ security: 'allowlist', ask: 'on-miss', autoReview: true });
  });

  test('Allow is the engine\'s `full` mode — the one that bypasses', () => {
    // bash-tools.exec.ts treats security:"full" + ask:"off" as a full
    // bypass. That is what this app shipped with, for everybody.
    expect(enginePolicyFor(ExecPolicy.Allow))
      .toEqual({ security: 'full', ask: 'off', autoReview: false });
  });

  test('only Allow can turn asking off', () => {
    for (const policy of [ExecPolicy.Ask, ExecPolicy.Auto]) {
      expect(enginePolicyFor(policy).ask, policy).not.toBe('off');
    }
  });

  test('anything unrecognised falls back to asking', () => {
    // An older build, a hand-edited database, a null. None of those are a
    // reason to start running commands without permission.
    for (const value of [undefined, null, '', 'full', 'off', 42, {}]) {
      expect(asExecPolicy(value)).toBe(ExecPolicy.Ask);
    }
  });

  test('a real value is kept', () => {
    expect(asExecPolicy('allow')).toBe(ExecPolicy.Allow);
    expect(asExecPolicy('auto')).toBe(ExecPolicy.Auto);
    expect(asExecPolicy('ask')).toBe(ExecPolicy.Ask);
  });
});
