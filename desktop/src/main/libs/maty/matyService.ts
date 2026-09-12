/**
 * Cloud work, from the app's side (docs/maties/cloud.md).
 *
 * The app hands Claidor a piece of work and then watches it for a while. It
 * watches for a while and not forever on purpose: the cloud engine exists so
 * that work carries on when the laptop is shut, so a job outliving the app's
 * attention is the normal case, not a failure. When the app stops watching it
 * says so rather than leaving a shimmer running on nothing, and the next time
 * anyone asks Claidor — opening the app, or pressing « Check again » — the
 * truth comes back.
 *
 * Nothing of the runner's reaches this module. Every request is signed with
 * the person's own Claidor session by `fetchWithAuth`, exactly as memory sync
 * and connections are.
 */

import {
  EMPTY_MATY_STATE,
  type MatyActionResult,
  type MatyJob,
  MatyOutcome,
  type MatyState,
} from '../../../shared/maty/constants';
import {
  hasLiveMatyJob,
  isLiveMatyJob,
  sameMatyJobs,
  upsertMatyJob,
} from '../../../shared/maty/jobList';
import {
  cancelMatyJob,
  createMatyJob,
  fetchMatyJob,
  fetchMatyState,
  type MatyClientDeps,
  MatyRequestStatus,
} from './matyClient';

const TAG = '[Maty]';

/**
 * How often Claidor is asked how a live job is getting on, and for how long.
 *
 * Eight seconds is quick enough that a short job feels answered and slow
 * enough that an hour of watching is a few hundred requests rather than
 * thousands. Half an hour is the limit: past that the app stops asking on its
 * own and waits to be asked.
 */
export const MATY_POLL_INTERVAL_MS = 8_000;
export const MATY_POLL_LIMIT_MS = 30 * 60_000;

export const MatyPollAction = {
  /** Ask Claidor again after `delayMs`. */
  Poll: 'poll',
  /** Nothing is live: there is nothing to watch. */
  Idle: 'idle',
  /** Something is still live, but the app has watched long enough. */
  GiveUp: 'give-up',
} as const;
export type MatyPollAction = typeof MatyPollAction[keyof typeof MatyPollAction];

export interface MatyPollDecision {
  readonly action: MatyPollAction;
  /** Only on `Poll`. */
  readonly delayMs?: number;
}

export interface MatyPollInput {
  readonly jobs: readonly MatyJob[];
  /** When this stretch of watching began. */
  readonly watchStartedAt: number;
  readonly now: number;
  readonly intervalMs?: number;
  readonly limitMs?: number;
}

/** Pure: the whole of the watching rule. */
export const decideMatyPoll = (input: MatyPollInput): MatyPollDecision => {
  if (!hasLiveMatyJob(input.jobs)) {
    return { action: MatyPollAction.Idle };
  }
  const limitMs = input.limitMs ?? MATY_POLL_LIMIT_MS;
  if (input.now - input.watchStartedAt >= limitMs) {
    return { action: MatyPollAction.GiveUp };
  }
  return {
    action: MatyPollAction.Poll,
    delayMs: input.intervalMs ?? MATY_POLL_INTERVAL_MS,
  };
};

/** Pure: the ids of the jobs that are live, for spotting a new one. */
export const liveMatyJobIds = (jobs: readonly MatyJob[]): string[] => (
  jobs.filter(isLiveMatyJob).map((job) => job.id).sort()
);

/** Pure: whether `next` holds a live job that `previous` did not. */
export const hasNewLiveMatyJob = (
  previous: readonly MatyJob[],
  next: readonly MatyJob[],
): boolean => {
  const before = new Set(liveMatyJobIds(previous));
  return liveMatyJobIds(next).some((id) => !before.has(id));
};

export interface MatyServiceDeps extends MatyClientDeps {
  isSignedIn: () => boolean;
  /** The state changed: tell the renderer. */
  onStateChanged?: (state: MatyState) => void;
  /** Overridable for tests; the defaults are the two constants above. */
  pollIntervalMs?: number;
  pollLimitMs?: number;
}

const sameState = (a: MatyState, b: MatyState): boolean => (
  a.available === b.available
  && a.loaded === b.loaded
  && a.watching === b.watching
  && sameMatyJobs(a.jobs, b.jobs)
);

export class MatyService {
  private readonly deps: MatyServiceDeps;
  private state: MatyState = EMPTY_MATY_STATE;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private watchStartedAt = 0;
  private refreshing: Promise<MatyState> | null = null;
  private disposed = false;

  constructor(deps: MatyServiceDeps) {
    this.deps = deps;
  }

  /** The last answer from Claidor; `loaded` is false until there has been one. */
  getState(): MatyState {
    return this.state;
  }

