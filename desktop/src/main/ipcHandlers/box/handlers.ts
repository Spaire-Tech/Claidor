import fs from 'node:fs/promises';

import { ipcMain } from 'electron';

import {
  BoxBrokerClient,
  type BoxBrokerSettings,
} from '../../../../openclaw-extensions/box/brokerClient';
import {
  BoxIpc,
  type BoxDoctorReport,
  type BoxMachine,
  type BoxRebuildDescription,
  type BoxRebuildKind,
  type BoxResult,
} from '../../../shared/box/constants';
import { planCopyFromBox, planCopyToBox } from '../../box/custody';
import { applyRebuild, describeRebuild, runDoctor } from '../../box/operations';

/**
 * The bridge to the agent's computer.
 *
 * Seven calls: what machines there are, how the box is doing, a file on, a
 * file off, what a rebuild would cost, and the two rebuilds themselves.
 * Everything that decides anything is in `main/box/`.
 *
 * Two rules are enforced here and not left to the caller:
 *
 *  - A copy is one file and a deliberate one. The guards in `box/custody.ts`
 *    run before anything is read or written.
 *  - Update and Reset happen only when the caller states the person agreed.
 *    They are not agent tools, and `applyRebuild` refuses an unconfirmed call.
 */

export type BoxIpcDeps = {
  /**
   * How to reach the broker, or null when the app is not signed in / the token
   * proxy is not up. Read fresh on every call: the proxy's port changes
   * between runs and the person can sign out mid-session.
   */
  getBrokerSettings: () => BoxBrokerSettings | null;
  /** The scope the box is opened under. "shared" is one box for every agent. */
  scopeKey?: string;
};

const NOT_CONFIGURED = 'The box is not set up yet. Sign in and try again.';

function failed<T>(reason: string): BoxResult<T> {
  return { ok: false, reason };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerBoxIpcHandlers(deps: BoxIpcDeps): void {
  const scopeKey = deps.scopeKey ?? 'shared';

  /** A client and the box it points at, or the reason there is neither. */
  const open = async (): Promise<
    { ok: true; client: BoxBrokerClient; boxId: string; workspaceRoot: string }
    | { ok: false; reason: string }
  > => {
    const settings = deps.getBrokerSettings();
    if (!settings) {
      return { ok: false, reason: NOT_CONFIGURED };
    }
    try {
      const client = new BoxBrokerClient(settings);
      const state = await client.ensureBox(scopeKey);
      return {
        ok: true,
        client,
        boxId: state.boxId,
        workspaceRoot: state.workspaceDir ?? '/home/user/workspace',
      };
    } catch (error) {
      return { ok: false, reason: messageOf(error) };
    }
  };

  ipcMain.handle(BoxIpc.ListMachines, async (): Promise<BoxResult<BoxMachine[]>> => {
    const settings = deps.getBrokerSettings();
    if (!settings) {
      return failed(NOT_CONFIGURED);
    }
    try {
      return { ok: true, value: await new BoxBrokerClient(settings).listMachines() };
    } catch (error) {
      return failed(messageOf(error));
    }
  });

  ipcMain.handle(BoxIpc.Doctor, async (): Promise<BoxDoctorReport> => {
    const opened = await open();
    if (!opened.ok) {
      return {
        ok: false,
        status: 'fail',
        summary: 'The box could not be reached.',
        checks: [],
        unreachable: opened.reason,
      };
    }
    return await runDoctor({ client: opened.client, boxId: opened.boxId });
  });

  ipcMain.handle(
    BoxIpc.CopyToBox,
    async (_event, request: unknown): Promise<BoxResult<{ boxPath: string }>> => {
      const { localPath, boxPath } = asCopyRequest(request);
      const opened = await open();
      if (!opened.ok) {
        return failed(opened.reason);
      }
      const plan = await planCopyToBox({
        localPath,
        boxPath,
        workspaceRoot: opened.workspaceRoot,
      });
      if (!plan.ok) {
        return failed(plan.reason);
      }
      try {
        await opened.client.putFile(opened.boxId, plan.boxPath, await fs.readFile(plan.localPath));
        return { ok: true, value: { boxPath: plan.boxPath } };
      } catch (error) {
        return failed(messageOf(error));
      }
    },
  );

  ipcMain.handle(
    BoxIpc.CopyFromBox,
    async (_event, request: unknown): Promise<BoxResult<{ localPath: string }>> => {
      const { localPath, boxPath, overwrite } = asCopyRequest(request);
      const opened = await open();
      if (!opened.ok) {
        return failed(opened.reason);
      }
      const plan = await planCopyFromBox({
        boxPath,
        localPath,
        overwrite,
        workspaceRoot: opened.workspaceRoot,
      });
      if (!plan.ok) {
        return failed(plan.reason);
      }
      try {
        await fs.writeFile(plan.localPath, await opened.client.getFile(opened.boxId, plan.boxPath));
        return { ok: true, value: { localPath: plan.localPath } };
      } catch (error) {
        return failed(messageOf(error));
      }
    },
  );

  ipcMain.handle(
    BoxIpc.DescribeRebuild,
    async (_event, kind: unknown): Promise<BoxRebuildDescription> => describeRebuild(asKind(kind)),
  );

  for (const [channel, kind] of [
    [BoxIpc.Update, 'update'],
    [BoxIpc.Reset, 'reset'],
  ] as const) {
    ipcMain.handle(
      channel,
      async (_event, request: unknown): Promise<BoxResult<{ boxId: string }>> => {
        const opened = await open();
        if (!opened.ok) {
          return failed(opened.reason);
        }
        const result = await applyRebuild({
          client: opened.client,
          boxId: opened.boxId,
          kind,
          // Never defaulted to true. The person's click is the only thing that
          // sets it.
          confirmed: isConfirmed(request),
        });
        return result.ok ? { ok: true, value: { boxId: result.boxId } } : failed(result.reason);
      },
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asCopyRequest(value: unknown): {
  localPath: string;
  boxPath: string;
  overwrite: boolean;
} {
  const record = asRecord(value);
  return {
    localPath: typeof record.localPath === 'string' ? record.localPath : '',
    boxPath: typeof record.boxPath === 'string' ? record.boxPath : '',
    overwrite: record.overwrite === true,
  };
}

function asKind(value: unknown): BoxRebuildKind {
  return value === 'reset' ? 'reset' : 'update';
}

function isConfirmed(value: unknown): boolean {
  return asRecord(value).confirmed === true;
}
