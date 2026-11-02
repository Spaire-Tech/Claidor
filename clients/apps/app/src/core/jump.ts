// The Mac window's search (⌘K, its command palette `QFn`), as its code does
// it (SimeonCore's Jump.swift): the matching (`Wmt`, `MFe`, `Pme`, `xFn`),
// what is listed for each tab and in which order (`SFn`), the actions
// (`RDn`), the links of the open chat (`SEn`), and the words each row and
// empty tab shows. The gates it shares with "/" (`agentNetworkEnabled`,
// `channelsAvailable`) are the store's.

import type { Entry } from './entry'
import { field, str, text } from './json'
import { t } from './l10n'
import {
  type Agent,
  shownDescription,
  shownTitle,
  showsMembers,
} from './models'
import {
  type FileHit,
  type MessageHit,
  type RoutineHit,
  type SearchTab,
  fileLine,
  messageLine,
  needsIndex,
  routineDate,
  searchTabs,
} from './search'

// MARK: Matching

/** A text's characters as Swift counts them (grapheme clusters). */
function characters(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl)
    return Array.from(
      new Intl.Segmenter().segment(text),
      (part) => part.segment,
    )
  return Array.from(text)
}

/** A letter or a digit, as Swift's `isLetter || isNumber` reads one. */
const letterOrNumber = /^[\p{Alphabetic}\p{N}]/u
/** The marks a decomposed letter carries (nonspacing, spacing and enclosing). */
const marks = /\p{M}/gu

/**
 * A text's letters and digits, accents taken off and in lower case, any
 * run of other characters one space, and for each kept letter the place
 * (in characters) it came from, -1 for a space (`Wmt`).
 */
export function normalize(text: string): {
  normalized: string[]
  sources: number[]
} {
  const out: string[] = []
  const sources: number[] = []
  let gap = false
  characters(text).forEach((character, index) => {
    const lowered = character.normalize('NFKD').replace(marks, '').toLowerCase()
    for (const letter of characters(lowered)) {
      if (!letterOrNumber.test(letter)) {
        gap = true
        continue
      }
      if (gap && out.length > 0) {
        out.push(' ')
        sources.push(-1)
      }
      gap = false
      out.push(letter)
      sources.push(index)
    }
  })
  return { normalized: out, sources }
}

/** The query's words (`Wf`). */
export function tokens(text: string): string[] {
  const normalized = normalize(text).normalized.join('')
  return normalized === '' ? [] : normalized.split(' ').filter((w) => w !== '')
}

/**
 * How well a word is found in a normalized text, or undefined (`MFe`): its
 * letters in order, each first found; a letter starting a word scores 5,
 * one right after the last 3 more, any other 1; the letters within three
 * times the word's length; less the place of the first letter (0.1 a
 * letter) and the text's length (0.02 a letter).
 */
export function score(
  text: readonly string[],
  word: readonly string[],
): number | undefined {
  if (word.length === 0) return 0
  let total = 0
  let matched = 0
  let last = -2
  let first = -1
  let end = -1
  for (
    let index = 0;
    index < text.length && matched < word.length;
    index += 1
  ) {
    if (text[index] !== word[matched]) continue
    if (first < 0) first = index
    const before = index > 0 ? text[index - 1] : undefined
    const starts =
      before === undefined ||
      before === ' ' ||
      before === '-' ||
      before === '_' ||
      before === '/' ||
      before === '.'
    let points = 1
    if (starts) points += 4
    if (last === index - 1) points += 3
    total += points
    last = index
    end = index
    matched += 1
  }
  if (matched < word.length || end - first + 1 > word.length * 3)
    return undefined
  return total - first * 0.1 - text.length * 0.02
}

/**
 * A row's score for the query's words, or undefined when a word is found
 * neither in its label nor in its keywords (`Pme`): each word's best, plus
 * the whole query's in the label.
 */
export function rank(
  label: string,
  keywords: readonly string[],
  words: readonly string[],
  query: string,
): number | undefined {
  const main = normalize(label).normalized
  const all = [main, ...keywords.map((one) => normalize(one).normalized)]
  let total = 0
  for (const token of words) {
    const word = characters(token)
    let best: number | undefined
    for (const one of all) {
      const found = score(one, word)
      if (found !== undefined && (best === undefined || found > best))
        best = found
    }
    if (best === undefined) return undefined
    total += best
  }
  return total + (score(main, characters(query)) ?? 0)
}

