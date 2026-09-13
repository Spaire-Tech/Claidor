/**
 * Work sent to the cloud engine (docs/maties/cloud.md).
 *
 * The cloud engine is for work that continues when the laptop is shut: the
 * app hands Claidor a piece of work, Claidor queues it, a runner picks it up,
 * and the answer is there whether or not this computer stayed awake.
 *
 * Everything here is either an IPC channel name, a route on Claidor's account
 * protocol — which the app already reaches under `/desktop`
 * (`src/main/libs/endpoints.ts`) — or a shape that crosses a process
 * boundary. The app holds no credential of the runner's: every request is
 * signed with the person's own Claidor session, exactly as memory sync and
 * connections are.
 */

export const MatyIpc = {
  /** What the cloud holds, and whether it will take work at all. */
  GetState: 'maty:getState',
  /** Ask Claidor again, now. */
  Refresh: 'maty:refresh',
  /** Send one piece of work up. */
  Send: 'maty:send',
  /** Read one job on its own. */
  GetJob: 'maty:getJob',
  /** Take a job back, while it is still queued. */
  Cancel: 'maty:cancel',
  /** Main → renderer: the state changed, here it is. */
  Changed: 'maty:changed',
} as const;
export type MatyIpc = typeof MatyIpc[keyof typeof MatyIpc];

/** The four routes, under the account protocol base URL (`.../desktop`). */
export const MATY_JOBS_ROUTE = '/api/maty/jobs';

export const matyJobRoute = (jobId: string): string => (
  `${MATY_JOBS_ROUTE}/${encodeURIComponent(jobId)}`
);

export const matyJobCancelRoute = (jobId: string): string => (
  `${matyJobRoute(jobId)}/cancel`
);

/** Claidor's answer when the cloud engine is not configured. */
export const MATY_UNAVAILABLE_STATUS = 503;

/**
 * Why the job exists. The app only ever creates the third: a one-off the
 * person asked for. Routines and mail are Claidor's to raise.
 */
export const MatyJobKind = {
  Routine: 'routine',
  Mail: 'mail',
  Task: 'task',
} as const;
export type MatyJobKind = typeof MatyJobKind[keyof typeof MatyJobKind];

/** Where a job is. `Done` and `Failed` are final. */
export const MatyJobStatus = {
  Queued: 'queued',
  Running: 'running',
  Done: 'done',
  Failed: 'failed',
} as const;
export type MatyJobStatus = typeof MatyJobStatus[keyof typeof MatyJobStatus];

/** One piece of work, as Claidor reports it. */
export interface MatyJob {
  readonly id: string;
  /** Claidor's word for why the job exists; an unknown one is kept as sent. */
  readonly kind: string;
  readonly prompt: string;
  readonly status: MatyJobStatus;
  /** The answer, once there is one. */
  readonly result: string;
  /** Why it could not be done, in plain words, once it has failed. */
  readonly error: string;
  /** ISO 8601, as Claidor sent them. Empty when Claidor did not send one. */
  readonly createdAt: string;
  readonly startedAt: string;
  readonly finishedAt: string;
}

/** What the app knows about the cloud right now. */
export interface MatyState {
  /**
   * Whether Claidor will take work at all. False switches the whole choice
   * off: the app never offers a control it cannot honour.
   */
  readonly available: boolean;
  readonly jobs: readonly MatyJob[];
  /** False until Claidor has answered once; nothing is drawn before that. */
  readonly loaded: boolean;
  /**
   * Whether the app is still asking Claidor how a live job is getting on.
   * It stops after a long while, because the cloud engine's whole point is
   * that nobody has to sit and watch. False with a live job on the list means
   * « it is still up there, ask again whenever you like », never « it died ».
   */
  readonly watching: boolean;
}

export const EMPTY_MATY_STATE: MatyState = {
  available: false,
  jobs: [],
  loaded: false,
  watching: false,
};

/** Where the next piece of work runs. The person's choice, and the label. */
export const MatyWorkPlace = {
  Here: 'here',
  Cloud: 'cloud',
} as const;
export type MatyWorkPlace = typeof MatyWorkPlace[keyof typeof MatyWorkPlace];

/** How a send or a cancel ended. */
export const MatyOutcome = {
  Sent: 'sent',
  Cancelled: 'cancelled',
  /** Claidor answered 503: the cloud engine is not configured. */
  Unavailable: 'unavailable',
  Failed: 'failed',
} as const;
export type MatyOutcome = typeof MatyOutcome[keyof typeof MatyOutcome];

export interface MatyActionResult {
  readonly outcome: MatyOutcome;
  readonly state: MatyState;
  /** The job as Claidor last described it, when the call produced one. */
  readonly job?: MatyJob;
  readonly error?: string;
}

/**
 * Longer than this and Claidor refuses the whole call, so the app stops it
 * here and says so in its own words. It is Claidor's figure, not a guess:
 * `PROMPT_MAX_LENGTH` in `server/polar/maty/service.py`.
 */
export const MATY_PROMPT_MAX_LENGTH = 8_000;
