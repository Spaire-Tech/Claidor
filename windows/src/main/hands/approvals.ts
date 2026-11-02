// "Allow once" answers for the agent's hands on this PC (SimeonMacCore's
// LocalToolApprovals.swift; the engine's host/local-exec/local-tool-approvals.ts):
// each names the request, the action and its target. Everything goes when
// the person sends a message; a used one is retired, so it covers nothing
// more. The Mac keeps them in `~/.simeon` (`local-tool-approvals.json`,
// `local-tool-retirements.json`), shared with the Electron app; here only
// this app reads them, so both are one file in the app's data folder,
// `local-tool-approvals.json` (`{"approvals":[{"id","action","target","resourcePath"?}],"retiredIds":[…]}`),
// signed (signed.ts): read once when the app starts, an edited one read as
// no answers, then held in memory. The hands refuse the data folder by its
// names, so a plain command can't write an answer for itself
// (sensitivePaths.ts says what a guard on names can't stop).

import path from 'node:path'
import type { LocalToolApproval } from './rules'
import { SigningKey, readSigned, removeSigned, writeSigned } from './signed'

/** `run-command`, `send-input`, `read-file`, `list-directory`, `write-file` (`SAND_LOCAL_TOOL_ACTIONS`). */
export const approvalActions = new Set(['run-command', 'send-input', 'read-file', 'list-directory', 'write-file'])

/** One row of the file, or undefined for anything else (`parseApproval`). */
export function readApproval(json: unknown): LocalToolApproval | undefined {
  if (typeof json !== 'object' || json == null) return undefined
  const row = json as Record<string, unknown>
  const { id, action, target, resourcePath } = row
  if (typeof id !== 'string' || id === '') return undefined
  if (typeof action !== 'string' || !approvalActions.has(action)) return undefined
  if (typeof target !== 'string') return undefined
  return { id, action, target, ...(typeof resourcePath === 'string' ? { resourcePath } : {}) }
}

interface Held {
  approvals: Map<string, LocalToolApproval>
  retired: Set<string>
}

export class LocalToolApprovals {
  readonly approvalsFile: string
  private held?: Held

  constructor(
    folder: string,
    private readonly key: SigningKey = SigningKey.forThisRun(),
  ) {
    this.approvalsFile = path.join(folder, 'local-tool-approvals.json')
  }

  /** The file, once: its approvals and retired ids when its signature is this app's; none otherwise. */
  private load(): Held {
    if (this.held) return this.held
    const held: Held = { approvals: new Map(), retired: new Set() }
    const parsed = readSigned(this.approvalsFile, this.key, 'local-tool-approvals') as
      | { approvals?: unknown; retiredIds?: unknown }
      | undefined
    if (Array.isArray(parsed?.approvals))
      for (const row of parsed.approvals) {
        const approval = readApproval(row)
        if (approval) held.approvals.set(approval.id, approval)
      }
    if (Array.isArray(parsed?.retiredIds))
      for (const id of parsed.retiredIds) if (typeof id === 'string' && held.approvals.has(id)) held.retired.add(id)
    this.held = held
    return held
  }

  /** Every approval recorded, by id. */
  all(): Map<string, LocalToolApproval> {
    return new Map(this.load().approvals)
  }

  /** "Allow once" recorded before the answer goes to the computer (`recordLocalToolApproval`). */
  record(approval: LocalToolApproval): void {
    const held = this.load()
    held.approvals.set(approval.id, approval)
    this.persist()
  }

  /** The person sent a message, Settings' Forget, or signed out: every approval goes (`clearLocalToolApprovals`). */
  clear(): void {
    this.held = { approvals: new Map(), retired: new Set() }
    removeSigned(this.approvalsFile)
  }

  /** The approvals still good: recorded and not used up (`readLiveLocalToolApprovals`). */
  live(): Map<string, LocalToolApproval> {
    const held = this.load()
    const out = new Map(held.approvals)
    for (const id of held.retired) out.delete(id)
    return out
  }

  /** An approval used once, so it covers nothing more (`retireLocalToolApproval`); an id never recorded is not kept. */
  retire(id: string): void {
    const held = this.load()
    if (!held.approvals.has(id) || held.retired.has(id)) return
    held.retired.add(id)
    this.persist()
  }

  private persist(): void {
    const held = this.load()
    if (held.approvals.size === 0) {
      removeSigned(this.approvalsFile)
      return
    }
    const approvals = [...held.approvals.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const retiredIds = [...held.retired].sort()
    // Not kept: what memory holds still counts until the app quits.
    writeSigned(this.approvalsFile, this.key, 'local-tool-approvals', { approvals, retiredIds })
  }
}
