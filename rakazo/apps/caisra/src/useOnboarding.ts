import type {
  OnboardingRunResult,
  OnboardingStatus,
  OnboardingTask,
  ShownWord,
  TaskCopy,
} from "@rakazo/core";
import {
  Appearance,
  beatsAt,
  INTRO_MS,
  linesOf,
  OnboardingPhase,
  PermissionAnswer,
  phaseDone,
  ROLES,
  type ScriptContext,
  segmentsOf,
  shownWords,
  stageOf,
  taskCopy,
  WORDS_PER_SECOND,
} from "@rakazo/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Yodo's first step, as state.
 *
 * Ported from `desktop/src/renderer/design/onboarding/useOnboarding.ts`, which
 * is itself the founder's canvas logic kept to its shape: one clock per phase,
 * a tick on every frame that turns elapsed time into how many words have
 * landed, and a handful of choices — a role, a task, an answer to the
 * permission card.
 *
 * **The bridge is the computer, and it is optional.** The three tasks are the
 * Mac's: write a riddle into Notes, flip the appearance, schedule a message.
 * Served from a browser there is no Mac to reach, so there is no bridge, the
 * status comes back with nothing available, and the cards draw dim and say
 * "Not yet" — which is the design's own answer for a task this computer cannot
 * do, not a hole. When Caisra ships as an app the bridge plugs in here and
 * nothing else changes.
 */

export interface OnboardingBridge {
  status: () => Promise<OnboardingStatus>;
  runTask: (task: OnboardingTask) => Promise<OnboardingRunResult>;
  openResult: (task: OnboardingTask, ref: string) => Promise<void>;
}

/** No computer to ask. Every card says so rather than offering to fail. */
const NOWHERE: OnboardingStatus = {
  platform: "unknown",
  appearance: Appearance.Light,
  available: [],
};

interface Clock {
  phase: OnboardingPhase;
  /** When this phase started streaming. */
  t0: number;
  beats: number;
}

export interface TaskCard extends TaskCopy {
  /** Can be pressed: the computer can do it and nothing is chosen yet. */
  pressable: boolean;
  /** This computer cannot do it. */
  unavailable: boolean;
  chosen: boolean;
  /** Faded: another card was chosen, or this one cannot be. */
  dim: boolean;
  pick: () => void;
}

