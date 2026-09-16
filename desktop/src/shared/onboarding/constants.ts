/**
 * The first step of onboarding: Yodo, the Chief of Staff, meets the person.
 *
 * From the founder's canvas of 16 September 2026
 * (`docs/product/design/canvas-2026-09-16-onboarding.html`; the design's
 * own source is beside it as `-template.html`). The founder: *"the final
 * goal is to have the chief of staff create the first agents for the
 * user. i'll figure out the rest later. for now after get started it
 * should take them to the chat."*
 *
 * What is here is what the main process and the renderer must agree on:
 * the IPC channels, the three tasks, and what a task run answers with.
 * The script itself, and how it streams, is `script.ts`.
 */

export const OnboardingIpc = {
  /** Platform, current appearance, which tasks can run here. */
  Status: 'onboarding:status',
  /** Do the thing the person allowed. Answers with a result card or a reason. */
  RunTask: 'onboarding:runTask',
  /** The result card's button: open the note, open the setting. */
  OpenResult: 'onboarding:openResult',
} as const;
export type OnboardingIpc = typeof OnboardingIpc[keyof typeof OnboardingIpc];

/** The three cards, in the canvas's order. */
export const OnboardingTask = {
  /** Leave a riddle in Apple Notes. */
  Notes: 'notes',
  /** Switch the Mac's appearance. */
  Appearance: 'appearance',
  /** Text a pep talk for tomorrow morning. Not available yet. */
  Messages: 'messages',
} as const;
export type OnboardingTask = typeof OnboardingTask[keyof typeof OnboardingTask];

export const Appearance = {
  Light: 'light',
  Dark: 'dark',
} as const;
export type Appearance = typeof Appearance[keyof typeof Appearance];

export interface OnboardingStatus {
  /** `darwin`, `win32`, `linux`. The tasks are the Mac's. */
  platform: string;
  /** What the Mac is showing right now, so the card offers the other one. */
  appearance: Appearance;
  /** Which of the three can actually be done on this computer today. */
  available: readonly OnboardingTask[];
}

/** What a task run answers: done, and with what to open, or not, and why. */
export type OnboardingRunResult =
  | { ok: true; task: OnboardingTask; ref: string }
  | { ok: false; task: OnboardingTask; reason: string };

/**
 * The one riddle. The founder: *"if its a riddle, have one ready. no
 * generate new one, lets just have one that we save."* It goes into a
 * note titled `RIDDLE.title`, answer at the bottom.
 */
export const RIDDLE = {
  title: 'A riddle from Yodo',
  question: 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?',
  answer: 'An echo.',
} as const;

/** Where the app's logos live, for the cards. */
export const ONBOARDING_LOGOS: Record<OnboardingTask, string> = {
  [OnboardingTask.Notes]: 'apple-notes.webp',
  [OnboardingTask.Appearance]: 'macos-settings.webp',
  [OnboardingTask.Messages]: 'imessage.webp',
};
