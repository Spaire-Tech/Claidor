import { describe, expect, test, vi } from 'vitest';

import type { ClaimedJob } from './claidor.js';
import { isRetryable, loop, turn } from './loop.js';
import type { LoopDeps } from './loop.js';
import type { RunnerSettings } from './settings.js';

const settings: RunnerSettings = {
  apiBaseUrl: 'https://api.example.test',
  runnerToken: 'runner-token',
  runnerName: 'runner-1',
  engineRoot: '/engine',
  workRoot: '/jobs',
  pollIntervalMs: 1,
  heartbeatIntervalMs: 5,
  jobTimeoutMs: 1000,
  engineStartTimeoutMs: 1000,
};

const aJob = (id: string): ClaimedJob => ({
  job: { id, kind: 'routine', prompt: 'summarise the morning', allow: [], executor: 'maty-runner' },
  accessToken: 'person-token',
  expiresAt: null,
});

const deps = (over: Partial<LoopDeps> = {}): LoopDeps & { calls: Record<string, unknown[][]> } => {
  const calls: Record<string, unknown[][]> = { claim: [], heartbeat: [], complete: [], fail: [], run: [] };
  const base: LoopDeps = {
    queue: {
      claim: async () => {
        calls.claim!.push([]);
        return null;
      },
      heartbeat: async (...args: unknown[]) => {
        calls.heartbeat!.push(args);
      },
      complete: async (...args: unknown[]) => {
        calls.complete!.push(args);
      },
      fail: async (...args: unknown[]) => {
        calls.fail!.push(args);
      },
    } as LoopDeps['queue'],
    run: async (claimed) => {
      calls.run!.push([claimed.job.id]);
      return { answer: 'here it is', usage: { total_tokens: 12 } };
    },
    sleep: async () => {},
    stopping: () => false,
  };
  return { ...base, ...over, queue: { ...base.queue, ...(over.queue ?? {}) }, calls };
};

