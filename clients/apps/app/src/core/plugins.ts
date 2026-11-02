// Connectors as the shipped window has it (SimeonCore's Plugins.swift, from
// the Plugins overlay, `clients/apps/web/public/app/assets/view-B5Ug8wEm.js`):
// the catalogue's entries, the computer's servers and plugins, the agent's
// skills, and the overlay's rules, ported function for function and checked
// against them run in Node (the core's own fixture, Fixtures/plugins.json):
// the fuzzy search (`MFe`), Available's order and sections (`Pl`, `ql`),
// what counts as added (`et`), Yours (`rt`), the filter (`nt`), the counts,
// the tools' names, the status words and the notices.
//
// Apps that can't be added yet (Plugins.swift's `AppsComingSoon`) are step
// 3c's, in connectCards.ts.

import {
  arr,
  bool,
  field,
  int,
  isObject,
  type JSONValue,
  str,
  text,
} from './json'
import { t } from './l10n'

// MARK: The catalogue's entries (`getCatalog`)

/** A catalogue entry (`PluginEntry`). */
export interface PluginEntry {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  iconUrl?: string
  homepage?: string
  skills?: PluginSkill[]
  connectors?: PluginConnector[]
  marketplace?: PluginMarketplace
  publisher?: PluginPublisher
  fields?: PluginField[]
}

export interface PluginSkill {
  name: string
  description: string
  sourceUrl?: string
}

export interface PluginConnector {
  name: string
  description: string
}

export interface PluginMarketplace {
  name: string
  displayName: string
  ownership?: string
}

export interface PluginPublisher {
  name: string
  displayName: string
  isUserOwned: boolean
}

/** One value a plugin asks for before it is added (`PluginEntry.Field`). */
export interface PluginField {
  key: string
  label: string
  isRequired: boolean
  isSecret: boolean
  placeholder?: string
  hint?: string
  defaultValue?: string
}

export function pluginEntryFrom(json: unknown): PluginEntry | undefined {
  const id = text(field(json, 'id')) ?? text(field(json, 'pluginId'))
  if (id == null) return undefined
  const name = str(field(json, 'name')) ?? id
  const marketplace = field(json, 'marketplace')
  const publisher = field(json, 'publisher')
  const skills = arr(field(json, 'skills'))
  const connectors = arr(field(json, 'connectors'))
  const fields = arr(field(json, 'fields'))
  return {
    id,
    name,
    displayName: str(field(json, 'displayName')) ?? name,
    description: str(field(json, 'description')) ?? '',
    category: str(field(json, 'category')) ?? '',
    iconUrl: text(field(json, 'iconUrl')),
    homepage: text(field(json, 'homepage')),
    skills: skills?.map((one) => ({
      name: str(field(one, 'name')) ?? '',
      description: str(field(one, 'description')) ?? '',
      sourceUrl: text(field(one, 'sourceUrl')),
    })),
    connectors: connectors?.map((one) => ({
      name: str(field(one, 'name')) ?? '',
      description: str(field(one, 'description')) ?? '',
    })),
    marketplace: isObject(marketplace)
      ? {
          name: str(field(marketplace, 'name')) ?? '',
          displayName: str(field(marketplace, 'displayName')) ?? '',
          ownership: str(field(marketplace, 'ownership')),
        }
      : undefined,
    publisher: isObject(publisher)
      ? {
          name: str(field(publisher, 'name')) ?? '',
          displayName: str(field(publisher, 'displayName')) ?? '',
          isUserOwned: bool(field(publisher, 'isUserOwned')) ?? false,
        }
      : undefined,
    fields: fields?.flatMap((one) => {
      const key = str(field(one, 'key'))
      if (key == null) return []
      return [
        {
          key,
          label: str(field(one, 'label')) ?? key,
          isRequired: bool(field(one, 'isRequired')) === true,
          isSecret: bool(field(one, 'isSecret')) === true,
          placeholder: str(field(one, 'placeholder')),
          hint: text(field(one, 'hint')),
          defaultValue: str(field(one, 'defaultValue')),
        },
      ]
    }),
  }
}

/** A `getCatalog` answer's entries: a list, or one under `plugins`. */
export function pluginEntriesFrom(answer: unknown): PluginEntry[] {
  return (arr(answer) ?? arr(field(answer, 'plugins')) ?? [])
    .map(pluginEntryFrom)
    .filter((entry): entry is PluginEntry => entry != null)
}

