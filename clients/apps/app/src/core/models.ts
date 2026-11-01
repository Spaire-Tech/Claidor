// The roster's rows (`Agent`, `Party`, `Preview` and `sortRoster` in
// ios/SimeonCore/Sources/SimeonCore/Models.swift): one row per agent or group,
// as the host projects it (`roster-projection.ts`).

import {
  type JSONValue,
  arr,
  bool,
  field,
  int,
  isObject,
  num,
  str,
  text,
} from './json'
import { t } from './l10n'

/** A person or an agent named on an entry: `{id, name}`. */
export interface Party {
  id: string
  name: string
}

export function partyFrom(json: unknown): Party | undefined {
  const id = text(field(json, 'id'))
  return id ? { id, name: text(field(json, 'name')) ?? '' } : undefined
}

/**
 * The host's stamp on a row (`roster-emit.ts`): an id for the host's run and
 * a number that only grows, so a late, older copy of a row can be told from a
 * newer one. It is not what the row says: two rows that differ only in it
 * are the same row (`sameAgent`).
 */
export interface RosterStamp {
  epoch: string
  seq: number
}

export interface Agent {
  id: string
  name: string
  title: string
  description: string
  colour?: string
  avatarDataURL?: string
  /** Which copy of its picture the host has (`avatarVersion`). */
  avatarVersion?: string
  /** The face it was given (`avatarShape`, "clay-07"), kept when another picture replaces it. */
  avatarShape?: string
  isGroup: boolean
  memberIds: string[]
  lastMessagePreview?: string
  /** Milliseconds since the epoch. */
  lastActivityAt?: number
  hasUnread: boolean
  unreadCount: number
  isRunningTurn: boolean
  isComposing: boolean
  activityLabel?: string
  isHidden: boolean
  /** "Notifications" on the agent's page (`notifyOnUpdatesEnabled`). */
  notifyOnUpdates: boolean
  voiceId?: string
  /** Someone else's room shared with the person (`remoteRoom`). */
  isRemoteRoom: boolean
  /** A room the person shares (`isSharedRoom`, or the host's `sharedRoomId`): the host refuses member changes for it. */
  isSharedRoom: boolean
  /** Running a turn or one of its helpers (`isRunning`). */
  isRunning: boolean
  /** Waiting on the person (`awaitingUserResponse`). */
  awaitingUserResponse: boolean
  activityKind?: string
  activityTool?: string
  activityDetail?: string
  /** The agent it is messaging (`currentActivity.target`): "Messaging Iris". */
  activityTarget?: string
  /** The id of the chat's newest message (`lastMessageId`). */
  lastMessageId?: string
  /** The chat's last line as the host sums it up (`lastEntry`: text, a link, or attachments). */
  lastEntry?: JSONValue
  /** Why the agent waits on the person (`awaitingUserResponse.reason`). */
  waitingReason?: string
  /** When it was made (ms): the oldest one titled Chief of Staff is the Chief of Staff. */
  createdAt?: number
  /** What it is for, when the app made it for something (`purpose`: "disk-saver"). */
  purpose?: string
  /** The agents it has messaged one to one, or that messaged it: the org chart's links. */
  conversationPartnerIds: string[]
  /** Its last change (`updatedAt`). */
  updatedAt?: number
  stamp: RosterStamp
}

/** A row with what is not given left as the host leaves it. */
export function makeAgent(
  fields: Partial<Agent> & { id: string; name: string },
): Agent {
  return {
    title: '',
    description: '',
    isGroup: false,
    memberIds: [],
    hasUnread: false,
    unreadCount: 0,
    isRunningTurn: false,
    isComposing: false,
    isHidden: false,
    notifyOnUpdates: true,
    isRemoteRoom: false,
    isSharedRoom: false,
    isRunning: false,
    awaitingUserResponse: false,
    conversationPartnerIds: [],
    stamp: { epoch: '', seq: 0 },
    ...fields,
  }
}

const positive = (value: unknown) => {
  const n = num(value)
  return n != null && n > 0 ? n : undefined
}

