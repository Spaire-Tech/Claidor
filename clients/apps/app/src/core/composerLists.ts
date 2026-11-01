// The composer's lists as the Mac's window builds them (SimeonCore's
// ComposerLists.swift): what "@" offers (agents, groups, "everyone",
// routines, connectors), what "/" offers (skills, then the app's actions),
// what "#" offers (pull requests the chat linked), how each is matched and
// ordered, and where a list opens. Read from the shipped window (`Q5n`,
// `j5n`, `u5n`, `D_n`, `cAe`, `j5e`, `Pme`).
//
// Places in the words are UTF-16 offsets, as the browser's field counts
// them (the core counts characters).

import { type DocNode, richDocument } from './chat'
import { type PullRequest, type Skill, pullRequestLinks } from './composerMenus'
import { type ConnectedApp } from './connectedApps'
import type { Entry } from './entry'
import { field, int, isObject, str, text } from './json'
import { t, tk } from './l10n'
import type { Agent } from './models'

// MARK: Matching (the window's `Wf`, `MFe`, `Pme`)

const letterOrNumber = /[\p{L}\p{N}]/u
const mark = /\p{M}/gu

/**
 * Text as the window matches it: each piece decomposed, its marks dropped,
 * lowercased; letters and numbers kept, every run of anything else one
 * space between words.
 */
export function normalize(words: string): string {
  let out = ''
  let pendingSeparator = false
  for (let index = 0; index < words.length; index += 1) {
    const unit = words.charCodeAt(index)
    // Half of a pair (an emoji, a rare letter): a separator, as in the core.
    if (unit >= 0xd800 && unit <= 0xdfff) {
      pendingSeparator = true
      continue
    }
    const kept = String.fromCharCode(unit)
      .normalize('NFKD')
      .replace(mark, '')
      .toLowerCase()
    for (const piece of kept) {
      if (!letterOrNumber.test(piece)) {
        pendingSeparator = true
        continue
      }
      if (pendingSeparator && out !== '') out += ' '
      pendingSeparator = false
      out += piece
    }
  }
  return out
}

/** The words of a query, as the window splits it. */
export function tokens(query: string): string[] {
  const normalized = normalize(query)
  return normalized === '' ? [] : normalized.split(' ')
}

const boundaries = new Set([0x20, 0x2d, 0x5f, 0x2f, 0x2e])

/**
 * How well `token` runs through `text` (`MFe`): each of its characters at
 * the first place it fits, left to right; 1 each, 4 more at a word's start,
 * 3 more right after the last; none when not all fit or they spread past
 * three times the token's length; less a tenth per character before the
 * first and a fiftieth per character of the text.
 */
export function subsequence(words: string, token: string): number | undefined {
  if (token === '') return 0
  const lower = words.toLowerCase()
  let score = 0
  let matched = 0
  let previous = -2
  let first = -1
  let last = -1
  for (
    let index = 0;
    index < lower.length && matched < token.length;
    index += 1
  ) {
    if (lower.charCodeAt(index) !== token.charCodeAt(matched)) continue
    if (first < 0) first = index
    const before =
      index > 0 && index - 1 < words.length
        ? words.charCodeAt(index - 1)
        : undefined
    const boundary = index === 0 || (before != null && boundaries.has(before))
    const here = index < words.length ? words.charCodeAt(index) : undefined
    const camel =
      before != null &&
      before >= 0x61 &&
      before <= 0x7a &&
      here != null &&
      here >= 0x41 &&
      here <= 0x5a
    let gain = 1
    if (boundary || camel) gain += 4
    if (previous === index - 1) gain += 3
    score += gain
    previous = index
    last = index
    matched += 1
  }
  if (matched < token.length || last - first + 1 > token.length * 3)
    return undefined
  return score - first * 0.1 - lower.length * 0.02
}

