import { describe, expect, test } from 'vitest';

import { composeQuestionText } from './CoworkQuestionWizard';

describe('the question card’s words', () => {
  test('a header that adds meaning joins the question', () => {
    expect(composeQuestionText('How often should I re-run this check?', 'Frequency'))
      .toBe('Frequency: How often should I re-run this check?');
  });

  test('a header the question already says is dropped', () => {
    expect(composeQuestionText('Which version should the board pack use?', 'Board pack'))
      .toBe('Which version should the board pack use?');
    expect(composeQuestionText('Keep the change log?', '  ')).toBe('Keep the change log?');
    expect(composeQuestionText('Keep the change log?')).toBe('Keep the change log?');
  });
});
