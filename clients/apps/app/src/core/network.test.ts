// The Simeon Network's page (core/network.ts), as SimeonCore's
// `SimeonNetworkTests`: the network as the server answers it, an invite
// pasted, and the model against a stand-in for the server.

import { describe, expect, it } from 'vitest'
import type { JSONValue } from './json'
import {
  NetworkModel,
  initial,
  inviteToken,
  joinInAddress,
  networkSnapshot,
  whereabouts,
} from './network'

/** The server's answer (`server/simeon/desktop/network.py`, `app_payload`), Ana and Maya on Ana's network. */
const answer: JSONValue = {
  network: {
    id: 'n1',
    name: "Ana's network",
    invite:
      'Join the Simeon Network: https://simeonlabs.com/network/join/#sn1-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    link: 'https://simeonlabs.com/network/join/#sn1-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  },
  you: 'ana',
  people: [
    {
      handle: 'ana',
      name: 'Ana',
      you: true,
      agents: [
        {
          id: 'iris',
          address: 'ana/Iris',
          kind: 'simeon',
          agent: 'Simeon agent',
          status: 'always on',
          role: 'Travel',
        },
      ],
      sessions: [
        {
          id: 's1',
          address: 'ana/claude',
          kind: 'claude-code',
          agent: 'Claude Code',
          status: 'busy',
          lastSeenMs: 1,
          machine: 'studio',
          repo: 'acme/api',
          branch: 'main',
          doing: 'Edit billing webhook',
        },
      ],
    },
    {
      handle: 'maya',
      name: 'Maya',
      agents: [],
      sessions: [
        {
          id: 's2',
          address: 'maya/dots',
          kind: 'dots',
          agent: 'Dots',
          status: 'away',
          lastSeenMs: 1,
        },
      ],
    },
  ],
}

const token = (letter: string) => `sn1-${letter.repeat(43)}`

describe('the network as the server answers it', () => {
  it('reads the network, its people, their agents and sessions', () => {
    const snapshot = networkSnapshot(answer)
    expect(snapshot?.name).toBe("Ana's network")
    expect(snapshot?.you).toBe('ana')
    expect(snapshot?.invite).toMatch(
      /^Join the Simeon Network: https:\/\/simeonlabs\.com\/network\/join\/#sn1-/,
    )
    expect(snapshot?.people).toHaveLength(2)
    const ana = snapshot!.people[0]!
    expect(ana.you).toBe(true)
    expect(initial(ana)).toBe('A')
    expect(ana.agents[0]?.name).toBe('Iris')
    expect(ana.agents[0]?.role).toBe('Travel')
    const claude = ana.sessions[0]!
    expect(claude.name).toBe('claude')
    expect(claude.status).toBe('busy')
    expect(whereabouts(claude)).toBe('Claude Code · studio · acme/api@main')
    const dots = snapshot!.people[1]!.sessions[0]!
    expect(dots.status).toBe('away')
    expect(whereabouts(dots)).toBe('Dots')
    expect(snapshot!.people[1]!.you).toBe(false)
    expect(networkSnapshot({ people: [] })).toBeUndefined()
  })
})

describe('an invite pasted', () => {
  it('finds the token in a line, a link or the token alone', () => {
    expect(
      inviteToken(
        `Join the Simeon Network: https://simeonlabs.com/network/join/#${token('A')}`,
      ),
    ).toBe(token('A'))
    expect(inviteToken(`  ${token('A')}\n`)).toBe(token('A'))
    expect(inviteToken('https://simeonlabs.com/network/join/')).toBeUndefined()
    expect(inviteToken('sn1-tooshort')).toBeUndefined()
  })

  it('reads the join page’s hand-over from the address', () => {
    expect(joinInAddress(`#network-join=${token('C')}`)).toBe(token('C'))
    expect(joinInAddress('#agent=iris')).toBeUndefined()
    expect(joinInAddress('#network-join=sn1-tooshort')).toBeUndefined()
    expect(joinInAddress('')).toBeUndefined()
  })
})

describe('the model', () => {
  it('reads, previews, joins, leaves, renames and makes a new link', async () => {
    const asked: [string, string | undefined, JSONValue | undefined][] = []
    const joined: JSONValue = { ...(answer as object), you: 'ana2' }
    const model = new NetworkModel(async (path, method, body) => {
      asked.push([path, method, body])
      if (path.startsWith('network/invite?'))
        return {
          name: "Maya's network",
          people: [{ handle: 'maya', name: 'Maya' }],
          already: false,
        }
      if (path === 'network/join') return joined
      return answer
    })
    let redraws = 0
    model.subscribe(() => (redraws += 1))
    await model.load()
    expect(model.snapshot?.name).toBe("Ana's network")
    expect(model.problem).toBeUndefined()
    expect(redraws).toBeGreaterThan(0)

    const line = `Join the Simeon Network: https://simeonlabs.com/network/join/#${token('B')}`
    const preview = await model.preview(line)
    expect(preview.name).toBe("Maya's network")
    expect(preview.people).toEqual(['Maya'])
    expect(asked.at(-1)?.[0]).toBe(`network/invite?link=${token('B')}`)

    await expect(model.preview('hello')).rejects.toThrow()
    expect(asked).toHaveLength(2)

    await model.join(line)
    expect(asked.at(-1)?.[0]).toBe('network/join')
    expect(asked.at(-1)?.[1]).toBe('POST')
    expect(asked.at(-1)?.[2]).toEqual({ link: token('B') })
    expect(model.snapshot?.you).toBe('ana2')

    await model.leave()
    expect(asked.at(-1)?.[0]).toBe('network/leave')
    await model.rename('Launch crew')
    expect(asked.at(-1)?.[2]).toEqual({ name: 'Launch crew' })
    await model.newLink()
    expect(asked.at(-1)?.[0]).toBe('network/invite/new')
  })

  it('says what went wrong when the network can’t be read', async () => {
    const model = new NetworkModel(async () => {
      throw new Error('Simeon Labs’ server can’t be reached.')
    })
    await model.load()
    expect(model.snapshot).toBeUndefined()
    expect(model.problem).toBe('Simeon Labs’ server can’t be reached.')
    expect(model.loading).toBe(false)
  })
})
