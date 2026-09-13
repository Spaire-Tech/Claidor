import { describe, expect, test } from 'vitest';

import { MatyJobKind, MatyJobStatus } from '../../../shared/maty/constants';
import { parseMatyJob, parseMatyJobEnvelope, parseMatyState } from './matyClient';

const job = (overrides: Record<string, unknown> = {}) => ({
  id: 'j1',
  kind: 'task',
  prompt: 'Write the morning briefing.',
  status: 'queued',
  result: '',
  error: '',
  createdAt: '2026-09-12T07:00:00Z',
  startedAt: '',
  finishedAt: '',
  ...overrides,
});

describe('parseMatyState', () => {
  test('reads the answer of GET /api/maty/jobs', () => {
    expect(parseMatyState({ available: true, jobs: [job()] })).toEqual({
      available: true,
      jobs: [{
        id: 'j1',
        kind: 'task',
        prompt: 'Write the morning briefing.',
        status: MatyJobStatus.Queued,
        result: '',
        error: '',
        createdAt: '2026-09-12T07:00:00Z',
        startedAt: '',
        finishedAt: '',
      }],
      loaded: true,
      watching: false,
    });
  });

  test('reads the same answer wrapped in the account protocol envelope', () => {
    const wrapped = parseMatyState({ code: 0, data: { available: true, jobs: [job()] } });
    expect(wrapped.available).toBe(true);
    expect(wrapped.jobs).toHaveLength(1);
  });

  test('a wrapper carrying a refusal code is not a list, whatever the status line said', () => {
    expect(parseMatyState({ code: 40301, message: 'no', data: { available: true, jobs: [job()] } }))
      .toEqual({ available: false, jobs: [], loaded: true, watching: false });
  });

  test('an answer it cannot read is « nothing there », never « available »', () => {
    expect(parseMatyState(null)).toEqual({
      available: false, jobs: [], loaded: true, watching: false,
    });
    expect(parseMatyState({ available: 'yes' }).available).toBe(false);
  });

  test('drops entries it cannot read rather than showing them as something else', () => {
    const state = parseMatyState({
      available: true,
      jobs: [job({ id: '' }), job({ id: 'j2', status: 'paused' }), null, job({ id: 'j3' })],
    });
    expect(state.jobs.map((entry) => entry.id)).toEqual(['j3']);
  });

  test('orders the list newest first whatever order Claidor sent', () => {
    const state = parseMatyState({
      available: true,
      jobs: [
        job({ id: 'old', createdAt: '2026-09-10T07:00:00Z' }),
        job({ id: 'new', createdAt: '2026-09-12T07:00:00Z' }),
      ],
    });
    expect(state.jobs.map((entry) => entry.id)).toEqual(['new', 'old']);
  });
});

describe('parseMatyJob', () => {
  test('fills in what Claidor left out rather than carrying undefined around', () => {
    expect(parseMatyJob({ id: 'j9', status: 'done' })).toEqual({
      id: 'j9',
      kind: MatyJobKind.Task,
      prompt: '',
      status: MatyJobStatus.Done,
      result: '',
      error: '',
      createdAt: '',
      startedAt: '',
      finishedAt: '',
    });
  });

  test('keeps a kind this app does not know, because Claidor owns that word', () => {
    expect(parseMatyJob(job({ kind: 'briefing' }))?.kind).toBe('briefing');
  });

  test('refuses a job with no id or an unknown status', () => {
    expect(parseMatyJob(job({ id: '   ' }))).toBeNull();
    expect(parseMatyJob(job({ status: 'cancelled' }))).toBeNull();
    expect(parseMatyJob('j1')).toBeNull();
  });
});

describe('parseMatyJobEnvelope', () => {
  test('reads the bare body the three single-job routes answer with', () => {
    expect(parseMatyJobEnvelope({ job: job({ id: 'j5' }) })?.id).toBe('j5');
  });

  test('reads the same body inside the { code, data } envelope', () => {
    expect(parseMatyJobEnvelope({ code: 0, data: { job: job({ id: 'j5' }) } })?.id).toBe('j5');
  });

  test('is null when there is no job in it', () => {
    expect(parseMatyJobEnvelope({ job: null })).toBeNull();
    expect(parseMatyJobEnvelope({ code: 1, data: { job: job() } })).toBeNull();
    expect(parseMatyJobEnvelope(null)).toBeNull();
  });
});
