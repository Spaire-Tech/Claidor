// Step 3c's cards as SimeonCore reads them, with the words each says:
// - apps an agent needs connected (Chat.swift's `.connectors`; Store.swift's
//   `CatalogApp`, `catalogApp`, `isConnected`, `isComingSoon`; Plugins.swift's
//   `AppsComingSoon`; Connecting.swift's words; ConnectorIcons.swift and the
//   Mac's `AppLogoTile` for its icon);
// - Slack or GitHub for a routine (`.listenerConnect`);
// - a cloud agent the agent started (`.cloudAgent`, `CloudAgentInfo`);
// - a new teammate joined (JoinedCard.swift, `AgentFaces.standing`,
//   Colour.swift's blend).
//
// The pictures are the apps' own files, read where the Mac's come from: the
// app icons from desktop/brand/app-icons (the source of the iPhone's and the
// Mac's `AppIcons`), the faces standing on their own from the shared core's
// own copy (Resources/Faces/Standing), and the list of the connectors with
// an icon from the core's own GeneratedAppIcons.swift.

import iconListSource from '../../../../../ios/SimeonCore/Sources/SimeonCore/GeneratedAppIcons.swift?raw'
import { chatGPT, claude, providerName } from './aiModels'
import type { ConnectedApp } from './connectedApps'
import type { Entry } from './entry'
import { type AgentFace, faceById, faceByVersion } from './faces'
import { brandLogos, brandMentions } from './generatedBrands'
import {
  arr,
  bool,
  field,
  int,
  isObject,
  type JSONValue,
  num,
  str,
  text,
} from './json'
import { t } from './l10n'
import { type Agent, hasPicture } from './models'

// MARK: Apps to connect

/** `connectors` (several apps, none connected yet) or `connector` (one, with the agent's reason, or "connected"). */
export interface ConnectorsCard {
  names: string[]
  /** The agent wrote it once the app was connected (`variant: "connected"`). */
  connected: boolean
  reason?: string
}

export function connectorsCard(entry: Entry): ConnectorsCard | undefined {
  const message = entry.message
  switch (str(field(message, 'type'))) {
    case 'connectors': {
      const names = (arr(field(message, 'connectors')) ?? [])
        .map(text)
        .filter((name): name is string => name != null)
      return names.length === 0 ? undefined : { names, connected: false }
    }
    case 'connector': {
      const name = text(field(message, 'connector'))
      if (name == null) return undefined
      return {
        names: [name],
        connected: str(field(message, 'variant')) === 'connected',
        reason: text(field(message, 'reason')),
      }
    }
    default:
      return undefined
  }
}

/** One app the catalogue offers (`CatalogApp`, from the computer's `getCatalog`). */
export interface CatalogApp {
  id: string
  name: string
  title: string
  summary: string
  category: string
  comingSoon: boolean
  /** The app's own server, when it serves itself (`vendorMcpUrl`). */
  serverURL?: string
  /** The name Simeon Labs' server knows it by, when the catalogue gives one (`composioToolkit`). */
  composioToolkit?: string
}

export function catalogAppFrom(json: unknown): CatalogApp | undefined {
  const id = text(field(json, 'id')) ?? text(field(json, 'pluginId'))
  if (id == null) return undefined
  return {
    id,
    name: str(field(json, 'name')) ?? id,
    title: text(field(json, 'displayName')) ?? text(field(json, 'name')) ?? id,
    summary: str(field(json, 'description')) ?? '',
    category: str(field(json, 'category')) ?? '',
    comingSoon: bool(field(json, 'comingSoon')) ?? false,
    serverURL: text(field(json, 'vendorMcpUrl')),
    composioToolkit: text(field(json, 'composioToolkit')),
  }
}

/** A `getCatalog` answer's apps: a list, or one under `plugins`. */
export function catalogFrom(answer: unknown): CatalogApp[] {
  return (arr(answer) ?? arr(field(answer, 'plugins')) ?? [])
    .map(catalogAppFrom)
    .filter((app): app is CatalogApp => app != null)
}

/** The app a card names ("Gmail"): by its title, its name or its id, in any case. */
export function catalogApp(
  catalog: readonly CatalogApp[],
  name: string,
): CatalogApp | undefined {
  const key = name.toLowerCase()
  return catalog.find(
    (app) =>
      app.title.toLowerCase() === key ||
      app.name.toLowerCase() === key ||
      app.id.toLowerCase() === key,
  )
}