/** Its connectors as the cards count them (`st`): its own name when the catalogue lists none. */
export function connectorList(entry: PluginEntry): PluginConnector[] {
  return entry.connectors ?? [{ name: entry.name, description: '' }]
}

export function hasSetupFields(entry: PluginEntry): boolean {
  return (entry.fields ?? []).length > 0
}

// MARK: The computer's servers, plugins, tools and the agent's skills

/** How a server or a plugin came to be there (`PluginInstallMode`). */
export type PluginInstallMode = 'team-required' | 'team-default' | 'user'

const installModes: readonly PluginInstallMode[] = [
  'team-required',
  'team-default',
  'user',
]

/** One account of one of the computer's servers (`listServers`). */
export interface PluginServer {
  id: string
  name: string
  url?: string
  command?: string
  transport: string
  status: string
  statusDetail?: string
  toolCount: number
  serverIdentifier: string
  rowServerIdentifier: string
  accountKey: string
  pluginId?: string
  isTeamServer: boolean
  isRequired: boolean
  managedByTeamPluginPolicy: boolean
}

/** The account a server has when it has only one (`PluginServer.defaultAccount`). */
export const defaultAccount = 'default'

export function pluginServerFrom(json: unknown): PluginServer | undefined {
  const id = text(field(json, 'id'))
  if (id == null) return undefined
  const serverIdentifier = str(field(json, 'serverIdentifier')) ?? id
  return {
    id,
    name: str(field(json, 'name')) ?? id,
    url: text(field(json, 'url')),
    command: text(field(json, 'command')),
    transport: str(field(json, 'transport')) ?? '',
    status: str(field(json, 'status')) ?? '',
    statusDetail: text(field(json, 'statusDetail')),
    toolCount: int(field(json, 'toolCount')) ?? 0,
    serverIdentifier,
    rowServerIdentifier:
      str(field(json, 'rowServerIdentifier')) ?? serverIdentifier,
    accountKey: text(field(json, 'accountKey')) ?? defaultAccount,
    pluginId: text(field(json, 'pluginId')),
    isTeamServer: bool(field(json, 'isTeamServer')) === true,
    isRequired: bool(field(json, 'isRequired')) === true,
    managedByTeamPluginPolicy:
      bool(field(json, 'managedByTeamPluginPolicy')) === true,
  }
}

/** `hs`: a team's server, or one the team requires, is the team's. */
export function serverInstallMode(server: PluginServer): PluginInstallMode {
  return server.isTeamServer ||
    server.isRequired ||
    server.managedByTeamPluginPolicy
    ? 'team-required'
    : 'user'
}

/** A plugin the computer has on (`listEffectivePlugins`). */
export interface EffectivePlugin {
  pluginId: string
  displayName?: string
  isEnabled: boolean
  installMode: PluginInstallMode
  hasTeamConfiguredVariables: boolean
}

export function effectivePluginFrom(
  json: unknown,
): EffectivePlugin | undefined {
  const pluginId = text(field(json, 'pluginId'))
  if (pluginId == null) return undefined
  const mode = str(field(json, 'installMode')) ?? ''
  return {
    pluginId,
    displayName: text(field(json, 'displayName')),
    isEnabled: bool(field(json, 'isEnabled')) === true,
    installMode: installModes.includes(mode as PluginInstallMode)
      ? (mode as PluginInstallMode)
      : 'user',
    hasTeamConfiguredVariables:
      bool(field(json, 'hasTeamConfiguredVariables')) === true,
  }
}

/** A tool of a server (`listServerTools`). */
export interface PluginTool {
  name: string
  title?: string
  description: string
  isDisabled: boolean
}

export function pluginToolFrom(json: unknown): PluginTool | undefined {
  const name = text(field(json, 'name'))
  if (name == null) return undefined
  return {
    name,
    title: text(field(json, 'title')),
    description: str(field(json, 'description')) ?? '',
    isDisabled: bool(field(json, 'isDisabled')) === true,
  }
}

/** One of the agent's skills (`getAgentWorkflows`). */
export interface AgentSkill {
  id: string
  name: string
  description: string
  body: string
  /** Its trigger, as the computer gave it (sent back as it is on Save). */
  trigger?: JSONValue
  sourceRef?: string
  source: string
  publishedByCurrentUser: boolean
  pluginId?: string
  isEnabledForAgent: boolean
}