describe('one turn', () => {
  test('does nothing when the queue is empty', async () => {
    const d = deps();
    expect(await turn(settings, d)).toBe(false);
    expect(d.calls.run).toEqual([]);
    expect(d.calls.complete).toEqual([]);
  });

  test('does the job and reports the answer', async () => {
    const d = deps({ queue: { claim: async () => aJob('j1') } as LoopDeps['queue'] });
    expect(await turn(settings, d)).toBe(true);
    expect(d.calls.run).toEqual([['j1']]);
    expect(d.calls.complete).toEqual([['j1', 'here it is', { total_tokens: 12 }]]);
    expect(d.calls.fail).toEqual([]);
  });

  test('reports a failure instead of throwing, so the loop lives', async () => {
    const d = deps({
      queue: { claim: async () => aJob('j2') } as LoopDeps['queue'],
      run: async () => {
        throw new Error('the engine would not start');
      },
    });
    await expect(turn(settings, d)).resolves.toBe(true);
    expect(d.calls.complete).toEqual([]);
    expect(d.calls.fail).toEqual([['j2', 'the engine would not start', true]]);
  });

  test('survives Claidor refusing the failure report', async () => {
    const d = deps({
      queue: {
        claim: async () => aJob('j3'),
        fail: async () => {
          throw new Error('Claidor is down');
        },
      } as LoopDeps['queue'],
      run: async () => {
        throw new Error('the work went wrong');
      },
    });
    await expect(turn(settings, d)).resolves.toBe(true);
  });

  test('beats while the job runs and stops beating after', async () => {
    vi.useFakeTimers();
    try {
      const d = deps({
        queue: { claim: async () => aJob('j4') } as LoopDeps['queue'],
        run: async () => {
          await vi.advanceTimersByTimeAsync(settings.heartbeatIntervalMs * 3);
          return { answer: 'done', usage: {} };
        },
      });
      await turn(settings, d);
      const beats = d.calls.heartbeat!.length;
      expect(beats).toBeGreaterThanOrEqual(2);
      await vi.advanceTimersByTimeAsync(settings.heartbeatIntervalMs * 5);
      expect(d.calls.heartbeat!.length).toBe(beats);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a cloud agent\'s turn', () => {
  test('the turn\'s replies ride along with the answer', async () => {
    const d = deps({
      queue: { claim: async () => aJob('j5') } as LoopDeps['queue'],
      run: async () => ({ answer: 'hello', usage: {}, messages: [{ role: 'assistant', text: 'hello' }] }),
    });
    await turn(settings, d);
    expect(d.calls.complete).toEqual([['j5', 'hello', {}, { messages: [{ role: 'assistant', text: 'hello' }] }]]);
  });

  test('the cancel flag on a heartbeat aborts the run and reports it as cancelled, final', async () => {
    vi.useFakeTimers();
    try {
      let beats = 0;
      const d = deps({
        queue: {
          claim: async () => aJob('j6'),
          heartbeat: async () => {
            beats += 1;
            return { cancelRequested: beats >= 2 };
          },
        } as LoopDeps['queue'],
        run: async (_claimed, _settings, signal) => {
          await new Promise<void>((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')));
            void vi.advanceTimersByTimeAsync(settings.heartbeatIntervalMs * 4).then(resolve);
          });
          return { answer: 'should not land', usage: {} };
        },
      });
      await turn(settings, d);
      expect(d.calls.complete).toEqual([]);
      expect(d.calls.fail).toEqual([['j6', 'Cancelled by the person while it ran.', false]]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('one job at a time', () => {
  test('the next claim only happens after the last job finished', async () => {
    const order: string[] = [];
    let handed = 0;
    const d = deps({
      queue: {
        claim: async () => {
          order.push('claim');
          handed += 1;
          return handed <= 2 ? aJob(`j${handed}`) : null;
        },
      } as LoopDeps['queue'],
      run: async (claimed) => {
        order.push(`start ${claimed.job.id}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push(`end ${claimed.job.id}`);
        return { answer: 'x', usage: {} };
      },
      stopping: () => handed >= 3,
    });
    await loop(settings, d);
    expect(order).toEqual(['claim', 'start j1', 'end j1', 'claim', 'start j2', 'end j2', 'claim']);
  });
});

describe('stopping', () => {
  test('finishes the job in hand, then stops', async () => {
    let stop = false;
    let handed = 0;
    const d = deps({
      queue: {
        claim: async () => {
          handed += 1;
          return handed === 1 ? aJob('last') : null;
        },
      } as LoopDeps['queue'],
      run: async () => {
        // The signal arrives in the middle of the work.
        stop = true;
        return { answer: 'finished anyway', usage: {} };
      },
      stopping: () => stop,
    });
    await loop(settings, d);
    expect(d.calls.complete).toEqual([['last', 'finished anyway', {}]]);
    expect(handed).toBe(1);
  });

  test('claims nothing once it is stopping', async () => {
    const d = deps({ stopping: () => true });
    await loop(settings, d);
    expect(d.calls.claim).toEqual([]);
  });
});

describe('what is worth trying again', () => {
  test('a network or engine failure is', () => {
    expect(isRetryable(new Error('fetch failed'))).toBe(true);
  });

  test('a refusal of ours is not, because it would refuse the same way again', () => {
    const refusal = new Error('no');
    refusal.name = 'BadMemoryName';
    expect(isRetryable(refusal)).toBe(false);
    const noModel = new Error('none');
    noModel.name = 'NoModelAvailable';
    expect(isRetryable(noModel)).toBe(false);
    const unknownExecutor = new Error('no such executor');
    unknownExecutor.name = 'UnknownExecutor';
    expect(isRetryable(unknownExecutor)).toBe(false);
    const cancelled = new Error('stopped');
    cancelled.name = 'JobCancelled';
    expect(isRetryable(cancelled)).toBe(false);
  });
});
