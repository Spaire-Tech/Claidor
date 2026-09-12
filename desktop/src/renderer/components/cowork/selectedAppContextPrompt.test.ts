import { describe, expect, test } from 'vitest';

import { buildSelectedAppContextPrompt } from './selectedAppContextPrompt';

describe('buildSelectedAppContextPrompt', () => {
  test('is nothing when no app was chosen', () => {
    expect(buildSelectedAppContextPrompt(undefined)).toBeUndefined();
  });

  test('is nothing when the slug is blank', () => {
    expect(buildSelectedAppContextPrompt({ slug: '  ', name: 'Gmail' })).toBeUndefined();
  });

  test('names the app and says it is a preference, not a restriction', () => {
    const prompt = buildSelectedAppContextPrompt({ slug: 'gmail', name: 'Gmail' });
    expect(prompt).toContain('Gmail');
    expect(prompt).toContain('<preferred_app name="Gmail" slug="gmail" />');
    expect(prompt).toContain('not a restriction');
  });

  test('falls back to the slug when the name is blank', () => {
    const prompt = buildSelectedAppContextPrompt({ slug: 'google_calendar', name: '  ' });
    expect(prompt).toContain('<preferred_app name="google_calendar" slug="google_calendar" />');
  });

  test('escapes a name that carries markup', () => {
    const prompt = buildSelectedAppContextPrompt({ slug: 'x', name: 'A "&" <b>' });
    expect(prompt).toContain('name="A &quot;&amp;&quot; &lt;b&gt;"');
  });
});
