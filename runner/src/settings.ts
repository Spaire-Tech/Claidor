import os from 'node:os';
import path from 'node:path';

/**
 * Everything the runner needs to start, all of it from the environment.
 *
 * There is no default for anything secret and no default that would work
 * in production by accident: the two values that decide who we are and who
 * we talk to must be set, or the process refuses to start.
 *
 * Every setting is read as SIMEON_<NAME>. The earlier CLAIDOR_<NAME> is still
 * read when the SIMEON_ name is not set, as the API reads its own settings,
 * so a deployment keeps working while its variables are renamed.
 */
export interface RunnerSettings {
  /** Simeon Labs' API, e.g. https://api.simeonlabs.com — no trailing slash. */
  apiBaseUrl: string;
  /** The service's own token. It belongs to the runner, not to a person. */
  runnerToken: string;
  /** How this runner names itself when it claims a job. */
  runnerName: string;
  /** Where a job's own directory is made, and deleted again. */
  workRoot: string;
  /** How long to wait before asking for work again when there is none. */
  pollIntervalMs: number;
  /** How often to tell the API a job is still going. */
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

/** `SIMEON_<name>`, else the earlier `CLAIDOR_<name>`, trimmed; '' when neither. */
const read = (env: NodeJS.ProcessEnv, name: string): string =>
  (env[`SIMEON_${name}`] ?? '').trim() || (env[`CLAIDOR_${name}`] ?? '').trim();

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = read(env, name);
  if (!value) throw new MissingSetting(`SIMEON_${name}`);
  return value;
};

/**
 * The API's address. `SIMEON_API_BASE_URL` is ours; `SIMEON_BASE_URL` is
 * the same address under the name the API already uses, so a service that
 * joins the shared environment group needs nothing extra.
 */
const apiBaseUrl = (env: NodeJS.ProcessEnv): string => {
  const ours = read(env, 'API_BASE_URL');
  if (ours) return ours.replace(/\/+$/, '');
  return required(env, 'BASE_URL').replace(/\/+$/, '');
};

const number = (env: NodeJS.ProcessEnv, name: string, fallback: number): number => {
  const raw = read(env, name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`SIMEON_${name} must be a positive number of milliseconds, not "${raw}".`);
  }
  return value;
};

export const readSettings = (env: NodeJS.ProcessEnv = process.env): RunnerSettings => ({
  apiBaseUrl: apiBaseUrl(env),
  runnerToken: required(env, 'MATY_RUNNER_TOKEN'),
  runnerName: read(env, 'MATY_RUNNER_NAME') || os.hostname(),
  workRoot: read(env, 'MATY_WORK_ROOT') || path.join(os.tmpdir(), 'maty-jobs'),
  pollIntervalMs: number(env, 'MATY_POLL_INTERVAL_MS', 5_000),
  heartbeatIntervalMs: number(env, 'MATY_HEARTBEAT_INTERVAL_MS', 15_000),
  jobTimeoutMs: number(env, 'MATY_JOB_TIMEOUT_MS', 15 * 60_000),
});
