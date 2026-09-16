import { describe, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({
  nativeTheme: { shouldUseDarkColors: false },
  shell: { openExternal: vi.fn(async () => undefined) },
}));

import { Appearance, OnboardingTask, RIDDLE } from '../../shared/onboarding/constants';
import {
  APPEARANCE_SETTINGS_URL,
  appearanceScript,
  availableTasks,
  escapeAppleScript,
  explainFailure,
  onboardingStatus,
  openOnboardingResult,
  riddleNoteScript,
  runOnboardingTask,
  showNoteScript,
} from './macTasks';

describe('the scripts', () => {
  test('the riddle goes into Notes under its title, with the answer at the bottom', () => {
    const script = riddleNoteScript();
    expect(script).toMatch(/^tell application "Notes"/);
    expect(script).toContain(`name:"${RIDDLE.title}"`);
    expect(script).toContain(escapeAppleScript(RIDDLE.question));
    expect(script).toContain('Answer: An echo.');
    expect(script).toContain('return id of theNote');
  });

  test('quotes and backslashes in a script are escaped, so a title cannot break out', () => {
    expect(escapeAppleScript('say "hi" \\ bye')).toBe('say \\"hi\\" \\\\ bye');
    expect(showNoteScript('x-coredata://A"B')).toContain('show note id "x-coredata://A\\"B"');
  });

  test('the appearance switch goes through System Events, either way', () => {
    expect(appearanceScript(true)).toContain('set dark mode to true');
    expect(appearanceScript(false)).toContain('set dark mode to false');
  });
});

describe('what this computer can do', () => {
  test('a Mac can do Notes and appearance; Messages is not wired yet; anything else can do nothing', () => {
    expect(availableTasks('darwin')).toEqual([OnboardingTask.Notes, OnboardingTask.Appearance]);
    expect(availableTasks('win32')).toEqual([]);
    expect(availableTasks('linux')).toEqual([]);
  });

  test('the status reads the appearance the Mac is showing now', () => {
    expect(onboardingStatus({ platform: 'darwin', isDark: () => true }).appearance).toBe(Appearance.Dark);
    expect(onboardingStatus({ platform: 'darwin', isDark: () => false }).appearance).toBe(Appearance.Light);
  });
});

describe('running a task', () => {
  test('the riddle: runs the Notes script and keeps the note id for later', async () => {
    const run = vi.fn(async () => 'x-coredata://1/ICNote/p7');
    const result = await runOnboardingTask(OnboardingTask.Notes, { platform: 'darwin', run });
    expect(result).toEqual({ ok: true, task: OnboardingTask.Notes, ref: 'x-coredata://1/ICNote/p7' });
    expect(run.mock.calls[0][0]).toBe(riddleNoteScript());
  });

  test('the appearance: a light Mac goes dark and a dark Mac goes light', async () => {
    const run = vi.fn(async () => '');
    expect(await runOnboardingTask(OnboardingTask.Appearance, { platform: 'darwin', run, isDark: () => false }))
      .toEqual({ ok: true, task: OnboardingTask.Appearance, ref: Appearance.Dark });
    expect(run.mock.calls[0][0]).toContain('set dark mode to true');
    expect(await runOnboardingTask(OnboardingTask.Appearance, { platform: 'darwin', run, isDark: () => true }))
      .toEqual({ ok: true, task: OnboardingTask.Appearance, ref: Appearance.Light });
    expect(run.mock.calls[1][0]).toContain('set dark mode to false');
  });

  test('Messages, and any task off a Mac, is refused before anything runs', async () => {
    const run = vi.fn(async () => '');
    const messages = await runOnboardingTask(OnboardingTask.Messages, { platform: 'darwin', run });
    expect(messages).toEqual({ ok: false, task: OnboardingTask.Messages, reason: 'Messages is not wired up yet.' });
    const elsewhere = await runOnboardingTask(OnboardingTask.Notes, { platform: 'linux', run });
    expect(elsewhere.ok).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  test("macOS saying no is explained, with where to turn it on; anything else is the script's own sentence", async () => {
    const denied = vi.fn(async () => { throw new Error('72:80: execution error: Not authorized to send Apple events to Notes. (-1743)'); });
    const result = await runOnboardingTask(OnboardingTask.Notes, { platform: 'darwin', run: denied });
    expect(result).toMatchObject({ ok: false, task: OnboardingTask.Notes });
    expect(result.ok === false && result.reason).toMatch(/Privacy & Security/);
    expect(explainFailure('Notes', new Error('12:34: execution error: Notes got an error: something odd (-1728)')))
      .toBe('Notes got an error: something odd (-1728)');
  });
});

describe('opening the result', () => {
  test('the note is shown by its id, or Notes is just brought up when there is none', async () => {
    const run = vi.fn(async () => '');
    await openOnboardingResult(OnboardingTask.Notes, 'x-coredata://1/ICNote/p7', { run });
    expect(run.mock.calls[0][0]).toContain('show note id "x-coredata://1/ICNote/p7"');
    await openOnboardingResult(OnboardingTask.Notes, '', { run });
    expect(run.mock.calls[1][0]).toBe('tell application "Notes" to activate');
  });

  test('the appearance opens the Appearance pane of System Settings', async () => {
    const openExternal = vi.fn(async () => undefined);
    await openOnboardingResult(OnboardingTask.Appearance, Appearance.Dark, { openExternal });
    expect(openExternal).toHaveBeenCalledWith(APPEARANCE_SETTINGS_URL);
  });
});
