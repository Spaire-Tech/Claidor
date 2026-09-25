import type { ClaimedJob } from './claidor.js';
import { MATY_RUNNER_EXECUTOR } from './claidor.js';
import { runJob } from './job.js';
import type { JobResult } from './job.js';
import type { RunnerSettings } from './settings.js';

/**
 * The seam between the queue and whatever does the work (25 September
 * 2026, `docs/product/box-substrate-read.md`: "keep the queue, change the
 * executor").
 *
 * Claidor names an executor on every claimed job (`executor`, default
 * `maty-runner`). Today there is exactly one: this process, a Render
 * container with no Docker, which lays out the person's memory, starts
 * the engine and asks it the job's conversation — a cloud agent's turn
 * runs on it as "read a file, call a model, write the reply back", and
 * branch, pull request and diff stay empty. The box executor (a clone, a
 * shell, a commit, a PR) registers here under its own name when it
 * exists; nothing about the loop, the lease or the token changes for it.
 */
export interface Executor {
  readonly name: string;
  run(claimed: ClaimedJob, settings: RunnerSettings, signal: AbortSignal): Promise<JobResult>;
}

export class UnknownExecutor extends Error {
  constructor(name: string) {
    super(`Claidor asked for the '${name}' executor, which this runner does not have.`);
    this.name = 'UnknownExecutor';
  }
}

export const matyRunnerExecutor: Executor = {
  name: MATY_RUNNER_EXECUTOR,
  run: (claimed, settings, signal) => runJob(claimed, settings, signal),
};

export const EXECUTORS: ReadonlyMap<string, Executor> = new Map([[matyRunnerExecutor.name, matyRunnerExecutor]]);

/** The executor a claimed job names, or a final (not retryable) refusal. */
export const executorFor = (claimed: ClaimedJob, executors: ReadonlyMap<string, Executor> = EXECUTORS): Executor => {
  const executor = executors.get(claimed.job.executor || MATY_RUNNER_EXECUTOR);
  if (executor === undefined) throw new UnknownExecutor(claimed.job.executor);
  return executor;
};

/** Run a claimed job on the executor it names. */
export const runOnExecutor = (claimed: ClaimedJob, settings: RunnerSettings, signal: AbortSignal): Promise<JobResult> =>
  executorFor(claimed).run(claimed, settings, signal);
