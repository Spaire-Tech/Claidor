// The agent's hands on this PC, the rules (SimeonMacCore's
// LocalExecRules.swift; the engine's shared/local-exec-gateway.ts and
// shared/local-tool-permission-machinery.ts): the limits, the words to the
// agent, what a request is about, and whether it may run. The words are
// the agent's (English, as the Mac's), never shown to the person.

import path from 'node:path'
import { type SensitivePlaces, sensitiveRefusal } from './sensitivePaths'

/** "Execution on Local Computer" (`LocalToolPermission`). */
export type Permission = 'always' | 'ask' | 'never'

export const LocalExec = {
  /** One file read or moved: 100 MiB (`DEFAULT_MAX_LOCAL_EXEC_FILE_BYTES`). */
  maxFileBytes: 100 * 1024 * 1024,
  /** The longest frame an upload may come in, in characters (`maxLocalExecUploadFrameBytes`). */
  uploadFrameCap: Math.ceil((100 * 1024 * 1024 * 4) / 3) + 64 * 1024,
  /** Each command's output, per stream, then cut without a word (`MAX_SHELL_OUTPUT_BYTES`). */
  streamCap: 1_048_576,
  /** A read's text, in characters (`MAX_TEXT_SIZE`). */
  textCap: 8 * 1024 * 1024,
  /** What a command's shell may say after its run's marker before it is taken as output (a state is far smaller). */
  stateCap: 16 * 1024 * 1024,
  /** A stopped command still there after this is stopped harder (`killProcess`'s second). */
  killGraceMs: 1_000,
  /** And after this, its end is told anyway. */
  endGraceMs: 5_000,
  /** The longest wait a timer keeps (Node fires a longer one at once). */
  longestTimerMs: 2 ** 31 - 1,
  execHeartbeatSeconds: 3,
  pingSeconds: 10,
  stallSeconds: 35,
  dataPostSeconds: 120,
  controlPostSeconds: 10,

  /** `(bytes / MiB).toFixed(1)` and " MiB" (`describeLocalExecBytes`). */
  describe(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
  },

  fileTooLarge(bytes: number): string {
    return `File is ${LocalExec.describe(bytes)}, which exceeds Simeon's ${LocalExec.describe(LocalExec.maxFileBytes)} limit for reading or transferring a single file over local-exec. Read a slice with offset/limit, or use a shell command (grep, head, tail) to extract just what you need.`
  },

  get uploadTooLarge(): string {
    return `The upload exceeds Simeon's ${LocalExec.describe(LocalExec.maxFileBytes)} limit for transferring a single file over local-exec and was refused before being read into memory. Transfer a smaller file, or split it into parts.`
  },

  disabled:
    'Local tools are turned off. The user has set local tool access to "Never", so ExternalShell, ExternalRead, AwaitExternalShell, CopyToBox, and CopyFromBox cannot run on their computer. Do not retry them while this setting remains "Never". Use your own computer instead (Shell, Read, AwaitShell), or ask the user to change the setting in the local tool access setting in Settings. If they change it away from "Never", you may try again.',

  unapproved:
    'That action was not approved on the user\'s computer, so nothing ran. Ask the user to approve it (or to set local tool access to "Always allow" in Settings), and use your own computer (Shell, Read, AwaitShell) in the meantime.',

  noHandler(kind: string): string {
    return `No handler found for server message of type ${kind}`
  },

  outsideRoot(target: string): string {
    return `Path is outside the allowed local-exec root and was refused: ${target}`
  },

  throughSymlink(target: string): string {
    return `Path resolves through a symlink to outside the allowed local-exec root and was refused: ${target}`
  },

  missingWorkingDirectory(requested: string, root: string): string {
    return `working directory ${requested} does not exist on this machine; running in ${root} instead\n`
  },

  /** The wait before dialling again: 1, 2, 4, 8, then 10 s (`computeBackoffMs`). */
  backoffSeconds(attempt: number): number {
    return Math.min(10, 2 ** (Math.max(attempt, 1) - 1))
  },

  /**
   * An answer the computer did not take is sent again after each of these,
   * about two minutes in all, with what was queued since; then it is
   * dropped and said so in the log (the server wakes a resting computer for
   * an answer).
   */
  answerRetrySeconds: [2, 4, 8, 16, 30, 60] as readonly number[],

  /** Whether an answer refused with this status goes again: not reached (0), the computer asleep or out of reach (5xx), its address out of date (401), or too soon (408, 429). */
  answerRetried(status: number): boolean {
    return status === 0 || status >= 500 || [401, 408, 429].includes(status)
  },

  /** How long a command may hold the stream before it goes to the background (`resolveShellTimeoutMs`). */
  blockMs(fields: {
    timeout: number
    isBackground: boolean
    timeoutBehaviorBackground: boolean
    hardTimeout?: number
  }): number {
    if (fields.timeout !== 0) return fields.timeout
    if (fields.isBackground || fields.timeoutBehaviorBackground || fields.hardTimeout != null) return 0
    return 30_000
  },
}

/** What a request asks of this PC (`LocalToolRequest`). */
export interface LocalToolRequest {
  action: string
  target: string
  resourcePath?: string
  attachToResourcePath?: string
  outlivesScope?: boolean
}

/** An "Allow once" answer (`LocalToolApproval`). */
export interface LocalToolApproval {
  id: string
  action: string
  target: string
  resourcePath?: string
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '')
}

