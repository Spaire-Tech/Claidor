// Search (⌘K) as the Mac's does it (SimeonCore's Search.swift): the tabs,
// what the computer finds for the words (a message, `searchAgents`; a file,
// `searchMedia`), every agent's routines (`listAllAutomations`), the words
// of a found message's and file's second line, and the row that shows a
// found line in its chat. The matching, the actions and what each tab lists
// are Jump.swift's (`jump.ts`).
//
// Search.swift also has the iPhone's own search (`Search.match`, the links
// of every chat, `LinkHit`, `allLinks`); the Mac's search doesn't use them
// (it matches with Jump's and lists the open chat's links), so the web,
// the Mac's translation, leaves them out.

import type { ChatRow } from './chat'
import { type JSONValue, field, int, num, str, text } from './json'
import { t, tk } from './l10n'
import type { Agent } from './models'
import { routineFrom } from './routines'

/** The tabs, in the Mac's order (`SearchTab`). */
export type SearchTab =
  | 'all'
  | 'messages'
  | 'agents'
  | 'groups'
  | 'files'
  | 'links'
  | 'routines'
  | 'actions'

export const searchTabs: readonly SearchTab[] = [
  'all',
  'messages',
  'agents',
  'groups',
  'files',
  'links',
  'routines',
  'actions',
]

/** A tab's name (`SearchTab.title`). */
export function tabTitle(tab: SearchTab): string {
  switch (tab) {
    case 'all':
      return tk('search.all')
    case 'messages':
      return t('Messages')
    case 'agents':
      return t('Agents')
    case 'groups':
      return t('Groups')
    case 'files':
      return t('Files')
    case 'links':
      return t('Links')
    case 'routines':
      return t('Routines')
    case 'actions':
      return t('Actions')
  }
}

/** Tabs the computer's index answers, hidden while its search is off (`needsIndex`, `gFn`). */
export function needsIndex(tab: SearchTab): boolean {
  return (
    tab === 'messages' ||
    tab === 'files' ||
    tab === 'links' ||
    tab === 'routines'
  )
}

/** A message the computer found (`searchAgents`): which chat, which line, who wrote it, the words around the match. */
export interface MessageHit {
  agentId: string
  entryId: string
  fromPerson: boolean
  snippet: string
  timestampMs?: number
}

export function messageHitFrom(json: unknown): MessageHit | undefined {
  const agentId = text(field(json, 'agentId'))
  const entryId = text(field(json, 'entryId'))
  if (!agentId || !entryId) return undefined
  return {
    agentId,
    entryId,
    fromPerson: str(field(json, 'role')) === 'user',
    snippet: str(field(json, 'snippet')) ?? '',
    timestampMs: num(field(json, 'timestampMs')),
  }
}

/** A file the computer found (`searchMedia`): its chat and line, its name and kind, a picture's size. */
export interface FileHit {
  agentId: string
  entryId: string
  fileName: string
  kind: string
  timestampMs?: number
  width?: number
  height?: number
}

export function fileHitFrom(json: unknown): FileHit | undefined {
  const agentId = text(field(json, 'agentId'))
  const entryId = text(field(json, 'entryId'))
  if (!agentId || !entryId) return undefined
  return {
    agentId,
    entryId,
    fileName: str(field(json, 'fileName')) ?? t('File'),
    kind: str(field(json, 'kind')) ?? 'file',
    timestampMs: num(field(json, 'timestampMs')),
    width: int(field(json, 'width')),
    height: int(field(json, 'height')),
  }
}

/**
 * What a found routine shows (Routines.swift's `Routine`, the parts search
 * reads): its id, its name, when it runs and when it last ran.
 */
export interface RoutineSummary {
  id: string
  name: string
  /** When it runs: the computer's own words (`triggerDescription`). */
  summary: string
  /** Milliseconds since the epoch. */
  lastRunAt?: number
}

/**
 * When a routine runs, as its row says it (`Routine.summary`): the
 * computer's own words in English; in another language the routine's own
 * sentence from its trigger, and its schedule's when the computer gives no
 * words (`Routine.when`, `Schedule.summary`, routines.ts).
 */
export function routineSummary(automation: JSONValue | undefined): string {
  if (automation == null) return ''
  return routineFrom(automation)?.summary ?? ''
}

/** A routine of any agent (`listAllAutomations`: `{agentId, automation}`). */
export interface RoutineHit {
  agentId: string
  routine: RoutineSummary
  createdAt?: number
}

export function routineHitFrom(json: unknown): RoutineHit | undefined {
  const agentId = text(field(json, 'agentId'))
  const automation = field(json, 'automation')
  const id = text(field(automation, 'id'))
  if (!agentId || automation == null || !id) return undefined
  return {
    agentId,
    routine: {
      id,
      name: str(field(automation, 'name')) ?? 'Routine',
      summary: routineSummary(automation),
      lastRunAt: num(field(automation, 'lastRunAt')),
    },
    createdAt: num(field(automation, 'createdAt')),
  }
}

/** The date at a routine's right (`lastRunAt ?? createdAt`). */
export function routineDate(hit: RoutineHit): number | undefined {
  return hit.routine.lastRunAt ?? hit.createdAt
}

/** The Mac waits this long after a keystroke before it asks the computer (`J0t`), in seconds. */
export const debounce = 0.15

// MARK: Words

/** "now", "5m ago", "3h ago", "2d ago", "4mo ago", "1y ago" (`fut`). */
export function ago(
  ms: number | undefined,
  now: Date = new Date(),
): string | undefined {
  if (ms == null) return undefined
  const seconds = Math.max(0, now.getTime() / 1000 - ms / 1000)
  if (seconds < 60) return tk('ago.now')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t`${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t`${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return t`${days}d ago`
  if (days < 365) return t`${Math.floor(days / 30)}mo ago`
  return t`${Math.floor(days / 365)}y ago`
}

/** A message's second line: who wrote to whom ("You to Theo", "Theo to you"; in a group "You in Launch", "In Launch"), and when. */
export function messageLine(
  hit: MessageHit,
  chat: Agent | undefined,
  now: Date = new Date(),
): string {
  const name = chat?.name ?? t('an agent')
  const who =
    chat?.isGroup === true
      ? hit.fromPerson
        ? t`You in ${name}`
        : t`In ${name}`
      : hit.fromPerson
        ? t`You to ${name}`
        : t`${name} to you`
  return [who, ago(hit.timestampMs, now)]
    .filter((part): part is string => part != null)
    .join(' · ')
}

/** A file's second line: its chat, a picture's size, when ("Theo · 1280×800 · 5m ago"). */
export function fileLine(
  hit: FileHit,
  chat: Agent | undefined,
  now: Date = new Date(),
): string {
  const size =
    hit.width != null && hit.height != null
      ? `${hit.width}×${hit.height}`
      : undefined
  return [chat?.name, size, ago(hit.timestampMs, now)]
    .filter((part): part is string => part != null)
    .join(' · ')
}

/** The row that shows a line (`Chat.rowId(for:in:)`): its own, or the folded run of messages between agents that holds it. */
export function rowIdFor(
  entryId: string,
  rows: readonly ChatRow[],
): string | undefined {
  for (const row of rows) {
    if (row.id === entryId) return row.id
    if (
      row.kind === 'teammates' &&
      row.entries.some((entry) => entry.id === entryId)
    )
      return row.id
  }
  return undefined
}
