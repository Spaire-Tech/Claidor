// "Allow once" answers for the agent's hands on this PC (SimeonMacCore's
// LocalToolApprovals.swift; the engine's host/local-exec/local-tool-approvals.ts):
// each names the request, the action and its target, kept in
// `local-tool-approvals.json` (`{"approvals":[{"id","action","target","resourcePath"?}]}`).
// Everything goes when the person sends a message; a used one is retired
// in `local-tool-retirements.json` (`{"retiredIds":[…]}`). The Mac keeps them
// in `~/.simeon`, shared with the Electron app; here they are in the app's
// data folder (`%APPDATA%\Simeon`), which the hands refuse to touch, so a
// command can't write an approval for itself.

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { LocalToolApproval } from './rules'

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

export class LocalToolApprovals {
  readonly approvalsFile: string
  readonly retirementsFile: string

  constructor(folder: string) {
    this.approvalsFile = path.join(folder, 'local-tool-approvals.json')
    this.retirementsFile = path.join(folder, 'local-tool-retirements.json')
  }

  /** Every approval in the file, by id; none when it is missing or unreadable. */
  all(): Map<string, LocalToolApproval> {
    const out = new Map<string, LocalToolApproval>()
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.approvalsFile, 'utf8'))
    } catch {
      return out
    }
    const rows = (parsed as { approvals?: unknown })?.approvals
    if (!Array.isArray(rows)) return out
    for (const row of rows) {
      const approval = readApproval(row)
      if (approval) out.set(approval.id, approval)
    }
    return out
  }

  /** "Allow once" recorded before the answer goes to the computer (`recordLocalToolApproval`). */
  record(approval: LocalToolApproval): void {
    const approvals = this.all()
    approvals.set(approval.id, approval)
    this.persist(approvals)
  }

  /** The person sent a message, or Settings' Forget: every approval goes (`clearLocalToolApprovals`). */
  clear(): void {
    rmSync(this.approvalsFile, { force: true })
  }

  /** The approvals still good: recorded and not used up (`readLiveLocalToolApprovals`). */
  live(): Map<string, LocalToolApproval> {
    const approvals = this.all()
    for (const id of this.retired()) approvals.delete(id)
    return approvals
  }

  /** An approval used once, so it covers nothing more (`retireLocalToolApproval`). */
  retire(id: string): void {
    const approvals = this.all()
    let retired = this.retired()
    if (retired.includes(id)) return
    retired.push(id)
    retired = retired.filter((one) => approvals.has(one))
    if (retired.length === 0) {
      rmSync(this.retirementsFile, { force: true })
      return
    }
    this.write(this.retirementsFile, { retiredIds: retired })
  }

  private retired(): string[] {
    try {
      const parsed = JSON.parse(readFileSync(this.retirementsFile, 'utf8')) as { retiredIds?: unknown }
      return Array.isArray(parsed.retiredIds)
        ? parsed.retiredIds.filter((one): one is string => typeof one === 'string')
        : []
    } catch {
      return []
    }
  }

  private persist(approvals: Map<string, LocalToolApproval>): void {
    if (approvals.size === 0) {
      rmSync(this.approvalsFile, { force: true })
      return
    }
    const rows = [...approvals.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    this.write(this.approvalsFile, { approvals: rows })
  }

  /** Written whole to a file beside it, then moved over it. */
  private write(file: string, json: unknown): void {
    try {
      mkdirSync(path.dirname(file), { recursive: true })
      const temp = `${file}.${process.pid}.tmp`
      writeFileSync(temp, JSON.stringify(json), { mode: 0o600 })
      renameSync(temp, file)
    } catch {
      // Not kept: the next answer asks again.
    }
  }
}