/** A row's score for a query (`Pme`): every word must run through its label or a keyword; plus the whole query through the label. None for no match. */
export function score(
  label: string,
  keywords: readonly string[],
  query: string,
): number | undefined {
  const words = tokens(query)
  const normalizedLabel = normalize(label)
  const fields = [normalizedLabel, ...keywords.map(normalize)]
  let total = 0
  for (const word of words) {
    const scores = fields
      .map((one) => subsequence(one, word))
      .filter((one): one is number => one != null)
    if (scores.length === 0) return undefined
    total += Math.max(...scores)
  }
  return total + (subsequence(normalizedLabel, words.join(' ')) ?? 0)
}

// MARK: Where a list opens (`cAe`, `H5n`, `V5n`)

/** A trigger being typed at the end of the words after the last pick: where its character is, and what follows it. */
export interface Trigger {
  /** The trigger character's place in the words. */
  at: number
  query: string
}

const separators = ',+*?$@|#{}()^-[]\\!%\'"~=<>:;'

function escapedClass(characters: string): string {
  return [...characters].map((one) => `\\${one}`).join('')
}

function patterns(trigger: string): { multi: RegExp; single: RegExp } {
  const mine = escapedClass(trigger)
  const others = escapedClass(separators)
  const unit = `[^${mine}${others}\\s]`
  const gap = `(?:\\.[ |$]| |[${others}\\/]|)`
  return {
    multi: new RegExp(`(^|\\s|\\()([${mine}]((?:${unit}${gap}){0,120}))$`),
    single: new RegExp(`(^|\\s|\\()([${mine}]((?:${unit}){0,50}))$`),
  }
}

const cachedPatterns: Record<string, { multi: RegExp; single: RegExp }> = {
  '@': patterns('@'),
  '/': patterns('/'),
  '#': patterns('#'),
}

/**
 * The list `trigger` ("@", "/" or "#") opens for the words, the caret at
 * their end: in the last 200 characters after the last pick, the trigger at
 * the start, after a space or after "(", then at most 50 characters of a
 * name (one space or one mark at a time between them).
 */
export function triggerIn(
  trigger: '@' | '/' | '#',
  draft: string,
  chipEnd = 0,
): Trigger | undefined {
  if (chipEnd > draft.length) return undefined
  const node = draft.slice(chipEnd)
  const tail = node.length > 200 ? node.slice(-200) : node
  const offset = draft.length - tail.length
  const found = cachedPatterns[trigger] ?? patterns(trigger)
  const match = found.multi.exec(tail) ?? found.single.exec(tail)
  if (!match) return undefined
  const typed = match[3] ?? ''
  if ([...typed].length > 50) return undefined
  return { at: offset + match.index + (match[1] ?? '').length, query: typed }
}

// MARK: "@" (`Q5n`, `j5n`)

export type Category = 'assistants' | 'automations' | 'tools'

export type MentionIcon =
  | { kind: 'everyone' }
  | { kind: 'agent'; id: string }
  | { kind: 'group' }
  | { kind: 'routine'; iconId?: string; iconURL?: string }
  | { kind: 'connector'; name: string }

/** What a pick puts in the message: a mention of an agent, or a reference (a routine's, a connector's). */
export type MentionInsert =
  | { kind: 'mention'; id: string; label: string }
  | {
      kind: 'workflow'
      id: string
      label: string
      iconId?: string
      iconURL?: string
    }

export interface MentionRow {
  key: string
  id: string
  category: Category
  label: string
  keywords: string[]
  subtitle?: string
  /** "Agent", "Group", "Routine" or "Plugin". */
  tag: string
  icon: MentionIcon
  insert: MentionInsert
}

/** The id the window gives "@everyone": every member of the group hears the message. */
export const everyoneId = '__everyone__'

/**
 * Who "@" offers in a chat (`tOn`): in a group, its members in its order; in
 * a one-to-one chat, every other agent and the groups this one is in, in the
 * list's order. Hidden agents are not left out.
 */
export function mentionMembers(
  current: Agent | undefined,
  roster: readonly Agent[],
): Agent[] {
  if (!current) return []
  if (current.isGroup)
    return current.memberIds
      .map((id) => roster.find((agent) => agent.id === id))
      .filter((agent): agent is Agent => agent != null)
  return roster.filter(
    (agent) =>
      agent.id !== current.id &&
      (!agent.isGroup || agent.memberIds.includes(current.id)),
  )
}

