// The shared core's tests of the roster's rows: `testTheListLineIsTheMacs`,
// `testNoTimeIsNotNineteenSixtyNine` (CoreTests.swift), the row read back in
// `SavedChatsTests`, and the Chief of Staff in `LanguageTests`.

import { afterEach, describe, expect, it } from 'vitest'
import {
  agentFrom,
  chiefOfStaff,
  chiefOfStaffDescription,
  makeAgent,
  plainPreview,
  previewLine,
  previewOfEntry,
  sameAgent,
  shownDescription,
  shownTitle,
  sortRoster,
} from './models'
import { loadWords, setWords } from './words'

afterEach(() => setWords('en', {}))

describe('the list line', () => {
  it('is the Mac’s', () => {
    expect(
      plainPreview(
        'See [the doc](https://simeonlabs.com/doc) and **Stripe**: `refund` done.\n\n- one\n- two',
      ),
    ).toBe('See the doc and Stripe: refund done. one two')
    expect(plainPreview('## Heading\n> quoted ~~old~~ _new_')).toBe(
      'Heading quoted old new',
    )
    expect(previewOfEntry({ kind: 'link', url: 'https://x.com' })).toBe(
      'Sent a link · https://x.com',
    )
    expect(
      previewOfEntry({ kind: 'attachment', count: 2, kinds: { image: 2 } }),
    ).toBe('Sent 2 images')
    expect(
      previewOfEntry({
        kind: 'attachment',
        count: 3,
        kinds: { image: 2, pdf: 1 },
      }),
    ).toBe('Sent 3 files · 2 images, 1 PDF')
    const agent = makeAgent({
      id: 'a',
      name: 'A',
      lastMessagePreview: 'Here is [the link](https://x.com)',
    })
    expect(previewLine(agent)).toBe('Here is the link')
    agent.awaitingUserResponse = true
    agent.waitingReason = 'Approve the refund'
    expect(previewLine(agent)).toBe('Waiting for you: Approve the refund')
  })

  it('keeps snake_case words and a written dollar', () => {
    expect(plainPreview('run my_script_name now')).toBe(
      'run my_script_name now',
    )
    expect(plainPreview('costs \\$5')).toBe('costs $5')
  })

  it('reads in French', async () => {
    await loadWords('fr')
    expect(
      previewOfEntry({ kind: 'attachment', count: 2, kinds: { image: 2 } }),
    ).toBe('Envoi\u202f: 2 images')
    expect(previewOfEntry({ kind: 'link', url: 'https://x.com' })).toBe(
      'Lien envoyé · https://x.com',
    )
    const agent = makeAgent({
      id: 'a',
      name: 'A',
      awaitingUserResponse: true,
      waitingReason: 'Valider',
    })
    expect(previewLine(agent)).toBe('En attente de toi\u202f: Valider')
  })
})

describe('a row', () => {
  it('goes by when the chat was made when it has no activity yet', () => {
    expect(
      agentFrom({ id: 'a', name: 'A', lastActivityAt: 0, updatedAt: 5_000 })
        ?.lastActivityAt,
    ).toBe(5_000)
    expect(
      agentFrom({ id: 'a', name: 'A', lastActivityAt: 0, updatedAt: 0 })
        ?.lastActivityAt,
    ).toBeUndefined()
    expect(
      agentFrom({ id: 'a', name: 'A', lastActivityAt: 7_000, updatedAt: 5_000 })
        ?.lastActivityAt,
    ).toBe(7_000)
    expect(agentFrom({ name: 'no id' })).toBeUndefined()
  })

  it('reads every field the host sends', () => {
    const theo = agentFrom({
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
      unreadCount: 2.7,
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
    })!
    expect(theo).toMatchObject({
      colour: '#FF6A00',
      unreadCount: 2,
      isRunningTurn: true,
      isComposing: true,
      activityLabel: 'Searching',
      activityTarget: 'iris',
      isHidden: true,
      notifyOnUpdates: false,
      isSharedRoom: true,
      isRemoteRoom: false,
      awaitingUserResponse: true,
      waitingReason: 'Approve the fare',
      purpose: 'disk-saver',
      conversationPartnerIds: ['iris'],
      stamp: { epoch: 'e1', seq: 7 },
    })
    expect(previewLine(theo)).toBe('Waiting for you: Approve the fare')
    const room = agentFrom({
      id: 'g',
      name: 'Room',
      isGroup: true,
      memberIds: ['theo', 'iris'],
      remoteRoom: { host: 'x' },
    })!
    expect(room.isRemoteRoom).toBe(true)
    expect(room.memberIds).toEqual(['theo', 'iris'])
    expect(
      agentFrom({ id: 'x', name: 'X', remoteRoom: null })?.isRemoteRoom,
    ).toBe(false)
  })

  it('is the same row whatever its stamp', () => {
    const a = makeAgent({ id: 'a', name: 'A', stamp: { epoch: 'e1', seq: 1 } })
    expect(sameAgent(a, { ...a, stamp: { epoch: 'e2', seq: 9 } })).toBe(true)
    expect(sameAgent(a, { ...a, name: 'B' })).toBe(false)
  })

  it('sorts newest first', () => {
    const rows = [
      makeAgent({ id: 'old', name: 'Old', lastActivityAt: 1 }),
      makeAgent({ id: 'none', name: 'None' }),
      makeAgent({ id: 'new', name: 'New', lastActivityAt: 9 }),
    ]
    expect(sortRoster(rows).map((a) => a.id)).toEqual(['new', 'old', 'none'])
  })
})

describe('the Chief of Staff', () => {
  it('is the oldest titled so, whatever his name', () => {
    const rows = [
      makeAgent({ id: 'b', name: 'Bob', title: 'COO', createdAt: 20 }),
      makeAgent({
        id: 's',
        name: 'Simeon',
        title: ' Chief of Staff ',
        createdAt: 10,
      }),
      makeAgent({ id: 'x', name: 'X', title: 'Travel', createdAt: 1 }),
    ]
    expect(chiefOfStaff(rows)?.id).toBe('s')
    expect(chiefOfStaff([rows[2]!])).toBeUndefined()
  })

  it('is shown in the app’s language and saved in English', async () => {
    const simeon = makeAgent({
      id: 'simeon',
      name: 'Simeon',
      title: 'Chief of Staff',
      description: chiefOfStaffDescription,
    })
    expect(shownTitle(simeon)).toBe('Chief of Staff')
    await loadWords('fr')
    expect(shownTitle(simeon)).toBe('Bras droit')
    expect(shownDescription(simeon)).not.toBe(chiefOfStaffDescription)
    const ada = makeAgent({
      id: 'ada',
      name: 'Ada',
      title: 'Boîte mail',
      description: 'Trie la boîte mail.',
    })
    expect(shownTitle(ada)).toBe('Boîte mail')
    expect(shownDescription(ada)).toBe('Trie la boîte mail.')
  })
})
