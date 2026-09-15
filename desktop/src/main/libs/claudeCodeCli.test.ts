import { describe, expect, test } from 'vitest';

import { CLAUDE_CLI_ENV, claudeCliCandidates, findClaudeCli } from './claudeCodeCli';

describe('claudeCliCandidates', () => {
  test('override first, then what PATH said, then where the installers put it', () => {
    const list = claudeCliCandidates({
      home: '/Users/bass', platform: 'darwin',
      env: { [CLAUDE_CLI_ENV]: '/custom/claude' },
      lookup: ['/opt/homebrew/bin/claude'],
    });
    expect(list[0]).toBe('/custom/claude');
    expect(list[1]).toBe('/opt/homebrew/bin/claude');
    expect(list).toContain('/Users/bass/.claude/local/claude');
    expect(list).toContain('/usr/local/bin/claude');
    // No duplicates, even when PATH and the usual list agree.
    expect(list.filter(one => one === '/opt/homebrew/bin/claude')).toHaveLength(1);
  });

  test('on Windows the names carry their extension', () => {
    const list = claudeCliCandidates({ home: 'C:\\Users\\bass', platform: 'win32', env: {} });
    expect(list.some(one => one.endsWith('claude.exe'))).toBe(true);
    expect(list.some(one => one.endsWith('claude.cmd'))).toBe(true);
  });
});

describe('findClaudeCli', () => {
  test('the first candidate that exists, or null and no guess', () => {
    const exists = (file: string): boolean => file === '/usr/local/bin/claude';
    expect(findClaudeCli(['/nope/claude', '/usr/local/bin/claude', '/also/claude'], exists)).toBe('/usr/local/bin/claude');
    expect(findClaudeCli(['/nope/claude'], exists)).toBeNull();
  });
});
