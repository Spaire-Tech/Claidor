import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Appearance,
  type OnboardingRunResult,
  type OnboardingStatus,
  type OnboardingTask,
} from '../../../shared/onboarding/constants';
import {
  beatsAt,
  INTRO_MS,
  linesOf,
  OnboardingPhase,
  PermissionAnswer,
  phaseDone,
  ROLES,
  type ScriptContext,
  segmentsOf,
  type ShownWord,
  shownWords,
  stageOf,
  type TaskCopy,
  taskCopy,
  WORDS_PER_SECOND,
} from '../../../shared/onboarding/script';

/**
 * The first step of onboarding, as state.
 *
 * The canvas's own logic (`docs/product/design/canvas-2026-09-16-onboarding-template.html`),
 * kept to its shape: one clock per phase, a tick on every frame that
 * turns elapsed time into how many words have landed, and a handful of
 * choices — a role, a task, an answer to the permission card. What the
 * canvas faked, this does: on "Allow access" the main process runs the
 * task on the Mac and the outcome, done or not, decides the last lines.
 *
 * The bridge is injected so the harness can stand in for the Mac.
 */

export interface OnboardingBridge {
  status: () => Promise<OnboardingStatus>;
  runTask: (task: OnboardingTask) => Promise<OnboardingRunResult>;
  openResult: (task: OnboardingTask, ref: string) => Promise<void>;
}

/** The app's own bridge, through the preload. */
export const electronOnboardingBridge = (): OnboardingBridge | undefined => {
  const onboarding = window.electron?.onboarding;
  if (!onboarding) return undefined;
  return {
    status: () => onboarding.status(),
    runTask: task => onboarding.runTask(task),
    openResult: (task, ref) => onboarding.openResult(task, ref),
  };
};

const NOWHERE: OnboardingStatus = { platform: 'unknown', appearance: Appearance.Light, available: [] };

interface Clock {
  phase: OnboardingPhase;
  /** When this phase started streaming. */
  t0: number;
  beats: number;
}

export interface TaskCard extends TaskCopy {
  /** Can be pressed: the computer can do it and nothing is chosen yet. */
  pressable: boolean;
  /** This computer cannot do it (Messages, today). */
  unavailable: boolean;
  chosen: boolean;
  /** Faded: another card was chosen, or this one cannot be. */
  dim: boolean;
  pick: () => void;
}

export interface OnboardingState {
  /** The big cloud is still on screen. */
  intro: boolean;
  /** Words of line `k` of a phase, to draw now. */
  words: (phase: OnboardingPhase, k: number) => ShownWord[];
  roles: readonly { label: string; pick: () => void }[];
  showChips: boolean;
  otherOpen: boolean;
  other: string;
  openOther: () => void;
  closeOther: () => void;
  setOther: (value: string) => void;
  submitOther: () => void;
  hasRole: boolean;
  roleLabel: string;
  /** They typed their own words rather than picking one of the ten. */
  ownWords: boolean;
  showTasks: boolean;
  tasks: readonly TaskCard[];
  task?: TaskCopy;
  showPerm: boolean;
  /** Allowed, and the Mac is still doing it. */
  working: boolean;
  allow: () => void;
  deny: () => void;
  /** The last phase is on screen. */
  hasAnswer: boolean;
  showResult: boolean;
  openResult: () => void;
  showGetStarted: boolean;
  showSkip: boolean;
  skip: () => void;
  stage: 0 | 1 | 2;
}

