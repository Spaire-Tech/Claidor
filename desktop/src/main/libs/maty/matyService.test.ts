import { describe, expect, test } from 'vitest';

import { type MatyJob, MatyJobKind, MatyJobStatus } from '../../../shared/maty/constants';
import {
  decideMatyPoll,
  hasNewLiveMatyJob,
  liveMatyJobIds,
  MATY_POLL_INTERVAL_MS,
  MATY_POLL_LIMIT_MS,
  MatyPollAction,
} from './matyService';

const makeJob = (id: string, status: MatyJobStatus): MatyJob => ({
  id,
  kind: MatyJobKind.Task,
  prompt: 'do the thing',
  status,
  result: '',
  error: '',
  createdAt: '2026-09-12T07:00:00Z',
  startedAt: '',
  finishedAt: '',
});

const START = 1_000_000;

describe('decideMatyPoll', () => {
  test('asks again while something is queued', () => {
    expect(decideMatyPoll({
      jobs: [makeJob('a', MatyJobStatus.Queued)],
      watchStartedAt: START,
      now: START + 1_000,
    })).toEqual({ action: MatyPollAction.Poll, delayMs: MATY_POLL_INTERVAL_MS });
  });

  test('asks again while something is running', () => {
    expect(decideMatyPoll({
      jobs: [makeJob('a', MatyJobStatus.Done), makeJob('b', MatyJobStatus.Running)],
      watchStartedAt: START,
      now: START + 5_000,
    }).action).toBe(MatyPollAction.Poll);
  });

  test('stops the moment nothing is live any more', () => {
    expect(decideMatyPoll({
      jobs: [makeJob('a', MatyJobStatus.Done), makeJob('b', MatyJobStatus.Failed)],
      watchStartedAt: START,
      now: START + 1_000,
    })).toEqual({ action: MatyPollAction.Idle });
  });

  test('an empty list is nothing to watch', () => {
    expect(decideMatyPoll({ jobs: [], watchStartedAt: START, now: START }).action)
      .toBe(MatyPollAction.Idle);
  });

  test('gives up once it has watched for the whole limit', () => {
    const jobs = [makeJob('a', MatyJobStatus.Running)];
    expect(decideMatyPoll({ jobs, watchStartedAt: START, now: START + MATY_POLL_LIMIT_MS - 1 }).action)
      .toBe(MatyPollAction.Poll);
    expect(decideMatyPoll({ jobs, watchStartedAt: START, now: START + MATY_POLL_LIMIT_MS }).action)
      .toBe(MatyPollAction.GiveUp);
    expect(decideMatyPoll({ jobs, watchStartedAt: START, now: START + MATY_POLL_LIMIT_MS * 4 }).action)
      .toBe(MatyPollAction.GiveUp);
  });

  test('nothing live beats the limit: a finished list is idle, never a give-up', () => {
    expect(decideMatyPoll({
      jobs: [makeJob('a', MatyJobStatus.Done)],
      watchStartedAt: START,
      now: START + MATY_POLL_LIMIT_MS * 10,
    }).action).toBe(MatyPollAction.Idle);
  });

  test('honours an interval and a limit given to it', () => {
    const jobs = [makeJob('a', MatyJobStatus.Queued)];
    expect(decideMatyPoll({
      jobs, watchStartedAt: START, now: START + 10, intervalMs: 250, limitMs: 1_000,
    })).toEqual({ action: MatyPollAction.Poll, delayMs: 250 });
    expect(decideMatyPoll({
      jobs, watchStartedAt: START, now: START + 1_000, intervalMs: 250, limitMs: 1_000,
    }).action).toBe(MatyPollAction.GiveUp);
  });
});

describe('spotting a new live job', () => {
  test('lists the live ids and nothing else, in a stable order', () => {
    expect(liveMatyJobIds([
      makeJob('b', MatyJobStatus.Running),
      makeJob('a', MatyJobStatus.Queued),
      makeJob('c', MatyJobStatus.Done),
    ])).toEqual(['a', 'b']);
  });

  test('a job that was not live before restarts the watch', () => {
    expect(hasNewLiveMatyJob(
      [makeJob('a', MatyJobStatus.Running)],
      [makeJob('a', MatyJobStatus.Running), makeJob('b', MatyJobStatus.Queued)],
    )).toBe(true);
  });

  test('the same live job carrying on does not', () => {
    expect(hasNewLiveMatyJob(
      [makeJob('a', MatyJobStatus.Queued)],
      [makeJob('a', MatyJobStatus.Running)],
    )).toBe(false);
  });

  test('a job finishing does not', () => {
    expect(hasNewLiveMatyJob(
      [makeJob('a', MatyJobStatus.Running)],
      [makeJob('a', MatyJobStatus.Done)],
    )).toBe(false);
  });
});