/** A label in runs, each the query's words found in it (shown bold) or not (`xFn`). */
export function matchRuns(
  label: string,
  query: string,
): { text: string; isMatch: boolean }[] {
  const words = tokens(query)
  if (words.length === 0 || label === '')
    return [{ text: label, isMatch: false }]
  const { normalized, sources } = normalize(label)
  const shown = characters(label)
  const lit = shown.map(() => false)
  for (const word of words) {
    const letters = characters(word)
    let from = 0
    while (from + letters.length <= normalized.length) {
      let at = -1
      for (
        let start = from;
        start <= normalized.length - letters.length;
        start += 1
      ) {
        if (
          letters.every(
            (letter, offset) => normalized[start + offset] === letter,
          )
        ) {
          at = start
          break
        }
      }
      if (at < 0) break
      for (let offset = 0; offset < letters.length; offset += 1) {
        const source = sources[at + offset]!
        if (source >= 0) lit[source] = true
      }
      from = at + letters.length
    }
  }
  const runs: { text: string; isMatch: boolean }[] = []
  shown.forEach((character, index) => {
    const lastRun = runs[runs.length - 1]
    if (lastRun && lastRun.isMatch === lit[index]) lastRun.text += character
    else runs.push({ text: character, isMatch: lit[index]! })
  })
  return runs
}

// MARK: Actions

/** An action (`Command`): its id, words, icon (the window's name), what it is found by, its line, whether it is the one in use. */
export interface Command {
  id: string
  label: string
  icon: string
  keywords: readonly string[]
  detail?: string
  isActive: boolean
}

/**
 * The actions in the window's order (`zRn`, `MDn`, `RDn`): Org Chart (with
 * the agent network on and agents to show), Open Hidden Agents (with any
 * hidden); for an open chat, Members (a group of the person's), Channels
 * (when the chat can have some) and Chat Settings; Settings: General and
 * Usage & Billing; Connectors; the three themes, the one in use ticked;
 * Update Simeon's Computer while it is offered (`HOn`), last.
 */