export function useOnboarding(
  userName: string,
  bridge: OnboardingBridge | undefined,
): OnboardingState {
  const [status, setStatus] = useState<OnboardingStatus>(NOWHERE);
  const born = useRef(Date.now());
  const [intro, setIntro] = useState(true);
  const [clock, setClock] = useState<Clock | null>(null);
  const [role, setRole] = useState<number | { other: string }>();
  const [other, setOther] = useState('');
  const [otherOpen, setOtherOpen] = useState(false);
  const [task, setTask] = useState<TaskCopy>();
  const [answer, setAnswer] = useState<PermissionAnswer>();
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [result, setResult] = useState<{ task: OnboardingTask; ref: string }>();

  useEffect(() => {
    let current = true;
    void bridge?.status()
      .then(one => { if (current) setStatus(one); })
      .catch(() => { /* nothing this computer can do; the cards say so */ });
    return () => { current = false; };
  }, [bridge]);

  const context = useMemo<ScriptContext>(() => ({
    userName,
    ...(role !== undefined ? { role } : {}),
    ...(task ? { task } : {}),
    ...(answer ? { answer } : {}),
    ...(failure ? { failure } : {}),
  }), [userName, role, task, answer, failure]);

  const begin = useCallback((phase: OnboardingPhase) => {
    setIntro(false);
    setClock({ phase, t0: Date.now(), beats: 0 });
  }, []);

  // The clock. The canvas ticked on a 16ms timer; this ticks on the
  // display's own frames, so a word lands on the frame its beat falls
  // in rather than up to a frame later, and it only touches state when
  // the count of landed words changes.
  useEffect(() => {
    let frame = 0;
    const tick = (): void => {
      frame = window.requestAnimationFrame(tick);
      if (intro) {
        if (Date.now() - born.current > INTRO_MS) begin(OnboardingPhase.Open);
        return;
      }
      setClock(current => {
        if (!current) return current;
        const total = segmentsOf(linesOf(current.phase, context)).total;
        const beats = beatsAt(Date.now() - current.t0, total);
        return beats === current.beats ? current : { ...current, beats };
      });
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [intro, begin, context]);

  const words = useCallback((phase: OnboardingPhase, k: number): ShownWord[] => {
    if (!clock) return [];
    return shownWords(linesOf(phase, context), k, clock, phase);
  }, [clock, context]);

  const done = useCallback((phase: OnboardingPhase): boolean => {
    if (!clock) return false;
    return phaseDone(linesOf(phase, context), clock, phase);
  }, [clock, context]);

  const pickRole = useCallback((picked: number | { other: string }) => {
    setRole(picked);
    setOtherOpen(false);
    begin(OnboardingPhase.Role);
  }, [begin]);

  const submitOther = useCallback(() => {
    const text = other.trim();
    if (text) pickRole({ other: text });
  }, [other, pickRole]);

  const pickTask = useCallback((copy: TaskCopy) => {
    if (task || !status.available.includes(copy.task)) return;
    setTask(copy);
    setAnswer(undefined);
    begin(OnboardingPhase.Perm);
  }, [task, status.available, begin]);

  const allow = useCallback(() => {
    if (!task || answer) return;
    setAnswer(PermissionAnswer.Allowed);
    setWorking(true);
    const run = bridge
      ? bridge.runTask(task.task)
      : Promise.resolve<OnboardingRunResult>({ ok: false, task: task.task, reason: 'This computer cannot be reached from here.' });
    void run
      .then(outcome => {
        if (outcome.ok) setResult({ task: outcome.task, ref: outcome.ref });
        else setFailure(outcome.reason);
      })
      .catch(error => {
        setFailure(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        setWorking(false);
        begin(OnboardingPhase.Task);
      });
  }, [task, answer, bridge, begin]);

  const deny = useCallback(() => {
    if (!task || answer) return;
    setAnswer(PermissionAnswer.Declined);
    begin(OnboardingPhase.Task);
  }, [task, answer, begin]);

  const openResult = useCallback(() => {
    if (!result || !bridge) return;
    void bridge.openResult(result.task, result.ref).catch(() => { /* the card stays; nothing to add */ });
  }, [result, bridge]);

  const skip = useCallback(() => {
    // The canvas's Skip: the current phase lands at once. Not an exit —
    // Get Started is the exit, once there is something to start with.
    const phase = clock?.phase ?? OnboardingPhase.Open;
    const total = segmentsOf(linesOf(phase, context)).total;
    setIntro(false);
    setClock({ phase, t0: Date.now() - (total / WORDS_PER_SECOND) * 1000 - 800, beats: total });
  }, [clock, context]);

  const roleLabel = role === undefined ? '' : typeof role === 'number' ? (ROLES[role]?.label ?? '') : role.other;

  // The result card appears once the second line of the last phase begins.
  const resultAt = segmentsOf(linesOf(OnboardingPhase.Task, context)).segments[1]?.offset ?? 0;
  const showResult = !!result && !failure && answer === PermissionAnswer.Allowed
    && clock?.phase === OnboardingPhase.Task && clock.beats >= resultAt;
  const finished = answer !== undefined && !working && done(OnboardingPhase.Task);

  const tasks = useMemo<TaskCard[]>(() => taskCopy(status.appearance).map(copy => {
    const available = status.available.includes(copy.task);
    const chosen = task?.task === copy.task;
    return {
      ...copy,
      pressable: available && !task,
      unavailable: !available,
      chosen,
      dim: (!!task && !chosen) || (!available && !task),
      pick: () => pickTask(copy),
    };
  }), [status.appearance, status.available, task, pickTask]);

  return {
    intro,
    words,
    roles: ROLES.map((one, i) => ({ label: one.label, pick: () => pickRole(i) })),
    showChips: role === undefined && !intro && done(OnboardingPhase.Open),
    otherOpen,
    other,
    openOther: () => setOtherOpen(true),
    closeOther: () => { setOtherOpen(false); setOther(''); },
    setOther,
    submitOther,
    hasRole: role !== undefined,
    roleLabel,
    ownWords: role !== undefined && typeof role !== 'number',
    showTasks: role !== undefined && done(OnboardingPhase.Role),
    tasks,
    ...(task ? { task } : {}),
    showPerm: !!task && done(OnboardingPhase.Perm) && (answer === undefined || working),
    working,
    allow,
    deny,
    hasAnswer: answer !== undefined && !working,
    showResult,
    openResult,
    showGetStarted: finished,
    showSkip: !finished,
    skip,
    stage: stageOf({ ...(role !== undefined ? { role } : {}), ...(task ? { task } : {}) }),
  };
}