  /** Signing out empties the list until somebody signs in again. */
  reset(): void {
    this.clearTimer();
    this.watchStartedAt = 0;
    this.applyState(EMPTY_MATY_STATE);
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  /**
   * Ask Claidor now, and start watching again from this moment. Somebody
   * asking is itself a reason to keep watching, so the half-hour limit starts
   * over here; it only exists to stop a timer nobody is waiting on.
   *
   * Several things on screen ask at once — the composer's chip and the strip
   * above it, on two screens — so a caller arriving while a round is in
   * flight joins that round rather than starting a second one.
   */
  refresh(): Promise<MatyState> {
    if (this.refreshing) return this.refreshing;
    const round = (async (): Promise<MatyState> => {
      this.watchStartedAt = Date.now();
      await this.load();
      this.scheduleWatch();
      return this.state;
    })();
    this.refreshing = round;
    void round.finally(() => {
      if (this.refreshing === round) this.refreshing = null;
    });
    return round;
  }

  /** Send one piece of work up. Only the words travel. */
  async send(prompt: string): Promise<MatyActionResult> {
    const text = prompt.trim();
    if (!text) {
      return { outcome: MatyOutcome.Failed, state: this.state, error: 'There is nothing to send.' };
    }
    if (!this.deps.isSignedIn()) {
      return { outcome: MatyOutcome.Failed, state: this.state, error: 'Not signed in.' };
    }
    const result = await createMatyJob(this.deps, text);
    if (result.status === MatyRequestStatus.Unavailable) {
      this.applyState({ ...this.state, available: false, loaded: true });
      return { outcome: MatyOutcome.Unavailable, state: this.state };
    }
    if (result.status === MatyRequestStatus.Failed) {
      return { outcome: MatyOutcome.Failed, state: this.state, error: result.error };
    }
    // Claidor took the work, so the cloud is plainly available whatever the
    // last list said.
    this.foldJob(result.data, { available: true });
    this.watchStartedAt = Date.now();
    this.scheduleWatch();
    return { outcome: MatyOutcome.Sent, state: this.state, job: result.data };
  }

  /** Take a job back. Claidor allows it only while the job is still queued. */
  async cancel(jobId: string): Promise<MatyActionResult> {
    if (!this.deps.isSignedIn()) {
      return { outcome: MatyOutcome.Failed, state: this.state, error: 'Not signed in.' };
    }
    const result = await cancelMatyJob(this.deps, jobId);
    if (result.status === MatyRequestStatus.Unavailable) {
      this.applyState({ ...this.state, available: false, loaded: true });
      return { outcome: MatyOutcome.Unavailable, state: this.state };
    }
    if (result.status === MatyRequestStatus.Failed) {
      return { outcome: MatyOutcome.Failed, state: this.state, error: result.error };
    }
    this.foldJob(result.data);
    this.scheduleWatch();
    return { outcome: MatyOutcome.Cancelled, state: this.state, job: result.data };
  }

  /** Read one job on its own, for when only that one matters. */
  async getJob(jobId: string): Promise<MatyActionResult> {
    if (!this.deps.isSignedIn()) {
      return { outcome: MatyOutcome.Failed, state: this.state, error: 'Not signed in.' };
    }
    const result = await fetchMatyJob(this.deps, jobId);
    if (result.status === MatyRequestStatus.Unavailable) {
      this.applyState({ ...this.state, available: false, loaded: true });
      return { outcome: MatyOutcome.Unavailable, state: this.state };
    }
    if (result.status === MatyRequestStatus.Failed) {
      return { outcome: MatyOutcome.Failed, state: this.state, error: result.error };
    }
    this.foldJob(result.data);
    this.scheduleWatch();
    return { outcome: MatyOutcome.Sent, state: this.state, job: result.data };
  }

  private async load(): Promise<void> {
    if (!this.deps.isSignedIn()) {
      this.clearTimer();
      this.applyState(EMPTY_MATY_STATE);
      return;
    }
    const result = await fetchMatyState(this.deps);
    if (result.status === MatyRequestStatus.Ok) {
      this.applyState({ ...result.data, watching: this.state.watching });
      return;
    }
    if (result.status === MatyRequestStatus.Unavailable) {
      this.clearTimer();
      this.applyState({ available: false, jobs: [], loaded: true, watching: false });
      return;
    }
    // A failed round changes nothing: the list the app holds is still the last
    // thing Claidor said, and the next round asks again.
    console.warn(`${TAG} could not read the cloud work: ${result.error}`);
  }

  private foldJob(job: MatyJob, patch?: Partial<MatyState>): void {
    this.applyState({
      ...this.state,
      ...patch,
      jobs: upsertMatyJob(this.state.jobs, job),
      loaded: true,
    });
  }

  private applyState(next: MatyState): void {
    const previous = this.state;
    if (hasNewLiveMatyJob(previous.jobs, next.jobs)) {
      this.watchStartedAt = Date.now();
    }
    if (sameState(previous, next)) return;
    this.state = next;
    this.deps.onStateChanged?.(next);
  }

  /** Start, continue or stop the watch, according to the rule above. */
  private scheduleWatch(): void {
    this.clearTimer();
    if (this.disposed || !this.deps.isSignedIn()) {
      this.setWatching(false);
      return;
    }
    const decision = decideMatyPoll({
      jobs: this.state.jobs,
      watchStartedAt: this.watchStartedAt,
      now: Date.now(),
      intervalMs: this.deps.pollIntervalMs,
      limitMs: this.deps.pollLimitMs,
    });
    if (decision.action !== MatyPollAction.Poll) {
      if (decision.action === MatyPollAction.GiveUp) {
        console.log(`${TAG} the work is still in the cloud; the app has stopped watching it`);
      }
      this.setWatching(false);
      return;
    }
    this.setWatching(true);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.load().then(() => this.scheduleWatch());
    }, decision.delayMs);
  }

  private setWatching(watching: boolean): void {
    if (this.state.watching === watching) return;
    this.applyState({ ...this.state, watching });
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
