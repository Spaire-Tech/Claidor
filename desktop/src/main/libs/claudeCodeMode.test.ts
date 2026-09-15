import { describe, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: true } }));

import { CLAUDE_CODE_ENV, decideClaudeCodeMode } from './claudeCodeMode';

describe('decideClaudeCodeMode', () => {
  test('a development build with Claude Code installed runs on it', () => {
    const on = decideClaudeCodeMode({ env: {}, packaged: false, command: '/opt/homebrew/bin/claude' });
    expect(on.enabled).toBe(true);
    expect(on.command).toBe('/opt/homebrew/bin/claude');
  });

  test('a development build without Claude Code stays on the account', () => {
    expect(decideClaudeCodeMode({ env: {}, packaged: false, command: null }).enabled).toBe(false);
  });

  test('a packaged build never does, whatever is installed', () => {
    const off = decideClaudeCodeMode({ env: {}, packaged: true, command: '/usr/local/bin/claude' });
    expect(off.enabled).toBe(false);
    expect(off.reason).toMatch(/packaged/);
  });

  test('the env var overrides in either direction', () => {
    expect(decideClaudeCodeMode({ env: { [CLAUDE_CODE_ENV]: '0' }, packaged: false, command: '/x/claude' }).enabled).toBe(false);
    expect(decideClaudeCodeMode({ env: { [CLAUDE_CODE_ENV]: 'off' }, packaged: false, command: '/x/claude' }).enabled).toBe(false);
    const forced = decideClaudeCodeMode({ env: { [CLAUDE_CODE_ENV]: '1' }, packaged: true, command: null });
    expect(forced.enabled).toBe(true);
    expect(forced.command).toBeNull();
    expect(forced.reason).toMatch(/no claude command/);
  });
});