export function agentSkillFrom(json: unknown): AgentSkill | undefined {
  const id = text(field(json, 'id'))
  if (id == null) return undefined
  return {
    id,
    name: str(field(json, 'name')) ?? '',
    description: str(field(json, 'description')) ?? '',
    body: str(field(json, 'body')) ?? '',
    trigger: field(json, 'trigger'),
    sourceRef: text(field(json, 'sourceRef')),
    source: str(field(json, 'source')) ?? 'workflow',
    publishedByCurrentUser:
      bool(field(json, 'publishedByCurrentUser')) === true,
    pluginId: text(field(json, 'pluginId')),
    isEnabledForAgent: bool(field(json, 'isEnabledForAgent')) ?? true,
  }
}

/** In Yours › Private (`Zn`): made here, or published by me. */
export function isPrivateSkill(skill: AgentSkill): boolean {
  return (
    skill.source === 'workflow' ||
    (skill.source === 'plugin' && skill.publishedByCurrentUser)
  )
}

/** Its page stays open (`Rn`). */
export function skillHasPage(skill: AgentSkill): boolean {
  return isPrivateSkill(skill) || skill.source === 'managed'
}

/** The row's line (`bi`). */
export function skillSubtitle(skill: AgentSkill): string {
  const origin =
    skill.source === 'plugin' ? t('Published') : t('Created locally')
  return `${origin} · ${skill.description === '' ? t('Skill') : skill.description}`
}

/** The page's kind line. */
export function skillKindLine(skill: AgentSkill): string {
  return skill.source === 'plugin'
    ? t('Shared with your team')
    : skill.source === 'managed'
      ? t('Managed by your organization')
      : t('Private skill')
}

/** A row of Yours › Installed (`rt`): a plugin with its connectors, or a server no plugin claims. */
export type PluginItem =
  | {
      kind: 'plugin'
      entry: PluginEntry
      installMode: PluginInstallMode
      connectors: PluginServer[]
    }
  | { kind: 'connector'; server: PluginServer; installMode: PluginInstallMode }

// MARK: The filter (`qn`)

export type PluginFilterKind = 'all' | 'connectors' | 'skills'
export type PluginFilterOwnership = 'all' | 'team' | 'public'

/** The Filter menu's choice (`PluginFilter`). */
export interface PluginFilter {
  type: PluginFilterKind
  ownership: PluginFilterOwnership
}

export const allPlugins: PluginFilter = { type: 'all', ownership: 'all' }

export function filterIsAll(filter: PluginFilter): boolean {
  return filter.type === 'all' && filter.ownership === 'all'
}

export function filterKindLabel(kind: PluginFilterKind): string {
  return kind === 'all'
    ? t('All types')
    : kind === 'connectors'
      ? t('Connectors')
      : t('Skills')
}

export function filterOwnershipLabel(ownership: PluginFilterOwnership): string {
  return ownership === 'all'
    ? t('All')
    : ownership === 'team'
      ? t('Team')
      : t('Public')
}

// MARK: Search and order

/** `localeCompare`, in the Mac's locale, so the order is the Mac's in every language. */
function ordered(a: string, b: string): number {
  return a.localeCompare(b, 'en-US')
}

/** `MFe`: the query's letters in order in the text, more for word starts and runs; none when they are not all there or too spread out. */
export function fuzzyScore(text: string, query: string): number | undefined {
  if (query.length === 0) return 0
  const lower = text.toLowerCase()
  const unit = (i: number): number | undefined =>
    i >= 0 && i < text.length ? text.charCodeAt(i) : undefined
  const separators = new Set([32, 45, 95, 47, 46])
  let sum = 0
  let matched = 0
  let previous = -2
  let first = -1
  let last = -1
  for (let c = 0; c < lower.length; c += 1) {
    if (matched >= query.length) break
    if (lower.charCodeAt(c) !== query.charCodeAt(matched)) continue
    if (first < 0) first = c
    const before = unit(c - 1)
    const boundary = c === 0 || (before != null && separators.has(before))
    const here = unit(c)
    const camel =
      before != null &&
      before >= 97 &&
      before <= 122 &&
      here != null &&
      here >= 65 &&
      here <= 90
    let points = 1
    if (boundary || camel) points += 4
    if (previous === c - 1) points += 3
    sum += points
    previous = c
    last = c
    matched += 1
  }
  if (matched < query.length || last - first + 1 > query.length * 3)
    return undefined
  return sum - first * 0.1 - lower.length * 0.02
}