/** A command's terminal file, `<terminals>/<id>.txt`, directly in the folder. */
export function isTerminalFile(target: string, terminalsFolder: string): boolean {
  const folder = trimTrailingSlashes(terminalsFolder)
  if (folder === '') return false
  const normalized = trimTrailingSlashes(target)
  if (!normalized.startsWith(`${folder}/`)) return false
  const rest = normalized.slice(folder.length + 1)
  return rest !== '' && !rest.includes('/') && rest.endsWith('.txt')
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value != null && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : undefined
}

/** What the request is about, by its kind (`describeLocalExec`); undefined for anything else. */
export function describe(
  kind: string,
  value: unknown,
  terminalsFolder: string,
): LocalToolRequest | undefined {
  switch (kind) {
    case 'shellStreamArgs':
    case 'backgroundShellSpawnArgs':
      return {
        action: 'run-command',
        target: text(field(value, 'command')) ?? '',
        resourcePath: terminalsFolder,
        outlivesScope:
          kind === 'backgroundShellSpawnArgs' || field(value, 'isBackground') === true,
      }
    case 'forceBackgroundShellArgs':
      return {
        action: 'run-command',
        target: 'a command already running',
        attachToResourcePath: terminalsFolder,
        outlivesScope: true,
      }
    case 'writeShellStdinArgs':
      return { action: 'send-input', target: text(field(value, 'chars')) ?? '' }
    case 'readArgs':
    case 'redactedReadArgs': {
      const target = text(field(value, 'path')) ?? ''
      return {
        action: 'read-file',
        target,
        ...(isTerminalFile(target, terminalsFolder) ? { attachToResourcePath: terminalsFolder } : {}),
      }
    }
    case 'lsArgs':
      return { action: 'list-directory', target: text(field(value, 'path')) ?? '' }
    default:
      return undefined
  }
}

function normalizeResource(value: string | undefined): string | undefined {
  if (value == null || value === '') return undefined
  return value.replace(/\\/g, '/')
}

/** The same action on the same target, or the folder the approval owns (`localToolApprovalCovers`). */
export function covers(
  approval: { action: string; target: string; resourcePath?: string },
  request: LocalToolRequest,
): boolean {
  if (approval.action === request.action && approval.target === request.target) return true
  const owned = normalizeResource(approval.resourcePath)
  if (owned == null) return false
  return owned === normalizeResource(request.attachToResourcePath)
}

/**
 * Why this PC will not do it, or undefined to go ahead (`isLocalUseBlocked`,
 * `LocalToolRules.refusal`): a place that holds keys first, whatever the
 * setting; then Never; Always; and under Ask, only what the person allowed
 * once, exactly that (a command's approval also covers its terminal file).
 * A command is also refused when the folder it would run in (the one asked
 * for, or where the shell is; the provider gives it as written and where it
 * really is) is such a place, as on the Mac (`LocalToolRules.commandFolders`);
 * here names in its words are also read from that folder, which the Mac
 * doesn't do.
 */
export function refusal(fields: {
  request: LocalToolRequest | undefined
  approvalId: string | undefined
  permission: Permission
  live: ReadonlyMap<string, LocalToolApproval>
  terminalsFolder: string
  places: SensitivePlaces
  /** The folders a command would run in, checked as paths. */
  folders?: readonly string[]
}): string | undefined {
  const { request, approvalId, permission, live, terminalsFolder, places } = fields
  if (request) {
    const sensitive = sensitiveRefusal(request.action, request.target, places, fields.folders ?? [])
    if (sensitive) return sensitive
    if (request.action === 'run-command')
      for (const folder of fields.folders ?? []) {
        if (folder.trim() === '') continue
        const inside = sensitiveRefusal('list-directory', folder, places)
        if (inside) return inside
      }
  }
  switch (permission) {
    case 'never':
      return LocalExec.disabled
    case 'always':
      return undefined
    case 'ask':
      break
  }
  if (approvalId == null || approvalId === '' || request == null) return LocalExec.unapproved
  const approval = live.get(approvalId)
  if (!approval) return LocalExec.unapproved
  const owned = approval.action === 'run-command' ? terminalsFolder : approval.resourcePath
  return covers({ action: approval.action, target: approval.target, resourcePath: owned }, request)
    ? undefined
    : LocalExec.unapproved
}

// MARK: Where things may be (`local-exec-machine.ts`)

/** Windows' paths on Windows; the checks on Linux run the same code with the system's own. */
export type PathFlavor = typeof path.win32 | typeof path.posix

/** `path.resolve` against the root: absolute, `.` and `..` worked out, no trailing separator. */
export function resolveAgainst(target: string, root: string, flavor: PathFlavor = path): string {
  return flavor.resolve(root, target)
}

/** Outside the root (`escapesRoot`: Node's `relative` starting with "..", or on another drive, which also refuses a child named "..x"). */
export function escapesRoot(base: string, target: string, flavor: PathFlavor = path): boolean {
  const relative = flavor.relative(base, target)
  if (relative === '') return false
  return relative.startsWith('..') || flavor.isAbsolute(relative)
}

/** The folder a command runs in: none given is the shell's own; one that is not there is the root, said first on stderr. */
export function workingDirectory(
  requested: string,
  root: string,
  isDirectory: (folder: string) => boolean,
  flavor: PathFlavor = path,
): { path: string; notice?: string } {
  const trimmed = requested.trim()
  if (trimmed === '') return { path: '' }
  const resolved = resolveAgainst(trimmed, root, flavor)
  if (isDirectory(resolved)) return { path: resolved }
  return { path: root, notice: LocalExec.missingWorkingDirectory(trimmed, root) }
}
