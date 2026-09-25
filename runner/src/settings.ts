import os from 'node:os';
import path from 'node:path';

/**
 * Everything the runner needs to start, all of it from the environment.
 *
 * There is no default for anything secret and no default that would work
 * in production by accident: the two values that decide who we are and who
 * we talk to must be set, or the process refuses to start.
 */
export interface RunnerSettings {
  /** Claidor's API, e.g. https://api.simeonlabs.com — no trailing slash. */
  apiBaseUrl: string;
  /** The service's own token. It belongs to the runner, not to a person. */
  runnerToken: string;
  /** How this runner names itself when it claims a job. */
  runnerName: string;
  /** Where a job's own directory is made, and deleted again. */
  workRoot: string;
  /** How long to wait before asking for work again when there is none. */
  pollIntervalMs: number;
  /** How often to tell Claidor a job is still going. */
  heartbeatIntervalMs: number;
  /** The longest a single job may take before it is given up on. */
  jobTimeoutMs: number;
}

export class MissingSetting extends Error {
  constructor(name: string) {
    super(`${name} is not set. The runner reads every setting from the environment.`);
    this.name = 'MissingSetting';
  }
}

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = (env[name] ?? '').trim();
  if (!value) throw new MissingSetting(name);
  return value;
};

/**
 * Claidor's address. `CLAIDOR_API_BASE_URL` is ours; `CLAIDOR_BASE_URL` is
 * the same address under the name the rest of Claidor already uses, so a
 * service that joins the shared environment group needs nothing extra.
 */
const apiBaseUrl = (env: NodeJS.ProcessEnv): string => {
  const ours = (env.CLAIDOR_API_BASE_URL ?? '').trim();
  if (ours) return ours.replace(/\/+$/, '');
  return required(env, 'CLAIDOR_BASE_URL').replace(/\/+$/, '');
};

const number = (env: NodeJS.ProcessEnv, name: string, fallback: number): number => {
  const raw = (env[name] ?? '').trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number of milliseconds, not "${raw}".`);
  }
  return value;
};

export const readSettings = (env: NodeJS.ProcessEnv = process.env): RunnerSettings => ({
  apiBaseUrl: apiBaseUrl(env),
  runnerToken: required(env, 'CLAIDOR_MATY_RUNNER_TOKEN'),
  runnerName: (env.CLAIDOR_MATY_RUNNER_NAME ?? '').trim() || os.hostname(),
  workRoot: (env.CLAIDOR_MATY_WORK_ROOT ?? '').trim() || path.join(os.tmpdir(), 'maty-jobs'),
  pollIntervalMs: number(env, 'CLAIDOR_MATY_POLL_INTERVAL_MS', 5_000),
  heartbeatIntervalMs: number(env, 'CLAIDOR_MATY_HEARTBEAT_INTERVAL_MS', 15_000),
  jobTimeoutMs: number(env, 'CLAIDOR_MATY_JOB_TIMEOUT_MS', 15 * 60_000),
});