function entryScore(entry: PluginEntry, q: string): number | undefined {
  const fields: [string, number][] = [
    [entry.displayName, 1],
    [entry.description, 0.5],
    [entry.category, 0.4],
    [(entry.skills ?? []).map((skill) => skill.name).join(' '), 0.45],
    [entry.marketplace?.displayName ?? '', 0.4],
  ]
  let best: number | undefined
  for (const [words, weight] of fields) {
    const found = fuzzyScore(words, q)
    if (found == null) continue
    const weighted = found * weight
    if (best == null || weighted > best) best = weighted
  }
  return best
}

/** Available's list (`Pl`): A to Z with no query; else the entries the query finds, best first. */
export function searchCatalog(
  catalog: readonly PluginEntry[],
  query: string,
): PluginEntry[] {
  const q = query.trim().toLowerCase()
  const searching = q !== ''
  const rows: {
    entry: PluginEntry
    key: string
    score: number
    index: number
  }[] = []
  catalog.forEach((entry, index) => {
    const found = searching ? entryScore(entry, q) : 0
    if (found != null)
      rows.push({
        entry,
        key: entry.displayName.toLowerCase(),
        score: found,
        index,
      })
  })
  rows.sort((a, b) => {
    if (searching && a.score !== b.score) return b.score - a.score
    return ordered(a.key, b.key) || a.index - b.index
  })
  return rows.map((row) => row.entry)
}

/** Yours' servers (`Tl`): all with no query; else those the query finds in the name, address, command or identifier, best first. */
export function searchServers(
  servers: readonly PluginServer[],
  query: string,
): PluginServer[] {
  const q = query.trim().toLowerCase()
  if (q === '') return [...servers]
  const rows: { server: PluginServer; score: number; index: number }[] = []
  servers.forEach((server, index) => {
    const scores: number[] = []
    const byName = fuzzyScore(server.name, q)
    if (byName != null) scores.push(byName)
    if (server.url != null) {
      const found = fuzzyScore(server.url, q)
      if (found != null) scores.push(found * 0.3)
    }
    if (server.command != null) {
      const found = fuzzyScore(server.command, q)
      if (found != null) scores.push(found * 0.3)
    }
    const byIdentifier = fuzzyScore(server.serverIdentifier, q)
    if (byIdentifier != null) scores.push(byIdentifier * 0.4)
    if (scores.length > 0)
      rows.push({ server, score: Math.max(...scores), index })
  })
  rows.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score
    return ordered(a.server.name, b.server.name) || a.index - b.index
  })
  return rows.map((row) => row.server)
}

/** One of Available's sections: its key, its name, its apps. */
export interface PluginSection {
  key: string
  title: string
  items: PluginEntry[]
}

/** The section that goes first. */
export const featuredSection = 'Featured'

/** Available's sections with no query (`ql`): by publisher, marketplace or category; Featured first, the rest A to Z, people's own publishers last. */
export function pluginSections(
  entries: readonly PluginEntry[],
): PluginSection[] {
  const plain: PluginSection[] = []
  const publishers: PluginSection[] = []
  for (const entry of entries) {
    let key: string
    let title: string
    let mine: boolean
    const publisher = entry.publisher
    if (publisher?.isUserOwned && entry.marketplace != null) {
      key = `publisher:${publisher.name}`
      title = publisher.displayName
      mine = true
    } else if (entry.marketplace != null) {
      key = `marketplace:${entry.marketplace.name}`
      title = entry.marketplace.displayName
      mine = false
    } else {
      key = `category:${entry.category}`
      title = entry.category
      mine = false
    }
    const list = mine ? publishers : plain
    const found = list.find((section) => section.key === key)
    if (found) found.items.push(entry)
    else list.push({ key, title, items: [entry] })
  }
  const sorted = (list: PluginSection[], featuredFirst: boolean) =>
    list
      .map((section, offset) => ({ section, offset }))
      .sort((a, b) => {
        const x = a.section.title
        const y = b.section.title
        if (x === y) return a.offset - b.offset
        if (featuredFirst && x === featuredSection) return -1
        if (featuredFirst && y === featuredSection) return 1
        return ordered(x, y) || a.offset - b.offset
      })
      .map(({ section }) => section)
  return [...sorted(plain, true), ...sorted(publishers, false)]
}

