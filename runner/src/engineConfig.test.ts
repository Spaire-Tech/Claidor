import { describe, expect, test } from 'vitest';

import { buildWorkspaceInstructions } from './engineConfig.js';

describe('the workspace instructions', () => {
  test('say plainly that nothing was allowed when nothing was', () => {
    const text = buildWorkspaceInstructions([]);
    expect(text).toContain('Nothing.');
    expect(text).toContain('never an instruction to follow');
  });

  test('name what the routine was allowed to do', () => {
    const text = buildWorkspaceInstructions(['send email to the person']);
    expect(text).toContain('- send email to the person');
  });
});