/** Whether an app a card names is connected: by its name, or by the catalogue's id the computer filed it under. */
export function isConnected(
  apps: readonly ConnectedApp[],
  catalog: readonly CatalogApp[],
  name: string,
): boolean {
  const key = name.toLowerCase()
  const plugin = catalogApp(catalog, name)?.id
  return apps.some(
    (app) =>
      app.status === 'connected' &&
      (app.name.toLowerCase() === key ||
        (app.pluginId != null && app.pluginId === plugin)),
  )
}

/** How many tools a connected app brings: its row's, found by its name alone, as the Mac's card finds it. */
export function connectedToolCount(
  apps: readonly ConnectedApp[],
  name: string,
): number {
  const key = name.toLowerCase()
  return (
    apps.find(
      (app) => app.name.toLowerCase() === key && app.status === 'connected',
    )?.toolCount ?? 0
  )
}

/** The catalogue's word for an app's slug (`CatalogApp.slug`): lower case, a dot a dash, its letters and digits in runs joined by dashes. */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .replaceAll('.', '-')
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean)
    .join('-')
}

// MARK: Apps that can't be connected yet (AppsComingSoon)

/** The apps whose sign-in needs Simeon Labs' own app with that company, until the server says otherwise. */
export const appsComingSoonBuiltIn: readonly string[] = [
  'gusto',
  'xero',
  'shopify',
  'brex',
  'pipedrive',
  'docusign',
  'onenote',
  'microsoft_todo',
  'metaads',
  'jobber',
  'bamboohr',
  'tiktok',
  'follow_up_boss',
  'matterport',
  'zoominfo',
  'clio_manage',
]

/** A name as the list matches it: its letters and digits alone, so "microsoft_todo" names "microsoft-to-do". */
export function comingSoonKey(name: string): string {
  return [...name.toLowerCase()]
    .filter((one) => /[\p{L}\p{M}\p{N}]/u.test(one))
    .join('')
}

/** Whether a list names an app, by its id, its name or its title. */
export function comingSoonNames(list: Iterable<string>, app: string): boolean {
  const wanted = comingSoonKey(app)
  if (wanted === '') return false
  for (const one of list) if (comingSoonKey(one) === wanted) return true
  return false
}

/** The server's list (`GET /desktop/api/apps`), when its answer has one; an older server's has none. */
export function comingSoonFrom(answer: unknown): Set<string> | undefined {
  const list = arr(field(answer, 'comingSoon'))
  if (list == null) return undefined
  return new Set(
    list
      .map(str)
      .filter((one): one is string => one != null)
      .map((one) => one.toLowerCase()),
  )
}

/** Whether an app can't be connected yet: the list names it, or the catalogue says so (or names it by its id or Simeon Labs' name for it). */
export function isComingSoon(
  list: Iterable<string>,
  catalog: readonly CatalogApp[],
  name: string,
): boolean {
  const names = [...list]
  if (comingSoonNames(names, name)) return true
  const found = catalogApp(catalog, name)
  if (!found) return false
  return (
    found.comingSoon ||
    comingSoonNames(names, found.id) ||
    (found.composioToolkit != null &&
      comingSoonNames(names, found.composioToolkit))
  )
}

/** What a connected app says in place of its button (`Connecting.connected`). */
export function connectedWord(): string {
  return t('Connected')
}

/** What an app that can't be connected yet says in place of its button (`AppsComingSoon.label`). */
export function comingSoonWord(): string {
  return t('Coming soon')
}

// MARK: The apps' icons (ConnectorIcons, the Mac's AppLogoTile)

/** Every connector with its app icon, the catalogue's id and name in its order: GeneratedAppIcons.swift, read as it is. */
export const iconConnectors: readonly (readonly [string, string])[] = [
  ...iconListSource.matchAll(/^\s*\("([^"]*)", "([^"]*)"\),?\s*$/gm),
].map((match) => [match[1]!, match[2]!] as const)

/** Names an app goes by besides its catalogue title. */
const iconAliases: Record<string, string> = {
  facebook: 'facebook',
  'meta business suite': 'facebook',
  monday: 'monday',
  excel: 'microsoft-excel',
  'microsoft excel': 'microsoft-excel',
  'capsule crm': 'capsule-crm',
  'microsoft outlook': 'outlook',
  'microsoft onedrive': 'onedrive',
  teams: 'microsoft-teams',
  'microsoft sharepoint': 'sharepoint',
  'microsoft onenote': 'onenote',
  'to do': 'microsoft-to-do',
  'search console': 'google-search-console',
  tiktok: 'tiktok-ads',
  convertkit: 'kit',
  'zoom workplace': 'zoom',
  'intuit quickbooks': 'quickbooks',
  'quickbooks online': 'quickbooks',
  atlassian: 'jira',
  confluence: 'jira',
  'apollo.io': 'apollo',
  'link by stripe': 'link',
}

