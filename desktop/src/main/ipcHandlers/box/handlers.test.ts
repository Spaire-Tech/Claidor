import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { BoxIpc } from '../../../shared/box/constants';

/** The handlers register against electron's ipcMain; here it is a map. */
const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, handler);
    },
  },
}));

const broker = vi.hoisted(() => ({
  ensureBox: vi.fn(async () => ({ boxId: 'box_1', workspaceDir: '/workspace' })),
  listMachines: vi.fn(async () => [
    { id: 'box_1', kind: 'box', label: 'The box', state: 'running' },
  ]),
  runShell: vi.fn(async () => ({ stdout: Buffer.from(''), stderr: Buffer.alloc(0), code: 0 })),
  putFile: vi.fn(async () => undefined),
  getFile: vi.fn(async () => Buffer.from('from the box')),
  updateBox: vi.fn(async () => ({ boxId: 'box_2' })),
  resetBox: vi.fn(async () => ({ boxId: 'box_3' })),
}));

vi.mock('../../../../openclaw-extensions/box/brokerClient', () => ({
  BoxBrokerClient: class {
    ensureBox = broker.ensureBox;
    listMachines = broker.listMachines;
    runShell = broker.runShell;
    putFile = broker.putFile;
    getFile = broker.getFile;
    updateBox = broker.updateBox;
    resetBox = broker.resetBox;
  },
}));

const { registerBoxIpcHandlers } = await import('./handlers');

let brokerSettings: { brokerBaseUrl: string } | null = { brokerBaseUrl: 'http://127.0.0.1:8123' };
let tmp = '';

const call = async (channel: string, ...args: unknown[]) => {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`no handler for ${channel}`);
  }
  return await handler({}, ...args);
};

beforeEach(async () => {
  handlers.clear();
  for (const fn of Object.values(broker)) {
    fn.mockClear();
  }
  brokerSettings = { brokerBaseUrl: 'http://127.0.0.1:8123' };
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'box-ipc-'));
  registerBoxIpcHandlers({ getBrokerSettings: () => brokerSettings });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('what the bridge offers', () => {
  test('is every box call and nothing else', () => {
    expect([...handlers.keys()].sort()).toEqual(Object.values(BoxIpc).sort());
  });
});

describe('when the box is not set up', () => {
  /**
   * Signed out, or the token proxy not up yet. Every call has to answer
   * rather than throw across the bridge, where the renderer sees only
   * "Error invoking remote method".
   */
  test('every call answers with a reason instead of throwing', async () => {
    brokerSettings = null;
    expect(await call(BoxIpc.ListMachines)).toMatchObject({ ok: false });
    expect(await call(BoxIpc.CopyToBox, { localPath: '/a', boxPath: 'b' }))
      .toMatchObject({ ok: false });
    expect(await call(BoxIpc.Update, { confirmed: true })).toMatchObject({ ok: false });
    const report = await call(BoxIpc.Doctor) as { unreachable?: string };
    expect(report.unreachable).toBeTruthy();
  });
});

describe('the registry', () => {
  test('lists what machines there are', async () => {
    expect(await call(BoxIpc.ListMachines)).toEqual({
      ok: true,
      value: [{ id: 'box_1', kind: 'box', label: 'The box', state: 'running' }],
    });
  });

  test('a broker that fails is reported, not thrown', async () => {
    broker.listMachines.mockRejectedValueOnce(new Error('broker is down'));
    expect(await call(BoxIpc.ListMachines)).toEqual({ ok: false, reason: 'broker is down' });
  });
});

