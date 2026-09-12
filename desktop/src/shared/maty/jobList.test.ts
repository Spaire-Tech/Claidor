import { describe, expect, test } from 'vitest';

import { type MatyJob, MatyJobKind, MatyJobStatus } from './constants';
import {
  hasLiveMatyJob,
  isCancellableMatyJob,
  isLiveMatyJob,
  replaceMatyJobs,
  sameMatyJobs,
  sortMatyJobsNewestFirst,
  upsertMatyJob,
  visibleMatyJobs,
} from './jobList';

const makeJob = (
  id: string,
  status: MatyJobStatus,
  createdAt = '2026-09-12T07:00:00Z',
  overrides: Partial<MatyJob> = {},
): MatyJob => ({
  id,
  kind: MatyJobKind.Task,
  prompt: 'do the thing',
  status,
  result: '',
  error: '',
  createdAt,
  startedAt: '',
  finishedAt: '',
  ...overrides,
});

describe('what is live', () => {
  test('queued and running are live; done and failed are not', () => {
    expect(isLiveMatyJob(makeJob('a', MatyJobStatus.Queued))).toBe(true);
    expect(isLiveMatyJob(makeJob('a', MatyJobStatus.Running))).toBe(true);
    expect(isLiveMatyJob(makeJob('a', MatyJobStatus.Done))).toBe(false);
    expect(isLiveMatyJob(makeJob('a', MatyJobStatus.Failed))).toBe(false);
  });

  test('only a queued job can be taken back', () => {
    expect(isCancellableMatyJob(makeJob('a', MatyJobStatus.Queued))).toBe(true);
    expect(isCancellableMatyJob(makeJob('a', MatyJobStatus.Running))).toBe(false);
    expect(isCancellableMatyJob(makeJob('a', MatyJobStatus.Done))).toBe(false);
  });

  test('hasLiveMatyJob reads the whole list', () => {
    expect(hasLiveMatyJob([])).toBe(false);
    expect(hasLiveMatyJob([makeJob('a', MatyJobStatus.Done)])).toBe(false);
    expect(hasLiveMatyJob([
      makeJob('a', MatyJobStatus.Done),
      makeJob('b', MatyJobStatus.Queued),
    ])).toBe(true);
  });
});

describe('the order of the list', () => {
  test('newest first', () => {
    const sorted = sortMatyJobsNewestFirst([
      makeJob('a', MatyJobStatus.Done, '2026-09-10T07:00:00Z'),
      makeJob('c', MatyJobStatus.Done, '2026-09-12T07:00:00Z'),
      makeJob('b', MatyJobStatus.Done, '2026-09-11T07:00:00Z'),
    ]);
    expect(sorted.map((job) => job.id)).toEqual(['c', 'b', 'a']);
  });

  test('the id breaks a tie, so the order never wobbles', () => {
    const sorted = sortMatyJobsNewestFirst([
      makeJob('a', MatyJobStatus.Done, ''),
      makeJob('c', MatyJobStatus.Done, ''),
      makeJob('b', MatyJobStatus.Done, ''),
    ]);
    expect(sorted.map((job) => job.id)).toEqual(['c', 'b', 'a']);
  });

  test('sorting does not touch the list it was given', () => {
    const jobs = [
      makeJob('a', MatyJobStatus.Done, '2026-09-10T07:00:00Z'),
      makeJob('b', MatyJobStatus.Done, '2026-09-12T07:00:00Z'),
    ];
    replaceMatyJobs(jobs);
    expect(jobs.map((job) => job.id)).toEqual(['a', 'b']);
  });
});

describe('upsertMatyJob', () => {
  test('adds a job the list did not hold', () => {
    const jobs = upsertMatyJob(
      [makeJob('a', MatyJobStatus.Done, '2026-09-10T07:00:00Z')],
      makeJob('b', MatyJobStatus.Queued, '2026-09-12T07:00:00Z'),
    );
    expect(jobs.map((job) => job.id)).toEqual(['b', 'a']);
  });

  test('replaces the job it already held, once', () => {
    const jobs = upsertMatyJob(
      [makeJob('a', MatyJobStatus.Queued), makeJob('b', MatyJobStatus.Done, '2026-09-11T07:00:00Z')],
      makeJob('a', MatyJobStatus.Running),
    );
    expect(jobs).toHaveLength(2);
    expect(jobs.find((job) => job.id === 'a')?.status).toBe(MatyJobStatus.Running);
  });
});

describe('sameMatyJobs', () => {
  test('the same list is the same list', () => {
    const jobs = [makeJob('a', MatyJobStatus.Queued)];
    expect(sameMatyJobs(jobs, [makeJob('a', MatyJobStatus.Queued)])).toBe(true);
  });

  test('a status, an answer or a finishing time makes it a different list', () => {
    const before = [makeJob('a', MatyJobStatus.Running)];
    expect(sameMatyJobs(before, [makeJob('a', MatyJobStatus.Done)])).toBe(false);
    expect(sameMatyJobs(before, [
      makeJob('a', MatyJobStatus.Running, '2026-09-12T07:00:00Z', { result: 'here it is' }),
    ])).toBe(false);
    expect(sameMatyJobs(before, [])).toBe(false);
  });
});

describe('visibleMatyJobs', () => {
  const live = makeJob('live', MatyJobStatus.Running, '2026-09-12T07:00:00Z');
  const done = makeJob('done', MatyJobStatus.Done, '2026-09-11T07:00:00Z');
  const failed = makeJob('failed', MatyJobStatus.Failed, '2026-09-10T07:00:00Z');

  test('shows everything that is not put away, newest first', () => {
    expect(visibleMatyJobs([done, live, failed], new Set(), 10).map((job) => job.id))
      .toEqual(['live', 'done', 'failed']);
  });

  test('a finished job that was put away is not drawn', () => {
    expect(visibleMatyJobs([done, live, failed], new Set(['done']), 10).map((job) => job.id))
      .toEqual(['live', 'failed']);
  });

  test('a live job is never hidden, whatever the app was told to put away', () => {
    expect(visibleMatyJobs([live], new Set(['live']), 10).map((job) => job.id)).toEqual(['live']);
  });

  test('the limit trims the finished rows', () => {
    expect(visibleMatyJobs([done, live, failed], new Set(), 2).map((job) => job.id))
      .toEqual(['live', 'done']);
  });

  test('the limit never trims a live row, however many there are', () => {
    const many = [
      makeJob('a', MatyJobStatus.Queued, '2026-09-12T07:00:00Z'),
      makeJob('b', MatyJobStatus.Running, '2026-09-12T06:00:00Z'),
      makeJob('c', MatyJobStatus.Queued, '2026-09-12T05:00:00Z'),
      done,
    ];
    expect(visibleMatyJobs(many, new Set(), 1).map((job) => job.id))
      .toEqual(['a', 'b', 'c']);
    expect(visibleMatyJobs([live], new Set(), 0).map((job) => job.id)).toEqual(['live']);
  });

  test('a live job comes before a finished one even when it is older', () => {
    const oldLive = makeJob('old-live', MatyJobStatus.Queued, '2026-09-01T07:00:00Z');
    expect(visibleMatyJobs([done, oldLive], new Set(), 10).map((job) => job.id))
      .toEqual(['old-live', 'done']);
  });
});