const iconByName: Map<string, string> = (() => {
  const names = new Map<string, string>()
  for (const [id, name] of iconConnectors) {
    names.set(id, id)
    names.set(name.toLowerCase(), id)
    names.set(slug(name), id)
  }
  for (const [alias, id] of Object.entries(iconAliases))
    if (!names.has(alias)) names.set(alias, id)
  return names
})()

/** The connector's id, from its id, its title or another of its names; none for an app that is not a connector (`ConnectorIcons.id`). */
export function connectorIconId(name: string): string | undefined {
  const key = name.trim().toLowerCase()
  if (key === '') return undefined
  return iconByName.get(key) ?? iconByName.get(slug(key))
}

const appIconFiles = import.meta.glob<string>(
  '../../../../../desktop/brand/app-icons/*.png',
  { eager: true, query: '?url', import: 'default' },
)
const appIconById = new Map(
  Object.entries(appIconFiles).map(([path, url]) => [
    path.slice(path.lastIndexOf('/') + 1, -'.png'.length),
    url,
  ]),
)

/** The app icon's address for a connector's id, as the built app serves it. */
export function appIconURL(id: string): string | undefined {
  return appIconById.get(id)
}

/** ChatGPT's, Claude's and Grok's app icons (the Mac's `Providers/<provider>`; Grok's from grok.com's own), by the provider's slug. */
const providerIcons: Record<string, string> = {
  chatgpt: new URL('../assets/providers/chatgpt.png', import.meta.url).href,
  claude: new URL('../assets/providers/claude.png', import.meta.url).href,
  grok: new URL('../assets/providers/grok.png', import.meta.url).href,
}

/** The API key providers' tiles (10 November 2026; NOTICE: LobeHub's marks on each brand's ground), by the provider's slug (`key_providers.PROVIDERS`). */
const keyProviderIcons = import.meta.glob<string>('../assets/providers/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** A provider's own tile by its slug (`chatgpt`, `deepseek`…): the Mac's `Providers/<provider>`; none for one the app doesn't know. */
export function providerIconURL(provider: string): string | undefined {
  if (!/^[a-z0-9]+$/.test(provider)) return undefined
  return (
    providerIcons[provider] ??
    keyProviderIcons[`../assets/providers/${provider}.png`]
  )
}

export type AppLogo =
  | { kind: 'icon'; url: string }
  /** `mono`: a one-colour logo, which the Mac draws as a template, in the words' colour. */
  | { kind: 'logo'; url: string; mono: boolean }
  | { kind: 'letter'; letter: string }

/**
 * What an app's tile shows (`AppLogoTile`): its own app icon, whole; else
 * the brand's logo on the grey tile (`Brands/<key>`); else its first letter.
 * (The Mac also tries its `Connectors/<slug>` logos between the two; they
 * are the same 232 connectors the icons are, so a name that would find one
 * finds its icon first.)
 */
export function appLogo(name: string, id?: string): AppLogo {
  const key =
    (id != null ? connectorIconId(id) : undefined) ?? connectorIconId(name)
  const icon = key != null ? appIconURL(key) : providerIcons[slug(name)]
  if (icon) return { kind: 'icon', url: icon }
  const lower = name.toLowerCase()
  const brand = brandMentions.find((one) => one.name.toLowerCase() === lower)
  const logo = brand ? brandLogos[brand.key] : undefined
  if (brand && logo) return { kind: 'logo', url: logo, mono: brand.mono }
  return { kind: 'letter', letter: firstLetter(name).toUpperCase() }
}

/** The first character as a person reads it (`String.prefix(1)`). */
function firstLetter(name: string): string {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const first = new Intl.Segmenter().segment(name)[Symbol.iterator]().next()
    return first.done ? '' : first.value.segment
  }
  return [...name][0] ?? ''
}

// MARK: Slack or GitHub for a routine

export type ListenerPlatform = 'slack' | 'github'

/** "Connect Slack so this routine can fire" (`listener-connect`): the platform, and the agent's reason when it gave one. */
export interface ListenerCard {
  platform: ListenerPlatform
  reason?: string
}

