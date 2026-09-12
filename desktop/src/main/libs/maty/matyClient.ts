/**
 * The four requests the app makes to Claidor about cloud work
 * (docs/maties/cloud.md, section 4).
 *
 *     GET  /desktop/api/maty/jobs             -> { available, jobs }
 *     POST /desktop/api/maty/jobs             -> { job }    503 when off
 *     GET  /desktop/api/maty/jobs/{id}        -> { job }    404 when not yours
 *     POST /desktop/api/maty/jobs/{id}/cancel -> { job }    only while queued
 *
 * No bearer token is held in this module: the caller passes the app's existing
 * authenticated-request path (`fetchWithAuth`), which signs the request and
 * refreshes the token on a 401, exactly as memory sync and connections do.
 */

import {
  MATY_JOBS_ROUTE,
  MATY_PROMPT_MAX_LENGTH,
  MATY_UNAVAILABLE_STATUS,
  type MatyJob,
  matyJobCancelRoute,
  MatyJobKind,
  matyJobRoute,
  MatyJobStatus,
  type MatyState,
} from '../../../shared/maty/constants';
import { replaceMatyJobs } from '../../../shared/maty/jobList';

export type FetchWithAuth = (url: string, options?: RequestInit) => Promise<Response>;

export interface MatyClientDeps {
  /** The account protocol base URL, e.g. `https://api.claidor.com/desktop`. */
  getServerBaseUrl: () => string;
  fetchWithAuth: FetchWithAuth;
}

export const MatyRequestStatus = {
  Ok: 'ok',
  /** Claidor answered 503: there is no cloud engine to take the work. */
  Unavailable: 'unavailable',
  Failed: 'failed',
} as const;
export type MatyRequestStatus = typeof MatyRequestStatus[keyof typeof MatyRequestStatus];

export type MatyRequestResult<T> =
  | { readonly status: typeof MatyRequestStatus.Ok; readonly data: T }
  | { readonly status: typeof MatyRequestStatus.Unavailable }
  | { readonly status: typeof MatyRequestStatus.Failed; readonly error: string };

const REQUEST_TIMEOUT_MS = 20_000;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const readText = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Claidor's account protocol wraps some payloads in `{ code, data }` and sends
 * others bare, so both are read. A wrapper carrying a non-zero code is a
 * refusal even when the status line said 200.
 */
export const matyPayloadOf = (body: unknown): Record<string, unknown> | null => {
  if (!isRecord(body)) return null;
  if (typeof body.code === 'number' && body.code !== 0) return null;
  return isRecord(body.data) ? body.data : body;
};

const readStatus = (value: unknown): MatyJobStatus | null => {
  const text = readText(value);
  for (const status of Object.values(MatyJobStatus)) {
    if (status === text) return status;
  }
  return null;
};

/**
 * Pure: read one job. A job with no id, or a status this app does not know,
 * is not a job — it is dropped rather than shown as something it is not.
 */
export const parseMatyJob = (value: unknown): MatyJob | null => {
  if (!isRecord(value)) return null;
  const id = readText(value.id).trim();
  const status = readStatus(value.status);
  if (!id || status === null) return null;
  return {
    id,
    kind: readText(value.kind).trim() || MatyJobKind.Task,
    prompt: readText(value.prompt),
    status,
    result: readText(value.result),
    error: readText(value.error),
    createdAt: readText(value.createdAt),
    startedAt: readText(value.startedAt),
    finishedAt: readText(value.finishedAt),
  };
};

/** Pure: read `GET /api/maty/jobs`. An unreadable answer is « nothing there ». */
export const parseMatyState = (body: unknown): MatyState => {
  const payload = matyPayloadOf(body);
  const rawJobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
  const jobs: MatyJob[] = [];
  for (const entry of rawJobs) {
    const job = parseMatyJob(entry);
    if (job) jobs.push(job);
  }
  return {
    available: payload?.available === true,
    jobs: replaceMatyJobs(jobs),
    loaded: true,
    // The service decides whether it is watching; parsing never claims it is.
    watching: false,
  };
};

/** Pure: read the `{ job }` the other three routes answer with. */
export const parseMatyJobEnvelope = (body: unknown): MatyJob | null => {
  const payload = matyPayloadOf(body);
  if (!payload) return null;
  return parseMatyJob(payload.job);
};

const failureMessage = async (response: Response): Promise<string> => {
  try {
    const body: unknown = await response.json();
    if (isRecord(body)) {
      for (const key of ['message', 'detail', 'error']) {
        const text = readText(body[key]);
        if (text) return text;
      }
    }
  } catch {
    // The status alone is the whole story.
  }
  return `HTTP ${response.status}`;
};

const request = async <T>(
  deps: MatyClientDeps,
  path: string,
  options: RequestInit,
  read: (response: Response) => Promise<MatyRequestResult<T>>,
): Promise<MatyRequestResult<T>> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await deps.fetchWithAuth(`${deps.getServerBaseUrl()}${path}`, {
      ...options,
      signal: controller.signal,
    });
    if (response.status === MATY_UNAVAILABLE_STATUS) {
      return { status: MatyRequestStatus.Unavailable };
    }
    if (!response.ok) {
      return { status: MatyRequestStatus.Failed, error: await failureMessage(response) };
    }
    return await read(response);
  } catch (error) {
    return {
      status: MatyRequestStatus.Failed,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
};

const readJobEnvelope = async (response: Response): Promise<MatyRequestResult<MatyJob>> => {
  const job = parseMatyJobEnvelope(await response.json());
  return job
    ? { status: MatyRequestStatus.Ok, data: job }
    : { status: MatyRequestStatus.Failed, error: 'Claidor did not describe the work.' };
};

export const fetchMatyState = (
  deps: MatyClientDeps,
): Promise<MatyRequestResult<MatyState>> => (
  request(deps, MATY_JOBS_ROUTE, { method: 'GET' }, async (response) => ({
    status: MatyRequestStatus.Ok,
    data: parseMatyState(await response.json()),
  }))
);

/**
 * Send one piece of work up. Only the words travel: the contract carries a
 * prompt and a kind and nothing else, so no file, folder or attachment of this
 * computer goes with it.
 */
export const createMatyJob = (
  deps: MatyClientDeps,
  prompt: string,
): Promise<MatyRequestResult<MatyJob>> => (
  request(
    deps,
    MATY_JOBS_ROUTE,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ kind: MatyJobKind.Task, prompt: prompt.slice(0, MATY_PROMPT_MAX_LENGTH) }),
    },
    readJobEnvelope,
  )
);

export const fetchMatyJob = (
  deps: MatyClientDeps,
  jobId: string,
): Promise<MatyRequestResult<MatyJob>> => (
  request(deps, matyJobRoute(jobId), { method: 'GET' }, readJobEnvelope)
);

export const cancelMatyJob = (
  deps: MatyClientDeps,
  jobId: string,
): Promise<MatyRequestResult<MatyJob>> => (
  request(deps, matyJobCancelRoute(jobId), { method: 'POST' }, readJobEnvelope)
);
