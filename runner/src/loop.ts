import { RunnerQueue } from './claidor.js';
import type { ClaimedJob } from './claidor.js';
import { runJob } from './job.js';
import type { JobResult } from './job.js';
import { log, reasonOf } from './log.js';
import type { RunnerSettings } from './settings.js';

/**
 * Claim a job, do it, report it, again. One at a time, a short sleep when
 * there is nothing, a heartbeat while a job runs, and on a termination
 * signal the job in hand is finished before the process stops.
 */

export interface LoopDeps {
  queue: Pick<RunnerQueue, 'claim' | 'heartbeat' | 'complete' | 'fail'>;
  run: (claimed: ClaimedJob, settings: RunnerSettings) => Promise<JobResult>;
  sleep: (ms: number) => Promise<void>;
  /** Answers true once a termination signal has arrived. */
  stopping: () => boolean;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A failure worth trying again is one the work itself did not cause: the
 * network, the engine failing to start, a timeout. Anything the runner
 * refuses on purpose — a bad memory name, no model, an instruction the
 * engine would not take — comes back again exactly the same way, so it is
 * reported as final and the queue stops after it.
 */
export const isRetryable = (error: unknown): boolean => {
  const name = error instanceof Error ? error.name : '';
  return name !== 'BadMemoryName' && name !== 'NoModelAvailable' && name !== 'MissingSetting';
};

/** One claim-and-do turn. True when there was work. */
export const turn = async (settings: RunnerSettings, deps: LoopDeps): Promise<boolean> => {
  const claimed = await deps.queue.claim();
  if (!claimed) return false;

  log.info(`job ${claimed.job.id} (${claimed.job.kind}) claimed`);
  const beat = setInterval(() => {
    deps.queue.heartbeat(claimed.job.id).catch((error) => {
      log.warn(`job ${claimed.job.id}: the heartbeat did not reach Claidor: ${reasonOf(error)}`);
    });
  }, settings.heartbeatIntervalMs);

  try {
    const result = await deps.run(claimed, settings);
    clearInterval(beat);
    await deps.queue.complete(claimed.job.id, result.answer, result.usage);
    log.info(`job ${claimed.job.id} done`);
  } catch (error) {
    clearInterval(beat);
    const retryable = isRetryable(error);
    log.error(`job ${claimed.job.id} failed (${retryable ? 'can be retried' : 'final'})`, error);
    try {
      await deps.queue.fail(claimed.job.id, reasonOf(error), retryable);
    } catch (reportError) {
      // The lease will lapse and the job will come back on its own.
      log.error(`job ${claimed.job.id}: the failure did not reach Claidor either`, reportError);
    }
  } finally {
    clearInterval(beat);
  }
  return true;
};

export const loop = async (settings: RunnerSettings, deps: LoopDeps): Promise<void> => {
  while (!deps.stopping()) {
    let worked = false;
    try {
      worked = await turn(settings, deps);
    } catch (error) {
      log.error('the queue could not be reached', error);
      await deps.sleep(settings.pollIntervalMs);
      continue;
    }
    if (!worked && !deps.stopping()) await deps.sleep(settings.pollIntervalMs);
  }
  log.info('stopped');
};

export const start = async (settings: RunnerSettings): Promise<void> => {
  let stopping = false;
  const stop = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    log.info(`${signal} received; finishing the job in hand and then stopping`);
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));

  await loop(settings, {
    queue: new RunnerQueue(settings.apiBaseUrl, settings.runnerToken, settings.runnerName),
    run: runJob,
    sleep: wait,
    stopping: () => stopping,
  });
};