export function listenerCard(entry: Entry): ListenerCard | undefined {
  const message = entry.message
  if (str(field(message, 'type')) !== 'listener-connect') return undefined
  const platform = text(field(message, 'platform'))
  if (platform !== 'slack' && platform !== 'github') return undefined
  return { platform, reason: text(field(message, 'reason')) }
}

/** Whether the platform is linked for routines to wake on, from `getListenerIntegrations`: false when it isn't listed. */
export function listenerConnectedIn(
  answer: unknown,
  platform: ListenerPlatform,
): boolean {
  const row = (arr(field(answer, 'integrations')) ?? []).find(
    (one) => str(field(one, 'platform')) === platform,
  )
  return bool(field(row, 'isConnected')) ?? false
}

// MARK: Cloud agents (CloudAgentInfo)

/** A cloud agent the agent started (`cloud-agent`): its id, its state read from the computer. */
export function cloudAgentCard(entry: Entry): { bcId: string } | undefined {
  const message = entry.message
  if (str(field(message, 'type')) !== 'cloud-agent') return undefined
  const bcId = text(field(message, 'bcId'))
  return bcId != null ? { bcId } : undefined
}

/** `paused`: the person's Claude plan reached its limit (11 November 2026); a reply carries on once it resets. */
export type CloudAgentStatus =
  | 'creating'
  | 'running'
  | 'finished'
  | 'error'
  | 'expired'
  | 'paused'
  | 'unknown'

const statuses: CloudAgentStatus[] = [
  'creating',
  'running',
  'finished',
  'error',
  'expired',
  'paused',
  'unknown',
]

/** A cloud agent's state, as `getCloudAgentInfo` answers. */
export interface CloudAgentInfo {
  name: string
  prompt: string
  status: CloudAgentStatus
  branch: string
  pullRequestURL: string
  pullRequestState: string
  pullRequestNumber?: number
  filesChanged: number
  linesAdded: number
  linesRemoved: number
  /** The program that codes for it, as the computer names it (`coder`: "claude-code", "codex"); empty from a computer that doesn't say. */
  coder: string
}

export function cloudAgentInfo(json: unknown): CloudAgentInfo | undefined {
  if (!isObject(json)) return undefined
  const words = (key: string) => text(field(json, key))?.trim() ?? ''
  const status = words('status') as CloudAgentStatus
  const number = int(field(json, 'prNumber'))
  return {
    name: words('name'),
    prompt: words('prompt'),
    status: statuses.includes(status) ? status : 'unknown',
    branch: words('branchName'),
    pullRequestURL: words('prUrl'),
    pullRequestState: words('prState'),
    pullRequestNumber: number != null && number > 0 ? number : undefined,
    filesChanged: int(field(json, 'filesChanged')) ?? 0,
    linesAdded: int(field(json, 'linesAdded')) ?? 0,
    linesRemoved: int(field(json, 'linesRemoved')) ?? 0,
    coder: words('coder'),
  }
}

/** The card when nothing could be read and nothing is coming: "Cloud agent", "Status unavailable". */
export const unavailableCloudAgent: CloudAgentInfo = cloudAgentInfo({})!

/** The badge: "Creating", "Running", "Done", "Failed" ("Error" until 13 November 2026), "Expired", "Paused", "Status unavailable". */
export function cloudAgentStatusLabel(info: CloudAgentInfo): string {
  switch (info.status) {
    case 'creating':
      return t('Creating')
    case 'running':
      return t('Running')
    case 'finished':
      return t('Done')
    case 'error':
      return t('Failed')
    case 'expired':
      return t('Expired')
    case 'paused':
      return t('Paused')
    case 'unknown':
      return t('Status unavailable')
  }
}

/** Not finished, failed or expired: the card asks again. */
export function cloudAgentIsLive(info: CloudAgentInfo): boolean {
  return (
    info.status === 'creating' ||
    info.status === 'running' ||
    info.status === 'unknown'
  )
}

/** The pull request's state as told, else "unknown" with an address and "none" without. */
export function cloudAgentPullState(info: CloudAgentInfo): string {
  if (info.pullRequestState !== '') return info.pullRequestState
  return info.pullRequestURL === '' ? 'none' : 'unknown'
}

/** "3 files changed"; none when nothing changed. */
export function cloudAgentChangedLabel(
  info: CloudAgentInfo,
): string | undefined {
  if (info.filesChanged <= 0) return undefined
  return info.filesChanged === 1
    ? t('1 file changed')
    : t`${info.filesChanged} files changed`
}

