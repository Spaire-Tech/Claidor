// Settings › External Agents (11 November 2026), the web app's copy of
// SimeonCore's ExternalAgents.swift: the bots the person let in, as the
// server lists them (`GET external-agents`,
// server/simeon/desktop/external_agents.py), the page's rows (the connected
// ones with "Last used …", then Dots, Muse, Grok Bot, Claude Code and Codex
// not connected yet; the coding agents' sheets show the ways to connect them),
// and the page's model (read as the page opens; Disconnect said to the
// server, the list shown as it answers).

import { type JSONValue, arr, field, num, str } from './json'
import { t } from './l10n'
import { displayLocale } from './listTime'

/**
 * One of the bots the page always lists: the server's kind, its mascot
 * (`assets/mascots/<icon>.png`), its name (theirs, never translated), its
 * row's line and its sheet's words. A bot in its maker's cloud is given an
 * address; a coding agent on the person's computer is shown the ways to
 * connect it (`ways`).
 */
export interface KnownBot {
  kind: string
  icon: string
  name: string
  line: () => string
  give: () => string
  ways?: () => BotWay[]
}

/**
 * One way to connect a coding agent, as its sheet shows it: what it is, a
 * line under it, and what to copy (11 November 2026, the founder: "can we
 * add claude code - and i'm guessing codex can do that as well… we need to
 * show the many ways to do it for both").
 */
export interface BotWay {
  title: string
  line: string
  /** What is copied: words for the agent, or a command for Terminal; never translated. */
  text: string
}

/** Over a coding agent's ways: any one does it, and each signs in once in the browser. */
export const waysIntro = (): string =>
  t('Pick one. Your browser opens once, to sign in to Simeon.')

/** What a coding agent is asked: the Simeon Network's skill, which has it connect itself (simeonlabs.com/network/skill.md). */
export const askLine =
  'Follow the instructions at https://simeonlabs.com/network/skill.md'
/**
 * Claude Code alone, in Terminal: the server added for every project, then
 * its sign-in (`claude mcp login`, Claude Code 2.1.322). `;`, not `&&`: the
 * sign-in still runs when the server was added before, and Windows'
 * PowerShell 5 knows no `&&`.
 */
export const claudeCodeCommand =
  'claude mcp add --transport http --scope user simeon https://api.simeonlabs.com/mcp; claude mcp login simeon'
/** Codex alone, in Terminal: it signs in as it adds the server ("Detected OAuth support. Starting OAuth flow", Codex 0.167.1). */
export const codexCommand =
  'codex mcp add simeon --url https://api.simeonlabs.com/mcp'
/** Every coding agent on the computer at once: the network's installer adds the server and the skill to each it finds. */
export const installCommand =
  'curl -fsSL https://simeonlabs.com/network/install.sh | bash'

/** A coding agent's three ways: ask it, its own command, or the installer for all of them. */
export function codingAgentWays(name: string, command: string): BotWay[] {
  return [
    {
      title: t`Ask ${name}`,
      line: t`Paste this into ${name}. It does the rest.`,
      text: askLine,
    },
    {
      title: t('In Terminal'),
      line: t`Connects ${name} alone.`,
      text: command,
    },
    {
      title: t('Every coding agent on your computer'),
      line: t('Claude Code, Codex and the others it finds, at once.'),
      text: installCommand,
    },
  ]
}

/** Dots, Muse and Grok Bot, in the order the Bots section had them; then Claude Code and Codex, the coding agents (11 November 2026), each with the founder's mascot. */
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
  {
    kind: 'claude-code',
    icon: 'claudecode',
    name: 'Claude Code',
    line: () => t('Connect Simeon to Claude Code.'),
    give: waysIntro,
    ways: () => codingAgentWays('Claude Code', claudeCodeCommand),
  },
  {
    kind: 'codex',
    icon: 'codex',
    name: 'Codex',
    line: () => t('Connect Simeon to Codex.'),
    give: waysIntro,
    ways: () => codingAgentWays('Codex', codexCommand),
  },
]

/** The icons drawn as mascots, cut out on Connect apps' tile (`assets/mascots/<icon>.png`): white, or #2c2c2e on dark. */
export const mascotIcons: ReadonlySet<string> = new Set([
  'grokbot',
  'muse',
  'dots',
  'claudecode',
  'codex',
])

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

/**
 * The mascot of the program that coded for a cloud agent (`Party.mascot`; 13
 * November 2026, the founder: "it should be whatever agent is used. either
 * claude code or codex"): the kind's own when it has one (Cursor's logo for
 * a cloud agent in Cursor), else Claude Code's, since every cloud agent
 * before `coder` ran in Claude Code.
 */
export function cloudAgentMascot(coder: string | undefined): string {
  if (coder === 'cursor') return 'cursor'
  const icon = coder == null ? undefined : botIcon(coder)
  return icon != null && mascotIcons.has(icon) ? icon : 'claudecode'
}

/**
 * The mascot of an agent outside Simeon (`Party.mascot`; 14 November 2026,
 * the founder: "the avatar is not a simeon avatar"): its kind's own, none
 * for a kind that has no mascot or a line that doesn't say what it is.
 */
export function networkMascot(kind: string | undefined): string | undefined {
  if (kind == null) return undefined
  if (kind === 'cursor') return 'cursor'
  const icon = botIcon(kind)
  return icon != null && mascotIcons.has(icon) ? icon : undefined
}

/** The icon for a kind the server names (`network.KINDS`): a known bot's mascot (Claude Code's and Codex's the founder's), its maker's mark for another coding agent, none for one there is none of. */
export function botIcon(kind: string): string | undefined {
  switch (kind) {
    case 'dots':
    case 'muse':
    case 'codex':
      return kind
    case 'grok-bot':
      return 'grokbot'
    case 'claude-code':
      return 'claudecode'
    case 'claude':
      return 'claude'
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
    'Connect Grok Bot, Muse, Dots, Claude Code or Codex. They can message your agents, follow their work and answer what they ask.',
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
