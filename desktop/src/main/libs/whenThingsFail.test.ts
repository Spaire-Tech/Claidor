import { describe, expect, test } from 'vitest';

import { buildFailureReference, WHEN_THINGS_FAIL_PATH } from './whenThingsFail';

const ref = (over: Partial<Parameters<typeof buildFailureReference>[0]> = {}): string =>
  buildFailureReference({
    appName: 'Faiser',
    logDir: '/Users/bass/Library/Logs/Faiser',
    gatewayLogDir: '/Users/bass/Library/Application Support/Faiser/openclaw/logs',
    engineConfigPath: '/Users/bass/Library/Application Support/Faiser/openclaw/state/openclaw.json',
    ...over,
  });

describe('the paths are this machine’s, not an example', () => {
  // The whole reason this file is generated. A hand-written path in a
  // comment named the wrong directory for weeks after the app was
  // renamed, and three separate investigations grepped an empty folder
  // (review.md §24).
  test('it prints the log directory it was given', () => {
    expect(ref()).toContain('/Users/bass/Library/Logs/Faiser');
    expect(ref({ logDir: '/somewhere/else' })).toContain('/somewhere/else');
  });

  test('it names the app it was given', () => {
    expect(ref()).toContain('# When something in Faiser does not work');
    expect(ref({ appName: 'Other' })).toContain('# When something in Other does not work');
  });

  test('paths it was not given are left out rather than guessed', () => {
    const sparse = ref({ gatewayLogDir: undefined, engineConfigPath: undefined });
    expect(sparse).not.toContain('undefined');
    expect(sparse).not.toContain('engine\'s own log');
    // The main log is not optional; without it the file has no point.
    expect(sparse).toContain('/Users/bass/Library/Logs/Faiser');
  });
});

describe('what it tells the agent to do', () => {
  test('read the log before explaining', () => {
    expect(ref()).toContain('**Read the log before you explain.**');
  });

  test('it makes "I do not know yet" an acceptable answer', () => {
    // Three invented explanations in one night is what happens when the
    // only acceptable answer is an answer.
    expect(ref()).toMatch(/It is always acceptable to say/);
    expect(ref()).toMatch(/I do not yet know what causes it/);
    expect(ref()).toContain('A theory is not.');
  });

  test('it carries the one log line that has actually settled things', () => {
    // Two hours of reasoning and two confident wrong answers ended when
    // somebody read this. It is the first row of the table for a reason.
    expect(ref()).toContain('desktop.proxy.upstream_refused');
    expect(ref()).toContain('browser profile=');
  });

  test('it says to quote the line rather than paraphrase it', () => {
    expect(ref()).toMatch(/give the line/i);
  });

  test('it says an empty log is itself a finding', () => {
    expect(ref()).toMatch(/say the log says nothing/i);
    expect(ref()).toMatch(/never ran/);
  });

  test('it forbids the three-possibilities answer and the reflex reinstall', () => {
    const text = ref();
    expect(text).toMatch(/Do not offer three possibilities/);
    expect(text).toMatch(/Do not tell the person to reinstall/);
    expect(text).toMatch(/Do not guess at a cause/);
  });

  test('it sends UI questions to the other reference file', () => {
    expect(ref()).toContain('reference/app-ui.md');
  });

  test('it says to search rather than read, because these files are huge', () => {
    expect(ref()).toMatch(/Do not read it end to end/);
  });
});

test('it lands beside the app map, in the workspace', () => {
  expect(WHEN_THINGS_FAIL_PATH).toBe('reference/when-things-fail.md');
  expect(WHEN_THINGS_FAIL_PATH.startsWith('/')).toBe(false);
});
