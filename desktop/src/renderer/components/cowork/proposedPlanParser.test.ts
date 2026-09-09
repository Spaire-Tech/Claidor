import { describe, expect, test } from 'vitest';

import {
  normalizeProposedPlanMarkdown,
  parseProposedPlanBlock,
} from './proposedPlanParser';

describe('parseProposedPlanBlock', () => {
  test('extracts a proposed plan and removes it from visible text', () => {
    expect(parseProposedPlanBlock('Intro\n<proposed_plan>\n- Step\n</proposed_plan>\nOutro')).toEqual({
      visibleText: 'Intro\nOutro',
      planText: '- Step',
    });
  });

  test('leaves text unchanged when no plan block exists', () => {
    expect(parseProposedPlanBlock('Intro')).toEqual({
      visibleText: 'Intro',
      planText: null,
    });
  });

  test('parses an incomplete streaming plan block without showing the tag', () => {
    expect(parseProposedPlanBlock('Intro\n<proposed_plan>\n- Step')).toEqual({
      visibleText: 'Intro',
      planText: '- Step',
    });
  });

  test('hides a partial opening tag while it is streaming', () => {
    expect(parseProposedPlanBlock('Intro\n<proposed_')).toEqual({
      visibleText: 'Intro',
      planText: null,
    });
  });

  test('accepts case-insensitive tags with attributes', () => {
    expect(parseProposedPlanBlock('<PROPOSED_PLAN data-source="model">\n- Step\n</PROPOSED_PLAN>')).toEqual({
      visibleText: '',
      planText: '- Step',
    });
  });

  test('ignores inline tag mentions before the real plan block', () => {
    expect(parseProposedPlanBlock([
      'Plan Mode asks me to answer in the <proposed_plan> format.',
      'The real plan follows:',
      '<proposed_plan>',
      'Summary',
      'Explain quadratic equations.',
      '</proposed_plan>',
    ].join('\n'))).toEqual({
      visibleText: 'Plan Mode asks me to answer in the <proposed_plan> format.\nThe real plan follows:',
      planText: 'Summary\nExplain quadratic equations.',
      ignoredInlineOpenTagCount: 1,
    });
  });

  test('normalizes inline section labels in proposed plans', () => {
    expect(parseProposedPlanBlock('<proposed_plan>\nSummary: Build the page.\n</proposed_plan>')).toEqual({
      visibleText: '',
      planText: '## Summary\n\nBuild the page.',
      didNormalizePlanText: true,
    });
  });

  test('normalizes heading-style section labels with bodies on the same line', () => {
    expect(parseProposedPlanBlock([
      '<proposed_plan>',
      '## Summary Create a birthday party invitation page. ## Implementation Approach 1. Create index.html.',
      '</proposed_plan>',
    ].join('\n'))).toEqual({
      visibleText: '',
      planText: [
        '## Summary',
        '',
        'Create a birthday party invitation page.',
        '## Implementation Approach',
        '',
        '1. Create index.html.',
      ].join('\n'),
      didNormalizePlanText: true,
    });
  });

  test('normalizes bold section labels with bodies on the same line', () => {
    expect(parseProposedPlanBlock([
      '<proposed_plan>',
      '**Summary** Build the quarterly review deck. **Implementation Approach** 1. Use the html2pptx workflow.',
      '</proposed_plan>',
    ].join('\n'))).toEqual({
      visibleText: '',
      planText: [
        '## Summary',
        '',
        'Build the quarterly review deck.',
        '## Implementation Approach',
        '',
        '1. Use the html2pptx workflow.',
      ].join('\n'),
      didNormalizePlanText: true,
    });
  });

  test('normalizes bold-only section labels before bodies on the next line', () => {
    expect(parseProposedPlanBlock([
      '<proposed_plan>',
      '**Summary**',
      'Build a warm, artsy single-page showcase site for "Wheatfield Bakery".',
      '',
      '**Implementation Approach**',
      '1. Create index.html with plain HTML + CSS + JS.',
      '</proposed_plan>',
    ].join('\n'))).toEqual({
      visibleText: '',
      planText: [
        '## Summary',
        'Build a warm, artsy single-page showcase site for "Wheatfield Bakery".',
        '',
        '## Implementation Approach',
        '1. Create index.html with plain HTML + CSS + JS.',
      ].join('\n'),
      didNormalizePlanText: true,
    });
  });
});

describe('normalizeProposedPlanMarkdown', () => {
  test('moves known section bodies to the line after the heading', () => {
    expect(normalizeProposedPlanMarkdown([
      '**Summary:** Generate educational content.',
      '## Implementation Approach: Use structured sections.',
      '**Summary** Create a single-page site for the client.',
      'Key Changes: Add examples.',
    ].join('\n'))).toBe([
      '## Summary',
      '',
      'Generate educational content.',
      '## Implementation Approach',
      '',
      'Use structured sections.',
      '## Summary',
      '',
      'Create a single-page site for the client.',
      '## Key Changes',
      '',
      'Add examples.',
    ].join('\n'));
  });

  test('does not normalize labels inside fenced code blocks', () => {
    expect(normalizeProposedPlanMarkdown([
      '```md',
      'Summary: Keep this literal.',
      '```',
      'Validation: Run tests.',
    ].join('\n'))).toBe([
      '```md',
      'Summary: Keep this literal.',
      '```',
      '## Validation',
      '',
      'Run tests.',
    ].join('\n'));
  });
});
