// The shared core's `SavedChatsTests` (ios/SimeonCore/Tests/SimeonCoreTests/SavedChatsTests.swift):
// the agents and chats kept on this device (the Windows app's), shown while
// the computer is away, replaced when it answers, never another account's;
// the pins and folders and the connectors' catalogue kept with them. The
// files are a place in memory here (`MemorySavedPlace`); the Windows app's
// own place, its folder on the PC, is checked in windows/test. The test of
// an id never naming a path is the main process's (windows/test).

import { describe, expect, it } from 'vitest'
import type { ChatRow } from './chat'
import { Entry } from './entry'
import { GatewayError } from './gatewayConnection'
import type { JSONObject, JSONValue } from './json'
import { currentLanguage } from './language'
import { type Agent, agentFrom, makeAgent, previewLine } from './models'
import {
  MemorySavedPlace,
  SavedChats,
  type SavedFileName,
  agentSavedJSON,
  keptLines,
  linesKept,
  ownerOf,
  sameOwner,
  savedOwner,
} from './savedChats'
import {
  type SidebarSection,
  assignAgents,
  unassignedId,
} from './sidebarSections'
import { type Account, AppStore } from './store'
import { FakeBackend, ms } from './testing'

const bass: Account = {
  name: 'Bass',
  email: 'bass@simeonlabs.com',
  id: 'acct-1',
}
const other: Account = {
  name: 'Rhea',
  email: 'rhea@simeonlabs.com',
  id: 'acct-2',
}

function line(
  id: string,
  text: string,
  at: number,
  role = 'user',
  streaming = false,
): Entry {
  const json: JSONObject = {
    kind: 'message',
    id,
    role,
    content: text,
    timestampMs: at,
  }
  if (streaming) json.isStreaming = true
  return Entry.from(json)!
}

/** Whether the pins and sections shown are the device's copy (the core's `pinsKept`, `sectionsKept`; private in the store). */
const kept = (store: AppStore) =>
  store as unknown as { pinsKept: boolean; sectionsKept: boolean }

const texts = (rows: readonly ChatRow[]) =>
  rows.flatMap((row) => (row.kind === 'bubble' ? [row.bubble.text] : []))

/** A computer that can be away (`AwayBackend`): asleep, every call fails; its settings and catalogue as told. */
class AwayBackend extends FakeBackend {
  away = false
  hostSettings: JSONObject = {}
  settingsWrites: JSONObject[] = []
  catalog: JSONValue[] = []
  catalogReads = 0

  constructor() {
    super()
    this.agents = [makeAgent({ id: 'theo', name: 'Theo' })]
  }

  private reach(): void {
    if (this.away) throw new GatewayError('asleep', false)
  }

  override async listAgents(): Promise<Agent[]> {
    this.reach()
    return super.listAgents()
  }

  override async transcriptPage(agentId: string, before?: number) {
    this.reach()
    return super.transcriptPage(agentId, before)
  }

  override async tail(agentId: string, limit: number) {
    this.reach()
    return super.tail(agentId, limit)
  }

  override async command(
    method: string,
    args: JSONValue = {},
    options: { wakes?: boolean } = {},
  ): Promise<JSONValue> {
    this.commands.push({ method, args, wakes: options.wakes ?? true })
    this.reach()
    const action = (args as { action?: string } | null)?.action
    if (method === 'getHostSettings') return this.hostSettings
    if (method === 'desktopMcp' && action === 'getCatalog') {
      this.catalogReads += 1
      return this.catalog
    }
    if (method === 'desktopMcp' && action === 'listServers')
      return { servers: [] }
    if (method === 'setHostSettings') {
      const written = args as JSONObject
      this.settingsWrites.push(written)
      this.hostSettings = { ...this.hostSettings, ...written }
      return {}
    }
    return {}
  }
}

