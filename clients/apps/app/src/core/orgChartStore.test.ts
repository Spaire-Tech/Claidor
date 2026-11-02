// Step 4e's store against a stand-in computer and server: the org chart's
// conversation between two agents (OrgChart.swift's `ExchangeCard`), and a
// starter pack read, added and found again (SimeonCore's
// `StarterPacksTests.testAddMakesTheTeamInItsFolder`, with the demo's
// shortened coffee-shop pack from Demo.swift), and its sheet as the Mac's
// MacServices asks, adds and closes it.

import { describe, expect, it } from 'vitest'
import { type JSONValue, field, str } from './json'
import { agentFrom, makeAgent } from './models'
import { AppStore } from './store'
import { FakeBackend, eventually } from './testing'

/** The website's first starter pack, shortened (Demo.swift's `packs/coffee-shop`). */
function coffeeShop(): JSONValue {
  const members: [string, string, string, string[], string][] = [
    [
      'Bruno',
      'Stock',
      'clay-07',
      ['square', 'veryfi', 'google-sheets'],
      'Keeps the shelves full and gets the reorder ready before you run out.',
    ],
    [
      'Clara',
      'Shifts',
      'clay-06',
      ['7shifts', 'whatsapp', 'google-calendar'],
      'Builds the rota and covers sick days.',
    ],
    [
      'Mae',
      'Socials',
      'clay-16',
      ['instagram', 'tiktok', 'canva'],
      'Posts the specials.',
    ],
    [
      'Ines',
      'Customers',
      'clay-24',
      ['google-maps', 'yelp', 'gmail'],
      'Answers everyone and takes the catering requests.',
    ],
    [
      'Hugo',
      'Money',
      'clay-28',
      ['quickbooks', 'paypal', 'gusto'],
      'Closes out the day and keeps the books tidy.',
    ],
  ]
  return {
    id: 'coffee-shop',
    folder: 'Coffee Shop Team',
    title: 'Simeon for Coffee Shops',
    summary:
      'Five agents for the back of the shop: stock, shifts, socials, customers and money.',
    appNames: { square: 'Square', veryfi: 'Veryfi', gmail: 'Gmail' },
    agents: members.map(([name, title, face, apps, summary]) => ({
      name,
      title,
      face,
      apps,
      summary,
      description: `${summary} Starts by asking to connect its apps.`,
    })),
  }
}

async function attached() {
  const backend = new FakeBackend()
  backend.agents = [
    makeAgent({ id: 'ada', name: 'Ada', createdAt: 1 }),
    makeAgent({ id: 'bea', name: 'Bea', createdAt: 2 }),
  ]
  backend.serverAnswers['packs/coffee-shop'] = coffeeShop()
  let made = 0
  backend.commandAnswers.createAgent = (args) => {
    made += 1
    const id = `agent-${made}`
    const agent = agentFrom({ ...(args as object), id })!
    backend.agents = [...backend.agents, agent]
    return { agent: { id } }
  }
  const store = new AppStore()
  await store.attach(backend)
  return { backend, store }
}

const sentOf = (backend: FakeBackend, method: string) =>
  backend.commands.filter((one) => one.method === method).map((one) => one.args)

describe('the org chart’s conversation between two agents', () => {
  it('reads the first one’s last 200 lines, without opening its chat', async () => {
    const { backend, store } = await attached()
    backend.lines = [
      { kind: 'message', id: 'u1', role: 'user', content: 'from the person' },
      {
        kind: 'message',
        id: 'o1',
        role: 'assistant',
        content: 'hi Bea',
        timestampMs: 2,
        toAgent: { id: 'bea', name: 'Bea' },
      },
      {
        kind: 'message',
        id: 'i1',
        role: 'user',
        content: 'hi Ada',
        timestampMs: 3,
        fromAgent: { id: 'bea', name: 'Bea' },
      },
    ]
    const lines = await store.networkExchange({ id: 'ada', name: 'Ada' }, 'bea')
    expect(lines).toEqual([
      {
        id: 'o1',
        text: 'hi Bea',
        authorId: 'ada',
        authorName: 'Ada',
        timestampMs: 2,
      },
      {
        id: 'i1',
        text: 'hi Ada',
        authorId: 'bea',
        authorName: 'Bea',
        timestampMs: 3,
      },
    ])
    expect(backend.tailed).toEqual(['ada'])
    expect(backend.opened).not.toContain('ada')
  })

  it('is refused when the lines can’t be read, and signed out', async () => {
    const { backend, store } = await attached()
    backend.tail = () => Promise.reject(new Error('offline'))
    await expect(
      store.networkExchange({ id: 'ada', name: 'Ada' }, 'bea'),
    ).rejects.toThrow('offline')
    store.detach()
    await expect(
      store.networkExchange({ id: 'ada', name: 'Ada' }, 'bea'),
    ).rejects.toThrow('Sign in to Simeon first.')
  })
})

