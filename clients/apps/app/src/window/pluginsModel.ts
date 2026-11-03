// What Connectors knows and does (mac/Simeon/PluginsModel.swift), as the
// window's overlay does it: the catalogue, the computer's servers and
// plugins, the open agent's skills; Add (with its setup page when a plugin
// needs values), Uninstall and Remove, each account's sign-in (Reopen, and
// Retry after ten minutes), the tools' switches, a skill's Save and Delete,
// the GitHub banner's Fix with agent, and the notice that says how each
// went. The rules and words are the core's (`plugins.ts`,
// `pluginsOverlay.ts`), the calls the store's (6c's section, through
// `PluginCalls`).
//
// One for the window, kept while it is open (ConnectorsLayer): the view
// (the tab, the search, the category, the pages, the setup page, the
// notice) is forgotten each time Connectors closes; the computer's state
// (servers, plugins, tools, skills, the banner, the sign-ins waiting, the
// logos) is the store's, kept until sign-out (`resetConnectors`, the
// Mac's `forget`). The consent and an app's sign-in go through the window's
// connector (`Connector`, step 6b).

import {
  connectedNotice,
  didntConnect,
  notConnectedNotice,
  type SignInEnd,
  stillConnectingNotice,
} from '../core/connecting'
import { field, str, text } from '../core/json'
import { plainError } from '../core/plainWords'
import { resyncsSkills } from '../core/pluginCalls'
import {
  addedNotice,
  type AgentSkill,
  allPlugins,
  connectorList,
  defaultAccount,
  type EffectivePlugin,
  entryForServer,
  hasSetupFields,
  type InstalledState,
  installedState,
  type Notice,
  noticeSeconds,
  onePerServer,
  type PluginEntry,
  type PluginFilter,
  type PluginItem,
  pluginItems,
  pluginsById,
  type PluginServer,
  type PluginTool,
  removedNotice,
  serverAccounts,
  serversByName,
  signInNotice,
  skillsAddedNotice,
} from '../core/plugins'
import {
  agentFailedNotice,
  deletedNotice,
  needsAgentNotice,
  needsSetupPage,
  savedNotice,
  setupSavedNotice,
  type SignInFlow,
  signInKey,
  signInSpacing,
  type SignInState,
  skillsDidntSyncNotice,
} from '../core/pluginsOverlay'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import type { Connector, HeldTab } from './connector'
import type { ConnectorsOpening } from './windowModel'

/** A page over the list (`PluginsModel.Page`): a plugin's, an installed server's, the setup page, a skill's, or a section of Available with every app in it. */
export type PluginsPage =
  | { kind: 'plugin'; id: string }
  | { kind: 'installed'; id: string }
  | { kind: 'setup'; id: string }
  | { kind: 'skill'; id: string }
  /** A section of Available, every app in it (its name's ›; 21 October 2026), by the section's key. */
  | { kind: 'category'; key: string }

/** Whether two pages are the same page (Swift's `==` on `Page`). */
export function samePage(
  a: PluginsPage | undefined,
  b: PluginsPage | undefined,
): boolean {
  if (!a || !b || a.kind !== b.kind) return false
  return a.kind === 'category'
    ? a.key === (b as { key: string }).key
    : a.id === (b as { id: string }).id
}

/** Available (Marketplace until 13 October 2026) or Yours (`PluginsModel.Tab`). */
export type PluginsTab = 'marketplace' | 'yours'

/** The setup page open: for which entry, and whether it edits values given before (`PluginsModel.Setup`). */
export interface PluginsSetup {
  entryId: string
  editing: boolean
}

/**
 * What the model asks of the window's connector (6b's `Connector`): the
 * consent, a tab opened on a click with no consent (`holdingTab`), then
 * the app's sign-in, handed the tab its click opened.
 */
export type PluginsConnector = Pick<Connector, 'ask' | 'holdingTab' | 'signIn'>

/** What a skills step did: how many of the plugin's skills it brought, or why it couldn't. */
interface Synced {
  added: number
  error?: string
}

const why = (error: unknown) =>
  plainError(error instanceof Error ? error.message : String(error))