/** A store on the device's copy kept at `place`, read as a sign-in reads it. */
async function storeOn(
  place: MemorySavedPlace,
  account?: Account,
): Promise<AppStore> {
  const store = new AppStore()
  const saved = new SavedChats(place)
  await saved.load()
  store.saved = saved
  if (account) store.account = account
  return store
}

/** What a new launch would read from the place. */
async function readBack(place: MemorySavedPlace): Promise<SavedChats> {
  const saved = new SavedChats(place)
  await saved.load()
  return saved
}

describe('the files', () => {
  it('reads a kept agent back as the same row, less what was going on', () => {
    const row = {
      id: 'theo',
      name: 'Theo',
      title: 'Travel',
      description: 'Books trips',
      avatarColor: '#FF6A00',
      avatarDataUrl: 'data:image/png;base64,AAAA',
      isGroup: false,
      memberIds: [],
      lastMessagePreview: 'Done',
      lastActivityAt: 5_000,
      hasUnread: true,
      unreadCount: 2,
      isRunningTurn: true,
      isRunning: true,
      isComposingMessage: true,
      currentActivity: {
        label: 'Searching',
        kind: 'tool',
        tool: 'web',
        detail: 'flights',
        target: 'iris',
      },
      isHiddenFromSidebar: true,
      notifyOnUpdatesEnabled: false,
      voiceId: 'v1',
      avatarVersion: '3',
      avatarShape: 'clay-07',
      sharedRoomId: 'room-1',
      awaitingUserResponse: { reason: 'Approve the fare' },
      lastMessageId: 'm9',
      lastEntry: { kind: 'text', text: 'Done' },
      createdAt: 1_000,
      purpose: 'disk-saver',
      conversationPartnerIds: ['iris'],
      updatedAt: 4_000,
      snapshotEpoch: 'e1',
      snapshotSeq: 7,
    }
    const theo = agentFrom(row)!
    const expected: Agent = {
      ...theo,
      isRunningTurn: false,
      isRunning: false,
      isComposing: false,
      activityLabel: undefined,
      activityKind: undefined,
      activityTool: undefined,
      activityDetail: undefined,
      activityTarget: undefined,
    }
    const back = agentFrom(agentSavedJSON(theo))
    expect(back).toEqual(expected)
    expect(previewLine(back!)).toBe('Waiting for you: Approve the fare')
    expect(back?.unreadCount).toBe(2)
    expect(back?.isSharedRoom).toBe(true)

    const room = agentFrom({
      id: 'g',
      name: 'Room',
      isGroup: true,
      memberIds: ['theo', 'iris'],
      remoteRoom: { host: 'x' },
    })!
    expect(agentFrom(agentSavedJSON(room))).toEqual(room)
    const bare = makeAgent({ id: 'iris', name: 'Iris' })
    expect(agentFrom(agentSavedJSON(bare))).toEqual(bare)
  })

  it('keeps the list and a chat, and reads them back at the next launch', async () => {
    const place = new MemorySavedPlace()
    const saved = new SavedChats(place)
    const owner = savedOwner('acct-1', 'Bass@SimeonLabs.com')
    saved.writeRoster(
      [
        makeAgent({ id: 'theo', name: 'Theo' }),
        makeAgent({ id: 'iris', name: 'Iris' }),
      ],
      owner,
    )
    saved.writeChat(
      'theo',
      [
        line('u1', 'Hi Theo', 1_000),
        line('a1', 'Half an ans', 2_000, 'assistant', true),
      ],
      false,
    )
    await saved.waitForWrites()

    const again = await readBack(place)
    expect(again.readRoster()?.agents.map((a) => a.id)).toEqual([
      'theo',
      'iris',
    ])
    expect(again.readRoster()?.owner).toEqual(owner)
    expect(again.readRoster()?.owner.email).toBe('bass@simeonlabs.com')
    const lines = await again.readChat('theo')
    expect(lines?.entries.map((e) => e.id)).toEqual(['u1', 'a1'])
    // A line cut off while it streamed is kept as finished.
    expect(lines?.entries.at(-1)?.isStreaming).toBe(false)
    expect(lines?.entries.at(-1)?.content).toBe('Half an ans')
    expect(lines?.hasOlder).toBe(false)
    expect(await again.readChat('iris')).toBeUndefined()

    // An agent no longer in the list loses its chat; signing out takes everything.
    again.removeChats(new Set(['iris']))
    await again.waitForWrites()
    expect(await (await readBack(place)).readChat('theo')).toBeUndefined()
    expect((await readBack(place)).readRoster()).toBeDefined()
    again.forget()
    await again.waitForWrites()
    expect(again.readRoster()).toBeUndefined()
    expect((await readBack(place)).readRoster()).toBeUndefined()
    expect(place.files).toEqual({})
    expect(place.chats.size).toBe(0)
  })

  it('keeps a long chat’s newest lines, and a large one’s fewer or none', () => {
    const long = Array.from({ length: 400 }, (_, i) =>
      line(`l${i}`, `Line ${i}`, i),
    )
    const kept = keptLines(long, false)
    expect(kept?.entries).toHaveLength(linesKept)
    expect(kept?.entries[0]?.id).toBe('l100')
    // Lines were left out.
    expect(kept?.hasOlder).toBe(true)
    expect(keptLines(long.slice(0, 150), false)?.hasOlder).toBe(false)
    expect(keptLines(long.slice(0, 150), true)?.hasOlder).toBe(true)
    expect(keptLines([], false)).toBeUndefined()

    const big = 'x'.repeat(10_000)
    const large = Array.from({ length: 300 }, (_, i) => line(`b${i}`, big, i))
    expect(keptLines(large, false)?.entries).toHaveLength(100)
    const huge = 'x'.repeat(30_000)
    expect(
      keptLines(
        Array.from({ length: 300 }, (_, i) => line(`h${i}`, huge, i)),
        false,
      ),
    ).toBeUndefined()
  })

  it('knows the same person by id, else by e-mail', () => {
    expect(
      sameOwner(savedOwner('a', 'x@y.com'), savedOwner('a', 'other@y.com')),
    ).toBe(true)
    expect(
      sameOwner(savedOwner('a', 'x@y.com'), savedOwner('b', 'x@y.com')),
    ).toBe(false)
    expect(
      sameOwner(savedOwner(undefined, 'X@y.com'), savedOwner('b', 'x@Y.com')),
    ).toBe(true)
    expect(
      sameOwner(savedOwner(undefined, ''), savedOwner(undefined, '')),
    ).toBe(false)
    expect(ownerOf(undefined)).toBeUndefined()
    expect(ownerOf({ email: '', id: undefined })).toBeUndefined()
    expect(ownerOf({ email: 'b@y.com', id: '' })?.id).toBeUndefined()
  })

  it('never keeps a read begun before a sign-out, nor one over a newer write', async () => {
    const place = new MemorySavedPlace()
    const first = new SavedChats(place)
    first.writeChat('theo', [line('u1', 'Hi', 1)], false)
    await first.waitForWrites()
    const saved = await readBack(place)
    const reading = saved.readChat('theo')
    saved.forget()
    expect(await reading).toBeUndefined()
    await saved.waitForWrites()
    expect(await saved.readChat('theo')).toBeUndefined()

    first.writeChat('iris', [line('o1', 'Old', 1)], false)
    await first.waitForWrites()
    const later = await readBack(place)
    const read = later.readChat('iris')
    later.writeChat('iris', [line('n1', 'New', 2)], false)
    expect((await read)?.entries.map((e) => e.id)).toEqual(['n1'])
  })
})