describe('a starter pack in the store', () => {
  it('makes the team in its folder, and finds it again once added', async () => {
    const { backend, store } = await attached()
    const pack = await store.starterPack('coffee-shop')
    expect(backend.serverCalls.map((call) => call.path)).toContain(
      'packs/coffee-shop',
    )
    expect(store.packAgents(pack)).toEqual([])
    const made = await store.addPack(pack)
    expect(made).toHaveLength(5)
    const team = made.map((id) => store.agent(id)!)
    expect(team.map((agent) => agent.name)).toEqual([
      'Bruno',
      'Clara',
      'Mae',
      'Ines',
      'Hugo',
    ])
    expect(team.map((agent) => agent.title)).toEqual([
      'Stock',
      'Shifts',
      'Socials',
      'Customers',
      'Money',
    ])
    expect(team.map((agent) => agent.avatarShape)).toEqual([
      'clay-07',
      'clay-06',
      'clay-16',
      'clay-24',
      'clay-28',
    ])
    expect(
      team.every((agent) =>
        agent.description.includes('Starts by asking to connect'),
      ),
    ).toBe(true)
    // Each speaks first at once, its nonce the app's own kind.
    for (const args of sentOf(backend, 'createAgent')) {
      expect(field(args, 'isKickstartRequested')).toBe(true)
      expect(field(args, 'origin')).toBe('user')
      expect(str(field(args, 'clientNonce'))).toMatch(/^ios-/)
    }
    const section = store.sidebarSections![0]!
    expect(section).toEqual({
      id: 'pack-coffee-shop',
      name: 'Coffee Shop Team',
      agentIds: made,
    })
    // The sections written whole to the computer, the pack's first.
    const written = sentOf(backend, 'setHostSettings').at(-1)
    expect((field(written, 'sidebarSections') as JSONValue[])[0]).toMatchObject(
      { id: 'pack-coffee-shop', name: 'Coffee Shop Team' },
    )
    expect(store.packAgents(pack)).toEqual(made)
  })

  it('says the server’s sentence for a pack it doesn’t have, and its own for one it can’t read', async () => {
    const { backend, store } = await attached()
    await expect(store.starterPack('nope')).rejects.toThrow('No such path.')
    backend.serverAnswers['packs/broken'] = { id: 'broken', agents: [] }
    await expect(store.starterPack('broken')).rejects.toThrow(
      "This team isn't available anymore.",
    )
  })

  it('makes the rest when one is refused, and says the refusal', async () => {
    const { backend, store } = await attached()
    const answer = backend.commandAnswers.createAgent!
    backend.commandAnswers.createAgent = (args) => {
      if (field(args, 'name') === 'Mae') throw new Error('Not allowed.')
      return answer(args)
    }
    const made = await store.addPack(await store.starterPack('coffee-shop'))
    expect(made).toHaveLength(4)
    expect(store.problem).toBe("Couldn't create Mae: Not allowed.")
    expect(store.sidebarSections![0]!.agentIds).toEqual(made)
  })
})

describe('the starter pack’s sheet in the store', () => {
  it('shows at once, then the pack; Add makes the team and gives the first to open', async () => {
    const { store } = await attached()
    store.askPack('coffee-shop')
    expect(store.packAsk).toEqual({ id: 'coffee-shop', adding: false })
    await eventually(() => store.packAsk?.pack != null)
    expect(store.packAsk?.pack?.title).toBe('Simeon for Coffee Shops')
    const adding = store.addAskedPack()
    expect(store.packAsk?.adding).toBe(true)
    // Nothing closes it while it adds; Add again does nothing.
    store.closePack()
    expect(store.packAsk).toBeDefined()
    expect(await store.addAskedPack()).toBeUndefined()
    const first = await adding
    expect(first).toBe(store.sidebarSections![0]!.agentIds[0])
    expect(store.packAsk).toBeUndefined()
  })

  it('a team already added only opens', async () => {
    const { backend, store } = await attached()
    const made = await store.addPack(await store.starterPack('coffee-shop'))
    const before = sentOf(backend, 'createAgent').length
    store.askPack('coffee-shop')
    await eventually(() => store.packAsk?.pack != null)
    expect(store.packAgents(store.packAsk!.pack!)).toEqual(made)
    expect(await store.addAskedPack()).toBe(made[0])
    expect(sentOf(backend, 'createAgent')).toHaveLength(before)
    expect(store.packAsk).toBeUndefined()
  })

  it('says why when nothing could be made, and why it can’t be read', async () => {
    const { backend, store } = await attached()
    backend.refusedCommands.add('createAgent')
    store.askPack('coffee-shop')
    await eventually(() => store.packAsk?.pack != null)
    expect(await store.addAskedPack()).toBeUndefined()
    expect(store.packAsk).toEqual({
      id: 'coffee-shop',
      adding: false,
      failure: { added: "Couldn't create Hugo: The computer didn't answer." },
    })
    store.closePack()
    expect(store.packAsk).toBeUndefined()
    backend.serverAnswers['packs/gone'] = { code: 404 }
    store.askPack('gone')
    await eventually(() => store.packAsk?.failure != null)
    expect(store.packAsk?.failure).toEqual({
      read: "This team isn't available anymore.",
    })
  })

  it('drops a read that comes back after it was closed or signed out', async () => {
    const { backend, store } = await attached()
    backend.serverDelayMs = 20
    store.askPack('coffee-shop')
    store.closePack()
    store.askPack('coffee-shop')
    store.detach()
    await new Promise((done) => setTimeout(done, 40))
    expect(store.packAsk).toBeUndefined()
  })
})
