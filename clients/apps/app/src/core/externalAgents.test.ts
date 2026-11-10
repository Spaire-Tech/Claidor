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
  lastUsedWords,
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
    expect(rows.map((row) => row.id)).toEqual([
      'grok-bot',
      'claude-code',
      'dots',
      'muse',
    ])
    expect(rows.map((row) => row.icon)).toEqual([
      'grokbot',
      'claude',
      'dots',
      'muse',
    ])
    expect(rows[0].connected).toBeDefined()
    expect(rows[0].line).toBeUndefined()
    expect(rows[2].line).toBe('Connect Simeon to ChatGPT Dots.')
    expect(externalAgentRows([]).map((row) => row.name)).toEqual([
      'Dots',
      'Muse',
      'Grok Bot',
    ])
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
    expect(botIcon('codex')).toBe('openai')
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