describe('the order of reads and writes', () => {
  /** A place whose writes take their time, as a large list's does through the app. */
  class SlowPlace extends MemorySavedPlace {
    override async write(
      name: SavedFileName,
      record: JSONValue,
    ): Promise<void> {
      await ms(30)
      return super.write(name, record)
    }
  }

  it('reads back nothing a sign-out forgot while a write was on its way (the Mac’s one queue)', async () => {
    const place = new SlowPlace()
    place.files.roster = JSON.stringify({
      version: 1,
      email: 'bass@simeonlabs.com',
      agents: [{ id: 'theo', name: 'Theo' }],
    })
    place.chats.set(
      'theo',
      JSON.stringify({
        version: 1,
        agentId: 'theo',
        entries: [
          {
            kind: 'message',
            id: 'u1',
            role: 'user',
            content: 'Hi',
            timestampMs: 1,
          },
        ],
      }),
    )
    const saved = new SavedChats(place)
    saved.writeRoster(
      [makeAgent({ id: 'theo', name: 'Theo' })],
      savedOwner('acct-1', bass.email),
    )
    saved.forget()
    // The next sign-in reads as the forget is still waiting behind the write.
    await saved.load()
    expect(saved.readRoster()).toBeUndefined()
    expect(await saved.readChat('theo')).toBeUndefined()
  })
})