/** What one read of `getCloudAgentInfo` gave: the state, nothing (final), or that it couldn't be asked. */
export type CloudAgentRead =
  | { kind: 'info'; info: CloudAgentInfo }
  | { kind: 'empty' }
  | { kind: 'failed' }

/** Seconds until the card asks again, none for never: five while it works; never once done, failed, expired or empty; after a failure, sixty when nothing was ever read, else five. */
export function cloudAgentNextPoll(
  read: CloudAgentRead,
  known: CloudAgentInfo | undefined,
): number | undefined {
  switch (read.kind) {
    case 'info':
      return cloudAgentIsLive(read.info) ? 5 : undefined
    case 'empty':
      return undefined
    case 'failed':
      if (!known) return 60
      return cloudAgentIsLive(known) ? 5 : undefined
  }
}

// MARK: GitHub on the computer (the cloud agent's first coding run)

/** GitHub's own page where the one-time code is typed. */
export const gitHubDevicePage = 'https://github.com/login/device'

/** "Connect GitHub" (`github-sign-in`, upstream card 8): the one-time code `WXYZ-1234` the computer's `gh` asked for, GitHub's page, and when the code stops working (ms since 1970). */
export interface GitHubSignInCard {
  code: string
  url: string
  expiresAtMs: number
}

export function gitHubSignInCard(entry: Entry): GitHubSignInCard | undefined {
  const message = entry.message
  if (str(field(message, 'type')) !== 'github-sign-in') return undefined
  const code = text(field(message, 'code'))?.trim() ?? ''
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return undefined
  const address = text(field(message, 'url')) ?? ''
  return {
    code,
    url: address.startsWith('https://github.com/') ? address : gitHubDevicePage,
    expiresAtMs: num(field(message, 'expiresAtMs')) ?? 0,
  }
}

/** How the sign-in stands, as the computer says it. */
export type GitHubSignInState =
  | { kind: 'waiting' }
  | { kind: 'connected'; login?: string }
  | { kind: 'expired' }
  | { kind: 'failed' }

/** The computer's answer (`getGitHubSignIn`: `{state, code?, login?}`) for this card, none when it couldn't be asked: a sign-in waiting on another code means this one expired. */
export function gitHubSignInState(
  card: GitHubSignInCard,
  answer: unknown,
  nowMs: number,
): GitHubSignInState | undefined {
  const state = str(field(answer, 'state'))
  if (state == null) return undefined
  switch (state) {
    case 'connected':
      return { kind: 'connected', login: text(field(answer, 'login')) }
    case 'waiting':
      if (
        text(field(answer, 'code')) !== card.code ||
        (card.expiresAtMs > 0 && nowMs >= card.expiresAtMs)
      )
        return { kind: 'expired' }
      return { kind: 'waiting' }
    case 'failed':
      return { kind: 'failed' }
    default:
      return { kind: 'expired' }
  }
}

/** Seconds until the card asks again: three while it waits (and when it couldn't be asked), never once it's settled. */
export function gitHubSignInNextPoll(
  state: GitHubSignInState | undefined,
): number | undefined {
  return state == null || state.kind === 'waiting' ? 3 : undefined
}

/** The card's title: "Connect GitHub" while there is something to do, "GitHub" once it is connected (as a connected app's card names the app). */
export function gitHubSignInTitle(
  state: GitHubSignInState | undefined,
): string {
  return state?.kind === 'connected' ? 'GitHub' : t('Connect GitHub')
}

/** The line under the title: what to do with the code, why there's nothing more to do, or the account once it is connected (none when its name isn't known). */
export function gitHubSignInLine(state: GitHubSignInState | undefined): string {
  switch (state?.kind) {
    case 'connected':
      return state.login ?? ''
    case 'expired':
      return t('This code expired. Ask your agent for a new one.')
    case 'failed':
      return t("GitHub couldn't be connected.")
    default:
      return t('Enter this code on GitHub to connect it to your computer.')
  }
}

/** The card's title and buttons. */
export function gitHubSignInWords(): {
  title: string
  open: string
  copy: string
  copied: string
} {
  return {
    title: t('Connect GitHub'),
    open: t('Open GitHub'),
    copy: t('Copy code'),
    copied: t('Copied'),
  }
}

/** "Connected as octocat", or "Connected" when the account's name isn't known. */
export function gitHubConnectedLabel(login: string | undefined): string {
  return login ? t`Connected as ${login}` : t('Connected')
}

// MARK: Claude Code or Codex, for a cloud agent's coding

