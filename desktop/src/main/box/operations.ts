/**
 * What a person can do to the agent's computer.
 *
 * Two of these are destructive in a way that does not look destructive, so
 * both are two steps: describe what it costs, then do it only when the caller
 * says it was confirmed.
 *
 * **Agents cannot call Update or Reset.** They are not registered as agent
 * tools anywhere in the plugin, and `applyRebuild` refuses an unconfirmed
 * call. An agent deciding on its own to rebuild the machine it is working on
 * is how a person loses a day's work to a tidy-up.
 */
import type {
  BoxDoctorReport,
  BoxMachine,
  BoxRebuildDescription,
  BoxRebuildKind,
} from '../../shared/box/constants';
import { BOX_CHECKS, buildDoctorScript, parseDoctorOutput, summarizeDoctor } from './doctor';

/** The slice of the broker client these operations need. */
export type BoxOperationsClient = {
  ensureBox(scopeKey: string): Promise<{ boxId: string; workspaceDir?: string }>;
  listMachines(): Promise<BoxMachine[]>;
  runShell(
    boxId: string,
    params: { script: string; allowFailure?: boolean },
  ): Promise<{ stdout: Buffer; stderr: Buffer; code: number }>;
  putFile(boxId: string, boxPath: string, data: Buffer): Promise<void>;
  getFile(boxId: string, boxPath: string): Promise<Buffer>;
  updateBox(boxId: string): Promise<{ boxId: string }>;
  resetBox(boxId: string): Promise<{ boxId: string }>;
};

export function describeRebuild(kind: BoxRebuildKind): BoxRebuildDescription {
  if (kind === 'update') {
    return {
      kind,
      title: 'Move the box to a newer version',
      keeps: [
        'Your files in the box',
        'Anything you are signed in to',
      ],
      // The line that has to be read before this is agreed to. Update sounds
      // harmless; software installed in the box does not survive it.
      loses: [
        'Software installed in the box — it will need installing again',
      ],
      lastResort: false,
    };
  }
  return {
    kind: 'reset',
    title: 'Put the box back to its last snapshot',
    keeps: [
      'Nothing after the snapshot',
    ],
    loses: [
      'Every file added or changed since the snapshot',
      'Anything you signed in to since the snapshot',
      'Software installed since the snapshot',
    ],
    lastResort: true,
  };
}

/**
 * Do the rebuild — only when the caller states the person agreed.
 *
 * The flag is not ceremony. It is the seam that makes it impossible for
 * anything that is not a person's click to reach `updateBox` or `resetBox`.
 */
export async function applyRebuild(params: {
  client: BoxOperationsClient;
  boxId: string;
  kind: BoxRebuildKind;
  confirmed: boolean;
}): Promise<{ ok: true; boxId: string } | { ok: false; reason: string }> {
  if (!params.confirmed) {
    return {
      ok: false,
      reason: `A ${params.kind} has to be confirmed by the person first.`,
    };
  }
  try {
    const state = params.kind === 'update'
      ? await params.client.updateBox(params.boxId)
      : await params.client.resetBox(params.boxId);
    return { ok: true, boxId: state.boxId };
  } catch (error) {
    return { ok: false, reason: messageOf(error) };
  }
}

/**
 * Run every health check in one call and read the answers.
 *
 * A box that cannot be reached at all is its own answer, and a different one
 * from a box that answered badly — so it is reported separately rather than as
 * ten failed checks.
 */
export async function runDoctor(params: {
  client: BoxOperationsClient;
  boxId: string;
}): Promise<BoxDoctorReport> {
  let stdout: string;
  try {
    const result = await params.client.runShell(params.boxId, {
      script: buildDoctorScript(BOX_CHECKS),
      // A probe that exits non-zero is a finding, not a reason to give up.
      allowFailure: true,
    });
    stdout = result.stdout.toString('utf8');
  } catch (error) {
    return {
      ok: false,
      status: 'fail',
      summary: 'The box could not be reached.',
      checks: [],
      unreachable: messageOf(error),
    };
  }

  const checks = parseDoctorOutput(stdout, BOX_CHECKS);
  const verdict = summarizeDoctor(checks);
  return {
    ok: verdict.status !== 'fail',
    status: verdict.status,
    summary: verdict.summary,
    checks,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
