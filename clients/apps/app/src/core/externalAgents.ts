// Settings › External Agents (11 November 2026), the web app's copy of
// SimeonCore's ExternalAgents.swift: the bots the person let in, as the
// server lists them (`GET external-agents`,
// server/simeon/desktop/external_agents.py), the page's rows (the connected
// ones with "Last used …", then Dots, Muse and Grok Bot not connected yet),
// and the page's model (read as the page opens; Disconnect said to the
// server, the list shown as it answers).

import { type JSONValue, arr, field, num, str } from './json'
import { t } from './l10n'
import { displayLocale } from './listTime'

/** One of the bots the page always lists: the server's kind, its mascot (`assets/providers/<icon>.png`), its name (theirs, never translated), its row's line and its sheet's words. */
export interface KnownBot {
  kind: string
  icon: string
  name: string
  line: () => string
  give: () => string
}

/** Dots, Muse and Grok Bot, in the order the Bots section had them. */
export const knownBots: readonly KnownBot[] = [
  {
    kind: 'dots',
    icon: 'dots',
    name: 'Dots',
    line: () => t('Connect Simeon to ChatGPT Dots.'),
    give: () => t('Give this to your Dot.'),
  },
  {
    kind: 'muse',
    icon: 'muse',
    name: 'Muse',
    line: () => t('Connect Simeon to Meta Muse.'),
    give: () => t('Give this to your Muse.'),
  },
  {
    kind: 'grok-bot',
    icon: 'grokbot',
    name: 'Grok Bot',
    line: () => t('Connect Simeon to Grok.'),
    give: () => t('Give this to your Bot.'),
  },
]

/** The mascots the account menu's row shows at its end (the reference's "Reason with" and its icons). */
export const menuIcons = ['grokbot', 'muse', 'dots'] as const

/** Where Learn more goes: the Simeon Network's page, which says what each bot can do. */
export const learnMore = 'https://simeonlabs.com/docs/network'

/** Where a bot reaches the person's agents (the server's MCP endpoint, `simeon/desktop/mcp.py`). */
export const botsAddress = 'https://api.simeonlabs.com/mcp'

/** The address a bot is given: its own for the three (`/mcp/grok-bot`: the server knows which bot it is whatever its sign-in says), the plain one for any other. */
export function botAddress(kind: string | undefined): string {
  const own: Record<string, string> = {
    dots: 'dots',
    muse: 'muse',
    'grok-bot': 'grok-bot',
    grokbot: 'grok-bot',
  }
  const path = kind == null ? undefined : own[kind]
  return path ? `${botsAddress}/${path}` : botsAddress
}

/** The icon for a kind the server names (`network.KINDS`): a known bot's mascot, its maker's mark for a coding agent, none for one there is none of. */
export function botIcon(kind: string): string | undefined {
  switch (kind) {
    case 'dots':
    case 'muse':
      return kind
    case 'grok-bot':
      return 'grokbot'
    case 'claude':
    case 'claude-code':
      return 'claude'
    case 'codex':
      return 'openai'
    case 'copilot':
      return 'copilot'
    case 'gemini':
      return 'google'
    default:
      return undefined
  }
}

/** One bot the person let in, as the server lists it (ms since 1970). */
export interface ExternalAgent {
  /** Its kind, or `client:…` for one whose kind isn't known. */
  id: string
  kind: string
  name: string
  lastUsedAt?: number
  connectedAt?: number
}

export function externalAgent(json: JSONValue): ExternalAgent | undefined {
  const id = str(field(json, 'id'))
  const name = str(field(json, 'name'))
  if (!id || name === undefined) return undefined
  return {
    id,
    kind: str(field(json, 'kind')) ?? 'agent',
    name,
    lastUsedAt: num(field(json, 'lastUsedAt')),
    connectedAt: num(field(json, 'connectedAt')),
  }
}

/** "Last used Nov 10, 2026", in the app's language. */
export function lastUsedWords(
  agent: ExternalAgent,
  options: { locale?: string; timeZone?: string } = {},
): string | undefined {
  const at = agent.lastUsedAt ?? agent.connectedAt
  if (at === undefined) return undefined
  const date = new Intl.DateTimeFormat(options.locale ?? displayLocale(), {
    timeZone: options.timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(at))
  return t`Last used ${date}`
}

/** A row of the page. */
export interface ExternalAgentRow {
  /** The server's row id for a connected bot, else the known bot's kind. */
  id: string
  name: string
  icon?: string
  /** What the server says of it, when it is connected. */
  connected?: ExternalAgent
  /** A known bot's line, while it isn't connected. */
  line?: string
}

/** The rows: the connected ones first (the newest use first, as the server sends them), then the known bots not connected yet. */
export function externalAgentRows(
  connected: readonly ExternalAgent[],
): ExternalAgentRow[] {
  const on = connected.map((agent) => ({
    id: agent.id,
    name: agent.name,
    icon: botIcon(agent.kind),
    connected: agent,
  }))
  const off = knownBots
    .filter((bot) => !connected.some((agent) => agent.kind === bot.kind))
    .map((bot) => ({
      id: bot.kind,
      name: bot.name,
      icon: bot.icon,
      line: bot.line(),
    }))
  return [...on, ...off]
}

/** The Disconnect question, the same on every app. */
export const disconnectTitle = (name: string): string => t`Disconnect ${name}?`
export const disconnectLine = (): string =>
  t('It can’t reach your agents anymore. You can connect it again anytime.')

/** The card's words: what the page is, in a line. */
export const externalAgentsHeadline = (): string =>
  t('Connect other assistants to Simeon')
export const externalAgentsExplanation = (): string =>
  t(
    'Connect Grok Bot, Muse, Dots or Claude Code. They can message your agents, follow their work and answer what they ask.',
  )

export type ExternalAgentsCall = (
  path: string,
  method?: string,
  body?: JSONValue,
) => Promise<JSONValue>

/** The page's model (SimeonCore's `ExternalAgentsModel`): the connected bots read as the page opens; Disconnect said to the server, and the list as it answers shown at once. */
export class ExternalAgentsModel {
  connected: ExternalAgent[] = []
  loaded = false
  /** What went wrong, in the person's words; the page shows it. */
  problem?: string
  private readonly listeners = new Set<() => void>()
  private version = 0

  constructor(private readonly call: ExternalAgentsCall) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  get rows(): ExternalAgentRow[] {
    return externalAgentRows(this.connected)
  }

  private changed(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }

  async load(): Promise<void> {
    try {
      this.take(await this.call('external-agents'))
      this.problem = undefined
    } catch (error) {
      this.problem = error instanceof Error ? error.message : String(error)
    }
    this.loaded = true
    this.changed()
  }

  async disconnect(id: string): Promise<void> {
    try {
      this.take(await this.call('external-agents/disconnect', 'POST', { id }))
      this.problem = undefined
    } catch (error) {
      this.problem = error instanceof Error ? error.message : String(error)
    }
    this.changed()
  }

  private take(answer: JSONValue): void {
    this.connected = (arr(field(answer, 'agents')) ?? [])
      .map(externalAgent)
      .filter((one): one is ExternalAgent => one !== undefined)
  }
}