/** `Jn`: everything when shown in full or when one more would be all; else the first `limit` and how many are hidden. */
export function collapse<T>(
  items: readonly T[],
  expanded: boolean,
  limit: number,
): { visible: T[]; hidden: number } {
  return expanded || items.length <= limit + 1
    ? { visible: [...items], hidden: 0 }
    : { visible: items.slice(0, limit), hidden: items.length - limit }
}

export const marketplaceLimit = 4
export const installedLimit = 6

// MARK: Servers, entries and what is added

/** The computer's servers, one row a server (`js`): the default account's row where there are several. */
export function onePerServer(servers: readonly PluginServer[]): PluginServer[] {
  const order: string[] = []
  const rows = new Map<string, PluginServer>()
  for (const server of servers) {
    const kept = rows.get(server.id)
    if (kept) {
      if (
        kept.accountKey !== defaultAccount &&
        server.accountKey === defaultAccount
      )
        rows.set(server.id, server)
    } else {
      order.push(server.id)
      rows.set(server.id, server)
    }
  }
  return order.map((id) => rows.get(id)!)
}

/** A server's accounts, the default first (`sd`). */
export function serverAccounts(
  servers: readonly PluginServer[],
  id: string,
): PluginServer[] {
  return servers
    .filter((server) => server.id === id)
    .map((server, offset) => ({ server, offset }))
    .sort((a, b) => {
      const x = a.server.accountKey === defaultAccount ? 0 : 1
      const y = b.server.accountKey === defaultAccount ? 0 : 1
      return x === y ? a.offset - b.offset : x - y
    })
    .map(({ server }) => server)
}

/** Servers by lower-cased name, a person's own over the team's (`Ss`). */
export function serversByName(
  servers: readonly PluginServer[],
): Map<string, PluginServer> {
  const map = new Map<string, PluginServer>()
  for (const server of servers)
    if (server.isTeamServer) map.set(server.name.toLowerCase(), server)
  for (const server of servers)
    if (!server.isTeamServer) map.set(server.name.toLowerCase(), server)
  return map
}

/** The catalogue entry a server belongs to (`Ue`): by its plugin, else by name. */
export function entryForServer(
  server: PluginServer,
  catalog: readonly PluginEntry[],
): PluginEntry | undefined {
  if (server.pluginId != null) {
    const found = catalog.find((entry) => entry.id === server.pluginId)
    if (found) return found
  }
  const key = server.name.toLowerCase()
  return catalog.find(
    (entry) =>
      entry.name.toLowerCase() === key ||
      entry.displayName.toLowerCase() === key,
  )
}

/** Whether an entry shows Added, and why (`Plugins.Installed`). */
export interface InstalledState {
  isInstalled: boolean
  plugin?: EffectivePlugin
  server?: PluginServer
}

/** Whether an entry shows Added (`et`): its plugin is on, or a server of it is there (even one still to sign in). */
export function installedState(
  entry: PluginEntry,
  servers: readonly PluginServer[],
  byName: ReadonlyMap<string, PluginServer>,
  plugins: ReadonlyMap<string, EffectivePlugin>,
): InstalledState {
  const named =
    byName.get(entry.name.toLowerCase()) ??
    byName.get(entry.displayName.toLowerCase())
  const plugin = plugins.get(entry.id)
  if (plugin && !plugin.isEnabled) return { isInstalled: false }
  const team = named?.isTeamServer === true ? named : undefined
  const server = servers.find((one) => one.pluginId === entry.id) ?? team
  return { isInstalled: plugin != null || server != null, plugin, server }
}

/** The plugins by their id, the last of each kept (as Swift's dictionary of them). */
export function pluginsById(
  plugins: readonly EffectivePlugin[],
): Map<string, EffectivePlugin> {
  return new Map(plugins.map((plugin) => [plugin.pluginId, plugin]))
}