/** The providers a cloud agent's coding can run on (`ModelConnectCard.offered`). */
export const modelConnectOffered: readonly string[] = [claude, chatGPT, 'cursor']

/**
 * Cursor, the third program a cloud agent can code in (13 November 2026, the
 * founder: "Cursor now"; `ModelConnectCard.cursor`). It is no plan in AI
 * Models: it is signed in on the person's cloud computer with Cursor's own
 * program, and its row reads that computer (`cursorSignInState`).
 */
export const cursor = 'cursor'

/** A provider whose sign-in is on the cloud computer and read from it, not from AI Models. */
export function modelConnectOnComputer(provider: string): boolean {
  return provider === cursor
}

/** Whose plan the program runs on, as the person knows it: Claude, ChatGPT, Cursor. */
export function modelConnectPlan(provider: string): string {
  return provider === cursor ? 'Cursor' : providerName(provider)
}

/**
 * Cursor's sign-in on the cloud computer, as the engine says it
 * (`getCursorSignIn`, `startCursorSignIn`; the core's `CursorSignIn`): its
 * program being put on the computer, the page on Cursor's own site to
 * approve on, connected, or why it ended.
 */
export type CursorSignIn =
  | { state: 'none' }
  | { state: 'installing' }
  | { state: 'waiting'; url: string; expiresAtMs: number }
  | { state: 'connected' }
  | { state: 'failed'; why: string }

/** A page on Cursor's own site, over https: the only kind the sheet opens. */
export function isCursorPage(link: string): boolean {
  try {
    const url = new URL(link)
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'cursor.com' || url.hostname.endsWith('.cursor.com'))
    )
  } catch {
    return false
  }
}

export function cursorSignInState(record: JSONValue | undefined): CursorSignIn {
  switch (str(field(record, 'state'))) {
    case 'connected':
      return { state: 'connected' }
    case 'installing':
      return { state: 'installing' }
    case 'failed':
      return { state: 'failed', why: str(field(record, 'why')) ?? '' }
    case 'waiting': {
      const url = str(field(record, 'url')) ?? ''
      const expires = field(record, 'expiresAtMs')
      return isCursorPage(url)
        ? {
            state: 'waiting',
            url,
            expiresAtMs: typeof expires === 'number' ? expires : 0,
          }
        : { state: 'none' }
    }
    default:
      return { state: 'none' }
  }
}

/** Seconds until the computer is asked again while the sheet waits (`CursorSignIn.pollSeconds`). */
export const cursorPollSeconds = 3

/**
 * "Connect Claude Code" and "Connect Codex" in one card (`model-connect`, 13
 * November 2026, the founder: "when neither of them is connected, the user
 * is given a choice of both cards to connect"; `ModelConnectCard` in the
 * shared core): the providers offered, in the order shown. A cloud agent
 * codes in Claude Code on the person's Claude plan, or in Codex on their
 * ChatGPT plan; a launch that finds neither connected puts this card in the
 * chat. It carries no state: what is connected is the person's own accounts
 * (`store.aiModels`).
 *
 * The card names the programs; Settings › AI Models names the plans (the
 * founder, the same day: "its connect codex or connect claude code ... for
 * the card specifically its that. but settings is claude and chat gpt. they
 * are two dif things").
 */
export interface ModelConnectCard {
  providers: string[]
}

export function modelConnectCard(entry: Entry): ModelConnectCard | undefined {
  const message = entry.message
  if (str(field(message, 'type')) !== 'model-connect') return undefined
  return { providers: modelConnectProviders(message) }
}

/** The providers a `model-connect` message offers: the ones this app knows, each once; all of them when it names none it knows. */
export function modelConnectProviders(message: JSONValue | undefined): string[] {
  const kept: string[] = []
  for (const one of arr(field(message, 'providers')) ?? []) {
    const provider = text(one)
    if (
      provider != null &&
      modelConnectOffered.includes(provider) &&
      !kept.includes(provider)
    )
      kept.push(provider)
  }
  // A card that names none it knows (an engine newer than this app) still offers them all.
  return kept.length > 0 ? kept : [...modelConnectOffered]
}

/** The program that codes on a provider's plan, by its own name. */
export function modelConnectProgram(provider: string): string {
  return provider === chatGPT
    ? 'Codex'
    : provider === cursor
      ? 'Cursor'
      : 'Claude Code'
}

/** The program's own logo (`assets/mascots/<name>.png`), drawn whole and bare: no tile, no white or dark ground (the founder: "its full logo no white or dark background"). */
export function modelConnectLogo(provider: string): string {
  return provider === chatGPT
    ? 'codex'
    : provider === cursor
      ? 'cursor'
      : 'claudecode'
}

