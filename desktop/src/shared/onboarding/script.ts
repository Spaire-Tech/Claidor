import { Appearance, OnboardingTask } from './constants';

/**
 * Yodo's script, and how it streams.
 *
 * Every sentence here is the founder's, from the 16 September canvas,
 * verbatim. The one thing added is a third ending for a task that was
 * allowed and then failed on the computer — the canvas had only "Done"
 * and "No bother", and saying "Done" over a note that was never written
 * is the lie the app must not tell.
 *
 * How it streams is the canvas's too: thirteen words a second, a pause
 * of three word-beats between lines, each word fading in as it lands.
 * `revealedWords` is that arithmetic, pure, so the renderer's only job
 * is to keep a clock and draw.
 */

export const OnboardingPhase = {
  /** The greeting and the question about their work. */
  Open: 'open',
  /** The reply to their role, and the three small tasks. */
  Role: 'role',
  /** The ask before the task. */
  Perm: 'perm',
  /** The outcome, and Get Started. */
  Task: 'task',
} as const;
export type OnboardingPhase = typeof OnboardingPhase[keyof typeof OnboardingPhase];

export const PermissionAnswer = {
  Allowed: 'allowed',
  Declined: 'declined',
} as const;
export type PermissionAnswer = typeof PermissionAnswer[keyof typeof PermissionAnswer];

/** Words per second, and the beats of silence between lines. The canvas's numbers. */
export const WORDS_PER_SECOND = 13;
export const LINE_GAP_BEATS = 3;
/** The big cloud, before the first word. */
export const INTRO_MS = 2150;

export interface Role {
  label: string;
  reply: string;
}

/** The ten, in the canvas's order, each with Yodo's one-line reply. */
export const ROLES: readonly Role[] = [
  { label: 'Finance', reply: "Numbers, then. I'll keep receipts on everything I hand you." },
  { label: 'Engineering / Tech', reply: "Right. I'll stay literal and leave the detail in." },
  { label: 'Founder / Business Owner', reply: "Thought so. I'll keep things short and decision-shaped." },
  { label: 'Sales / Marketing', reply: "Pipeline work. I'll keep you in front of people instead of admin." },
  { label: 'Office Work', reply: "The stuff nobody thanks you for. That's the easiest to take off you." },
  { label: 'Content Creator', reply: "Output work. I'll keep the drafts moving so you're never starting cold." },
  { label: 'Design / Creative', reply: "Fine. I'll keep the output visual where that helps." },
  { label: 'Consultant / Freelance', reply: "Many masters. I'll keep the clients from blurring into each other." },
  { label: 'Student', reply: 'Deadlines and reading. I can carry most of that.' },
  { label: 'Slacker (my kind)', reply: "Ha. My kind of client. We'll find you agents who work while you don't." },
];

/** The reply when they typed something of their own. */
export const OTHER_REPLY = "Noted. I'll work out the shape of it as we go.";

export const OTHER_PLACEHOLDER = 'So what is it you do?';

export interface TaskCopy {
  task: OnboardingTask;
  /** The card. */
  label: string;
  /** The permission card's title: the app being asked for. */
  permTitle: string;
  permSub: string;
  /** Yodo's line before the permission card. */
  permLine: string;
  /** Yodo's line once it is done. */
  doneLine: string;
  /** The result card. */
  resultName: string;
  resultKind: string;
  resultOpen: string;
}

/**
 * The three cards' words. The appearance one reads the Mac: the founder,
 * *"the ai tho has to be smart enough to see if the mac is in light or
 * dark mode currently"* — so a Mac already in dark mode is offered light,
 * and the result says which way it went.
 */
export function taskCopy(appearance: Appearance): readonly TaskCopy[] {
  const toDark = appearance !== Appearance.Dark;
  const other = toDark ? 'dark' : 'light';
  return [
    {
      task: OnboardingTask.Notes,
      label: 'Leave a riddle on your note app',
      permTitle: 'Notes',
      permSub: 'App access requested',
      permLine: "I can do that, but I'll need access to Notes to write it in there. Mind allowing that?",
      doneLine: 'Done. I left one in Notes. Try opening it.',
      resultName: 'A riddle from Yodo',
      resultKind: 'Note',
      resultOpen: 'Open in Notes',
    },
    {
      task: OnboardingTask.Appearance,
      label: `Change my theme to ${other} mode`,
      permTitle: 'System Settings',
      permSub: 'System access requested',
      permLine: "Easy enough. I'll need permission to change your system appearance. Mind allowing that?",
      doneLine: `Done. Have a look around — everything just went ${other}.`,
      resultName: `Appearance — ${toDark ? 'Dark' : 'Light'}`,
      resultKind: 'System setting',
      resultOpen: 'Open in Settings',
    },
    {
      task: OnboardingTask.Messages,
      label: 'Text myself a pep talk for 9am tomorrow',
      permTitle: 'Messages',
      permSub: 'App access requested',
      permLine: "Can do. I'll need access to Messages to send it to you in the morning. Mind allowing that?",
      doneLine: "Done. It'll land at nine, whether you're ready for it or not.",
      resultName: 'Pep talk — 9:00 AM',
      resultKind: 'Scheduled message',
      resultOpen: 'Open in Messages',
    },
  ];
}