export function commands(options: {
  orgChart: boolean
  hiddenCount: number
  current?: Agent
  hasChannels: boolean
  usage?: boolean
  theme: string
  computerUpdate?: boolean
}): Command[] {
  const { orgChart, hiddenCount, current, hasChannels, theme } = options
  const usage = options.usage ?? true
  const computerUpdate = options.computerUpdate ?? false
  const command = (
    id: string,
    label: string,
    icon: string,
    keywords: string[],
    detail?: string,
    isActive = false,
  ): Command => ({ id, label, icon, keywords, detail, isActive })
  const list: Command[] = []
  if (orgChart)
    list.push(
      command(
        'view:org-chart',
        t('Org Chart'),
        'organization-filled',
        ['open', 'organization', 'network', 'graph'],
        t('Views'),
      ),
    )
  if (hiddenCount > 0)
    list.push(
      command(
        'open-hidden-chats',
        t('Open Hidden Agents'),
        'eye-slash',
        ['hidden', 'unhide', 'hide', 'sidebar', 'bots'],
        t('Sidebar'),
      ),
    )
  if (current) {
    if (showsMembers(current))
      list.push(
        command(
          'info:members',
          t('Members'),
          'people',
          ['people', 'group', 'participants'],
          t('Current chat'),
        ),
      )
    if (hasChannels)
      list.push(
        command(
          'info:channels',
          t('Channels'),
          'chat-bubbles',
          ['messaging', 'platforms', 'connect'],
          t('Current chat'),
        ),
      )
    list.push(
      command(
        'info:settings',
        t('Chat Settings'),
        'settings-gear',
        ['details', 'notifications'],
        t('Current chat'),
      ),
    )
  }
  list.push(
    command(
      'settings:general',
      t('Settings: General'),
      'settings-gear',
      [
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
      t('Settings'),
    ),
  )
  if (usage)
    list.push(
      command(
        'settings:usage',
        t('Settings: Usage & Billing'),
        'chart-bars',
        ['usage', 'billing', 'spend', 'limit', 'on-demand', 'plan', 'quota'],
        t('Settings'),
      ),
    )
  list.push(
    command('overlay:plugins', t('Connectors'), 'plug', [
      'plugins',
      'marketplace',
      'tools',
      'skills',
      'mcp',
      'connectors',
      'customize',
    ]),
  )
  const themes: [string, string, string, string[]][] = [
    [
      'system',
      t('Theme: System'),
      'display',
      ['appearance', 'os', 'auto', 'follow'],
    ],
    ['light', t('Theme: Light'), 'sun', ['appearance', 'day', 'bright']],
    ['dark', t('Theme: Dark'), 'moon', ['appearance', 'night', 'mode']],
  ]
  for (const [id, label, icon, keywords] of themes)
    list.push(
      command(
        `theme:${id}`,
        label,
        icon,
        keywords,
        t('Settings · Appearance'),
        id === theme,
      ),
    )
  if (computerUpdate)
    list.push(
      command(
        'update:computer',
        t("Update Simeon's Computer"),
        'device-desktop',
        ['box', 'image', 'machine', 'recreate', 'latest', 'shared'],
        t('Updates'),
      ),
    )
  return list
}

// MARK: Rows

/** One row of results (`Row`, `fSe`): an agent or group (hidden ones only for a query), an action, a message, a file, a link or a routine. */
export type Row =
  | { kind: 'agent'; agent: Agent; hidden: boolean }
  | { kind: 'command'; command: Command }
  | { kind: 'message'; hit: MessageHit }
  | { kind: 'file'; hit: FileHit }
  | { kind: 'link'; url: string }
  | { kind: 'routine'; hit: RoutineHit }

export function rowId(row: Row): string {
  switch (row.kind) {
    case 'agent':
      return `agent:${row.agent.id}`
    case 'command':
      return `command:${row.command.id}`
    case 'message':
      return `message:${row.hit.agentId}:${row.hit.entryId}`
    case 'file':
      return `file:${row.hit.agentId}:${row.hit.entryId}`
    case 'link':
      return `link:${row.url}`
    case 'routine':
      return `routine:${row.hit.agentId}:${row.hit.routine.id}`
  }
}

/** What the All tab says at its right (`kind`, `kFn`). */
export function rowKind(row: Row): string {
  switch (row.kind) {
    case 'agent':
      return row.agent.isGroup ? t('Group') : t('Agent')
    case 'command':
      return t('Action')
    case 'message':
      return t('Message')
    case 'file':
      return t('File')
    case 'link':
      return t('Link')
    case 'routine':
      return t('Routine')
  }
}

/** A message's or file's time, when it has one (`timestampMs`, `O0t`). */
export function rowTimestamp(row: Row): number | undefined {
  if (row.kind !== 'message' && row.kind !== 'file') return undefined
  const ms = row.hit.timestampMs
  return ms != null && ms > 0 ? ms : undefined
}

/** The date at a routine's right in its own tab: its last run, or when it was made (`dateMs`, `wFn`). */
export function rowDate(row: Row): number | undefined {
  if (rowTimestamp(row) !== undefined || row.kind !== 'routine')
    return undefined
  const date = routineDate(row.hit)
  return date != null && date > 0 ? date : undefined
}

/** The words a row is found by (`searchable`, `TFn`). */
function searchable(row: Row): { label: string; keywords: string[] } {
  switch (row.kind) {
    case 'agent': {
      const agent = row.agent
      const title = agent.isGroup ? '' : agent.title.trim()
      return {
        label: agent.name,
        keywords: title === '' ? [] : [title, shownTitle(agent)],
      }
    }
    case 'command':
      return { label: row.command.label, keywords: [...row.command.keywords] }
    case 'message':
      return { label: row.hit.snippet, keywords: tokens(row.hit.snippet) }
    case 'file':
      return { label: row.hit.fileName, keywords: tokens(row.hit.fileName) }
    case 'link':
      return { label: address(row.url), keywords: tokens(row.url) }
    case 'routine':
      return {
        label: row.hit.routine.name,
        keywords: [row.hit.routine.summary],
      }
  }
}

/** The row's words, bold where the query is found (`title`, `JFn`); a link's are its address. */
export function rowTitle(row: Row): string {
  switch (row.kind) {
    case 'agent':
      return row.agent.name
    case 'command':
      return row.command.label
    case 'message':
      return row.hit.snippet
    case 'file':
      return row.hit.fileName
    case 'link':
      return address(row.url)
    case 'routine':
      return row.hit.routine.name
  }
}

/** Whether it belongs on a tab (`belongs`, `bFn`). */
function belongs(row: Row, tab: SearchTab): boolean {
  switch (tab) {
    case 'all':
      return true
    case 'messages':
      return row.kind === 'message'
    case 'files':
      return row.kind === 'file'
    case 'links':
      return row.kind === 'link'
    case 'routines':
      return row.kind === 'routine'
    case 'actions':
      return row.kind === 'command'
    case 'agents':
      return row.kind === 'agent' && !row.agent.isGroup
    case 'groups':
      return row.kind === 'agent' && row.agent.isGroup
  }
}

// MARK: Addresses

/** An address's parts, as `URLComponents(string:)` reads them (swift-foundation's, on the Mac since macOS 15); undefined for one it refuses. */
interface Parts {
  scheme: string
  /** What is between "//" and the path, when there is a "//": the user, the host as written and the port. */
  authority?: { user: string; host: string; port: string }
  /** The path, query and fragment, each with what may not stand in it percent-encoded, as `URLComponents` writes them. */
  path: string
  query?: string
  fragment?: string
}

const unreserved = "A-Za-z0-9\\-._~!$&'()*+,;="
const pathCharacters = new RegExp(`[${unreserved}:@/]`)
const queryCharacters = new RegExp(`[${unreserved}:@/?]`)
const hostCharacters = new RegExp(`^[${unreserved}%]*$`)

/** A component with every character it may not hold percent-encoded (UTF-8), and a % that starts no escape written %25. */
function encoded(part: string, allowed: RegExp): string {
  let out = ''
  const characters = Array.from(part)
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]!
    if (character === '%') {
      const escape = characters.slice(index + 1, index + 3).join('')
      out += /^[0-9A-Fa-f]{2}$/.test(escape) ? '%' : '%25'
    } else if (allowed.test(character)) {
      out += character
    } else {
      for (const byte of new TextEncoder().encode(character))
        out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
    }
  }
  return out
}