describe('copying a file onto the box', () => {
  test('reads the real file and puts it in the workspace', async () => {
    const local = path.join(tmp, 'notes.txt');
    await fs.writeFile(local, 'hello box');
    const result = await call(BoxIpc.CopyToBox, { localPath: local, boxPath: '' });
    expect(result).toEqual({ ok: true, value: { boxPath: '/workspace/uploads/notes.txt' } });
    expect(broker.putFile).toHaveBeenCalledWith(
      'box_1',
      '/workspace/uploads/notes.txt',
      Buffer.from('hello box'),
    );
  });

  /**
   * The guard has to hold at the bridge, not only in the module: this is the
   * call a renderer can make.
   */
  test('a destination outside the workspace is refused and nothing is sent', async () => {
    const local = path.join(tmp, 'notes.txt');
    await fs.writeFile(local, 'x');
    const result = await call(BoxIpc.CopyToBox, { localPath: local, boxPath: '../../etc/passwd' });
    expect(result).toMatchObject({ ok: false });
    expect(broker.putFile).not.toHaveBeenCalled();
  });

  test('a folder is refused and nothing is sent', async () => {
    const result = await call(BoxIpc.CopyToBox, { localPath: tmp, boxPath: '' });
    expect(result).toMatchObject({ ok: false });
    expect(broker.putFile).not.toHaveBeenCalled();
  });

  test('a request with no file at all is refused', async () => {
    expect(await call(BoxIpc.CopyToBox, undefined)).toMatchObject({ ok: false });
    expect(broker.putFile).not.toHaveBeenCalled();
  });
});

describe('copying a file back off the box', () => {
  test('writes it where the person asked', async () => {
    const local = path.join(tmp, 'out.txt');
    const result = await call(BoxIpc.CopyFromBox, { boxPath: 'out.txt', localPath: local });
    expect(result).toEqual({ ok: true, value: { localPath: local } });
    await expect(fs.readFile(local, 'utf8')).resolves.toBe('from the box');
  });

  test('will not quietly overwrite what is already there', async () => {
    const local = path.join(tmp, 'out.txt');
    await fs.writeFile(local, 'the older version');
    expect(await call(BoxIpc.CopyFromBox, { boxPath: 'out.txt', localPath: local }))
      .toMatchObject({ ok: false });
    await expect(fs.readFile(local, 'utf8')).resolves.toBe('the older version');
  });

  test('overwrites when the person says so', async () => {
    const local = path.join(tmp, 'out.txt');
    await fs.writeFile(local, 'the older version');
    expect(await call(BoxIpc.CopyFromBox, { boxPath: 'out.txt', localPath: local, overwrite: true }))
      .toMatchObject({ ok: true });
    await expect(fs.readFile(local, 'utf8')).resolves.toBe('from the box');
  });
});

describe('Update and Reset', () => {
  test('say what they cost before they are done', async () => {
    const update = await call(BoxIpc.DescribeRebuild, 'update') as { loses: string[] };
    expect(update.loses.join(' ')).toMatch(/[Ss]oftware installed/);
    const reset = await call(BoxIpc.DescribeRebuild, 'reset') as { lastResort: boolean };
    expect(reset.lastResort).toBe(true);
  });

  /**
   * The spec's rule: agents can never rebuild the box themselves. The
   * confirmation is the seam, and it is never defaulted to true.
   */
  test('do nothing at all without the person confirming', async () => {
    expect(await call(BoxIpc.Update, {})).toMatchObject({ ok: false });
    expect(await call(BoxIpc.Reset, {})).toMatchObject({ ok: false });
    expect(await call(BoxIpc.Update, undefined)).toMatchObject({ ok: false });
    expect(broker.updateBox).not.toHaveBeenCalled();
    expect(broker.resetBox).not.toHaveBeenCalled();
  });

  test('go through once confirmed, and report the new box', async () => {
    expect(await call(BoxIpc.Update, { confirmed: true }))
      .toEqual({ ok: true, value: { boxId: 'box_2' } });
    expect(await call(BoxIpc.Reset, { confirmed: true }))
      .toEqual({ ok: true, value: { boxId: 'box_3' } });
  });
});

describe('the health check', () => {
  test('is one call to the box', async () => {
    await call(BoxIpc.Doctor);
    expect(broker.runShell).toHaveBeenCalledTimes(1);
  });

  test('a box that answers nothing is a report of failures, not a crash', async () => {
    const report = await call(BoxIpc.Doctor) as { ok: boolean; checks: unknown[] };
    expect(report.ok).toBe(false);
    expect(report.checks.length).toBeGreaterThan(0);
  });
});