/** One row as the host sends it; undefined without an id. */
export function agentFrom(json: unknown): Agent | undefined {
  const id = text(field(json, 'id'))
  if (!id) return undefined
  const activity = field(json, 'currentActivity')
  const awaiting = field(json, 'awaitingUserResponse')
  const unread = num(field(json, 'unreadCount'))
  const isRunningTurn =
    bool(field(json, 'isRunningTurn')) ??
    bool(field(json, 'isRunning')) ??
    false
  const entry = field(json, 'lastEntry')
  return makeAgent({
    id,
    name: str(field(json, 'name')) ?? '',
    title: str(field(json, 'title')) ?? '',
    description: str(field(json, 'description')) ?? '',
    colour: text(field(json, 'avatarColor')),
    avatarDataURL: text(field(json, 'avatarDataUrl')),
    isGroup: bool(field(json, 'isGroup')) ?? false,
    memberIds: (arr(field(json, 'memberIds')) ?? [])
      .map(text)
      .filter((m): m is string => !!m),
    lastMessagePreview: text(field(json, 'lastMessagePreview')),
    // The host sends 0 for a chat with no activity yet: that is no time, and
    // the row goes by when it was made, as the window's (`updatedAt`) does.
    lastActivityAt:
      positive(field(json, 'lastActivityAt')) ??
      positive(field(json, 'updatedAt')),
    hasUnread: bool(field(json, 'hasUnread')) ?? false,
    // Whole messages, as the Dock counts them (`Math.floor`).
    unreadCount:
      unread != null && Number.isFinite(unread) && Math.abs(unread) < 1e15
        ? Math.floor(unread)
        : 0,
    isRunningTurn,
    isComposing: bool(field(json, 'isComposingMessage')) ?? false,
    activityLabel: text(field(activity, 'label')),
    isHidden: bool(field(json, 'isHiddenFromSidebar')) ?? false,
    notifyOnUpdates: bool(field(json, 'notifyOnUpdatesEnabled')) ?? true,
    voiceId: text(field(json, 'voiceId')),
    avatarVersion: text(field(json, 'avatarVersion')),
    avatarShape: text(field(json, 'avatarShape')),
    isRemoteRoom: field(json, 'remoteRoom') != null,
    // The window reads `isSharedRoom`, which this host never sends; it sends `sharedRoomId` and refuses member changes for it.
    isSharedRoom:
      bool(field(json, 'isSharedRoom')) === true ||
      text(field(json, 'sharedRoomId')) != null,
    isRunning: bool(field(json, 'isRunning')) ?? isRunningTurn,
    awaitingUserResponse: awaiting != null,
    activityKind: text(field(activity, 'kind')),
    activityTool: text(field(activity, 'tool')),
    activityDetail: text(field(activity, 'detail')),
    activityTarget: text(field(activity, 'target')),
    lastMessageId: text(field(json, 'lastMessageId')),
    lastEntry: entry != null ? entry : undefined,
    waitingReason: text(field(awaiting, 'reason')),
    createdAt: num(field(json, 'createdAt')),
    purpose: text(field(json, 'purpose')),
    conversationPartnerIds: (arr(field(json, 'conversationPartnerIds')) ?? [])
      .map(str)
      .filter((m): m is string => m != null),
    updatedAt: num(field(json, 'updatedAt')),
    stamp: {
      epoch: str(field(json, 'snapshotEpoch')) ?? '',
      seq: num(field(json, 'snapshotSeq')) ?? 0,
    },
  })
}

/** The same row, whatever its stamp (`RosterStamp`'s `==`). */
export function sameAgent(a: Agent, b: Agent): boolean {
  return (
    JSON.stringify({ ...a, stamp: null }) ===
    JSON.stringify({ ...b, stamp: null })
  )
}

/** It has a picture of its own: the picture, or only its version. */
export function hasPicture(agent: Agent): boolean {
  return !!agent.avatarDataURL || !!agent.avatarVersion
}

/** A group whose members the person can change. */
export function showsMembers(agent: Agent): boolean {
  return agent.isGroup && !agent.isSharedRoom && !agent.isRemoteRoom
}

/** The agent is working: the window's typing dots. */
export function isBusy(agent: Agent): boolean {
  return agent.isRunningTurn || agent.isComposing
}

/** Simeon's description from onboarding (`Onboarding.chiefOfStaffDescription`), saved in English. */
export const chiefOfStaffDescription =
  'Your Chief of Staff: manages your other Agents and pulls you in for decisions.'

/** The Chief of Staff: the oldest agent titled "Chief of Staff" or "COO", whatever its name. */
export function chiefOfStaff(agents: readonly Agent[]): Agent | undefined {
  let found: Agent | undefined
  for (const agent of agents) {
    const title = agent.title.trim().toLowerCase()
    if (title !== 'chief of staff' && title !== 'coo') continue
    if (!found || (agent.createdAt ?? 0) < (found.createdAt ?? 0)) found = agent
  }
  return found
}

/** The title as the person reads it: the Chief of Staff's in the app's language, any other as its agent wrote it. */
export function shownTitle(agent: Agent): string {
  return agent.title.trim().toLowerCase() === 'chief of staff'
    ? t('Chief of Staff')
    : agent.title
}

/** The description as the person reads it: Simeon's own from onboarding in the app's language, any other as written. */
export function shownDescription(agent: Agent): string {
  return agent.description === chiefOfStaffDescription
    ? t(
        'Your Chief of Staff: manages your other Agents and pulls you in for decisions.',
      )
    : agent.description
}

/**
 * The list row's second line (`sidebar.tsx`, `previewTextFromLastEntry`):
 * "Waiting for you: …" when the agent waits on the person, else the last line
 * with its Markdown taken out, "Sent a link · …", or "Sent 2 images".
 */
