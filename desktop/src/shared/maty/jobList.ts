/**
 * The job list, as a handful of pure functions so that both processes and the
 * tests agree about it.
 *
 * Claidor owns the truth: the list it sends replaces what the app held. The
 * single-job answers (create, read, cancel) are folded into that list rather
 * than replacing it, because they describe one job and say nothing about the
 * others.
 */

import { type MatyJob, MatyJobStatus } from './constants';

/** Queued and running are the live states; nothing leaves done or failed. */
export const isLiveMatyJob = (job: MatyJob): boolean => (
  job.status === MatyJobStatus.Queued || job.status === MatyJobStatus.Running
);

/** Only a queued job can be taken back; the contract refuses the rest. */
export const isCancellableMatyJob = (job: MatyJob): boolean => (
  job.status === MatyJobStatus.Queued
);

export const hasLiveMatyJob = (jobs: readonly MatyJob[]): boolean => (
  jobs.some(isLiveMatyJob)
);

/**
 * Newest first. `createdAt` is Claidor's and may be missing, so the id breaks
 * every tie and the order is stable whatever arrives.
 */
export const sortMatyJobsNewestFirst = (jobs: readonly MatyJob[]): MatyJob[] => (
  [...jobs].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  })
);

/** Fold one job Claidor described into the list, keeping the order. */
export const upsertMatyJob = (jobs: readonly MatyJob[], job: MatyJob): MatyJob[] => {
  const others = jobs.filter((existing) => existing.id !== job.id);
  return sortMatyJobsNewestFirst([...others, job]);
};

/** The whole list as Claidor sent it: its answer is the truth, in its order. */
export const replaceMatyJobs = (jobs: readonly MatyJob[]): MatyJob[] => (
  sortMatyJobsNewestFirst(jobs)
);

/** Whether two lists say the same thing, so an unchanged state is not pushed. */
export const sameMatyJobs = (a: readonly MatyJob[], b: readonly MatyJob[]): boolean => {
  if (a.length !== b.length) return false;
  return a.every((job, index) => {
    const other = b[index];
    return other !== undefined
      && job.id === other.id
      && job.status === other.status
      && job.result === other.result
      && job.error === other.error
      && job.finishedAt === other.finishedAt
      && job.startedAt === other.startedAt;
  });
};

/**
 * What the strip above the composer shows.
 *
 * A live job is never hidden: the person must be able to find it again long
 * after the moment they sent it. A finished one stays until they put it away,
 * and « away » is only the app's own view — the contract has no notion of a
 * job being seen, and nothing is deleted on Claidor.
 */
export const visibleMatyJobs = (
  jobs: readonly MatyJob[],
  putAway: ReadonlySet<string>,
  limit: number,
): MatyJob[] => {
  const shown = sortMatyJobsNewestFirst(jobs)
    .filter((job) => isLiveMatyJob(job) || !putAway.has(job.id));
  return shown.slice(0, Math.max(0, limit));
};