/** A connector's name with its account when it is not the default one: "Gmail (work@x.com)" (`M5n`). */
export function connectorLabel(name: string, accountKey?: string): string {
  if (!accountKey || accountKey === 'default') return name
  const cleaned = accountKey
    .replace(/["'`\\[\]{}()<>]/g, '')
    .split(/\s+/)
    .filter((piece) => piece !== '')
    .join(' ')
  return `${name} (${[...cleaned].slice(0, 64).join('')})`
}

/** A connector's line under its name (`X5n`). */
export function connectorStatus(app: ConnectedApp): string {
  switch (app.status) {
    case 'connected':
      return tk('mention.connected')
    case 'needsAuth':
      return tk('mention.needsAuth')
    case 'error':
      return tk('mention.error')
    case 'initializing':
      return tk('mention.connecting')
    case 'disconnected':
      return tk('mention.disconnected')
    case 'disabledByTeamAdminPolicy':
      return tk('mention.disabled')
    default:
      return app.accountKey === 'default' ? (app.url ?? '') : app.accountKey
  }
}

/** The connectors "@" lists (`z9n`): not those a team admin turned off, not team ones without a plugin; one per app and account, a personal one over a team one. */
export function mentionConnectors(
  apps: readonly ConnectedApp[],
): ConnectedApp[] {
  const order: string[] = []
  const chosen = new Map<string, ConnectedApp>()
  for (const app of apps) {
    if (app.status === 'disabledByTeamAdminPolicy') continue
    if (app.isTeamServer && app.pluginId == null) continue
    const key = `${app.pluginId ?? app.name}\u0000${app.accountKey}`
    const held = chosen.get(key)
    if (held) {
      if (held.isTeamServer && !app.isTeamServer) chosen.set(key, app)
    } else {
      order.push(key)
      chosen.set(key, app)
    }
  }
  return order.map((key) => chosen.get(key)!)
}

/** Every row "@" can offer, in the window's order: everyone (a group of two or more), the members, the routines, the connectors. */
export function mentionRows(
  members: readonly Agent[],
  isGroupChat: boolean,
  routines: readonly Skill[],
  connectors: readonly ConnectedApp[],
): MentionRow[] {
  const rows: MentionRow[] = []
  if (isGroupChat && members.length >= 2)
    rows.push({
      key: `assistants:${everyoneId}`,
      id: everyoneId,
      category: 'assistants',
      label: 'everyone',
      keywords: ['all'],
      tag: t('Agent'),
      icon: { kind: 'everyone' },
      insert: { kind: 'mention', id: everyoneId, label: 'everyone' },
    })
  for (const member of members) {
    const count = member.memberIds.length
    rows.push({
      key: `assistants:${member.id}`,
      id: member.id,
      category: 'assistants',
      label: member.name,
      keywords: [],
      subtitle: member.isGroup ? t`${count} agents` : undefined,
      tag: member.isGroup ? t('Group') : t('Agent'),
      icon: member.isGroup
        ? { kind: 'group' }
        : { kind: 'agent', id: member.id },
      insert: { kind: 'mention', id: member.id, label: member.name },
    })
  }
  for (const routine of routines)
    rows.push({
      key: `automations:${routine.id}`,
      id: routine.id,
      category: 'automations',
      label: routine.name,
      keywords: [],
      subtitle: routine.subtitle,
      tag: t('Routine'),
      icon: {
        kind: 'routine',
        iconId: routine.iconId,
        iconURL: routine.iconURL,
      },
      insert: {
        kind: 'workflow',
        id: routine.id,
        label: routine.name,
        iconId: routine.iconId,
        iconURL: routine.iconURL,
      },
    })
  for (const app of connectors) {
    const id = `mcp:${app.serverIdentifier}`
    const label = connectorLabel(app.name, app.accountKey)
    rows.push({
      key: `tools:${id}`,
      id,
      category: 'tools',
      label,
      keywords: [],
      subtitle: connectorStatus(app),
      tag: t('Plugin'),
      icon: { kind: 'connector', name: app.name },
      insert: { kind: 'workflow', id: `mcp:${app.serverId}`, label },
    })
  }
  return rows
}

/**
 * The rows for what was typed after "@" (`j5n`): each once; all of them, in
 * order, for nothing typed; else those every word runs through, best first,
 * the ones picked lately first among equals. No limit.
 */
export function filterMentions(
  rows: readonly MentionRow[],
  query: string,
  recents: readonly string[],
): MentionRow[] {
  const seen = new Set<string>()
  const unique = rows.filter((row) => {
    if (seen.has(row.key)) return false
    seen.add(row.key)
    return true
  })
  if (query.trim() === '') return unique
  if (tokens(query).length === 0) return []
  return unique
    .map((row, index) => {
      const value = score(row.label, row.keywords, query)
      const position = recents.indexOf(row.key)
      const recency =
        position >= 0 ? (recents.length - position) / recents.length : 0
      return { row, index, value, recency }
    })
    .filter(
      (item): item is typeof item & { value: number } => item.value != null,
    )
    .sort((a, b) =>
      a.value !== b.value
        ? b.value - a.value
        : a.recency !== b.recency
          ? b.recency - a.recency
          : a.index - b.index,
    )
    .map((item) => item.row)
}

/** The keys picked lately from "@", newest first, after `key` is picked: at most 20 (`Llt`). */
export function rememberingMention(
  key: string,
  recents: readonly string[],
): string[] {
  return [key, ...recents.filter((one) => one !== key)].slice(0, 20)
}

/** What "@" says with nothing to offer: the typed name not found, in curly quotes. */
export function mentionEmptyText(query: string): string {
  const typed = query.trim()
  return typed === ''
    ? t('Nothing to mention yet')
    : t`No matches for “${typed}”`
}

// MARK: "/" (`u5n`)

/** One of the app's actions "/" offers (the palette's commands that run something). */
export interface Action {
  id: string
  label: string
  keywords: string[]
  detail?: string
}

/**
 * The app's actions "/" offers (the palette's `composerActions`, `RDn`), in
 * its order: Org Chart; Open Hidden Agents while an agent is hidden; a
 * group's Members; Channels; Chat Settings; the Settings sections;
 * Connectors; the three themes; Update Simeon's Computer while an update
 * waits. Each runs at once; none goes into the message.
 */
export function appActions(options: {
  isGroup: boolean
  hasHiddenAgents: boolean
  hasChannels?: boolean
  showsOrgChart?: boolean
  showsUsage?: boolean
  computerUpdate?: boolean
}): Action[] {
  const {
    isGroup,
    hasHiddenAgents,
    hasChannels = true,
    showsOrgChart = true,
    showsUsage = true,
    computerUpdate = false,
  } = options
  const actions: Action[] = []
  const currentChat = t('Current chat')
  const settings = t('Settings')
  const appearance = t('Settings · Appearance')
  if (showsOrgChart)
    actions.push({
      id: 'org-chart',
      label: t('Org Chart'),
      keywords: ['open', 'organization', 'network', 'graph'],
      detail: t('Views'),
    })
  if (hasHiddenAgents)
    actions.push({
      id: 'open-hidden-chats',
      label: t('Open Hidden Agents'),
      keywords: ['hidden', 'unhide', 'hide', 'sidebar', 'bots'],
      detail: t('Sidebar'),
    })
  if (isGroup)
    actions.push({
      id: 'info:members',
      label: t('Members'),
      keywords: ['people', 'group', 'participants'],
      detail: currentChat,
    })
  if (hasChannels)
    actions.push({
      id: 'info:channels',
      label: t('Channels'),
      keywords: ['messaging', 'platforms', 'connect'],
      detail: currentChat,
    })
  actions.push({
    id: 'info:settings',
    label: t('Chat Settings'),
    keywords: ['details', 'notifications'],
    detail: currentChat,
  })
  actions.push({
    id: 'settings:general',
    label: t('Settings: General'),
    keywords: [
      'account',
      'model',
      'notifications',
      'preferences',
      'appearance',
      'theme',
      'mode',
      'security',
      'yubikey',
      'webauthn',
    ],
    detail: settings,
  })
  if (showsUsage)
    actions.push({
      id: 'settings:usage',
      label: t('Settings: Usage & Billing'),
      keywords: [
        'usage',
        'billing',
        'spend',
        'limit',
        'on-demand',
        'plan',
        'quota',
      ],
      detail: settings,
    })
  actions.push({
    id: 'overlay:plugins',
    label: t('Connectors'),
    keywords: [
      'plugins',
      'marketplace',
      'tools',
      'skills',
      'mcp',
      'connectors',
      'customize',
    ],
  })
  actions.push({
    id: 'theme:system',
    label: t('Theme: System'),
    keywords: ['appearance', 'os', 'auto', 'follow'],
    detail: appearance,
  })
  actions.push({
    id: 'theme:light',
    label: t('Theme: Light'),
    keywords: ['appearance', 'day', 'bright'],
    detail: appearance,
  })
  actions.push({
    id: 'theme:dark',
    label: t('Theme: Dark'),
    keywords: ['appearance', 'night', 'mode'],
    detail: appearance,
  })
  if (computerUpdate)
    actions.push({
      id: 'computer-update',
      label: t("Update Simeon's Computer"),
      keywords: ['box', 'image', 'machine', 'recreate', 'latest', 'shared'],
      detail: t('Updates'),
    })
  return actions
}

export type SlashItem =
  | { kind: 'skill'; skill: Skill }
  | { kind: 'action'; action: Action }

export function slashId(item: SlashItem): string {
  return item.kind === 'skill' ? item.skill.id : `action:${item.action.id}`
}

export function slashLabel(item: SlashItem): string {
  return item.kind === 'skill' ? item.skill.name : item.action.label
}

/** "Skill" or "Action". */
export function slashTag(item: SlashItem): string {
  return item.kind === 'action' ? t('Action') : t('Skill')
}

/** A skill's description; an action's place ("Settings", "Current chat"). */
export function slashSubtitle(item: SlashItem): string | undefined {
  return item.kind === 'skill' ? item.skill.summary : (item.action.detail ?? '')
}

/**
 * What "/" offers for what was typed: the skills whose name holds it, in
 * their order; then the actions every word runs through, best first; eight
 * at most, three kept for actions when there are that many.
 */
export function slashItems(
  skills: readonly Skill[],
  actions: readonly Action[],
  query: string,
): SlashItem[] {
  const wanted = query.trim().toLowerCase()
  const foundSkills = skills.filter(
    (skill) => wanted === '' || skill.name.toLowerCase().includes(wanted),
  )
  const foundActions = actions
    .map((action, index) => ({
      action,
      index,
      value: score(
        action.label,
        [...action.keywords, ...(action.detail != null ? [action.detail] : [])],
        query,
      ),
    }))
    .filter(
      (item): item is typeof item & { value: number } => item.value != null,
    )
    .sort((a, b) =>
      a.value !== b.value ? b.value - a.value : a.index - b.index,
    )
    .map((item) => item.action)
  const shownSkills = foundSkills.slice(0, 8 - Math.min(foundActions.length, 3))
  return [
    ...shownSkills.map((skill): SlashItem => ({ kind: 'skill', skill })),
    ...foundActions
      .slice(0, 8 - shownSkills.length)
      .map((action): SlashItem => ({ kind: 'action', action })),
  ]
}

/** What "/" says with nothing to offer (straight quotes). */
export function slashEmptyText(query: string, hasAny: boolean): string {
  const typed = query.trim()
  return hasAny && typed !== ''
    ? t`No matches for "${typed}"`
    : t('Nothing to reference yet')
}

// MARK: "#" (`D_n`, `Iyn`)

/** A cloud agent's pull request, as its card knows it (`CloudAgentInfo`), for "#". */
export interface CloudPull {
  name: string
  pullRequestNumber?: number
  pullRequestURL: string
}

/**
 * The pull requests the chat named, newest first, each once (`D_n`): from a
 * message's own document when it has one, from a cloud agent's card, else
 * from the GitHub (or Simeon review) addresses in its words. A document's
 * reference outranks a card, which outranks an address; the better one's
 * details win, the place stays where it was first found.
 */
export function pullCandidates(
  entries: readonly Entry[],
  cloud: Record<string, CloudPull> = {},
): PullRequest[] {
  const order: number[] = []
  const held = new Map<number, { rank: number; pull: PullRequest }>()
  const offer = (pull: PullRequest, rank: number) => {
    if (pull.number <= 0) return
    const existing = held.get(pull.number)
    if (existing) {
      if (rank > existing.rank) held.set(pull.number, { rank, pull })
    } else {
      order.push(pull.number)
      held.set(pull.number, { rank, pull })
    }
  }
  for (const entry of [...entries].reverse()) {
    const message = entry.message
    if (
      entry.kind === 'send-message' &&
      str(field(message, 'type')) === 'cloud-agent'
    ) {
      const bcId = text(field(message, 'bcId'))
      const info = bcId != null ? cloud[bcId] : undefined
      if (info?.pullRequestNumber != null) {
        const title =
          info.name === '' ? text(field(message, 'title'))?.trim() : info.name
        offer(
          {
            number: info.pullRequestNumber,
            url: info.pullRequestURL,
            title: title ? title : undefined,
          },
          1,
        )
        continue
      }
    }
    if (entry.kind === 'message') {
      const doc = richDocument(str(entry.raw.richText))
      if (doc) {
        for (const [pull, rank] of documentPulls(doc)) offer(pull, rank)
        continue
      }
    }
    let words: string
    if (entry.kind === 'message') words = entry.content ?? ''
    else if (
      entry.kind === 'send-message' &&
      str(field(message, 'type')) === 'text'
    )
      words = str(field(message, 'content')) ?? ''
    else if (entry.kind === 'notice') words = text(entry.raw.text) ?? ''
    else continue
    for (const pull of pullRequestLinks(words)) offer(pull, 0)
  }
  return order.map((number) => held.get(number)!.pull)
}

/** A document's pull requests, in its order: its references (rank 2), and the addresses in its words and links (rank 0). */
function documentPulls(node: DocNode): [PullRequest, number][] {
  const out: [PullRequest, number][] = []
  const attrs = isObject(node.attrs) ? node.attrs : {}
  if (node.type === 'prReference') {
    const number = int(attrs.prNumber)
    if (number != null) {
      const title = str(attrs.title)?.trim()
      const url = str(attrs.url)?.trim()
      out.push([
        { number, url: url ?? '', title: title ? title : undefined },
        2,
      ])
    }
  } else if (node.type === 'text') {
    for (const pull of pullRequestLinks(str(node.text) ?? ''))
      out.push([pull, 0])
    for (const one of Array.isArray(node.marks) ? node.marks : []) {
      if (!isObject(one) || one.type !== 'link') continue
      const href = str(field(one.attrs, 'href'))
      if (href) for (const pull of pullRequestLinks(href)) out.push([pull, 0])
    }
  }
  for (const child of Array.isArray(node.content) ? node.content : [])
    if (isObject(child)) out.push(...documentPulls(child as DocNode))
  return out
}

/** The pull requests "#…" matches (`Iyn`): its number holds what was typed, or its title does; eight at most. */
export function filterPulls(
  pulls: readonly PullRequest[],
  query: string,
): PullRequest[] {
  const wanted = query.trim().toLowerCase()
  return pulls
    .filter(
      (pull) =>
        wanted === '' ||
        String(pull.number).includes(wanted) ||
        (pull.title ?? '').toLowerCase().includes(wanted),
    )
    .slice(0, 8)
}
