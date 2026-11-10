// The Simeon Network as Settings › Network shows it (10 November 2026), the
// web app's copy of SimeonCore's SimeonNetwork.swift: the network the server
// answers (`GET network`, server/simeon/desktop/network.py), an invite
// pasted, and the page's model (read, preview a link, join, leave, rename,
// new link), each change shown as the server answers it.

import { SimeonAPIError } from './api'
import { type JSONValue, arr, bool, field, str } from './json'
import { t } from './l10n'

export type SessionStatus = 'busy' | 'idle' | 'away'

export interface NetworkAgent {
  id: string
  address: string
  name: string
  role?: string
}

export interface NetworkSession {
  id: string
  address: string
  name: string
  agent: string
  kind: string
  status: SessionStatus
  machine?: string
  repo?: string
  branch?: string
  doing?: string
}

export interface NetworkPerson {
  handle: string
  name: string
  avatarUrl?: string
  you: boolean
  agents: NetworkAgent[]
  sessions: NetworkSession[]
}

export interface NetworkSnapshot {
  id: string
  name: string
  /** The whole invite line: "Join the Simeon Network: https://simeonlabs.com/network/join/#sn1-…". */
  invite: string
  link: string
  you: string
  people: NetworkPerson[]
}

export interface NetworkInvitePreview {
  name: string
  people: string[]
  already: boolean
}

export const networkInstall =
  'curl -fsSL https://simeonlabs.com/network/install.sh | bash'
export const networkMcp = 'https://api.simeonlabs.com/mcp'
export const networkDocs = 'https://simeonlabs.com/docs/network'

/** The invite token in a pasted line, link or token (`sn1-` and 43 characters). */
export function inviteToken(text: string): string | undefined {
  return /sn1-[A-Za-z0-9_-]{43}/.exec(text)?.[0]
}