describe('the store', () => {
  /** View › Reload (7c's Control-R) attaches again: what is kept on the PC stays, and shows again; only a sign-out, an ended sign-in or another account forget it. */
  it('keeps the copy on the PC through a Reload', async () => {
    const place = new MemorySavedPlace()
    const store = await storeOn(place, bass)
    const backend = new AwayBackend()
    backend.lines.push({
      kind: 'message',
      id: 'a1',
      role: 'assistant',
      content: 'On it',
      timestampMs: 3_000,
    })
    await store.attach(backend)
    await store.open('theo')
    store.saveNow()
    await store.saved?.waitForWrites()
    const files = { ...place.files }
    const chats = new Map(place.chats)
    expect(files.roster).toBeDefined()
    expect(chats.size).toBe(1)
    // Reload: the same computer, attached again, now asleep.
    backend.away = true
    let shown: string[] = []
    await store.attach(backend, () => {
      shown = store.agents.map((agent) => agent.id)
    })
    await store.saved?.waitForWrites()
    expect(place.files.roster).toBe(files.roster)
    expect(place.chats).toEqual(chats)
    expect(shown).toEqual(['theo'])
    expect(store.showingSaved).toBe(true)
    await store.open('theo')
    expect(texts(store.rows('theo'))).toEqual(['Hi Theo', 'On it'])
    // A detach then an attach (a Reload done so) forgets nothing either.
    store.detach()
    await store.attach(backend)
    await store.saved?.waitForWrites()
    expect(place.chats).toEqual(chats)
    expect(store.agents.map((agent) => agent.id)).toEqual(['theo'])
  })

  /** A first launch keeps what the computer sent; the next, with the computer asleep, shows it at once, and the computer's copy replaces it when it wakes. */
  it('shows the list and a chat from this device while the computer is away', async () => {
    const place = new MemorySavedPlace()
    const first = await storeOn(place, bass)
    const up = new AwayBackend()
    up.lines.push({
      kind: 'message',
      id: 'a1',
      role: 'assistant',
      content: 'On it',
      timestampMs: 3_000,
    })
    await first.attach(up)
    await first.open('theo')
    first.saveNow()
    await first.saved?.waitForWrites()
    first.detach()
    expect(
      (await (await readBack(place)).readChat('theo'))?.entries.map(
        (e) => e.id,
      ),
    ).toEqual(['u1', 'a1'])

    const store = await storeOn(place, bass)
    const backend = new AwayBackend()
    backend.away = true
    // The window shows when told the list is up: with the computer already attached, so a chat opened then opens.
    let shown: { saved: boolean; agents: string[] } | undefined
    await store.attach(backend, () => {
      shown = {
        saved: store.showingSaved,
        agents: store.agents.map((a) => a.id),
      }
    })
    expect(shown).toEqual({ saved: true, agents: ['theo'] })
    expect(store.agents.map((a) => a.id)).toEqual(['theo'])
    expect(store.showingSaved).toBe(true)
    await store.open('theo')
    expect(texts(store.rows('theo'))).toEqual(['Hi Theo', 'On it'])
    // No "Couldn't load this conversation" over the kept lines.
    expect(store.loadFailed.has('theo')).toBe(false)
    // Nothing the computer did not send is kept: the copy is as the first launch left it.
    store.saveNow()
    await store.saved?.waitForWrites()
    expect(
      (await readBack(place)).readRoster()?.agents.map((a) => a.id),
    ).toEqual(['theo'])
    expect(
      (await (await readBack(place)).readChat('theo'))?.entries.map(
        (e) => e.id,
      ),
    ).toEqual(['u1', 'a1'])

    // The computer wakes: its list, and its chat in place of the kept lines.
    backend.away = false
    backend.agents = [
      makeAgent({ id: 'theo', name: 'Theo' }),
      makeAgent({ id: 'iris', name: 'Iris' }),
    ]
    // "On it" was taken back on the computer meanwhile: newer than all the computer has, it goes all the same.
    backend.lines = [
      {
        kind: 'message',
        id: 'u1',
        role: 'user',
        content: 'Hi Theo',
        timestampMs: 1_000,
      },
      {
        kind: 'message',
        id: 'u2',
        role: 'user',
        content: 'Book it',
        timestampMs: 2_000,
      },
    ]
    await store.reloadRoster()
    expect(store.showingSaved).toBe(false)
    expect(new Set(store.agents.map((a) => a.id))).toEqual(
      new Set(['theo', 'iris']),
    )
    await store.refresh('theo')
    // A kept line the computer no longer has goes.
    expect(texts(store.rows('theo'))).toEqual(['Hi Theo', 'Book it'])
    store.saveNow()
    await store.saved?.waitForWrites()
    expect(
      (await (await readBack(place)).readChat('theo'))?.entries.map(
        (e) => e.id,
      ),
    ).toEqual(['u1', 'u2'])
    expect(
      new Set((await readBack(place)).readRoster()?.agents.map((a) => a.id)),
    ).toEqual(new Set(['theo', 'iris']))
  })

  const travel = { id: 's1', name: 'Travel', agentIds: ['iris'] }
  const work = { id: 's2', name: 'Work', agentIds: ['theo'] }

  /** A first launch keeps the computer's pins and folders with the list, for the next launch to show at once. */
  async function keptOnce(
    place: MemorySavedPlace,
    pins: string[],
    sections: JSONValue,
  ): Promise<void> {
    const first = await storeOn(place, bass)
    const up = new AwayBackend()
    up.agents = [
      makeAgent({ id: 'theo', name: 'Theo' }),
      makeAgent({ id: 'iris', name: 'Iris' }),
    ]
    up.hostSettings = { pinnedAgentIds: pins, sidebarSections: sections }
    await first.attach(up)
    first.saveNow()
    await first.saved?.waitForWrites()
    first.detach()
  }

  /**
   * The founder, 27 October 2026: at launch every chat showed in one list,
   * then went to its folder seconds later (longer with the computer
   * asleep). The pins and folders now come with the list kept on this
   * device; the computer's replace them when it answers.
   */
  it('shows the pins and folders with the kept list at launch', async () => {
    const place = new MemorySavedPlace()
    await keptOnce(place, ['theo'], [travel])
    expect((await readBack(place)).readLayout()?.pinnedIds).toEqual(['theo'])

    const store = await storeOn(place, bass)
    const asleep = new AwayBackend()
    asleep.away = true
    let shown: { pins: string[]; folders: string[] } | undefined
    await store.attach(asleep, () => {
      shown = {
        pins: [...store.pinnedIds],
        folders: (store.sidebarSections ?? []).map((s) => s.id),
      }
    })
    // The pins are there as the list first shows.
    expect(shown?.pins).toEqual(['theo'])
    expect(shown?.folders).toEqual(['s1', unassignedId])
    expect(store.sidebarSections?.[0]?.agentIds).toEqual(['iris'])
    expect(kept(store).pinsKept).toBe(true)
    expect(kept(store).sectionsKept).toBe(true)

    // The computer wakes with changes made elsewhere: its own replace the device's, and are kept in turn.
    asleep.away = false
    asleep.hostSettings = { pinnedAgentIds: ['iris'], sidebarSections: [work] }
    await store.loadPins()
    await store.loadSections()
    expect(store.pinnedIds).toEqual(['iris'])
    expect(store.sidebarSections?.[0]?.id).toBe('s2')
    expect(kept(store).pinsKept).toBe(false)
    expect(kept(store).sectionsKept).toBe(false)
    await store.reloadRoster()
    store.saveNow()
    await store.saved?.waitForWrites()
    expect((await readBack(place)).readLayout()?.pinnedIds).toEqual(['iris'])
    expect((await readBack(place)).readLayout()?.sections?.[0]?.id).toBe('s2')

    // Another account never sees them.
    const rhea = await storeOn(place, other)
    const away = new AwayBackend()
    away.away = true
    await rhea.attach(away)
    expect(rhea.pinnedIds).toEqual([])
    expect(rhea.sidebarSections).toBeUndefined()
  })

  const gmail = {
    id: 'gmail',
    name: 'gmail',
    displayName: 'Gmail',
    description: 'Mail',
    category: 'Communication',
  }
  const slack = {
    id: 'slack',
    name: 'slack',
    displayName: 'Slack',
    description: 'Chat',
    category: 'Communication',
  }

  /**
   * The connectors' catalogue kept on this device (28 October 2026, the
   * founder: "i hate the loading connectors"): there as the list first
   * shows, kept while the computer rests, replaced by the computer's once
   * it answers, and kept again. Another language's is not shown.
   */
  it('has the connectors’ catalogue there at launch', async () => {
    const place = new MemorySavedPlace()
    const first = await storeOn(place, bass)
    const up = new AwayBackend()
    up.catalog = [gmail]
    await first.attach(up)
    const read = await first.readCatalog()
    expect(read?.map((entry) => entry.id)).toEqual(['gmail'])
    expect(first.catalog.map((app) => app.title)).toEqual(['Gmail'])
    await first.saved?.waitForWrites()
    expect((await readBack(place)).readCatalog(currentLanguage())).toBeDefined()
    expect((await readBack(place)).readCatalog('xx')).toBeUndefined()

    const store = await storeOn(place, bass)
    const asleep = new AwayBackend()
    asleep.away = true
    let shown: string[] = []
    await store.attach(asleep, () => {
      shown = store.catalogEntries.map((entry) => entry.id)
    })
    // The catalogue is there as the list first shows.
    expect(shown).toEqual(['gmail'])
    expect(store.catalog.map((app) => app.title)).toEqual(['Gmail'])
    // Resting: what was shown stays.
    expect(await store.readCatalog()).toBeUndefined()
    expect(store.catalogEntries.map((entry) => entry.id)).toEqual(['gmail'])
    // Awake with a new app: the computer's replaces it, and is kept.
    asleep.away = false
    asleep.catalog = [gmail, slack]
    const fresh = await store.readCatalog()
    expect(fresh?.map((entry) => entry.id)).toEqual(['gmail', 'slack'])
    expect(store.catalog.map((app) => app.title)).toEqual(['Gmail', 'Slack'])
    await store.saved?.waitForWrites()
    const kept = (await readBack(place)).readCatalog(currentLanguage())
    expect(Array.isArray(kept) ? kept.length : 0).toBe(2)
    // Read once a sign-in: the apps' cards read again do not ask for it again.
    const reads = asleep.catalogReads
    await store.loadAppCards()
    expect(asleep.catalogReads).toBe(reads)

    // Signed out: it goes with the rest.
    store.forgetSaved()
    await store.saved?.waitForWrites()
    expect(
      (await readBack(place)).readCatalog(currentLanguage()),
    ).toBeUndefined()
  })

  /** A change made while the folders and pins are the device's copy is made on the computer's own, so another device's changes stay. */
  it('makes a change to the kept copy on the computer’s own', async () => {
    const place = new MemorySavedPlace()
    await keptOnce(place, ['theo'], [travel])
    const store = await storeOn(place, bass)
    const backend = new AwayBackend()
    backend.away = true
    backend.agents = [
      makeAgent({ id: 'theo', name: 'Theo' }),
      makeAgent({ id: 'iris', name: 'Iris' }),
    ]
    await store.attach(backend)
    expect(store.sidebarSections?.[0]?.id).toBe('s1')
    expect(kept(store).sectionsKept).toBe(true)

    // Meanwhile, on another device: a folder "Work" and Iris pinned too.
    backend.away = false
    backend.hostSettings = {
      pinnedAgentIds: ['theo', 'iris'],
      sidebarSections: [travel, work],
    }

    // Theo moved into Travel here: Work stays.
    expect(
      store.editSections((sections: SidebarSection[]) =>
        assignAgents(sections, ['theo'], 's1'),
      ),
    ).toBe(true)
    for (let i = 0; i < 100 && backend.settingsWrites.length === 0; i++)
      await ms(2)
    const written = backend.settingsWrites.at(-1)?.sidebarSections as {
      id: string
      agentIds: string[]
    }[]
    expect(written.map((s) => s.id)).toEqual(['s1', 's2', unassignedId])
    expect(written[0]?.agentIds).toEqual(['iris', 'theo'])
    expect(kept(store).sectionsKept).toBe(false)

    // Theo unpinned here: Iris, pinned elsewhere, stays.
    await store.setPinned('theo', false)
    expect(backend.settingsWrites.at(-1)?.pinnedAgentIds).toEqual(['iris'])
    expect(store.pinnedIds).toEqual(['iris'])
  })

  /** A list kept for one account is never shown to another, and goes; one shown before the account was known goes when it is. */
  it('never shows another account’s kept list', async () => {
    const place = new MemorySavedPlace()
    const first = await storeOn(place, bass)
    await first.attach(new AwayBackend())
    first.saveNow()
    await first.saved?.waitForWrites()
    first.detach()

    const asleep = new AwayBackend()
    asleep.away = true
    const rhea = await storeOn(place, other)
    await rhea.attach(asleep)
    expect(rhea.agents).toEqual([])
    await rhea.saved?.waitForWrites()
    expect((await readBack(place)).readRoster()).toBeUndefined()

    // The account is read beside the agents: the list shows, then goes when the account is someone else's.
    const again = await storeOn(place, bass)
    await again.attach(new AwayBackend())
    again.saveNow()
    await again.saved?.waitForWrites()
    again.detach()
    const windows = await storeOn(place)
    await windows.attach(asleep)
    expect(windows.agents.map((a) => a.id)).toEqual(['theo'])
    windows.account = other
    expect(windows.agents).toEqual([])
    expect(windows.showingSaved).toBe(false)
  })

  it('forgets what was kept on signing out', async () => {
    const place = new MemorySavedPlace()
    const store = await storeOn(place, bass)
    await store.attach(new AwayBackend())
    await store.open('theo')
    store.saveNow()
    store.detach()
    store.forgetSaved()
    await store.saved?.waitForWrites()
    expect((await readBack(place)).readRoster()).toBeUndefined()
    expect(await (await readBack(place)).readChat('theo')).toBeUndefined()
  })

  /** A preview shows the kept lines, and asks the computer only when they lack the chat's newest line; the copy kept stays whole. */
  it('previews the kept lines and asks only for what is new', async () => {
    const place = new MemorySavedPlace()
    const first = await storeOn(place, bass)
    const up = new AwayBackend()
    up.lines.push({
      kind: 'message',
      id: 'a1',
      role: 'assistant',
      content: 'On it',
      timestampMs: 3_000,
    })
    await first.attach(up)
    await first.open('theo')
    first.saveNow()
    await first.saved?.waitForWrites()
    first.detach()

    // The list says the newest line is one the device has: nothing is asked.
    const backend = new AwayBackend()
    const theo = makeAgent({ id: 'theo', name: 'Theo', lastMessageId: 'a1' })
    backend.agents = [theo]
    const store = await storeOn(place, bass)
    await store.attach(backend)
    await store.peek('theo')
    expect(backend.tailed).toEqual([])
    expect(texts(store.rows('theo'))).toEqual(['Hi Theo', 'On it'])
    store.detach()

    // A newer line came: the newest lines are read and shown under the kept ones, which stay as they were.
    backend.agents = [{ ...theo, lastMessageId: 'n1' }]
    backend.lines = [
      {
        kind: 'message',
        id: 'n1',
        role: 'assistant',
        content: 'Booked',
        timestampMs: 5_000,
      },
    ]
    const again = await storeOn(place, bass)
    await again.attach(backend)
    await again.peek('theo')
    expect(backend.tailed).toEqual(['theo'])
    expect(texts(again.rows('theo'))).toEqual(['Hi Theo', 'On it', 'Booked'])
    again.saveNow()
    await again.saved?.waitForWrites()
    expect(
      (await (await readBack(place)).readChat('theo'))?.entries.map(
        (e) => e.id,
      ),
    ).toEqual(['u1', 'a1'])
  })

  /** The account is read beside the agents: a device copy of another account goes, the server's list (this account's own) stays. */
  it('keeps the server’s list when another account’s device copy goes', async () => {
    const place = new MemorySavedPlace()
    const first = await storeOn(place, other)
    const elsewhere = new AwayBackend()
    elsewhere.agents = [makeAgent({ id: 'rhea-agent', name: 'Rhea’s' })]
    await first.attach(elsewhere)
    first.saveNow()
    await first.saved?.waitForWrites()
    first.detach()

    const backend = new AwayBackend()
    backend.away = true
    backend.serverAnswers['chats/agents'] = {
      agents: [
        {
          id: 'theo',
          name: 'Theo',
          lastActivityAt: 3_000,
          lastMessageId: 'a1',
        },
        { id: 'iris', name: 'Iris', lastActivityAt: 1_000 },
      ],
    }
    const windows = await storeOn(place)
    windows.readsServerCopy = true
    await windows.attach(backend)
    for (let i = 0; i < 100 && windows.agents[0]?.id !== 'theo'; i++)
      await ms(2)
    expect(windows.agents.map((a) => a.id)).toEqual(['theo', 'iris'])
    windows.account = bass
    expect(windows.agents.map((a) => a.id)).toEqual(['theo', 'iris'])
    await windows.saved?.waitForWrites()
    // The other account's device copy went.
    expect((await readBack(place)).readRoster()).toBeUndefined()
  })

  it('keeps nothing on the web, where no copy is set', async () => {
    const store = new AppStore()
    const backend = new AwayBackend()
    await store.attach(backend)
    await store.open('theo')
    store.saveNow()
    store.forgetSaved()
    expect(store.saved).toBeUndefined()
    expect(texts(store.rows('theo'))).toEqual(['Hi Theo'])
  })

  it('keeps a moment after the computer’s change, and never after a sign-out', async () => {
    const place = new MemorySavedPlace()
    const store = await storeOn(place, bass)
    const backend = new AwayBackend()
    await store.attach(backend)
    await store.open('theo')
    // Nothing yet: a streamed answer is kept every two seconds, not per word.
    await store.saved?.waitForWrites()
    expect(place.chats.size).toBe(0)
    store.detach()
    store.forgetSaved()
    await ms(10)
    expect(place.chats.size).toBe(0)
  })
})
