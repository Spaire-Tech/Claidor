/**
 * The names the renderer and the main process agree on for the box.
 *
 * Shared because both sides need them; nothing here decides anything.
 */

export const BoxIpc = {
  /** The registry: the box, plus the person's own registered machines. */
  ListMachines: 'box:list-machines',
  /** Health check. Runs at startup and on demand. */
  Doctor: 'box:doctor',
  /** Explicit import: one file from this machine to the box. */
  CopyToBox: 'box:copy-to',
  /** Explicit export: one file from the box back to this machine. */
  CopyFromBox: 'box:copy-from',
  /** What Update or Reset would mean, in words, before either is done. */
  DescribeRebuild: 'box:describe-rebuild',
  /** Move to a fresh instance, keeping files and logins. */
  Update: 'box:update',
  /** Back to a snapshot. The last resort. */
  Reset: 'box:reset',
} as const;

export type BoxIpcChannel = typeof BoxIpc[keyof typeof BoxIpc];

export type BoxRebuildKind = 'update' | 'reset';

export type BoxMachineKind = 'box' | 'machine';

export type BoxMachine = {
  id: string;
  kind: BoxMachineKind;
  label: string;
  state: 'running' | 'stopped' | 'unknown';
  template?: string;
  createdAtMs?: number;
};

export type BoxCheckStatus = 'ok' | 'warn' | 'fail';

export type BoxCheckResult = {
  id: string;
  label: string;
  status: BoxCheckStatus;
  detail: string;
  remedy?: string;
};

export type BoxDoctorReport = {
  ok: boolean;
  status: BoxCheckStatus;
  summary: string;
  checks: BoxCheckResult[];
  /** Set when the box could not be reached at all, in which case checks is empty. */
  unreachable?: string;
};

/**
 * What a rebuild costs, said before it happens.
 *
 * `keeps` and `loses` are the whole point: Update reads as harmless and is
 * not, because installed software does not survive it.
 */
export type BoxRebuildDescription = {
  kind: BoxRebuildKind;
  title: string;
  keeps: string[];
  loses: string[];
  /** True for Reset: the person should have tried everything else first. */
  lastResort: boolean;
};

export type BoxResult<T> = { ok: true; value: T } | { ok: false; reason: string };