export function useOnboarding(userName: string, bridge?: OnboardingBridge) {
  const [status, setStatus] = useState<OnboardingStatus>(NOWHERE);
  const born = useRef(Date.now());
  const [intro, setIntro] = useState(true);
  const [clock, setClock] = useState<Clock | null>(null);
  const [role, setRole] = useState<number | { other: string }>();
  const [other, setOther] = useState("");
  const [otherOpen, setOtherOpen] = useState(false);
  const [task, setTask] = useState<TaskCopy>();
  const [answer, setAnswer] = useState<PermissionAnswer>();
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [result, setResult] = useState<{ task: OnboardingTask; ref: string }>();

  useEffect(() => {
    let live = true;
    void bridge
      ?.status()
      .then((one) => {
        if (live) setStatus(one);
      })
      .catch(() => {
        // Nothing this computer can do; the cards say so.
      });
    return () => {
      live = false;
    };
  }, [bridge]);

  const context = useMemo<ScriptContext>(
    () => ({
      userName,
      ...(role !== undefined ? { role } : {}),
      ...(task ? { task } : {}),
      ...(answer ? { answer } : {}),
      ...(failure ? { failure } : {}),
    }),
    [userName, role, task, answer, failure],
  );

  const begin = useCallback((phase: OnboardingPhase) => {
    setIntro(false);
    setClock({ phase, t0: Date.now(), beats: 0 });
  }, []);

  // The clock. The canvas ticked on a 16ms timer; this ticks on the display's
  // own frames, so a word lands on the frame its beat falls in rather than up
  // to a frame later, and it only touches state when the count changes.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = window.requestAnimationFrame(tick);
      if (intro) {
        if (Date.now() - born.current > INTRO_MS) begin(OnboardingPhase.Open);
        return;
      }
      setClock((current) => {
        if (!current) return current;
        const total = segmentsOf(linesOf(current.phase, context)).total;
        const beats = beatsAt(Date.now() - current.t0, total);
        return beats === current.beats ? current : { ...current, beats };
      });
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [intro, begin, context]);

  const words = useCallback(
    (phase: OnboardingPhase, k: number): ShownWord[] => {
      if (!clock) return [];
      return shownWords(linesOf(phase, context), k, clock, phase);
    },
    [clock, context],
  );

  const done = useCallback(
    (phase: OnboardingPhase): boolean => {
      if (!clock) return false;
      return phaseDone(linesOf(phase, context), clock, phase);
    },
    [clock, context],
  );

  const pickRole = useCallback(
    (picked: number | { other: string }) => {
      setRole(picked);
      setOtherOpen(false);
      begin(OnboardingPhase.Role);
    },
    [begin],
  );

  const submitOther = useCallback(() => {
    const text = other.trim();
    if (text) pickRole({ other: text });
  }, [other, pickRole]);

  const pickTask = useCallback(
    (copy: TaskCopy) => {
      if (task || !status.available.includes(copy.task)) return;
      setTask(copy);
      setAnswer(undefined);
      begin(OnboardingPhase.Perm);
    },
    [task, status.available, begin],
  );

  const allow = useCallback(() => {
    if (!task || answer) return;
    setAnswer(PermissionAnswer.Allowed);
    setWorking(true);
    const run = bridge
      ? bridge.runTask(task.task)
      : Promise.resolve<OnboardingRunResult>({
          ok: false,
          task: task.task,
          reason: "This computer cannot be reached from here.",
        });
    void run
      .then((outcome) => {
        if (outcome.ok) setResult({ task: outcome.task, ref: outcome.ref });
        else setFailure(outcome.reason);
      })
      .catch((cause: unknown) => {
        setFailure(cause instanceof Error ? cause.message : String(cause));
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
    void bridge.openResult(result.task, result.ref).catch(() => {
      // The card stays; there is nothing to add.
    });
  }, [result, bridge]);

  const skip = useCallback(() => {
    // The canvas's Skip: the current phase lands at once. Not an exit — Get
    // Started is the exit, once there is something to start with.
    const phase = clock?.phase ?? OnboardingPhase.Open;
    const total = segmentsOf(linesOf(phase, context)).total;
    setIntro(false);
    setClock({ phase, t0: Date.now() - (total / WORDS_PER_SECOND) * 1000 - 800, beats: total });
  }, [clock, context]);

  const roleLabel =
    role === undefined ? "" : typeof role === "number" ? (ROLES[role]?.label ?? "") : role.other;

  // The result card appears once the second line of the last phase begins.
  const resultAt = segmentsOf(linesOf(OnboardingPhase.Task, context)).segments[1]?.offset ?? 0;
  const showResult =
    !!result &&
    !failure &&
    answer === PermissionAnswer.Allowed &&
    clock?.phase === OnboardingPhase.Task &&
    clock.beats >= resultAt;
  const finished = answer !== undefined && !working && done(OnboardingPhase.Task);

  const tasks = useMemo<TaskCard[]>(
    () =>
      taskCopy(status.appearance).map((copy) => {
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
      }),
    [status.appearance, status.available, task, pickTask],
  );

  return {
    intro,
    words,
    roles: ROLES.map((one, i) => ({ label: one.label, pick: () => pickRole(i) })),
    showChips: role === undefined && !intro && done(OnboardingPhase.Open),
    otherOpen,
    other,
    openOther: () => setOtherOpen(true),
    closeOther: () => {
      setOtherOpen(false);
      setOther("");
    },
    setOther,
    submitOther,
    hasRole: role !== undefined,
    roleLabel,
    ownWords: role !== undefined && typeof role !== "number",
    showTasks: role !== undefined && done(OnboardingPhase.Role),
    tasks,
    task,
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
    stage: stageOf({
      ...(role !== undefined ? { role } : {}),
      ...(task ? { task } : {}),
    }),
  };
}

export type OnboardingState = ReturnType<typeof useOnboarding>;