/** Yours › Installed (`rt`). */
export function pluginItems(
  servers: readonly PluginServer[],
  catalog: readonly PluginEntry[],
  plugins: readonly EffectivePlugin[],
): PluginItem[] {
  const byPlugin = new Map<string, EffectivePlugin>()
  const pluginOrder: string[] = []
  for (const plugin of plugins) {
    if (!byPlugin.has(plugin.pluginId)) pluginOrder.push(plugin.pluginId)
    byPlugin.set(plugin.pluginId, plugin)
  }
  const list: PluginItem[] = []
  const placed = new Map<string, number>()
  for (const server of servers) {
    const entry = entryForServer(server, catalog)
    const plugin = entry ? byPlugin.get(entry.id) : undefined
    if (
      !entry ||
      !(server.pluginId === entry.id || server.isTeamServer) ||
      plugin?.isEnabled === false
    ) {
      list.push({
        kind: 'connector',
        server,
        installMode: serverInstallMode(server),
      })
      continue
    }
    const index = placed.get(entry.id)
    const there = index != null ? list[index] : undefined
    if (index == null || there?.kind !== 'plugin') {
      placed.set(entry.id, list.length)
      list.push({
        kind: 'plugin',
        entry,
        installMode: plugin?.installMode ?? serverInstallMode(server),
        connectors: [server],
      })
      continue
    }
    const next = server.isTeamServer
      ? [...there.connectors, server]
      : [server, ...there.connectors]
    list[index] = {
      kind: 'plugin',
      entry,
      installMode:
        plugin != null || server.isTeamServer ? there.installMode : 'user',
      connectors: next,
    }
  }
  for (const id of pluginOrder) {
    const plugin = byPlugin.get(id)
    if (!plugin || !plugin.isEnabled || placed.has(id)) continue
    const entry = catalog.find((one) => one.id === id)
    if (!entry) continue
    list.push({
      kind: 'plugin',
      entry,
      installMode: plugin.installMode,
      connectors: [],
    })
  }
  return list
}

/** A skills-only plugin stays in a search only when its name holds the query (`ui`). */
export function itemKeptByQuery(item: PluginItem, query: string): boolean {
  if (item.kind !== 'plugin' || item.connectors.length > 0) return true
  const q = query.toLowerCase()
  return (
    q === '' ||
    item.entry.displayName.toLowerCase().includes(q) ||
    item.entry.name.toLowerCase().includes(q)
  )
}

// MARK: The filter (`nt`, `Ul`, `Hl`, `fi`)

function passesKind(
  connectors: number,
  skills: number | undefined,
  kind: PluginFilterKind,
): boolean {
  switch (kind) {
    case 'all':
      return true
    case 'connectors':
      return connectors > 0
    case 'skills':
      return (skills ?? 0) > 0
  }
}

function passesOwner(owner: string, ownership: PluginFilterOwnership): boolean {
  return ownership === 'all' || owner === ownership
}

function entryOwner(entry: PluginEntry): string {
  if (!entry.marketplace) return 'public'
  return entry.marketplace.ownership === 'team' ? 'team' : 'neither'
}

/** Whether the filter keeps an entry (`nt`); `owner` forced for a team's install. */
export function entryKept(
  entry: PluginEntry,
  filter: PluginFilter,
  owner?: string,
): boolean {
  return (
    passesKind(
      connectorList(entry).length,
      entry.skills?.length,
      filter.type,
    ) && passesOwner(owner ?? entryOwner(entry), filter.ownership)
  )
}

/** Whether the filter keeps a row of Installed (`Ul`). */
export function itemKept(item: PluginItem, filter: PluginFilter): boolean {
  const team = item.installMode !== 'user'
  if (item.kind === 'connector')
    return (
      passesKind(1, undefined, filter.type) &&
      passesOwner(
        team || item.server.isTeamServer ? 'team' : 'neither',
        filter.ownership,
      )
    )
  return entryKept(item.entry, filter, team ? 'team' : undefined)
}

/** Whether the filter keeps a skill (`Hl`). */
export function skillKept(skill: AgentSkill, filter: PluginFilter): boolean {
  return (
    passesKind(0, 1, filter.type) &&
    passesOwner(
      skill.source === 'plugin' ? 'team' : 'neither',
      filter.ownership,
    )
  )
}

/** Yours › Private (`Ml`): the agent's own skills and the ones I published, by name. */
export function privateSkills(skills: readonly AgentSkill[]): AgentSkill[] {
  return skills
    .filter(isPrivateSkill)
    .map((skill, offset) => ({ skill, offset }))
    .sort(
      (a, b) =>
        a.skill.name.localeCompare(b.skill.name, 'en-US', {
          sensitivity: 'base',
        }) || a.offset - b.offset,
    )
    .map(({ skill }) => skill)
}

// MARK: Words

/** "1 connector", "2 skills" (`us`). */
export function countWord(n: number, noun: string): string {
  switch (noun) {
    case 'connector':
      return n === 1 ? t('1 connector') : t`${n} connectors`
    case 'skill':
      return n === 1 ? t('1 skill') : t`${n} skills`
    default:
      return `${n} ${n === 1 ? noun : `${noun}s`}`
  }
}

