// Starter packs (SimeonCore's `StarterPacksTests`): the server's pack read,
// the app's link, and the web app's own address. Add making the team in its
// folder is in orgChartStore.test.ts, against the stand-in computer.

import { describe, expect, it } from 'vitest'
import { NetworkError } from './http'
import {
  addressWithoutPack,
  isPackId,
  packAddFailure,
  packAgentArguments,
  packFrom,
  packInAddress,
  packLinked,
  packReadFailure,
  packSectionId,
} from './starterPacks'

describe('a starter pack', () => {
  it('is read as the server sends it', () => {
    const pack = packFrom({
      id: 'coffee-shop',
      folder: 'Coffee Shop Team',
      title: 'Simeon for Coffee Shops',
      summary: 'Five agents.',
      appNames: { square: 'Square' },
      agents: [
        {
          name: 'Bruno',
          title: 'Stock',
          face: 'clay-02',
          summary: 'Keeps the shelves full.',
          apps: ['square', 'veryfi'],
          description: 'Keeps the coffee shop stocked.',
        },
      ],
    })!
    expect(packSectionId(pack.id)).toBe('pack-coffee-shop')
    expect(pack.members.map((member) => member.name)).toEqual(['Bruno'])
    expect(pack.members[0]!.instructions).toBe('Keeps the coffee shop stocked.')
    // An app the server names no further keeps its id.
    expect(pack.members[0]!.apps).toEqual([
      { id: 'square', name: 'Square' },
      { id: 'veryfi', name: 'veryfi' },
    ])
    expect(
      packFrom({ id: 'Coffee Shop', folder: 'x', agents: [{ name: 'A' }] }),
    ).toBeUndefined()
    expect(
      packFrom({ id: 'empty', folder: 'Empty', agents: [] }),
    ).toBeUndefined()
    // No title: the folder stands for it; a member without a name is left out.
    const plain = packFrom({
      id: 'x',
      folder: 'X Team',
      agents: [{ name: '' }, { name: 'Ada' }],
    })!
    expect(plain.title).toBe('X Team')
    expect(plain.members.map((member) => member.name)).toEqual(['Ada'])
    expect(plain.members[0]).toEqual({
      name: 'Ada',
      title: '',
      face: '',
      summary: '',
      apps: [],
      instructions: '',
    })
  })

  it('has an id of 1 to 64 of a–z, 0–9 and "-"', () => {
    expect(isPackId('coffee-shop')).toBe(true)
    expect(isPackId('a'.repeat(64))).toBe(true)
    for (const no of [
      '',
      'a'.repeat(65),
      'Coffee',
      'coffee shop',
      'café',
      'a_b',
    ])
      expect(isPackId(no), no).toBe(false)
  })

  it('reads the app’s link (the iPhone’s, and the Windows app’s later)', () => {
    expect(
      packLinked('simeon-ios://app/v1/pack/add?id=coffee-shop', 'simeon-ios'),
    ).toBe('coffee-shop')
    for (const raw of [
      'simeon://app/v1/pack/add?id=coffee-shop',
      'simeon-ios://app/v1/pack/add',
      'simeon-ios://app/v1/pack/add?id=a&id=b',
      'simeon-ios://app/v1/pack/add?id=Coffee',
      'simeon-ios://other/v1/pack/add?id=a',
      'simeon-ios://app/v1/open',
      'not a link',
    ])
      expect(packLinked(raw, 'simeon-ios'), raw).toBeUndefined()
    expect(packLinked('simeon://app/v1/pack/add?id=trades', 'simeon')).toBe(
      'trades',
    )
  })

  it('is named by the web app’s own address, then taken out of it', () => {
    expect(packInAddress('?api=x&pack=coffee-shop&agent=iris')).toBe(
      'coffee-shop',
    )
    expect(packInAddress('?pack=Coffee%20Shop')).toBeUndefined()
    expect(packInAddress('?agent=iris')).toBeUndefined()
    expect(
      addressWithoutPack(
        'https://app.simeonlabs.com/app-next/?api=x&pack=coffee-shop&agent=iris',
      ),
    ).toBe('https://app.simeonlabs.com/app-next/?api=x&agent=iris')
    expect(
      addressWithoutPack('https://app.simeonlabs.com/app-next/?agent=iris'),
    ).toBeUndefined()
  })

  it('makes each agent as the core’s createAgent does', () => {
    expect(
      packAgentArguments(
        {
          name: 'Bruno',
          title: ' Stock ',
          face: 'clay-07',
          summary: 'Keeps the shelves full.',
          apps: [],
          instructions: 'Keeps the coffee shop stocked.',
        },
        'ios-1',
      ),
    ).toEqual({
      name: 'Bruno',
      description: 'Keeps the coffee shop stocked.',
      isKickstartRequested: true,
      origin: 'user',
      clientNonce: 'ios-1',
      title: 'Stock',
      avatarShape: 'clay-07',
    })
    // No title and no face: neither is sent.
    expect(
      packAgentArguments(
        {
          name: 'Ada',
          title: '',
          face: '',
          summary: '',
          apps: [],
          instructions: '',
        },
        'ios-2',
      ),
    ).toEqual({
      name: 'Ada',
      description: '',
      isKickstartRequested: true,
      origin: 'user',
      clientNonce: 'ios-2',
    })
  })

  it('says why it can’t be shown in plain words', () => {
    expect(
      packReadFailure(new Error("This team isn't available anymore.")),
    ).toBe("This team isn't available anymore.")
    expect(
      packReadFailure(
        new Error("Simeon Labs' server answered packs/x with 502."),
      ),
    ).toBe('Simeon isn’t available at the moment. Try again in a little while.')
    expect(packReadFailure(new Error(''))).toBe(
      'Simeon isn’t available at the moment. Try again in a little while.',
    )
    // No answer at all: the browser's words ("Failed to fetch", "Load failed") are never shown.
    for (const words of ['Failed to fetch', 'Load failed'])
      expect(packReadFailure(new NetworkError(words, 'unreachable'))).toBe(
        "Simeon can't be reached. Check your connection and try again.",
      )
    expect(packAddFailure(undefined)).toEqual({ added: undefined })
    expect(
      packAddFailure("Couldn't create Hugo: the gateway closed (1006)"),
    ).toEqual({ added: "Couldn't create Hugo. Try again in a little while." })
    expect(packAddFailure("Couldn't create Hugo: Not allowed.")).toEqual({
      added: "Couldn't create Hugo: Not allowed.",
    })
  })
})