function parts(raw: string): Parts | undefined {
  const found =
    /^([A-Za-z][A-Za-z0-9+.-]*):(\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#([\s\S]*))?$/.exec(
      raw,
    )
  if (!found) return undefined
  const whole = found[3]
  let authority: Parts['authority']
  if (whole !== undefined) {
    const at = whole.lastIndexOf('@') + 1
    const user = whole.slice(0, at)
    const rest = whole.slice(at)
    const host = rest.startsWith('[')
      ? rest.slice(0, rest.indexOf(']') + 1)
      : rest.replace(/:[^:]*$/, '')
    const port = rest.slice(host.length)
    if (!/^(:\d*)?$/.test(port)) return undefined
    if (
      /^\p{ASCII}*$/u.test(host) &&
      !host.startsWith('[') &&
      !hostCharacters.test(host)
    )
      return undefined
    authority = {
      user: encoded(user.slice(0, -1), queryCharacters) + (at > 0 ? '@' : ''),
      host,
      port,
    }
  }
  return {
    scheme: found[1]!,
    authority,
    path: encoded(found[4]!, pathCharacters),
    query:
      found[5] === undefined ? undefined : encoded(found[5], queryCharacters),
    fragment:
      found[6] === undefined ? undefined : encoded(found[6], queryCharacters),
  }
}

/** A link's address without its scheme (`address`, `L0t`): the host and the path, no lone "/". */
export function address(url: string): string {
  const found = parts(url)
  const host = found?.authority?.host
  if (!found || !host) return url
  return host + (found.path === '/' ? '' : found.path)
}

/** A host as `URLComponents` writes one it was given: in small letters, a name in another script in its ASCII form (IDNA). */
function writtenHost(host: string): string | undefined {
  if (/^\p{ASCII}*$/u.test(host)) return host.toLowerCase()
  try {
    return new URL(`http://${host}`).hostname
  } catch {
    return undefined
  }
}

/**
 * An address on the web, written as the window writes it back (`web`,
 * `YAe`): http or https, with a host; undefined otherwise.
 */