/** A row's title: "Connect Codex" while there is something to do, "Codex" once it is connected, as a connected app's card names the app. */
export function modelConnectTitle(
  provider: string,
  connected: boolean,
): string {
  const name = modelConnectProgram(provider)
  return connected ? name : t`Connect ${name}`
}

/** The line under a row's title: whose plan the program runs on, which is the account Connect signs in to; none once it is connected. */
export function modelConnectLine(provider: string, connected: boolean): string {
  if (connected) return ''
  return t`Runs on your ${modelConnectPlan(provider)} plan.`
}

/** The card in the list of chats: "Connect Claude Code, Codex, Cursor"; a card for one program, that one's name. */
export function modelConnectPreview(
  providers: readonly string[] = modelConnectOffered,
): string {
  return t`Connect ${providers.map(modelConnectProgram).join(', ')}`
}

/** Seconds until the accounts are read again while a row still waits; never once one is connected. */
export function modelConnectNextPoll(
  anyConnected: boolean,
): number | undefined {
  return anyConnected ? undefined : 4
}

/** The most times the accounts are read again for one card: ten minutes, then a card left on screen with nothing connected stops asking. */
export const modelConnectPolls = 150

/** Where Open would have gone (`cloudAgentWebUrl`): Simeon's page for the run, its id written as a path's part (`urlPathAllowed` without "/"). Never made; the card opens the pull request instead (View PR, 11 November 2026). */
export function cloudAgentWebURL(bcId: string): string {
  let part: string
  try {
    part = encodeURIComponent(bcId).replace(
      /%(?:24|26|2B|2C|3B|3D|3A|40)/g,
      (escaped) => decodeURIComponent(escaped),
    )
  } catch {
    part = bcId
  }
  return `https://app.simeonlabs.com/agents/${part}`
}

/** An address the card may open in a new tab: a web page's, or none. */
export function webPage(address: string | undefined): string | undefined {
  if (!address) return undefined
  try {
    const url = new URL(address)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}

/** A line cut in its middle to fit `room` ("feature/lo…in-fix"), as the Mac cuts a branch's name; whole when it fits. */
export function middleCut(
  words: string,
  room: number,
  width: (words: string) => number,
): string {
  if (width(words) <= room) return words
  const letters = [...words]
  const cut = (kept: number) =>
    letters.slice(0, Math.ceil(kept / 2)).join('') +
    '…' +
    letters.slice(letters.length - Math.floor(kept / 2)).join('')
  let low = 0
  let high = letters.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (width(cut(middle)) <= room) low = middle
    else high = middle - 1
  }
  return cut(low)
}

// MARK: A new teammate joined (JoinedCard)

/** "Iris just joined your team" (`agent-joined`): the agent another one hired, its name as hired, what it does. */
export interface JoinedCard {
  agentId: string
  name: string
  /** What it does, one short sentence; "" when the agent gave none. */
  line: string
}

/** The card from its message; none without the agent's id and name (the chat then says the message's words). */
export function joinedCard(entry: Entry): JoinedCard | undefined {
  const message = entry.message
  if (str(field(message, 'type')) !== 'agent-joined') return undefined
  const agentId = text(field(message, 'agentId'))
  const name = text(field(message, 'name'))?.trim()
  if (agentId == null || !name) return undefined
  return { agentId, name, line: text(field(message, 'line'))?.trim() ?? '' }
}

/** The agent while the roster has it: gone (deleted since), the card keeps its words and loses its face and buttons. */
export function joinedAgent(
  card: JoinedCard,
  agents: readonly Agent[],
): Agent | undefined {
  return agents.find((agent) => agent.id === card.agentId)
}

/** "Iris just joined your team", by the name the roster has now, else the one it was hired with. */
export function joinedTitleIn(
  card: JoinedCard,
  agents: readonly Agent[],
): string {
  return joinedTitleFor(joinedAgent(card, agents)?.name ?? card.name)
}

export function joinedTitleFor(name: string): string {
  return t`${name} just joined your team`
}

export function goToChatWord(): string {
  return t('Go to Chat')
}

export function viewProfileWord(): string {
  return t('View Profile')
}

/** The face an agent stands as on the card: the catalogue face it wears, or, with no picture yet, the one it was given; none for a picture of its own (`AgentFaces.standing`). */
export function standingFace(agent: Agent): AgentFace | undefined {
  const worn = faceByVersion(agent.avatarVersion)
  if (worn) return worn
  return hasPicture(agent) ? undefined : faceById(agent.avatarShape)
}