export function previewLine(agent: Agent): string {
  if (agent.awaitingUserResponse && agent.waitingReason) {
    return t`Waiting for you: ${agent.waitingReason}`
  }
  const line =
    agent.lastEntry != null ? previewOfEntry(agent.lastEntry) : undefined
  if (line) return line
  if (agent.lastMessagePreview != null)
    return plainPreview(agent.lastMessagePreview)
  return agent.description
}

/** The preview of the chat's last line (`sidebar-agent-preview-content.tsx`). */
export function previewOfEntry(entry: unknown): string | undefined {
  switch (str(field(entry, 'kind'))) {
    case 'link': {
      const url = text(field(entry, 'url'))
      return url != null ? t`Sent a link · ${url}` : undefined
    }
    case 'attachment': {
      const kinds = field(entry, 'kinds')
      return attachments(
        int(field(entry, 'count')) ?? 1,
        isObject(kinds) ? kinds : {},
      )
    }
    case 'text': {
      const said = str(field(entry, 'text'))
      return said != null ? plainPreview(said) : undefined
    }
    default:
      return undefined
  }
}

/** The window's Markdown replacements, in its order, then the spaces run together. */
const replacements: [RegExp, string][] = [
  [/`+/g, ''],
  [/!\[([^\]]*)\]\([^)]*\)/g, '$1'],
  [/\[([^\]]+)\]\([^)]*\)/g, '$1'],
  [/\$\$((?:[^$\\]|\\[\s\S])+?)\$\$/g, '$1'],
  [/\\\(([\s\S]+?)\\\)/g, '$1'],
  [/\\\[([\s\S]+?)\\\]/g, '$1'],
  [/\\\$/g, '$$'],
  [/^\s{0,3}#{1,6}\s+/gm, ''],
  [/^\s{0,3}>\s?/gm, ''],
  [/^\s{0,3}(?:[-*+]|\d+[.)])\s+/gm, ''],
  [/\*\*([^*]+)\*\*/g, '$1'],
  [/__([^_]+)__/g, '$1'],
  [/~~([^~]+)~~/g, '$1'],
  [/\*([^*\n]+)\*/g, '$1'],
  // ICU's \w: letters, marks, digits and joiners, in any script.
  [
    /(?<![\p{L}\p{M}\p{Nd}\p{Pc}])_([^_\n]+)_(?![\p{L}\p{M}\p{Nd}\p{Pc}])/gu,
    '$1',
  ],
  [/\|/g, ' '],
]

const plainCache = new Map<string, string>()

/** One line of Markdown as the list shows it, kept per text: the list asks again on every redraw. */
export function plainPreview(markdown: string): string {
  const hit = plainCache.get(markdown)
  if (hit != null) return hit
  // The first couple of thousand characters are plenty for one line.
  let line = markdown.length > 2_000 ? markdown.slice(0, 2_000) : markdown
  for (const [pattern, template] of replacements)
    line = line.replace(pattern, template)
  line = line.split(/\s+/u).filter(Boolean).join(' ')
  if (plainCache.size > 400) plainCache.clear()
  plainCache.set(markdown, line)
  return line
}

/** The kinds a preview names; any other is a file. */
const named = new Set([
  'image',
  'video',
  'audio',
  'pdf',
  'markdown',
  'table',
  'json',
  'text',
  'document',
  'archive',
  'file',
])

/** "1 image", "2 images". */
function label(kind: string, count: number): string {
  const one = count === 1
  switch (kind) {
    case 'image':
      return one ? t('1 image') : t`${count} images`
    case 'video':
      return one ? t('1 video') : t`${count} videos`
    case 'audio':
      return one ? t('1 audio file') : t`${count} audio files`
    case 'pdf':
      return one ? t('1 PDF') : t`${count} PDFs`
    case 'markdown':
      return one ? t('1 Markdown file') : t`${count} Markdown files`
    case 'table':
      return one ? t('1 spreadsheet') : t`${count} spreadsheets`
    case 'json':
      return one ? t('1 JSON file') : t`${count} JSON files`
    case 'text':
      return one ? t('1 text file') : t`${count} text files`
    case 'document':
      return one ? t('1 document') : t`${count} documents`
    case 'archive':
      return one ? t('1 archive') : t`${count} archives`
    default:
      return one ? t('1 file') : t`${count} files`
  }
}

function attachments(count: number, kinds: Record<string, JSONValue>): string {
  const total = Math.max(1, count)
  const present = Object.entries(kinds)
    .map(([key, value]): [string, number] | undefined => {
      const n = int(value)
      return n != null && n > 0 ? [named.has(key) ? key : 'file', n] : undefined
    })
    .filter((pair): pair is [string, number] => pair != null)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  if (present.length === 0) return t`Sent ${label('file', total)}`
  if (present.length === 1) return t`Sent ${label(present[0]![0], total)}`
  return t`Sent ${label('file', total)} · ${present.map(([kind, n]) => label(kind, n)).join(', ')}`
}

/** The roster in the list's order: newest activity first. Hidden agents stay in it; the list leaves them out. */
export function sortRoster(agents: readonly Agent[]): Agent[] {
  return [...agents].sort(
    (a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0),
  )
}