export function web(raw: string): string | undefined {
  const trimmed = raw.trim()
  const lower = trimmed.toLowerCase()
  const secure = lower.startsWith('https://')
  if (!secure && !lower.startsWith('http://')) return undefined
  // A space in the host is not an address; one after it is written %20, as a browser writes it.
  const afterScheme = trimmed.slice(secure ? 8 : 7)
  const host = /^[^/?#]*/.exec(afterScheme)![0]
  if (host === '' || /\s/u.test(host)) return undefined
  const found = parts(trimmed.replaceAll(' ', '%20'))
  const authority = found?.authority
  if (!found || !authority?.host) return undefined
  const name = writtenHost(authority.host)
  if (name === undefined) return undefined
  const path = found.path === '' ? '/' : found.path
  const query = found.query === undefined ? '' : `?${found.query}`
  const fragment = found.fragment === undefined ? '' : `#${found.fragment}`
  return `${found.scheme.toLowerCase()}://${authority.user}${name}${authority.port}${path}${query}${fragment}`
}

// MARK: What each tab lists

/**
 * What a tab lists (`results`, `SFn`). With no query: All lists the agents
 * (the pins first) and the actions; the other tabs their own of the agents,
 * files, links, routines and actions. With a query: every row whose words
 * match, best first; then the computer's own matches for messages and
 * files that the words did not find (not while they are for older words);
 * then the hidden agents that match.
 */
export function results(options: {
  agents: readonly Agent[]
  hidden: readonly Agent[]
  commands: readonly Command[]
  messages?: readonly MessageHit[]
  files?: readonly FileHit[]
  messagesStale?: boolean
  filesStale?: boolean
  links?: readonly string[]
  routines?: readonly RoutineHit[]
  tab: SearchTab
  query: string
}): Row[] {
  const { tab, query } = options
  const only = (rows: Row[]) => rows.filter((row) => belongs(row, tab))
  const agentRows = only(
    options.agents.map((agent) => ({ kind: 'agent', agent, hidden: false })),
  )
  const commandRows = only(
    options.commands.map((command) => ({ kind: 'command', command })),
  )
  const fileRows = only(
    (options.files ?? []).map((hit) => ({ kind: 'file', hit })),
  )
  const linkRows = only(
    (options.links ?? []).map((url) => ({ kind: 'link', url })),
  )
  const routineRows = only(
    (options.routines ?? []).map((hit) => ({ kind: 'routine', hit })),
  )
  const words = tokens(query)
  if (words.length === 0)
    return tab === 'all'
      ? [...agentRows, ...commandRows]
      : [...agentRows, ...fileRows, ...linkRows, ...routineRows, ...commandRows]
  const joined = words.join(' ')
  const messageRows = only(
    (options.messages ?? []).map((hit) => ({ kind: 'message', hit })),
  )
  const ranked = rankRows(
    [
      ...agentRows,
      ...commandRows,
      ...fileRows,
      ...linkRows,
      ...routineRows,
      ...messageRows,
    ],
    words,
    joined,
  )
  const found = new Set(ranked.map(rowId))
  const more = [
    ...(options.messagesStale ? [] : messageRows),
    ...(options.filesStale ? [] : fileRows),
  ].filter((row) => !found.has(rowId(row)))
  const hiddenRows = rankRows(
    only(
      options.hidden.map((agent) => ({ kind: 'agent', agent, hidden: true })),
    ),
    words,
    joined,
  )
  return [...ranked, ...more, ...hiddenRows]
}

/** Best first; equal scores keep their order, as the window's stable sort does. */
function rankRows(
  rows: readonly Row[],
  words: readonly string[],
  query: string,
): Row[] {
  const scored: { row: Row; score: number; order: number }[] = []
  rows.forEach((row, order) => {
    const found = searchable(row)
    const value = rank(found.label, found.keywords, words, query)
    if (value !== undefined) scored.push({ row, score: value, order })
  })
  return scored
    .sort((a, b) =>
      a.score !== b.score ? b.score - a.score : a.order - b.order,
    )
    .map((one) => one.row)
}

/** The agents in the window's order for search (`ordered`, `Pln`): the pins in their order, then the rest as listed. */
export function ordered(
  agents: readonly Agent[],
  pinnedIds: readonly string[],
): Agent[] {
  const byId = new Map<string, Agent>()
  for (const agent of agents) if (!byId.has(agent.id)) byId.set(agent.id, agent)
  const pins = pinnedIds
    .map((id) => byId.get(id))
    .filter((agent): agent is Agent => agent != null)
  const pinned = new Set(pins.map((agent) => agent.id))
  return [...pins, ...agents.filter((agent) => !pinned.has(agent.id))]
}

// MARK: Tabs and their words

/** The tabs shown: those the computer's index answers only while its search is on (`tabs`, `gFn`). */
export function tabs(globalSearch: boolean): SearchTab[] {
  return globalSearch
    ? [...searchTabs]
    : searchTabs.filter((tab) => !needsIndex(tab))
}

/** Tab or Left and Right: the next tab round (`nextTab`, `zWe`). */
export function nextTab(
  tab: SearchTab,
  step: number,
  list: readonly SearchTab[],
): SearchTab {
  const index = list.indexOf(tab)
  if (index < 0 || list.length === 0) return tab
  return list[(index + step + list.length) % list.length]!
}

/** ⌘1 to ⌘9 for the first nine rows (`shortcut`, `IFn`). */
export function shortcut(index: number): number | undefined {
  return index < 9 ? index + 1 : undefined
}

/** What an empty tab says (`empty`, `GFn`, `VFn`): its words, a line under them, and whether its icon is the glass (else people). */
export function empty(
  tab: SearchTab,
  unavailable: boolean,
): { label: string; hint?: string; glass: boolean } {
  if (unavailable)
    return {
      label: t('Search unavailable'),
      hint: t('Try again in a moment.'),
      glass: true,
    }
  switch (tab) {
    case 'all':
    case 'agents':
      return { label: t('No agents yet'), glass: false }
    case 'messages':
      return {
        label: t('Search messages'),
        hint: t('Type to find messages across your chats.'),
        glass: true,
      }
    case 'groups':
      return { label: t('No group chats yet'), glass: false }
    case 'files':
      return { label: t('No files yet'), glass: false }
    case 'links':
      return { label: t('No links in this chat yet'), glass: false }
    case 'routines':
      return { label: t('No routines yet'), glass: false }
    case 'actions':
      return { label: t('No actions'), glass: false }
  }
}

/** Where a list from the computer stands (`Status`, `_0t`, `sJt`). */
export type Status = 'empty' | 'loading' | 'ready' | 'failed'

/** Whether the tab waits on the computer, could not get its answer, or has what it needs (`Settled`, `vFn`). */
export type Settled = 'settled' | 'pending' | 'unavailable'

export function settled(options: {
  tab: SearchTab
  globalSearch: boolean
  filtered: boolean
  messages: Status
  files: Status
  routines: Status
}): Settled {
  const { tab, globalSearch, filtered } = options
  if (!globalSearch) return 'settled'
  const asked: Status[] = []
  if (filtered && (tab === 'all' || tab === 'messages'))
    asked.push(options.messages)
  if (tab === 'files' || (tab === 'all' && filtered)) asked.push(options.files)
  if (tab === 'routines' || (tab === 'all' && filtered))
    asked.push(options.routines)
  if (asked.includes('loading')) return 'pending'
  if (asked.includes('failed')) return 'unavailable'
  return 'settled'
}

/**
 * A row's second line (`subtitle`, `qFn`, `jFn`): an agent's description,
 * a group's members, an action's line, "Theo to you · 5m ago", "Scout ·
 * 1280×800 · 1d ago", a routine's schedule and agent.
 */
export function subtitle(
  row: Row,
  agents: ReadonlyMap<string, Agent>,
  now: Date = new Date(),
): string {
  switch (row.kind) {
    case 'agent':
      return row.agent.isGroup
        ? row.agent.memberIds
            .map((id) => agents.get(id)?.name)
            .filter((name): name is string => name != null && name !== '')
            .join(', ')
        : shownDescription(row.agent)
    case 'command':
      return row.command.detail ?? ''
    case 'message':
      return messageLine(row.hit, agents.get(row.hit.agentId), now)
    case 'file':
      return fileLine(row.hit, agents.get(row.hit.agentId), now)
    case 'link':
      return ''
    case 'routine':
      return [row.hit.routine.summary, agents.get(row.hit.agentId)?.name ?? '']
        .filter((part) => part !== '')
        .join(' · ')
  }
}

// MARK: The open chat's links

const picture = /!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+[^)]*)?\)/g
const markdownLink = /\[[^\]]*\]\(\s*([^)\s]+)(?:\s+[^)]*)?\)/g

/**
 * The links in a chat's lines, in their order, each once (`links`, `SEn`):
 * a message's Markdown links (not its pictures), a message that is only an
 * address, an attachment on the web.
 */
export function links(entries: readonly Entry[]): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const add = (raw: string) => {
    const url = web(raw)
    if (url === undefined || seen.has(url)) return
    seen.add(url)
    found.push(url)
  }
  const words = (content: string) => {
    if (content === '') return
    const withoutPictures = content.replace(picture, ' ')
    for (const match of withoutPictures.matchAll(markdownLink)) add(match[1]!)
    add(content)
  }
  for (const entry of entries) {
    if (entry.kind === 'message') {
      words(entry.content ?? '')
    } else if (entry.kind === 'send-message') {
      const message = entry.message
      if (message == null) continue
      const type = str(field(message, 'type'))
      if (type === 'text') words(str(field(message, 'content')) ?? '')
      else if (type === 'attachment') {
        const url = text(field(message, 'url'))
        if (url) add(url)
      }
    }
  }
  return found
}
