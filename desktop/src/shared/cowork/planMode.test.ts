import { expect, test } from 'vitest';

import {
  containsPlanModePrompt,
  isPlanImplementationApproval,
  PLAN_MODE_PROMPT_MARKER,
} from './planMode';

test('detects explicit approval to implement a plan', () => {
  expect(isPlanImplementationApproval('Implement the plan')).toBe(true);
  expect(isPlanImplementationApproval('Please execute the plan you just proposed')).toBe(true);
  expect(isPlanImplementationApproval('Start the implementation')).toBe(true);
  expect(isPlanImplementationApproval('Plan looks good, go ahead')).toBe(true);
  expect(isPlanImplementationApproval('Go ahead and implement the plan')).toBe(true);
  expect(isPlanImplementationApproval('Implement it')).toBe(true);
});

test('does not treat planning questions as implementation approval', () => {
  expect(isPlanImplementationApproval('How would this plan be implemented?')).toBe(false);
  expect(isPlanImplementationApproval('Keep refining the plan')).toBe(false);
  expect(isPlanImplementationApproval('Explain the plan')).toBe(false);
});

test('detects the plan mode prompt marker', () => {
  expect(containsPlanModePrompt(`${PLAN_MODE_PROMPT_MARKER}\nRules`)).toBe(true);
  expect(containsPlanModePrompt('# Plan Mode Execution Override')).toBe(false);
  expect(containsPlanModePrompt('# Default Mode')).toBe(false);
});