/** A page address a sign-in may open: the web's own kinds only, never a script. */
function webAddress(address: string | undefined): string | undefined {
  if (address == null) return undefined
  try {
    const url = new URL(address)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}

export class PluginsModel {
  private listeners = new Set<() => void>()
  private version = 0

  // The view: forgotten when Connectors closes (`reset`).
  tab: PluginsTab = 'marketplace'
  query = ''
  marketplaceFilter: PluginFilter = allPlugins
  yoursFilter: PluginFilter = allPlugins
  /** Available's category, by its section's key (the founder, 21 October 2026: "the filter should be the categories"); none, every one. */
  category?: string
  path: PluginsPage[] = []
  setup?: PluginsSetup
  /** Sections opened in full; folded again when the list is drawn anew (a tab, Back). */
  expanded: ReadonlySet<string> = new Set()
  notice?: Notice
  /** ⌘F asked the search for the keys (`PluginsState.searchFocus`). */
  searchFocus = 0

  /** This opening's catalogue is in: a page asked for by a link waits for it, not for the last opening's. */
  catalogLoaded = false
  busy = 0
  /** The entry whose Add is under way: its row's spinner. */
  adding?: string
  launchingFix = false
  /** The agent open in the window (`window.selected`): its skills are Yours › Private, and Add and Save are for it. */
  agentId?: string

  /** The window's connector: the consent and the sign-in (set by ConnectorsLayer, as the Mac sets `model.store`). */
  connector?: PluginsConnector
  private noticeTimer?: ReturnType<typeof setTimeout>
  /** When the last sign-in page was opened (ms): the next waits `signInSpacing` after it. */
  private lastOpen = 0

  constructor(readonly store: AppStore) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  private changed(): void {
    this.version += 1
    for (const listener of this.listeners) listener()
  }

  // MARK: The computer's state (the store's), as the pages read it

  /** The catalogue's entries (the store's `catalogEntries`). */
  get catalog(): readonly PluginEntry[] {
    return this.store.catalogEntries
  }

  /** Each account of each server (`servers`). */
  get servers(): readonly PluginServer[] {
    return this.store.pluginServers
  }

  /** The plugins the computer has on (`plugins`). */
  get plugins(): readonly EffectivePlugin[] {
    return this.store.effectivePlugins
  }

  /** Each server's tools as last read, by the server's id (`tools`). */
  get tools(): ReadonlyMap<string, readonly PluginTool[]> {
    return this.store.pluginTools
  }

  /** Why a tool's switch didn't change, by the server's id (`toolFailures`). */
  get toolFailures(): ReadonlyMap<string, string> {
    return this.store.pluginToolFailures
  }

  /** The open agent's skills (`skills`). */
  get skills(): readonly AgentSkill[] {
    return this.store.agentSkills
  }

  /** The plugins the GitHub banner names (`authBlocked`). */
  get authBlocked(): readonly string[] {
    return this.store.pluginAuthBlocked
  }

  /** Sign-ins waiting, by key (`flows`). */
  get flows(): ReadonlyMap<string, SignInFlow> {
    return this.store.signInFlows
  }

  /** The catalogue's logos read so far, data URLs by address (`logos`). */
  get logos(): ReadonlyMap<string, string> {
    return this.store.pluginLogos
  }

  get isBusy(): boolean {
    return this.busy > 0
  }

  /** The filter of the tab shown (`filter`). */
  get filter(): PluginFilter {
    return this.tab === 'marketplace'
      ? this.marketplaceFilter
      : this.yoursFilter
  }

  set filter(next: PluginFilter) {
    if (this.tab === 'marketplace') this.marketplaceFilter = next
    else this.yoursFilter = next
    this.changed()
  }

  private deduped?: {
    servers: readonly PluginServer[]
    rows: PluginServer[]
    byName: Map<string, PluginServer>
  }
  private byPlugin?: {
    plugins: readonly EffectivePlugin[]
    map: Map<string, EffectivePlugin>
  }

  /** The servers one row a server, the default account's (`onePerServer`). */
  get onePerServer(): PluginServer[] {
    return this.dedupe().rows
  }

  private dedupe() {
    const servers = this.servers
    if (this.deduped?.servers !== servers) {
      const rows = onePerServer(servers)
      this.deduped = { servers, rows, byName: serversByName(rows) }
    }
    return this.deduped
  }

  /** The plugins by their id (`effective`). */
  get effective(): ReadonlyMap<string, EffectivePlugin> {
    const plugins = this.plugins
    if (this.byPlugin?.plugins !== plugins)
      this.byPlugin = { plugins, map: pluginsById(plugins) }
    return this.byPlugin.map
  }

  /** Whether an entry shows Added (`installed`). */
  installed(entry: PluginEntry): InstalledState {
    const { rows, byName } = this.dedupe()
    return installedState(entry, rows, byName, this.effective)
  }

  /** Yours › Installed (`yoursItems`). */
  get yoursItems(): PluginItem[] {
    return pluginItems(this.onePerServer, this.catalog, this.plugins)
  }

  /** An installed plugin's server, for its row (`serverState`): Connect while it waits for its sign-in, Connected once it is, else its status. */
  serverState(entry: PluginEntry): PluginServer | undefined {
    return (
      this.installed(entry).server ??
      this.servers.find((server) => server.pluginId === entry.id)
    )
  }

  /** Whether the plugin's app can't be added yet (`AppsComingSoon`): its row and page say "Coming soon", with no Add. */
  comingSoon(entry: PluginEntry): boolean {
    return this.store.isComingSoon(entry.id)
  }

  // MARK: The view

  /** Closing forgets the view: Available, no search, no filters, no page (`reset`). */
  reset(): void {
    this.tab = 'marketplace'
    this.query = ''
    this.marketplaceFilter = allPlugins
    this.yoursFilter = allPlugins
    this.category = undefined
    this.path = []
    this.setup = undefined
    this.expanded = new Set()
    this.show(undefined)
    this.changed()
  }

  /**
   * An opening's ask (`PluginsState.open`): a fresh opening starts from
   * nothing; then Available, an app's page, an installed server's page
   * (Yours), a search, or a skill's page (Yours).
   */
  follow(ask: ConnectorsOpening, fresh: boolean): void {
    if (fresh) this.reset()
    switch (ask.kind) {
      case 'marketplace':
        this.setTab('marketplace')
        this.setPath([])
        break
      case 'plugin':
        this.setTab('marketplace')
        this.setPath([{ kind: 'plugin', id: ask.id }])
        break
      case 'server':
        this.setTab('yours')
        this.setPath([{ kind: 'installed', id: ask.id }])
        break
      case 'query':
        this.setTab('marketplace')
        this.query = ask.text
        this.setPath([])
        break
      case 'skill':
        this.setTab('yours')
        this.setPath([{ kind: 'skill', id: ask.id }])
        break
    }
    this.changed()
  }

  /** Available or Yours; another tab folds the sections again. */
  setTab(tab: PluginsTab): void {
    if (tab === this.tab) return
    this.tab = tab
    this.expanded = new Set()
    this.changed()
  }

  /** The search's words, as each key is typed. */
  setQuery(query: string): void {
    if (query === this.query) return
    this.query = query
    this.changed()
  }

  /** Available's category, or every one. */
  setCategory(key: string | undefined): void {
    if (key === this.category) return
    this.category = key
    this.changed()
  }

  /** The pages over the list; going back folds the sections again. */
  setPath(path: PluginsPage[]): void {
    if (path.length < this.path.length) this.expanded = new Set()
    this.path = path
    this.changed()
  }

  /** A page opened over the one shown (`path.append`). */
  push(page: PluginsPage): void {
    this.setPath([...this.path, page])
  }

  /** Back (`path.removeLast()`). */
  back(): void {
    if (this.path.length === 0) return
    this.setPath(this.path.slice(0, -1))
  }

  /** A page whose thing has gone closes itself, and what is over it (`removeSubrange`). */
  closePage(page: PluginsPage): void {
    for (let index = this.path.length - 1; index >= 0; index -= 1)
      if (samePage(this.path[index], page)) {
        this.setPath(this.path.slice(0, index))
        return
      }
  }

  /** A section opened in full, or folded again. */
  toggleExpanded(key: string): void {
    const next = new Set(this.expanded)
    if (!next.delete(key)) next.add(key)
    this.expanded = next
    this.changed()
  }

  /** ⌘F: the search, on the list (a page has none, and the chat behind does not get it either). */
  focusSearch(): void {
    if (this.path.length > 0) return
    this.searchFocus += 1
    this.changed()
  }

  /** The window's connector, for the consent and the sign-in (the Mac's `model.store = store`). */
  setConnector(connector: PluginsConnector | undefined): void {
    this.connector = connector
  }

  /** The agent open in the window; another one's skills are read (`onChange(of: window.selected)`). */
  setAgent(agentId: string | undefined): void {
    // Only the shown agent's skills are kept, however the answers cross (M1 of the review: the Mac lets the last answer win).
    this.store.showSkillsOf(agentId)
    if (agentId === this.agentId) return
    this.agentId = agentId
    this.changed()
  }

  // MARK: Reading

  /**
   * Opening (`load`): the catalogue the store holds (read by a card in this
   * sign-in) shows at once and is read again behind it (28 October 2026,
   * the founder: "i hate the loading connectors"); with none, "Loading
   * connectors…" until it is in. The servers, the plugins, the agent's
   * skills, the banner, and the one sync its opening starts.
   */
  async load(agentId: string | undefined): Promise<void> {
    const store = this.store
    const signedIn = store.pluginSignIn
    this.catalogLoaded = store.catalogEntries.length > 0
    this.changed()
    const catalogAnswer = store.readCatalog()
    const pluginsAnswer = store.readEffectivePlugins()
    await store.readPluginServers()
    await catalogAnswer
    // Signed out, or into another account, meanwhile: nothing more of this opening, and the next computer is not asked.
    if (!this.isCurrent(signedIn)) return
    this.catalogLoaded = true
    this.changed()
    await pluginsAnswer
    if (!this.isCurrent(signedIn)) return
    await store.readAgentSkills(agentId)
    if (!this.isCurrent(signedIn)) return
    await store.readPluginSyncStatus()
    if (!this.isCurrent(signedIn)) return
    // The one sync its opening starts; the banner is read again after it.
    void store.syncPluginSkillsQuietly()
  }

  /**
   * Whether the sign-in an action began in (`store.pluginSignIn`, taken at
   * its start) is still the one: after a sign-out, or another sign-in, the
   * action writes nothing more and makes no more calls, so it never acts on
   * the next account's computer (PluginsModel.swift's `isCurrent`; the
   * Electron app runs an engine per account and cuts its calls at sign-out).
   */
  private isCurrent(signedIn: object | undefined): boolean {
    return this.store.pluginSignIn === signedIn
  }

  /** The servers read again (`refreshServers`). */
  refreshServers(): Promise<void> {
    return this.store.readPluginServers()
  }

  /** The open agent's skills (`loadSkills`). */
  loadSkills(agentId: string | undefined): Promise<void> {
    return this.store.readAgentSkills(agentId)
  }

  /** A server's tools (`loadTools`). */
  loadTools(serverId: string): Promise<void> {
    return this.store.readPluginTools(serverId)
  }

  /** A catalogue entry's logo (`loadLogo`), read once per address. */
  loadLogo(address: string): Promise<void> {
    return this.store.readPluginLogo(address)
  }

  // MARK: Notices (`TKn`)

  /** The notice at the panel's foot, or none; 3.5 s, or 6 s for a failure. */
  show(next: Notice | undefined): void {
    clearTimeout(this.noticeTimer)
    this.noticeTimer = undefined
    this.notice = next
    this.changed()
    if (!next) return
    this.noticeTimer = setTimeout(
      () => {
        this.noticeTimer = undefined
        this.notice = undefined
        this.changed()
      },
      noticeSeconds(next) * 1000,
    )
  }

  private fail(error: unknown): void {
    this.show({ isError: true, text: why(error) })
  }

  private setBusy(by: number): void {
    this.busy += by
    this.changed()
  }

  /** One of the overlay's busy actions, its failure as the notice (`runReportingNotice`); none once another sign-in's. */
  private async reporting(work: () => Promise<void>): Promise<void> {
    const signedIn = this.store.pluginSignIn
    this.setBusy(1)
    try {
      await work()
    } catch (error) {
      if (this.isCurrent(signedIn)) this.fail(error)
    } finally {
      this.setBusy(-1)
    }
  }

  private setAdding(entryId: string | undefined): void {
    this.adding = entryId
    this.changed()
  }

  // MARK: Add, setup, remove

  /**
   * Add, the consent first when the plugin brings an app to sign in to
   * (`requestAdd`); a skills-only plugin is added at once. Nothing for an
   * app that can't be added yet.
   */
  requestAdd(entry: PluginEntry, agentId: string | undefined): void {
    if (this.comingSoon(entry)) return
    if (connectorList(entry).length === 0) {
      void this.add(entry, agentId)
      return
    }
    // Connect's click opens the sign-in's tab, handed down to it; Add that goes to the setup page first opens none.
    const team =
      this.effective.get(entry.id)?.hasTeamConfiguredVariables === true
    this.connector?.ask(
      entry.displayName,
      (tab) => this.add(entry, agentId, tab),
      { signIn: !needsSetupPage(entry, team) },
    )
  }

  /**
   * Add (`Ct`), Connect since 13 October 2026 (`Connecting`): a skills-only
   * plugin needs an agent; one with values to give opens its setup page;
   * else it is installed and its sign-in opened at once and waited for
   * (`connectAfterInstall`): "Connected" only once it is, and a sign-in the
   * person cancels takes the app back out.
   */
  async add(
    entry: PluginEntry,
    agentId: string | undefined,
    /** The tab Connect's click opened, for its sign-in (6b's `HeldTab`). */
    tab?: HeldTab,
  ): Promise<void> {
    this.show(undefined)
    const team =
      this.effective.get(entry.id)?.hasTeamConfiguredVariables === true
    const signedIn = this.store.pluginSignIn
    if (connectorList(entry).length === 0) {
      if (agentId == null) {
        this.show(needsAgentNotice())
        return
      }
      this.setAdding(entry.id)
      try {
        if (!(await this.install(entry.id, {}, team))) return
        if (!this.isCurrent(signedIn)) return
        const synced = await this.syncSkills(entry, agentId)
        if (!this.isCurrent(signedIn)) return
        this.show(
          synced.error != null
            ? skillsDidntSyncNotice(entry.displayName, synced.error)
            : skillsAddedNotice(entry.displayName, synced.added),
        )
      } finally {
        this.setAdding(undefined)
      }
      return
    }
    if (needsSetupPage(entry, team)) {
      this.setup = { entryId: entry.id, editing: false }
      this.push({ kind: 'setup', id: entry.id })
      return
    }
    this.setAdding(entry.id)
    try {
      const addedNow = !this.installed(entry).isInstalled
      if (!(await this.install(entry.id, {}, team))) return
      if (!this.isCurrent(signedIn)) return
      await this.connectAfterInstall(entry, addedNow, agentId, tab)
    } finally {
      this.setAdding(undefined)
    }
  }

  /** `installEntry` (the sign-in is the caller's: `connectAfterInstall`); a refusal said as the notice. */
  private async install(
    entryId: string,
    values: Readonly<Record<string, string>>,
    team: boolean,
  ): Promise<boolean> {
    const signedIn = this.store.pluginSignIn
    this.setBusy(1)
    try {
      await this.store.installPlugin(entryId, values, team)
      return true
    } catch (error) {
      if (this.isCurrent(signedIn)) this.fail(error)
      return false
    } finally {
      this.setBusy(-1)
    }
  }

  /**
   * The sign-in of a plugin just installed, opened and waited for
   * (`connectAfterInstall`): once connected, its skills synced and
   * "Connected Gmail" said; cancelled, or no sign-in to open, the app this
   * connect added (`addedNow`) taken back out and why said; closed on the
   * maker's page before the computer said so, kept, as it may still finish.
   * A plugin whose server needs no sign-in is added as before.
   */
  private async connectAfterInstall(
    entry: PluginEntry,
    addedNow: boolean,
    agentId: string | undefined,
    tab?: HeldTab,
  ): Promise<void> {
    const store = this.store
    const name = entry.displayName
    if (!store.pluginCallsReady) return
    const signedIn = store.pluginSignIn
    const vendorId = await store.pluginVendorServer(entry.id)
    // Signed out, or into another account, meanwhile: nothing more of this connect, here or on that computer.
    if (!this.isCurrent(signedIn)) return
    const servers = store.pluginServers
    const row =
      (vendorId != null
        ? servers.find((server) => server.id === vendorId)
        : undefined) ?? servers.find((server) => server.pluginId === entry.id)
    const needsSignIn =
      vendorId != null
        ? row?.status !== 'connected'
        : row?.status === 'needsAuth'
    const serverId = vendorId ?? row?.id
    if (serverId == null || !needsSignIn) {
      const synced = await this.syncSkills(entry, agentId)
      if (!this.isCurrent(signedIn)) return
      this.show(
        row?.status === 'connected'
          ? connectedNotice(name, synced.added, synced.error)
          : addedNotice(name, synced.added, [], synced.error),
      )
      return
    }
    const accountKey = defaultAccount
    let answer: unknown
    try {
      answer = await store.askServerSignIn(serverId, accountKey)
    } catch (error) {
      if (!this.isCurrent(signedIn)) return
      if (addedNow) await store.takeBackPlugin(entry.id, serverId)
      if (!this.isCurrent(signedIn)) return
      this.show({ isError: true, text: didntConnect(name, why(error)) })
      return
    }
    if (!this.isCurrent(signedIn)) return
    if (str(field(answer, 'status')) === 'already-authenticated') {
      await store.readPluginServers()
      if (!this.isCurrent(signedIn)) return
      const synced = await this.syncSkills(entry, agentId)
      if (!this.isCurrent(signedIn)) return
      this.show(connectedNotice(name, synced.added, synced.error))
      return
    }
    const url = webAddress(text(field(answer, 'authorizationUrl')))
    if (url == null) {
      if (addedNow) await store.takeBackPlugin(entry.id, serverId)
      if (!this.isCurrent(signedIn)) return
      this.show({
        isError: true,
        text: didntConnect(name, str(field(answer, 'message'))),
      })
      return
    }
    const end = await this.openSignInAndWait(
      url,
      serverId,
      accountKey,
      name,
      tab,
    )
    if (!this.isCurrent(signedIn)) return
    switch (end) {
      case 'connected': {
        const synced = await this.syncSkills(entry, agentId)
        if (!this.isCurrent(signedIn)) return
        this.show(connectedNotice(name, synced.added, synced.error))
        break
      }
      case 'cancelled':
        if (addedNow) await store.takeBackPlugin(entry.id, serverId)
        if (!this.isCurrent(signedIn)) return
        this.show(notConnectedNotice(name))
        break
      case 'unconfirmed':
        this.show(stillConnectingNotice(name))
        break
      case 'replaced':
        break
    }
  }

  /** The skills step (`Is`): the agent's private copies of the plugin's skills dropped, then the computer's plugin skills synced. */
  private async syncSkills(
    entry: PluginEntry,
    agentId: string | undefined,
  ): Promise<Synced> {
    const store = this.store
    const signedIn = store.pluginSignIn
    await store.dropPluginCopies(entry, agentId)
    // Signed out, or into another account, meanwhile: nothing more goes to that computer.
    if (!this.isCurrent(signedIn)) return { added: 0 }
    this.setBusy(1)
    try {
      const added = await store.syncPluginSkills(entry.id)
      if (!this.isCurrent(signedIn)) return { added }
      await store.readPluginSyncStatus()
      if (!this.isCurrent(signedIn)) return { added }
      await store.readAgentSkills(agentId)
      return { added }
    } catch (error) {
      return { added: 0, error: why(error) }
    } finally {
      this.setBusy(-1)
    }
  }

  /** Edit Values (`Ze`): the setup page, its values never shown. */
  editValues(entry: PluginEntry): void {
    if (!hasSetupFields(entry)) return
    this.show(undefined)
    this.setup = { entryId: entry.id, editing: true }
    this.push({ kind: 'setup', id: entry.id })
  }

  /**
   * The setup page's button, from its click: a new add's sign-in may open a
   * page once it is installed, so its click opens the tab for it
   * (`holdingTab`); Edit Values opens none.
   */
  requestSubmitSetup(
    values: Readonly<Record<string, string>>,
    agentId: string | undefined,
  ): void {
    const connector = this.connector
    if (this.setup?.editing === false && connector)
      void connector.holdingTab((tab) => this.submitSetup(values, agentId, tab))
    else void this.submitSetup(values, agentId)
  }

  /** The setup page's button (`At`): install with the values, or replace them; then back one page, and a new one's sign-in as Connect opens it. */
  async submitSetup(
    values: Readonly<Record<string, string>>,
    agentId: string | undefined,
    /** The tab the button's click opened (`requestSubmitSetup`), for a new add's sign-in. */
    tab?: HeldTab,
  ): Promise<void> {
    const setup = this.setup
    if (!setup) return
    const entry = this.catalog.find((one) => one.id === setup.entryId)
    const name = entry?.displayName ?? t('the plugin')
    this.show(undefined)
    const signedIn = this.store.pluginSignIn
    let installedNew = false
    await this.reporting(async () => {
      if (setup.editing) {
        await this.store.updatePluginValues(setup.entryId, values)
        // Signed out, or into another account, meanwhile: nothing more of it here.
        if (!this.isCurrent(signedIn)) return
        this.show(setupSavedNotice(name))
      } else {
        if (!(await this.install(setup.entryId, values, false))) return
        if (!this.isCurrent(signedIn)) return
        installedNew = true
      }
      this.setup = undefined
      this.changed()
      // Back to where Add or Edit Values was pressed, unless the person went back already.
      if (samePage(this.path.at(-1), { kind: 'setup', id: setup.entryId }))
        this.back()
    })
    if (!installedNew || !this.isCurrent(signedIn)) return
    // Its sign-in, when it has one, outside the busy mark (the window stays usable while the page is open); the values given are kept whatever the sign-in does.
    if (entry) await this.connectAfterInstall(entry, false, agentId, tab)
    else this.show({ isError: false, text: t`Added ${name}` })
  }

  /** Uninstall or Remove of a server (`dn`). */
  async remove(serverId: string, agentId: string | undefined): Promise<void> {
    const server = this.onePerServer.find((one) => one.id === serverId)
    if (!server) return
    const store = this.store
    this.show(undefined)
    const signedIn = store.pluginSignIn
    await this.reporting(async () => {
      const removal = await store.removePluginServer(serverId)
      // Signed out, or into another account, meanwhile: nothing more said here, nor asked of that computer.
      if (!this.isCurrent(signedIn)) return
      this.show(removedNotice(server.name, removal.removed, removal.reason))
      const entry = entryForServer(server, this.catalog)
      if (entry && resyncsSkills(removal)) {
        await store.dropPluginCopies(entry, agentId)
        if (!this.isCurrent(signedIn)) return
        try {
          await store.syncPluginSkills()
        } catch {
          // Let go, as the Mac does.
        }
        if (!this.isCurrent(signedIn)) return
        await store.readAgentSkills(agentId)
        if (!this.isCurrent(signedIn)) return
      }
      // A server no entry claims has no page left.
      if (
        removal.removed &&
        !entry &&
        samePage(this.path.at(-1), { kind: 'installed', id: serverId })
      )
        this.back()
    })
  }

  /** Uninstall of a plugin (`Tt`); the page stays, now with Add. */
  async uninstall(
    pluginId: string,
    agentId: string | undefined,
  ): Promise<void> {
    const store = this.store
    const entry = this.catalog.find((one) => one.id === pluginId)
    const name =
      entry?.displayName ??
      this.effective.get(pluginId)?.displayName ??
      t('the plugin')
    this.show(undefined)
    const signedIn = store.pluginSignIn
    await this.reporting(async () => {
      const removal = await store.uninstallPluginEntry(pluginId)
      // Signed out, or into another account, meanwhile: nothing more said here, nor asked of that computer.
      if (!this.isCurrent(signedIn)) return
      this.show(removedNotice(name, removal.removed, removal.reason))
      if (entry && resyncsSkills(removal)) {
        await store.dropPluginCopies(entry, agentId)
        if (!this.isCurrent(signedIn)) return
        try {
          await store.syncPluginSkills()
        } catch {
          // Let go, as the Mac does.
        }
        if (!this.isCurrent(signedIn)) return
        await store.readAgentSkills(agentId)
      }
    })
  }

  // MARK: Sign-in (`PBn`, `Qn`)

  /** The key of an account's sign-in: its own row's identifier, else the server's with the account's name. */
  signInKeyFor(server: PluginServer, accountKey: string): string {
    const identifier =
      serverAccounts(this.servers, server.id).find(
        (one) => one.accountKey === accountKey,
      )?.serverIdentifier ??
      (accountKey === defaultAccount
        ? server.rowServerIdentifier
        : `${server.rowServerIdentifier}--${accountKey}`)
    return signInKey(identifier)
  }

  /** None, waiting on its page, or waited ten minutes (`signInState`). */
  signInState(server: PluginServer, accountKey: string): SignInState {
    const flow = this.flows.get(this.signInKeyFor(server, accountKey))
    if (!flow) return 'none'
    return flow.timedOut ? 'timedOut' : 'waiting'
  }

  /** The sign-in button: the consent first for a new sign-in (Connect, Retry); Reopen opens the waiting page again at once (`requestSignIn`). */
  requestSignIn(server: PluginServer, accountKey: string): void {
    const flow = this.flows.get(this.signInKeyFor(server, accountKey))
    if (flow && !flow.timedOut) {
      // Reopen, with no consent: its own click opens the tab the page shows in again.
      void this.connector?.holdingTab((tab) =>
        this.signIn(server, accountKey, tab),
      )
      return
    }
    // Connect and Retry: the consent's Connect opens the tab, handed to the sign-in.
    this.connector?.ask(server.name, (tab) =>
      this.signIn(server, accountKey, tab),
    )
  }

  /**
   * The sign-in button (`signIn`): Reopen opens the waiting page again;
   * Connect and Retry ask the computer for a sign-in (no trigger:
   * Connectors' own), and say how it ended as Connect does.
   */
  async signIn(
    server: PluginServer,
    accountKey: string,
    /** The tab its click opened (6b's `HeldTab`), taken by the sign-in before this ends. */
    tab?: HeldTab,
  ): Promise<void> {
    const store = this.store
    const key = this.signInKeyFor(server, accountKey)
    const flow = this.flows.get(key)
    if (flow && !flow.timedOut) {
      store.reopenSignInFlow(key)
      this.openSignIn(flow.url, server.id, accountKey, server.name, tab)
      return
    }
    this.show(undefined)
    const signedIn = store.pluginSignIn
    await this.reporting(async () => {
      const answer = await store.askServerSignIn(server.id, accountKey)
      // Signed out, or into another account, meanwhile: nothing more of this sign-in here.
      if (!this.isCurrent(signedIn)) return
      const status = str(field(answer, 'status')) ?? ''
      const url = webAddress(text(field(answer, 'authorizationUrl')))
      if (status === 'started' && url != null) {
        store.startSignInFlow(key, url)
        // The page is what the person sees now; how it ends is said once it has.
        void this.openSignInAndWait(
          url,
          server.id,
          accountKey,
          server.name,
          tab,
        ).then((end) => {
          if (!this.isCurrent(signedIn)) return
          switch (end) {
            case 'connected':
              this.show(connectedNotice(server.name, 0))
              break
            case 'cancelled':
              this.show(notConnectedNotice(server.name))
              break
            case 'unconfirmed':
              this.show(stillConnectingNotice(server.name))
              break
            case 'replaced':
              break
          }
        })
      } else if (status === 'already-authenticated') {
        this.show(connectedNotice(server.name, 0))
      } else if (status === 'started') {
        // Its page is not a web address (a script): nothing opens, said as a sign-in that never opened, as Connect says it.
        this.show({ isError: true, text: didntConnect(server.name) })
      } else {
        this.show(signInNotice(status, str(field(answer, 'message'))))
      }
      await store.readPluginServers()
    })
  }

  /** Whether the account now says connected: the servers read again (the sign-in's `done`). */
  private connected(
    serverId: string,
    accountKey: string,
  ): () => Promise<boolean> {
    return async () => {
      await this.store.readPluginServers()
      return (
        serverAccounts(this.store.pluginServers, serverId).find(
          (one) => one.accountKey === accountKey,
        )?.status === 'connected'
      )
    }
  }

  /**
   * Two sign-in pages at least `signInSpacing` apart: this page's moment
   * is kept for it as it is asked (so two asked together are spaced too),
   * and the wait until then given to the sign-in (`after`), which takes
   * its click's tab at once and shows the page once the wait is over.
   */
  private spaced(): Promise<void> {
    const now = Date.now()
    const at = Math.max(now, this.lastOpen + signInSpacing * 1000)
    this.lastOpen = at
    if (at <= now) return Promise.resolve()
    return new Promise((resolve) => setTimeout(resolve, at - now))
  }

  /** The sign-in page (`openSignIn`), closed by itself once the computer says the account is connected; not waited for. */
  private openSignIn(
    url: string,
    serverId: string,
    accountKey: string,
    name: string,
    tab?: HeldTab,
  ): void {
    void this.connector?.signIn(
      url,
      name,
      this.connected(serverId, accountKey),
      {
        tab,
        after: this.spaced(),
      },
    )
  }

  /** The same page, waited for: how the sign-in ended (Connect's, `openSignInAndWait`). Started at once, so it takes its click's tab before that click's work ends. */
  private openSignInAndWait(
    url: string,
    serverId: string,
    accountKey: string,
    name: string,
    tab?: HeldTab,
  ): Promise<SignInEnd> {
    const connector = this.connector
    // No window to open it in (never in the window): kept, as one that may still finish.
    if (!connector) return Promise.resolve('unconfirmed')
    return connector.signIn(url, name, this.connected(serverId, accountKey), {
      tab,
      after: this.spaced(),
    })
  }

  // MARK: Tools and skills

  /** A tool's switch: changed at once, then asked of the computer; a refusal said under the tools and the switch put back (`toggle`). */
  toggle(tool: PluginTool, serverId: string): Promise<void> {
    return this.store.togglePluginTool(tool.name, serverId)
  }

  /** A private skill's switch; a failure is let go, as the overlay does (`setEnabled`). */
  setEnabled(skill: AgentSkill, agentId: string | undefined): Promise<void> {
    return this.store.setAgentSkillEnabled(skill, agentId)
  }

  /** Save on a skill's page: whether it was saved, and the notice (`save`). */
  async save(
    skill: AgentSkill,
    name: string,
    description: string,
    body: string,
    agentId: string,
  ): Promise<boolean> {
    this.show(undefined)
    const signedIn = this.store.pluginSignIn
    try {
      await this.store.saveAgentSkill(skill, name, description, body, agentId)
      // Signed out, or into another account, meanwhile: nothing said here.
      if (!this.isCurrent(signedIn)) return false
      this.show(savedNotice(name.trim()))
      return true
    } catch (error) {
      if (this.isCurrent(signedIn)) this.fail(error)
      return false
    }
  }

  /** Delete skill: its page closes once it is gone (`delete`). */
  async delete(skill: AgentSkill, agentId: string): Promise<void> {
    this.show(undefined)
    const signedIn = this.store.pluginSignIn
    try {
      await this.store.deleteAgentSkill(skill.id, agentId)
      // Signed out, or into another account, meanwhile: nothing said here.
      if (!this.isCurrent(signedIn)) return
      this.show(deletedNotice(skill.name))
      if (samePage(this.path.at(-1), { kind: 'skill', id: skill.id }))
        this.back()
    } catch (error) {
      if (this.isCurrent(signedIn)) this.fail(error)
    }
  }

  // MARK: Fix with agent (`si.launch`)

  /** The Plugin Setup agent: the one there is, else a new one told what to do; the agent's id once it can be opened. */
  async fixWithAgent(): Promise<string | undefined> {
    const store = this.store
    if (this.launchingFix) return undefined
    const existing = store.pluginSetupAgent
    if (existing) return existing.id
    if (store.isLoading) return undefined
    this.launchingFix = true
    this.changed()
    try {
      // Made, the roster read again, and told what to do: once the agent exists it opens, even if its first message could not be sent, which the notice says.
      const made = await store.makePluginSetupAgent()
      if (made.failure != null) this.show(agentFailedNotice(made.failure))
      return made.id
    } finally {
      this.launchingFix = false
      this.changed()
    }
  }
}
