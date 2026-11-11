// Settings › External Agents (core/externalAgents.ts), as SimeonCore's
// `ExternalAgentsTests`: the bots as the server lists them, the page's rows,
// each bot's address, and the model against a stand-in for the server.

import { describe, expect, it } from 'vitest'
import { SimeonAPIError } from './api'
import {
  ExternalAgentsModel,
  botAddress,
  botIcon,
  botsAddress,
  externalAgent,
  externalAgentRows,
  knownBots,
  lastUsedWords,
  mascotIcons,
} from './externalAgents'
import type { JSONValue } from './json'

/** `GET /desktop/api/external-agents` (`server/simeon/desktop/external_agents.py`): Grok Bot used yesterday, Claude Code last week. */
const answer: JSONValue = {
  agents: [
    {
      id: 'grok-bot',
      kind: 'grok-bot',
      name: 'Grok Bot',
      lastUsedAt: 1_794_355_200_000,
      connectedAt: 1_794_300_000_000,
    },
    {
      id: 'claude-code',
      kind: 'claude-code',
      name: 'Claude Code',
      lastUsedAt: 1_793_800_000_000,
    },
    { kind: 'dots', name: 'No id' },
  ],
}

const agentsOf = (json: JSONValue) =>
  ((json as { agents: JSONValue[] }).agents ?? [])
    .map(externalAgent)
    .filter((one) => one !== undefined)

describe('External Agents', () => {
  it('puts the connected first, then the known bots not connected yet', () => {
    const agents = agentsOf(answer)
    expect(agents.map((one) => one.id)).toEqual(['grok-bot', 'claude-code'])
    const rows = externalAgentRows(agents)
    // Claude Code connected isn't offered again; Codex is.
    expect(rows.map((row) => row.id)).toEqual([
      'grok-bot',
      'claude-code',
      'dots',
      'muse',
      'codex',
    ])
    expect(rows.map((row) => row.icon)).toEqual([
      'grokbot',
      'claudecode',
      'dots',
      'muse',
      'codex',
    ])
    expect(rows[0].connected).toBeDefined()
    expect(rows[0].line).toBeUndefined()
    expect(rows[2].line).toBe('Connect Simeon to ChatGPT Dots.')
    expect(externalAgentRows([]).map((row) => row.name)).toEqual([
      'Dots',
      'Muse',
      'Grok Bot',
      'Claude Code',
      'Codex',
    ])
  })

  it('shows a coding agent the ways to connect it, and a hosted bot an address', () => {
    const claude = knownBots.find((bot) => bot.kind === 'claude-code')
    expect(claude?.ways?.().map((way) => way.title)).toEqual([
      'Ask Claude Code',
      'In Terminal',
      'Every coding agent on your computer',
    ])
    expect(claude?.ways?.().map((way) => way.text)).toEqual([
      'Follow the instructions at https://simeonlabs.com/network/skill.md',
      'claude mcp add --transport http --scope user simeon https://api.simeonlabs.com/mcp; claude mcp login simeon',
      'curl -fsSL https://simeonlabs.com/network/install.sh | bash',
    ])
    expect(claude?.give()).toBe(
      'Pick one. Your browser opens once, to sign in to Simeon.',
    )
    const codex = knownBots.find((bot) => bot.kind === 'codex')
    const ways = codex?.ways?.() ?? []
    expect(ways[0].line).toBe('Paste this into Codex. It does the rest.')
    // Codex signs in as it adds the server.
    expect(ways[1].text).toBe(
      'codex mcp add simeon --url https://api.simeonlabs.com/mcp',
    )
    expect(ways[1].line).toBe('Connects Codex alone.')
    for (const kind of ['dots', 'muse', 'grok-bot'])
      expect(knownBots.find((bot) => bot.kind === kind)?.ways).toBeUndefined()
    for (const bot of knownBots) expect(mascotIcons.has(bot.icon)).toBe(true)
  })

  it('says when a bot was last used, as a date', () => {
    const [bot] = agentsOf(answer)
    expect(
      lastUsedWords(bot, {
        locale: 'en-US',
        timeZone: 'America/Los_Angeles',
      }),
    ).toBe('Last used Nov 10, 2026')
    expect(lastUsedWords({ id: 'x', kind: 'agent', name: 'X' })).toBeUndefined()
  })

  it('gives each bot its address and icon', () => {
    expect(botAddress('grok-bot')).toBe(
      'https://api.simeonlabs.com/mcp/grok-bot',
    )
    expect(botAddress('grokbot')).toBe(
      'https://api.simeonlabs.com/mcp/grok-bot',
    )
    expect(botAddress('dots')).toBe('https://api.simeonlabs.com/mcp/dots')
    expect(botAddress('muse')).toBe('https://api.simeonlabs.com/mcp/muse')
    expect(botAddress(undefined)).toBe(botsAddress)
    expect(botAddress('any')).toBe(botsAddress)
    expect(botIcon('codex')).toBe('codex')
    // The founder's mascot for Claude Code; Claude in its own app keeps the app's icon.
    expect(botIcon('claude-code')).toBe('claudecode')
    expect(botIcon('claude')).toBe('claude')
    expect(botIcon('cursor')).toBeUndefined()
  })

  it('reads and disconnects', async () => {
    const calls: [string, string | undefined][] = []
    let connected: JSONValue = answer
    const model = new ExternalAgentsModel(async (path, method, body) => {
      calls.push([path, method])
      if (path === 'external-agents/disconnect') {
        expect(body).toEqual({ id: 'grok-bot' })
        connected = {
          agents: [
            {
              id: 'claude-code',
              kind: 'claude-code',
              name: 'Claude Code',
              lastUsedAt: 1,
            },
          ],
        }
      }
      return connected
    })
    let heard = 0
    model.subscribe(() => (heard += 1))
    await model.load()
    expect(model.loaded).toBe(true)
    expect(model.connected.map((one) => one.id)).toEqual([
      'grok-bot',
      'claude-code',
    ])
    await model.disconnect('grok-bot')
    expect(model.connected.map((one) => one.id)).toEqual(['claude-code'])
    expect(model.rows.map((row) => row.id)).toEqual([
      'claude-code',
      'dots',
      'muse',
      'grok-bot',
      'codex',
    ])
    expect(calls).toEqual([
      ['external-agents', undefined],
      ['external-agents/disconnect', 'POST'],
    ])
    expect(heard).toBe(2)
  })

  it('says a failure', async () => {
    const model = new ExternalAgentsModel(async () => {
      throw new SimeonAPIError('Simeon Labs’ server didn’t answer.', 502)
    })
    await model.load()
    expect(model.problem).toBe('Simeon Labs’ server didn’t answer.')
    expect(model.loaded).toBe(true)
  })
})
