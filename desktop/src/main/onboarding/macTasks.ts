import { execFile } from 'child_process';
import { nativeTheme, shell } from 'electron';

import {
  Appearance,
  type OnboardingRunResult,
  type OnboardingStatus,
  OnboardingTask,
  RIDDLE,
} from '../../shared/onboarding/constants';

/**
 * The three small things Yodo does on the Mac during onboarding, and
 * the truth about what this computer can do.
 *
 * Each task is one AppleScript through `osascript`, which is how a Mac
 * app talks to another app. macOS asks the person once, in its own
 * dialog, whether Caisra may control Notes or System Events; that comes
 * after our own "Allow access" card, not instead of it. If they say no
 * to macOS, `osascript` fails with -1743 and the person is told where to
 * turn it on.
 *
 * The founder: *"the permission must come and the thing should actually
 * do the work. if its a riddle, have one ready … message needs iMessage,
 * that one is a bit complex … we'll make it unavailable until we figure
 * it out. settings is straightforward. the ai tho has to be smart enough
 * to see if the mac is in light or dark mode currently."*
 *
 * The scripts are built by pure functions so a test can read them; the
 * runner is injectable so nothing here needs a Mac to be tested.
 */

/** macOS: "Not authorized to send Apple events to <app>." */
const NOT_AUTHORIZED = /-1743|not authori[sz]ed to send apple events/i;

export const escapeAppleScript = (text: string): string => (
  text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
);

const escapeHtml = (text: string): string => (
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
);

/** The note, as Notes takes it: a name and an HTML body. Answers with the note's id. */
export function riddleNoteScript(): string {
  const body = [
    `<div>${escapeHtml(RIDDLE.question)}</div>`,
    '<div><br></div>',
    '<div>— Yodo</div>',
    '<div><br></div>',
    '<div><br></div>',
    '<div><br></div>',
    `<div>Answer: ${escapeHtml(RIDDLE.answer)}</div>`,
  ].join('');
  return [
    'tell application "Notes"',
    `  set theNote to make new note at folder "Notes" of default account with properties {name:"${escapeAppleScript(RIDDLE.title)}", body:"${escapeAppleScript(body)}"}`,
    '  return id of theNote',
    'end tell',
  ].join('\n');
}

/** Show one note by id, front and centre. */
export function showNoteScript(noteId: string): string {
  return [
    'tell application "Notes"',
    '  activate',
    `  show note id "${escapeAppleScript(noteId)}"`,
    'end tell',
  ].join('\n');
}

/** Flip the Mac's appearance. System Events owns that switch. */
export function appearanceScript(dark: boolean): string {
  return [
    'tell application "System Events"',
    '  tell appearance preferences',
    `    set dark mode to ${dark ? 'true' : 'false'}`,
    '  end tell',
    'end tell',
  ].join('\n');
}

/** The Appearance pane of System Settings, by its URL scheme. */
export const APPEARANCE_SETTINGS_URL = 'x-apple.systempreferences:com.apple.Appearance-Settings.extension';

export type ScriptRunner = (script: string) => Promise<string>;

/** `osascript`, one script, its stdout. */
export const runAppleScript: ScriptRunner = script => new Promise((resolve, reject) => {
  execFile('osascript', ['-e', script], { timeout: 20_000 }, (error, stdout, stderr) => {
    if (error) {
      const message = (stderr || error.message || '').trim();
      reject(new Error(message || 'osascript failed'));
      return;
    }
    resolve(String(stdout).trim());
  });
});

/** What the person is told when a script does not go through. */
export function explainFailure(app: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (NOT_AUTHORIZED.test(message)) {
    return `macOS did not let Caisra control ${app}. You can allow it in System Settings → Privacy & Security → Automation.`;
  }
  return message.replace(/^\d+:\d+:\s*execution error:\s*/i, '').trim() || `${app} did not answer.`;
}

export interface MacTaskDeps {
  platform?: NodeJS.Platform;
  run?: ScriptRunner;
  isDark?: () => boolean;
  openExternal?: (url: string) => Promise<void>;
}

export function currentAppearance(isDark: () => boolean = () => nativeTheme.shouldUseDarkColors): Appearance {
  return isDark() ? Appearance.Dark : Appearance.Light;
}

/** Which tasks this computer can do. Messages is not one of them yet. */
export function availableTasks(platform: NodeJS.Platform): OnboardingTask[] {
  if (platform !== 'darwin') return [];
  return [OnboardingTask.Notes, OnboardingTask.Appearance];
}

export function onboardingStatus(deps: MacTaskDeps = {}): OnboardingStatus {
  const platform = deps.platform ?? process.platform;
  return {
    platform,
    appearance: currentAppearance(deps.isDark),
    available: availableTasks(platform),
  };
}

/**
 * Do the task. The result's `ref` is what `openResult` needs later: the
 * note's id, or the appearance that was set.
 */
export async function runOnboardingTask(task: OnboardingTask, deps: MacTaskDeps = {}): Promise<OnboardingRunResult> {
  const platform = deps.platform ?? process.platform;
  const run = deps.run ?? runAppleScript;
  if (!availableTasks(platform).includes(task)) {
    return { ok: false, task, reason: task === OnboardingTask.Messages ? 'Messages is not wired up yet.' : 'This only works on a Mac.' };
  }
  try {
    if (task === OnboardingTask.Notes) {
      const noteId = await run(riddleNoteScript());
      console.log(`[Onboarding] riddle left in Notes (${noteId || 'no id returned'})`);
      return { ok: true, task, ref: noteId };
    }
    const toDark = currentAppearance(deps.isDark) !== Appearance.Dark;
    await run(appearanceScript(toDark));
    console.log(`[Onboarding] appearance set to ${toDark ? 'dark' : 'light'}`);
    return { ok: true, task, ref: toDark ? Appearance.Dark : Appearance.Light };
  } catch (error) {
    const reason = explainFailure(task === OnboardingTask.Notes ? 'Notes' : 'System Settings', error);
    console.warn(`[Onboarding] ${task} failed: ${reason}`);
    return { ok: false, task, reason };
  }
}

/** The result card's button. */
export async function openOnboardingResult(task: OnboardingTask, ref: string, deps: MacTaskDeps = {}): Promise<void> {
  const run = deps.run ?? runAppleScript;
  const openExternal = deps.openExternal ?? (url => shell.openExternal(url));
  if (task === OnboardingTask.Notes) {
    if (ref) {
      await run(showNoteScript(ref));
    } else {
      await run('tell application "Notes" to activate');
    }
    return;
  }
  if (task === OnboardingTask.Appearance) {
    await openExternal(APPEARANCE_SETTINGS_URL);
  }
}
