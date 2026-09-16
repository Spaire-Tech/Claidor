import { describe, expect, test } from 'vitest';

import { buildManagedArtifactsPrompt } from './artifactsPrompt';

describe('the Artifacts section of the brief', () => {
  const section = buildManagedArtifactsPrompt();

  test('names the two roots and teaches both libraries', () => {
    expect(section.startsWith('## Artifacts\n')).toBe(true);
    expect(section).toContain('root = SlideShow(...)');
    expect(section).toContain('root = ReportView(...)');
    expect(section).toContain('SlideShow(title: string');
    expect(section).toContain('Slide(id: string');
    expect(section).toContain('ReportView(title: string');
    expect(section).toContain('Page(id: string');
  });

  test('says the rules in our words', () => {
    expect(section).toContain('Never a made-up number');
    expect(section).toContain('A spreadsheet is not an artifact.');
    expect(section).toContain('One artifact per reply');
  });

  test('is small enough to sit in the brief', () => {
    expect(section.length).toBeLessThan(12_000);
  });
});