/** A row's line (`tt`): its connectors and skills, or "no supported contributions". */
export function contributions(connectors: number, skills?: number): string {
  const parts: string[] = []
  if (connectors > 0) parts.push(countWord(connectors, 'connector'))
  if (skills != null && skills > 0) parts.push(countWord(skills, 'skill'))
  return parts.length === 0
    ? t('no supported contributions')
    : parts.join(' · ')
}

/** A plugin row's line (`tt`). */
export function entryContributions(entry: PluginEntry): string {
  return contributions(connectorList(entry).length, entry.skills?.length)
}

/** A connector row's line (`Wl`): its entry's counts, else "1 connector". */
export function serverContributions(
  server: PluginServer,
  catalog: readonly PluginEntry[],
): string {
  const entry = entryForServer(server, catalog)
  return entry ? entryContributions(entry) : contributions(1)
}

/** The status pill's word (`LBn`). */
export function statusWord(status: string): string {
  switch (status) {
    case 'connected':
      return t('Connected')
    case 'needsAuth':
      return t('Needs auth')
    case 'error':
      return t('Error')
    case 'initializing':
      return t('Starting')
    case 'disconnected':
      return t('Disconnected')
    case 'disabledByTeamAdminPolicy':
      return t('Disabled by team admin')
    default:
      return status
  }
}

/** The tools' names (`Gl`): its title, else the name without the prefix all share, its separators as spaces, a capital first. */
export function toolNames(
  tools: readonly PluginTool[],
): Record<string, string> {
  const prefix = sharedPrefix(tools.map((tool) => tool.name))
  const map: Record<string, string> = {}
  for (const tool of tools)
    map[tool.name] = tool.title ?? humanised(tool.name.slice(prefix.length))
  return map
}

/** The start all the names share, up to its last "-", "_" or ".", when each is longer than it. */
export function sharedPrefix(names: readonly string[]): string {
  if (names.length < 2) return ''
  const head = names[0]!
  let length = 0
  while (
    length < head.length &&
    names.every(
      (name) =>
        length < name.length &&
        name.charCodeAt(length) === head.charCodeAt(length),
    )
  )
    length += 1
  const shared = head.slice(0, length)
  const cut = Math.max(
    shared.lastIndexOf('-'),
    shared.lastIndexOf('_'),
    shared.lastIndexOf('.'),
  )
  if (cut < 0) return ''
  const prefix = shared.slice(0, cut + 1)
  return names.every((name) => name.length > prefix.length) ? prefix : ''
}

/** A name with its separators as spaces and a capital first. */
export function humanised(name: string): string {
  const spaced = name.replace(/[-_.]+/g, ' ').trim()
  if (spaced === '') return name
  const first = [...spaced][0]!
  return first.toUpperCase() + spaced.slice(first.length)
}

