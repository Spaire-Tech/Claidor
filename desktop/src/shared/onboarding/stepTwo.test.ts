import { describe, expect, test } from 'vitest';

import { STEP_TWO_TITLE, stepTwoKickoff } from './stepTwo';

describe('the hidden turn that opens step two', () => {
  test('carries the name and the work type, and the beats in order', () => {
    const turn = stepTwoKickoff({ userName: 'Bass', workType: 'Founder / Business Owner' });
    expect(turn).toMatch(/^\[From the app, not from Bass\./);
    expect(turn).toContain('they chose: Founder / Business Owner.');
    expect(turn).toContain('twenty-three Caisra Agents already trained');
    expect(turn.indexOf('not going to hand them a blank team')).toBeLessThan(turn.indexOf('call propose_team'));
    expect(turn).toContain('say so in one short line each');
    expect(turn).toContain('ask before connecting anything');
  });

  test('their own words go through one clarifying line and picks, not the table', () => {
    const turn = stepTwoKickoff({ userName: 'Bass', workType: 'I run a bakery', ownWords: true });
    expect(turn).toContain('typed in their own words: "I run a bakery"');
    expect(turn).toContain('your own two or three picks');
  });

  test('a blank name is not a blank sentence', () => {
    expect(stepTwoKickoff({ userName: '  ', workType: 'Student' })).toContain('the person has just finished');
  });

  test('the conversation has a title, since nobody typed its first line', () => {
    expect(STEP_TWO_TITLE).toBe('Your starter team');
  });
});
