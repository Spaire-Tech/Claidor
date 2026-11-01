// What the window shows, kept in one place (`AppStore` in
// ios/SimeonCore/Sources/SimeonCore/Store.swift and StoreSaved.swift), and
// told to the screens when it changes.
//
// Translated so far: the roster (step 1d). On attach, the server's copy of
// the list (`chats/agents`) shows while the computer has not answered; the
// computer's own list replaces it; a computer that rests where the server
// lets it sleep is no failure; a refused account raises the access cover;
// the host's events keep the list current. The chats, the cards, the
// connectors and the rest come with their screens (docs/web-app/PROGRESS.md).
// The Mac also shows the list it kept on disk (`SavedChats`); the web shows
// the server's copy instead (the decision is in PROGRESS.md).

import { SimeonAPIError } from './api'
import type { AgentBackend, BackendEvent } from './backend'
import { GatewayError } from './gatewayConnection'
import { arr, field, str, text } from './json'
import { t } from './l10n'
import { type Agent, agentFrom, sameAgent, sortRoster } from './models'

/** The signed-in person, from `user/profile` (`Account` in Store.swift). */
export interface Account {
  name: string
  email: string
  /** The picture the sign-in gave (`avatarUrl`, Google's), https only. */
  pictureURL?: string
  /** The account's id on Simeon Labs' server. */
  id?: string
}

export function accountFrom(profile: unknown): Account | undefined {
  const email = str(field(profile, 'email')) ?? ''
  const name =
    text(field(profile, 'preferredName')) ??
    text(field(profile, 'name')) ??
    text(field(profile, 'nickname')) ??
    email.split('@')[0] ??
    ''
  if (name === '' && email === '') return undefined
  const picture = text(field(profile, 'avatarUrl'))
  return {
    name,
    email,
    pictureURL: picture?.startsWith('https://') ? picture : undefined,
    id: text(field(profile, 'id')),
  }
}

function sameList(a: readonly Agent[], b: readonly Agent[]): boolean {
  return a.length === b.length && a.every((agent, i) => sameAgent(agent, b[i]!))
}

export class AppStore {
  agents: Agent[] = []
  account?: Account
  /** The list shown is a copy (the server's), not yet the computer's. */
  showingSaved = false
  /** The copy shown is the server's. */
  listFromServer = false
  /** The computer has answered with its list in this sign-in. */
  hasReachedBox = false
  /** The list could not be read (the computer did not answer). */
  rosterFailed = false
  /** The computer refused this account (no plan): the window's access cover. */
  accessBlocked = false
  /** The event stream is up. */
  isLive = false
  /** The computer sleeps where the server lets it, and is not woken for the list. */
  isAsleep = false
  isLoading = false
  /** What went wrong, in the person's words, when the screens should say it. */
  problem?: string
  /** Whether the list's failure is said (`problem`); the Mac says it in the sidebar instead. */
  reportsRosterFailure = true
  /** Read the server's copy of the list while the computer has not answered. */
  readsServerCopy = false

  private backend?: AgentBackend
  private listening?: AbortController
  private onListShown?: () => void
  private readonly listeners = new Set<() => void>()
  private version = 0

  /** For the screens: called after each change. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** A number that changes with every change, for `useSyncExternalStore`. */
  getVersion = (): number => this.version

  private changed(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }

  /**
   * Starts on a backend: the roster, then the live events. `shown` is told as
   * soon as a list is on screen, the server's copy or the computer's.
   */
  async attach(backend: AgentBackend, shown?: () => void): Promise<void> {
    const account = this.account
    this.detach()
    this.account = account
    this.backend = backend
    this.onListShown = shown
    if (this.readsServerCopy) void this.showServerList(backend)
    this.isLoading = true
    this.changed()
    const listening = new AbortController()
    this.listening = listening
    void backend
      .events((event) => {
        if (this.backend === backend) this.apply(event)
      }, listening.signal)
      .catch(() => {})
    try {
      await this.reloadRoster()
    } finally {
      if (this.backend === backend) {
        this.isLoading = false
        this.onListShown = undefined
        this.changed()
      }
    }
  }

  /** Signed out, or the sign-in ended. */
  detach(): void {
    this.listening?.abort()
    this.listening = undefined
    this.backend = undefined
    this.agents = []
    this.account = undefined
    this.showingSaved = false
    this.listFromServer = false
    this.hasReachedBox = false
    this.rosterFailed = false
    this.accessBlocked = false
    this.isLive = false
    this.isAsleep = false
    this.problem = undefined
    this.onListShown = undefined
    this.changed()
  }

  /**
   * The server's copy of the list (`GET /desktop/api/chats/agents`), shown
   * when it comes before the computer answers. The computer's list replaces it.
   */
  private async showServerList(asked: AgentBackend): Promise<void> {
    let answer
    try {
      answer = await asked.server('chats/agents')
    } catch {
      return
    }
    if (asked !== this.backend || this.hasReachedBox) return
    const list = (arr(field(answer, 'agents')) ?? [])
      .map(agentFrom)
      .filter((agent): agent is Agent => agent != null)
    if (list.length === 0) return
    this.showingSaved = true
    this.listFromServer = true
    this.agents = sortRoster(list)
    this.changed()
    this.onListShown?.()
  }

  async reloadRoster(): Promise<void> {
    const backend = this.backend
    if (!backend) return
    try {
      const list = await backend.listAgents()
      if (backend !== this.backend) return
      this.showingSaved = false
      this.listFromServer = false
      this.agents = sortRoster(list)
      this.rosterFailed = false
      this.accessBlocked = false
      this.hasReachedBox = true
      this.changed()
    } catch (error) {
      if (backend !== this.backend) return
      // The computer rests where the server lets it sleep: the server's copy stands, and nothing failed.
      if (GatewayError.isResting(error)) return
      this.rosterFailed = true
      // The computer refused this account (`EnsureSandBox`'s permission_denied: no plan): the access cover, not a failure to report.
      this.accessBlocked =
        error instanceof SimeonAPIError && error.status === 403
      if (this.reportsRosterFailure && !this.accessBlocked) {
        const why = error instanceof Error ? error.message : String(error)
        this.problem = t`Couldn't reach your agents: ${why}`
      }
      this.changed()
    }
  }

  apply(event: BackendEvent): void {
    switch (event.kind) {
      case 'agents': {
        this.showingSaved = false
        this.listFromServer = false
        const sorted = sortRoster(event.agents)
        if (!sameList(sorted, this.agents)) this.agents = sorted
        this.changed()
        return
      }
      case 'agentUpserted': {
        // The host sends the same agent again often (each step of a turn); only a change redraws the list.
        if (this.agents.some((agent) => sameAgent(agent, event.agent))) return
        const next = this.agents.filter((agent) => agent.id !== event.agent.id)
        next.push(event.agent)
        this.agents = sortRoster(next)
        this.changed()
        return
      }
      case 'connection':
        if (this.isLive === event.live) return
        this.isLive = event.live
        this.changed()
        return
      case 'computerAsleep':
        if (this.isAsleep === event.asleep) return
        this.isAsleep = event.asleep
        this.changed()
        return
      default:
        // The rest comes with its screens.
        return
    }
  }

  /** One agent, by id. */
  agent(id: string): Agent | undefined {
    return this.agents.find((agent) => agent.id === id)
  }
}