/** An account's name (`vi`, `P5n`): "Default", else its key without quotes and brackets, 64 characters at most. */
export function accountLabel(key: string): string {
  if (key === defaultAccount) return t('Default')
  const stripped = key.replace(/["'`\\[\]{}()<>]/g, '')
  return stripped.replace(/\s+/g, ' ').trim().slice(0, 64)
}

/** The GitHub banner's line (`ni`). */
export function authBlockedLine(names: readonly string[]): string {
  const named = names.filter((name) => name !== '')
  if (named.length === 0 || named.length > 3) {
    return names.length === 1
      ? t(
          "1 installed plugin can't be fetched until Simeon's computer can read their source repository.",
        )
      : t`${names.length} installed plugins can't be fetched until Simeon's computer can read their source repository.`
  }
  const list = named.join(', ')
  return named.length === 1
    ? t`${list} is installed, but their content can't be fetched until Simeon's computer can read the source repository.`
    : t`${list} are installed, but their content can't be fetched until Simeon's computer can read the source repository.`
}

/** "Copy link"'s address (`Ll`), with `URLSearchParams`' own encoding. */
export function shareLink(pluginId: string): string {
  return `https://simeonlabs.com/?${new URLSearchParams({ pluginId })}`
}

// MARK: Notices (`_l`, `An`, `Tn`)

/** What the notice at the panel's foot says (`Plugins.Notice`). */
export interface Notice {
  isError: boolean
  text: string
}

/** How long it stays: 3.5 s, or 6 s for a failure. */
export function noticeSeconds(notice: Notice): number {
  return notice.isError ? 6 : 3.5
}

export function signInNotice(status: string, message?: string): Notice {
  switch (status) {
    case 'already-authenticated':
      return { isError: false, text: t('Already authenticated') }
    case 'not-configured':
      return { isError: true, text: t('Server is not configured') }
    case 'not-supported':
      return { isError: true, text: message ?? '' }
    case 'unreachable':
      return {
        isError: true,
        text: t`Couldn't start sign-in: ${message ?? ''}`,
      }
    case 'started':
      return {
        isError: false,
        text: t(
          'Opened the OAuth flow in your browser. Return here once it completes.',
        ),
      }
    default:
      return { isError: true, text: message ?? status }
  }
}

export function addedNotice(
  name: string,
  added: number,
  failed: readonly string[],
  error?: string,
): Notice {
  if (error != null || failed.length > 0) {
    const why = error ?? t`couldn't add ${failed.join(', ')}`
    return {
      isError: true,
      text: t`Added ${name}, but not all of its skills: ${why}.`,
    }
  }
  if (added <= 0) return { isError: false, text: t`Added ${name}` }
  return {
    isError: false,
    text:
      added === 1
        ? t`Added ${name} and 1 skill`
        : t`Added ${name} and ${added} skills`,
  }
}

export function skillsAddedNotice(name: string, added: number): Notice {
  return {
    isError: false,
    text:
      added === 0
        ? t`Added ${name}`
        : added === 1
          ? t`Added 1 skill from ${name}`
          : t`Added ${added} skills from ${name}`,
  }
}

export function removedNotice(
  name: string,
  removed: boolean,
  reason?: string,
): Notice {
  if (removed) return { isError: false, text: t`Removed ${name}` }
  if (reason === 'team-server')
    return {
      isError: true,
      text: t`${name} is provided by your team and can't be removed here`,
    }
  return {
    isError: true,
    text: t`Couldn't remove ${name}. It may be managed elsewhere. Reopen settings and try again.`,
  }
}

// MARK: Connecting's words the list says (Connecting.swift; step 6b ports the rest)

/** The button of an app that isn't connected (`Connecting.connect`). */
export function connectWord(): string {
  return t('Connect')
}

/** Once connected: the app, and the skills it brought (`Connecting.connectedNotice`). */
export function connectedNotice(
  name: string,
  skills: number,
  error?: string,
): Notice {
  if (error != null)
    return {
      isError: true,
      text: t`Connected ${name}, but its skills didn't sync: ${error}`,
    }
  if (skills === 1)
    return { isError: false, text: t`Connected ${name} and 1 skill` }
  return {
    isError: false,
    text:
      skills > 0
        ? t`Connected ${name} and ${skills} skills`
        : t`Connected ${name}`,
  }
}

/** The sign-in closed before the app was connected (`Connecting.notConnectedNotice`). */
export function notConnectedNotice(name: string): Notice {
  return { isError: false, text: t`${name} wasn't connected` }
}

/** The sign-in closed on the maker's page before the computer said so (`Connecting.stillConnectingNotice`). */
export function stillConnectingNotice(name: string): Notice {
  return { isError: false, text: t`Finishing ${name}'s sign-in…` }
}

/** What a sign-in that never opened says (`Connecting.didntConnect`). */
export function didntConnect(name: string, why?: string): string {
  if (why == null || why === '') return t`${name} didn't connect. Try again.`
  return t`${name} didn't connect: ${why}`
}

// MARK: Fix with agent (`Ql`, `Xl`, `Zl`)

/** "Plugin Setup", the agent Fix with agent makes, and what it is first told. */
export const setupAgentName = 'Plugin Setup'
export const setupAgentPurpose = 'plugin-auth'
export const setupAgentDescription =
  "Sets up git credentials on Simeon's computer so installed plugins can be fetched."
export const setupAgentRequest = [
  "Some of my installed plugins can't be fetched.",
  'Their content lives in a private git repository, and your computer — the machine Shell and Read act on, not mine — has no credentials to read it.',
  'Set that up on your computer: run `gh auth login` there, then `gh auth setup-git` so git itself uses the credential.',
  'When a step needs me (a device code, a password, 2FA, an OAuth approval), hand your computer over with request_box_help instead of guessing.',
  "Then verify with a read-only `git ls-remote` against one of those plugin repositories and tell me whether it worked. Don't change my repositories or any other credentials.",
].join(' ')
