import { RunnerQueue } from './claidor.js';
import type { ClaimedJob, JobState } from './claidor.js';
import { runOnExecutor } from './executor.js';
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
  run: (claimed: ClaimedJob, settings: RunnerSettings, signal: AbortSignal) => Promise<JobResult>;
  sleep: (ms: number) => Promise<void>;
  /** Answers true once a termination signal has arrived. */
  stopping: () => boolean;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** What the queue is told when the person asked the job to stop mid-run. */
export const CANCELLED_REASON = 'Cancelled by the person while it ran.';

/**
 * A failure worth trying again is one the work itself did not cause: the
 * network, the engine failing to start, a timeout. Anything the runner
 * refuses on purpose — a bad memory name, no model, an instruction the
 * engine would not take, an executor it does not have — comes back again
 * exactly the same way, so it is reported as final and the queue stops
 * after it. A cancellation is final by definition.
 */
export const isRetryable = (error: unknown): boolean => {
  const name = error instanceof Error ? error.name : '';
  return name !== 'BadMemoryName' && name !== 'NoModelAvailable' && name !== 'MissingSetting' && name !== 'UnknownExecutor' && name !== 'JobCancelled';
};

/** One claim-and-do turn. True when there was work. */
export const turn = async (settings: RunnerSettings, deps: LoopDeps): Promise<boolean> => {
  const claimed = await deps.queue.claim();
  if (!claimed) return false;

  log.info(`job ${claimed.job.id} (${claimed.job.kind}, ${claimed.job.executor}) claimed`);
  // The person can ask a running job to stop (a cloud agent's pause); the
  // heartbeat's answer carries the flag and the executor is told to abort.
  const cancel = new AbortController();
  const beat = setInterval(() => {
    deps.queue
      .heartbeat(claimed.job.id)
      .then((state: JobState | void) => {
        if (state !== undefined && state.cancelRequested && !cancel.signal.aborted) {
          log.info(`job ${claimed.job.id}: the person asked it to stop`);
          cancel.abort();
        }
      })
      .catch((error) => {
        log.warn(`job ${claimed.job.id}: the heartbeat did not reach Claidor: ${reasonOf(error)}`);
      });
  }, settings.heartbeatIntervalMs);

  try {
    const result = await deps.run(claimed, settings, cancel.signal);
    clearInterval(beat);
    if (result.messages === undefined) await deps.queue.complete(claimed.job.id, result.answer, result.usage);
    else await deps.queue.complete(claimed.job.id, result.answer, result.usage, { messages: result.messages });
    log.info(`job ${claimed.job.id} done`);
  } catch (error) {
    clearInterval(beat);
    const cancelled = cancel.signal.aborted;
    const retryable = !cancelled && isRetryable(error);
    if (cancelled) log.info(`job ${claimed.job.id} cancelled`);
    else log.error(`job ${claimed.job.id} failed (${retryable ? 'can be retried' : 'final'})`, error);
    try {
      await deps.queue.fail(claimed.job.id, cancelled ? CANCELLED_REASON : reasonOf(error), retryable);
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
    run: runOnExecutor,
    sleep: wait,
    stopping: () => stopping,
  });
};