/** The invite the website's join page hands the web app (`#network-join=sn1-…`), or none. */
export function joinInAddress(hash: string): string | undefined {
  const asked = new URLSearchParams(hash.replace(/^#/, '')).get('network-join')
  return asked == null ? undefined : inviteToken(asked)
}

const askedKey = 'simeon.networkJoin'

/**
 * The join page's invite, read as the app starts: kept for this tab
 * (through a sign-in, which goes to its own page and back) and taken out
 * of the address, so a reload doesn't ask again. Settings › Network takes
 * it (`takeAskedJoin`) and asks whose network it is for.
 */
export function keepAskedJoin(): void {
  if (typeof window === 'undefined') return
  const token = joinInAddress(window.location.hash)
  if (!token) return
  const url = new URL(window.location.href)
  url.hash = ''
  window.history.replaceState(window.history.state, '', url.href)
  try {
    sessionStorage.setItem(askedKey, token)
  } catch {
    // No storage (a private window): the invite waits only until the next page.
    pending = token
  }
}

let pending: string | undefined

/** Whether the join page handed over an invite not yet shown. */
export function askedJoin(): boolean {
  if (pending) return true
  try {
    return sessionStorage.getItem(askedKey) != null
  } catch {
    return false
  }
}

/** The join page's invite, once. */
export function takeAskedJoin(): string | undefined {
  let token = pending
  pending = undefined
  try {
    token = sessionStorage.getItem(askedKey) ?? token
    sessionStorage.removeItem(askedKey)
  } catch {
    // No storage: the one kept here.
  }
  return token
}

/** The name after the person's handle: `ana/claude` → `claude`. */
function afterHandle(address: string): string {
  const at = address.indexOf('/')
  return at >= 0 ? address.slice(at + 1) : address
}

function networkAgent(json: JSONValue): NetworkAgent | undefined {
  const id = str(field(json, 'id'))
  const address = str(field(json, 'address'))
  if (id === undefined || address === undefined) return undefined
  const role = str(field(json, 'role'))
  return { id, address, name: afterHandle(address), ...(role ? { role } : {}) }
}

function networkSession(json: JSONValue): NetworkSession | undefined {
  const id = str(field(json, 'id'))
  const address = str(field(json, 'address'))
  if (id === undefined || address === undefined) return undefined
  const status = str(field(json, 'status'))
  const session: NetworkSession = {
    id,
    address,
    name: afterHandle(address),
    agent: str(field(json, 'agent')) ?? 'Agent',
    kind: str(field(json, 'kind')) ?? 'agent',
    status: status === 'busy' || status === 'idle' ? status : 'away',
  }
  for (const key of ['machine', 'repo', 'branch', 'doing'] as const) {
    const value = str(field(json, key))
    if (value) session[key] = value
  }
  return session
}

function networkPerson(json: JSONValue): NetworkPerson | undefined {
  const handle = str(field(json, 'handle'))
  if (handle === undefined) return undefined
  const avatarUrl = str(field(json, 'avatarUrl'))
  return {
    handle,
    name: str(field(json, 'name')) ?? handle,
    ...(avatarUrl ? { avatarUrl } : {}),
    you: bool(field(json, 'you')) ?? false,
    agents: (arr(field(json, 'agents')) ?? [])
      .map(networkAgent)
      .filter((one): one is NetworkAgent => one !== undefined),
    sessions: (arr(field(json, 'sessions')) ?? [])
      .map(networkSession)
      .filter((one): one is NetworkSession => one !== undefined),
  }
}

/** The network as the server answers it, or undefined. */
export function networkSnapshot(json: JSONValue): NetworkSnapshot | undefined {
  const network = field(json, 'network')
  const id = str(field(network, 'id'))
  const name = str(field(network, 'name'))
  if (id === undefined || name === undefined) return undefined
  return {
    id,
    name,
    invite: str(field(network, 'invite')) ?? '',
    link: str(field(network, 'link')) ?? '',
    you: str(field(json, 'you')) ?? '',
    people: (arr(field(json, 'people')) ?? [])
      .map(networkPerson)
      .filter((one): one is NetworkPerson => one !== undefined),
  }
}

/** Where a session works, in one line: "Claude Code · studio · acme/api@main". */
export function whereabouts(session: NetworkSession): string {
  const parts = [session.agent]
  if (session.machine) parts.push(session.machine)
  if (session.repo)
    parts.push(
      session.branch ? `${session.repo}@${session.branch}` : session.repo,
    )
  return parts.join(' · ')
}

/** A person's first letter, for one without a picture. */
export function initial(person: NetworkPerson): string {
  return person.name.slice(0, 1).toUpperCase() || '?'
}

export type NetworkCall = (
  path: string,
  method?: string,
  body?: JSONValue,
) => Promise<JSONValue>

/** The page's model: the network read as the page opens; each change said to the server and shown as it answers. */
export class NetworkModel {
  snapshot?: NetworkSnapshot
  loading = false
  /** What went wrong, in the person's words; the page shows it. */
  problem?: string
  private readonly listeners = new Set<() => void>()
  private version = 0

  constructor(private readonly call: NetworkCall) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  private changed(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }

  async load(): Promise<void> {
    if (this.loading) return
    this.loading = true
    this.changed()
    try {
      this.take(await this.call('network'))
      this.problem = undefined
    } catch (error) {
      this.problem = error instanceof Error ? error.message : String(error)
    } finally {
      this.loading = false
      this.changed()
    }
  }

  /** Whose network a pasted invite is for; throws the words for one that isn't an invite or no longer works. */
  async preview(text: string): Promise<NetworkInvitePreview> {
    const token = inviteToken(text)
    if (!token)
      throw new SimeonAPIError(
        t('This isn’t a Simeon Network invite link.'),
        400,
      )
    const answer = await this.call(`network/invite?link=${token}`)
    const name = str(field(answer, 'name'))
    if (name === undefined)
      throw new SimeonAPIError(
        t('This isn’t a Simeon Network invite link.'),
        400,
      )
    return {
      name,
      people: (arr(field(answer, 'people')) ?? [])
        .map((one) => str(field(one, 'name')))
        .filter((one): one is string => one !== undefined),
      already: bool(field(answer, 'already')) ?? false,
    }
  }

  async join(text: string): Promise<void> {
    this.take(
      await this.call('network/join', 'POST', {
        link: inviteToken(text) ?? text,
      }),
    )
  }

  async leave(): Promise<void> {
    this.take(await this.call('network/leave', 'POST', {}))
  }

  async rename(name: string): Promise<void> {
    this.take(await this.call('network/rename', 'POST', { name }))
  }

  async newLink(): Promise<void> {
    this.take(await this.call('network/invite/new', 'POST', {}))
  }

  private take(answer: JSONValue): void {
    const found = networkSnapshot(answer)
    if (!found)
      throw new SimeonAPIError(
        t('Simeon Labs’ server answered with something unexpected.'),
        200,
      )
    this.snapshot = found
    this.changed()
  }
}