const standingFiles = import.meta.glob<string>(
  '../../../../../ios/SimeonCore/Sources/SimeonCore/Resources/Faces/Standing/*.webp',
  { eager: true, query: '?url', import: 'default' },
)

/** The face standing on its own, its background taken away (Resources/Faces/Standing), as the built app serves it. */
export function standingURL(face: AgentFace): string | undefined {
  const entry = Object.entries(standingFiles).find(([path]) =>
    path.endsWith(`/${face.id}.webp`),
  )
  return entry?.[1]
}

/** A colour, sRGB, each channel 0 to 1 (Colour.swift's `RGB`). */
export interface RGB {
  r: number
  g: number
  b: number
  a: number
}

export function rgb(r: number, g: number, b: number, a = 1): RGB {
  return { r, g, b, a }
}

/** "#rrggbb" or "#rrggbbaa"; anything else reads as black, as Swift's `UInt64(_, radix: 16) ?? 0`. */
export function rgbFromHex(hex: string): RGB {
  const digits = hex.startsWith('#') ? hex.slice(1) : hex
  const value = /^[0-9a-f]{1,16}$/i.test(digits) ? BigInt(`0x${digits}`) : 0n
  const channel = (shift: bigint) => Number((value >> shift) & 0xffn) / 255
  if (digits.length === 8)
    return rgb(channel(24n), channel(16n), channel(8n), channel(0n))
  return rgb(channel(16n), channel(8n), channel(0n))
}

/** "#rrggbb", each channel rounded. */
export function hexOf(colour: RGB): string {
  const channel = (value: number) =>
    Math.round(Math.min(Math.max(value, 0), 1) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(colour.r)}${channel(colour.g)}${channel(colour.b)}`
}

/** A straight sRGB blend, `amount` of the way toward `other`. */
export function blended(colour: RGB, other: RGB, amount: number): RGB {
  return rgb(
    colour.r + (other.r - colour.r) * amount,
    colour.g + (other.g - colour.g) * amount,
    colour.b + (other.b - colour.b) * amount,
    colour.a,
  )
}

/** WCAG's relative luminance: 0 for black, 1 for white. */
export function luminance(colour: RGB): number {
  const linear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  return (
    0.2126 * linear(colour.r) +
    0.7152 * linear(colour.g) +
    0.0722 * linear(colour.b)
  )
}

/** A colour as CSS writes it. */
export function cssColour(colour: RGB): string {
  const channel = (value: number) =>
    Math.round(Math.min(Math.max(value, 0), 1) * 255)
  return `rgb(${channel(colour.r)} ${channel(colour.g)} ${channel(colour.b)} / ${colour.a})`
}

/**
 * The card in the colour of its face's own background (the founder's design
 * B): from the colour 16% lighter at the top leading corner to 24% darker at
 * the bottom trailing one, Go to Chat white with its words 55% darker, the
 * words white on every face.
 */
export interface JoinedColours {
  top: RGB
  bottom: RGB
  /** Go to Chat's words, on its white. */
  deep: RGB
}

const white = rgb(1, 1, 1)
const black = rgb(0, 0, 0)

/** The title, what it does, View Profile's pane and its edge, and the light behind the face. */
export const joinedInk = white
export const joinedSecondaryInk = rgb(1, 1, 1, 0.8)
export const joinedPane = rgb(1, 1, 1, 0.18)
export const joinedPaneEdge = rgb(1, 1, 1, 0.4)
export const joinedGlow = rgb(1, 1, 1, 0.22)

export function joinedColoursOf(backdrop: RGB): JoinedColours {
  return {
    top: blended(backdrop, white, 0.16),
    bottom: blended(backdrop, black, 0.24),
    deep: blended(backdrop, black, 0.55),
  }
}

/** The colours for a face, when it has its backdrop. */
export function joinedColoursForFace(
  face: AgentFace | undefined,
): JoinedColours | undefined {
  return face?.backdrop != null
    ? joinedColoursOf(rgbFromHex(face.backdrop))
    : undefined
}

/** The card's colours for this agent: its standing face's; none for a picture of its own or an agent gone, which keep the chat's grey. */
export function joinedColours(
  card: JoinedCard,
  agents: readonly Agent[],
): JoinedColours | undefined {
  const agent = joinedAgent(card, agents)
  return agent ? joinedColoursForFace(standingFace(agent)) : undefined
}
