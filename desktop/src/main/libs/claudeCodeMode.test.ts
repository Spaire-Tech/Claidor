import { describe, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: true } }));

import { CLAUDE_CODE_ENV, decideClaudeCodeMode } from './claudeCodeMode';

describe('decideClaudeCodeMode', () => {
  // 17 September: off everywhere. The founder asked for the account's
  // model back after Claude Code's permission protocol changed under
  // the engine (review item 66); no build turns the mechanic on by
  // itself any more, installed or not.
  test('a development build with Claude Code installed stays on the account', () => {
    const off = decideClaudeCodeMode({ env: {}, packaged: false, command: '/opt/homebrew/bin/claude' });
    expect(off.enabled).toBe(false);
    expect(off.command).toBe('/opt/homebrew/bin/claude');
    expect(off.reason).toMatch(/development build/);
  });

  test('a development build without Claude Code stays on the account', () => {
    expect(decideClaudeCodeMode({ env: {}, packaged: false, command: null }).enabled).toBe(false);
  });

  test('a packaged build never does, whatever is installed', () => {
    const off = decideClaudeCodeMode({ env: {}, packaged: true, command: '/usr/local/bin/claude' });
    expect(off.enabled).toBe(false);
    expect(off.reason).toMatch(/packaged/);
  });

  test('the env var is the only way on, and still turns it off explicitly', () => {
    expect(decideClaudeCodeMode({ env: { [CLAUDE_CODE_ENV]: '0' }, packaged: false, command: '/x/claude' }).enabled).toBe(false);
    expect(decideClaudeCodeMode({ env: { [CLAUDE_CODE_ENV]: 'off' }, packaged: false, command: '/x/claude' }).enabled).toBe(false);
    const on = decideClaudeCodeMode({ env: { [CLAUDE_CODE_ENV]: '1' }, packaged: false, command: '/x/claude' });
    expect(on.enabled).toBe(true);
    expect(on.command).toBe('/x/claude');
    const forced = decideClaudeCodeMode({ env: { [CLAUDE_CODE_ENV]: '1' }, packaged: true, command: null });
    expect(forced.enabled).toBe(true);
    expect(forced.command).toBeNull();
    expect(forced.reason).toMatch(/no claude command/);
  });
});
