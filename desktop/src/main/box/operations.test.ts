import { describe, expect, test, vi } from 'vitest';

import { applyRebuild, describeRebuild, runDoctor, type BoxOperationsClient } from './operations';
import { BOX_CHECKS, buildDoctorScript } from './doctor';

function fakeClient(overrides: Partial<BoxOperationsClient> = {}): BoxOperationsClient {
  return {
    ensureBox: async () => ({ boxId: 'box_1' }),
    listMachines: async () => [],
    runShell: async () => ({ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), code: 0 }),
    putFile: async () => undefined,
    getFile: async () => Buffer.alloc(0),
    updateBox: async () => ({ boxId: 'box_2' }),
    resetBox: async () => ({ boxId: 'box_3' }),
    ...overrides,
  };
}

describe('what Update costs, said before it happens', () => {
  /**
   * Update reads as harmless and is not. If this line ever stops being said,
   * someone loses the tools they installed and has no idea why.
   */
  test('names the one thing that does not survive it', () => {
    const described = describeRebuild('update');
    expect(described.loses.join(' ')).toMatch(/[Ss]oftware installed/);
    expect(described.keeps.join(' ')).toMatch(/files/i);
    expect(described.keeps.join(' ')).toMatch(/signed in/i);
    expect(described.lastResort).toBe(false);
  });

  test('Reset says it is the last resort and what goes with it', () => {
    const described = describeRebuild('reset');
    expect(described.lastResort).toBe(true);
    expect(described.loses.length).toBeGreaterThan(1);
  });
});

describe('who is allowed to rebuild the box', () => {
  /**
   * An agent deciding on its own to rebuild the machine it is working on is
   * how a person loses a day to a tidy-up. The flag is the seam that makes
   * that impossible.
   */
  test('an unconfirmed update is refused and the broker is never called', async () => {
    const updateBox = vi.fn(async () => ({ boxId: 'box_2' }));
    const result = await applyRebuild({
      client: fakeClient({ updateBox }),
      boxId: 'box_1',
      kind: 'update',
      confirmed: false,
    });
    expect(result).toMatchObject({ ok: false });
    expect(updateBox).not.toHaveBeenCalled();
  });

  test('an unconfirmed reset is refused too', async () => {
    const resetBox = vi.fn(async () => ({ boxId: 'box_3' }));
    await applyRebuild({
      client: fakeClient({ resetBox }),
      boxId: 'box_1',
      kind: 'reset',
      confirmed: false,
    });
    expect(resetBox).not.toHaveBeenCalled();
  });

  test('a confirmed update goes through and returns the new box', async () => {
    expect(await applyRebuild({
      client: fakeClient(),
      boxId: 'box_1',
      kind: 'update',
      confirmed: true,
    })).toEqual({ ok: true, boxId: 'box_2' });
  });

  test('a confirmed reset goes through', async () => {
    expect(await applyRebuild({
      client: fakeClient(),
      boxId: 'box_1',
      kind: 'reset',
      confirmed: true,
    })).toEqual({ ok: true, boxId: 'box_3' });
  });

  test('a broker that refuses says why, rather than throwing at the caller', async () => {
    const result = await applyRebuild({
      client: fakeClient({ updateBox: async () => { throw new Error('no newer template'); } }),
      boxId: 'box_1',
      kind: 'update',
      confirmed: true,
    });
    expect(result).toEqual({ ok: false, reason: 'no newer template' });
  });
});

describe('the health check', () => {
  test('is one call to the box, carrying every check', async () => {
    const runShell = vi.fn(async () => ({
      stdout: Buffer.from(''), stderr: Buffer.alloc(0), code: 0,
    }));
    await runDoctor({ client: fakeClient({ runShell }), boxId: 'box_1' });
    expect(runShell).toHaveBeenCalledTimes(1);
    expect(runShell.mock.calls[0][1].script).toBe(buildDoctorScript(BOX_CHECKS));
  });

  /**
   * A probe that exits non-zero is a finding. Letting that fail the call would
   * turn one missing program into no report at all.
   */
  test('does not treat a failing probe as a failed call', async () => {
    const runShell = vi.fn(async () => ({
      stdout: Buffer.from(''), stderr: Buffer.alloc(0), code: 1,
    }));
    await runDoctor({ client: fakeClient({ runShell }), boxId: 'box_1' });
    expect(runShell.mock.calls[0][1].allowFailure).toBe(true);
  });

  test('reports a real box as checks with a verdict', async () => {
    const { execFileSync } = await import('node:child_process');
    const stdout = execFileSync('sh', ['-c', buildDoctorScript(BOX_CHECKS)], { encoding: 'utf8' });
    const report = await runDoctor({
      client: fakeClient({
        runShell: async () => ({ stdout: Buffer.from(stdout), stderr: Buffer.alloc(0), code: 0 }),
      }),
      boxId: 'box_1',
    });
    expect(report.checks).toHaveLength(BOX_CHECKS.length);
    expect(report.summary.length).toBeGreaterThan(0);
    expect(report.unreachable).toBeUndefined();
  });

  /**
   * A box that cannot be reached is a different problem from a box that
   * answered badly, and saying "10 problems" for it would send someone
   * hunting the wrong fault.
   */
  test('a box that cannot be reached says so, and lists no checks', async () => {
    const report = await runDoctor({
      client: fakeClient({ runShell: async () => { throw new Error('broker is down'); } }),
      boxId: 'box_1',
    });
    expect(report.unreachable).toBe('broker is down');
    expect(report.checks).toEqual([]);
    expect(report.summary).toMatch(/could not be reached/);
  });
});