/** What the person picked, and what came of it, as the lines need it. */
export interface ScriptContext {
  userName: string;
  /** Index into `ROLES`, or their own words. */
  role?: number | { other: string };
  task?: TaskCopy;
  answer?: PermissionAnswer;
  /** Set when the task was allowed and then did not go through. */
  failure?: string;
}

/** The lines of a phase, in order. Empty where the context has not reached it. */
export function linesOf(phase: OnboardingPhase, context: ScriptContext): readonly string[] {
  switch (phase) {
    case OnboardingPhase.Open: {
      const name = context.userName.trim() || 'there';
      return [
        `Hey, ${name}!`,
        "My name is Yodo. I'm your Chief of Staff.",
        'My job is simple: figure out what you need done, then put the right agents on it. You can work with them yourself, or let me run the team for you.',
        "Right now you've got nobody. By the time we're done here you'll have two or three, and they'll already be working.",
        'So talk to me. Which best describes your work?',
      ];
    }
    case OnboardingPhase.Role: {
      const reply = context.role === undefined
        ? ''
        : typeof context.role === 'number'
          ? (ROLES[context.role]?.reply ?? '')
          : OTHER_REPLY;
      return [
        reply,
        'Here on your Mac I work directly with your files, your folders, and the apps you connect.',
        'Start with something small to see how it feels:',
      ];
    }
    case OnboardingPhase.Perm:
      return [context.task?.permLine ?? ''];
    case OnboardingPhase.Task:
      if (context.answer !== PermissionAnswer.Allowed) {
        return [
          "No bother. I'll ask again when it actually matters.",
          'We can get you moving without it.',
          "You're all set.",
        ];
      }
      if (context.failure) {
        return [
          `That didn't go through: ${context.failure}`,
          'We can get you moving without it.',
          "You're all set.",
        ];
      }
      return [
        context.task?.doneLine ?? '',
        'And just like that, we did something on your computer.',
        "You're all set.",
      ];
  }
}

/** The canvas splits on spaces and keeps the space on the word that follows it. */
export function wordsOf(text: string): string[] {
  return text.split(' ').map((word, i) => (i ? ` ${word}` : word));
}

export interface Segment {
  words: readonly string[];
  /** Where this line starts on the phase's clock, in word-beats. */
  offset: number;
}

/** The lines as segments on one clock, and the beat the last word lands on. */
export function segmentsOf(lines: readonly string[]): { segments: Segment[]; total: number } {
  let offset = 0;
  const segments = lines.map(text => {
    const words = wordsOf(text);
    const segment = { words, offset };
    offset += words.length + LINE_GAP_BEATS;
    return segment;
  });
  return { segments, total: offset };
}

/** How many beats have landed after `elapsedMs`, capped at the phase's end. */
export function beatsAt(elapsedMs: number, total: number): number {
  return Math.min(total, Math.floor((elapsedMs / 1000) * WORDS_PER_SECOND));
}

export const WordState = {
  /** Laid out, not yet reached: it holds its place, invisible. */
  Hidden: 'hidden',
  /** Reached while this phase streams: it fades in. */
  In: 'in',
  /** From a phase that has played: shown, still. */
  Still: 'still',
} as const;
export type WordState = typeof WordState[keyof typeof WordState];

export interface ShownWord {
  text: string;
  state: WordState;
}

/**
 * The words of line `k`, and how each is drawn now.
 *
 * Every word of a line is on the page from the line's first beat, the
 * unreached ones invisible, so the line wraps once and nothing moves
 * while it streams — a word landing at the end of a line used to push
 * the words before it around. A phase that has already played shows
 * every word, still. A phase not reached yet shows nothing — its block
 * is not on screen anyway.
 */
export function shownWords(
  lines: readonly string[],
  k: number,
  current: { phase: OnboardingPhase; beats: number },
  phase: OnboardingPhase,
  order: readonly OnboardingPhase[] = PHASES,
): ShownWord[] {
  const { segments } = segmentsOf(lines);
  const segment = segments[k];
  if (!segment) return [];
  if (current.phase !== phase) {
    const played = order.indexOf(phase) < order.indexOf(current.phase);
    return played ? segment.words.map(text => ({ text, state: WordState.Still })) : [];
  }
  const n = current.beats - segment.offset;
  return segment.words.map((text, i) => ({ text, state: i < n ? WordState.In : WordState.Hidden }));
}

/** Whether a phase has finished streaming. */
export function phaseDone(
  lines: readonly string[],
  current: { phase: OnboardingPhase; beats: number },
  phase: OnboardingPhase,
  order: readonly OnboardingPhase[] = PHASES,
): boolean {
  if (current.phase !== phase) return order.indexOf(phase) < order.indexOf(current.phase);
  return current.beats >= segmentsOf(lines).total;
}

export const PHASES: readonly OnboardingPhase[] = [
  OnboardingPhase.Open, OnboardingPhase.Role, OnboardingPhase.Perm, OnboardingPhase.Task,
];

/** The three dots: which stage is lit. */
export function stageOf(context: Pick<ScriptContext, 'role' | 'task'>): 0 | 1 | 2 {
  if (context.task) return 2;
  if (context.role !== undefined) return 1;
  return 0;
}
