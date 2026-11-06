// The Microsoft Store package's identity (scripts/lib/store.mjs) and its
// pictures (resources/appx/, scripts/make-icon.mjs), as electron-builder
// packs them.

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodePNG } from '../scripts/lib/icon.mjs'
import { readStoreIdentity } from '../scripts/lib/store.mjs'

const windows = path.resolve(__dirname, '..')

describe('the Store’s identity', () => {
  it('is Partner Center’s once filled in, never a value in the wrong form', () => {
    const read = readStoreIdentity(readFileSync(path.join(windows, 'store.json'), 'utf8'))
    if (!('identity' in read)) expect(read.wrong).toEqual([])
  })

  it('says what to fill in while it is empty', () => {
    const empty = JSON.stringify({ identityName: '', publisher: '', publisherDisplayName: '' })
    expect(readStoreIdentity(empty)).toEqual({ missing: ['identityName', 'publisher', 'publisherDisplayName'], wrong: [] })
  })

  it('takes Partner Center’s three values', () => {
    const text = JSON.stringify({
      identityName: ' ExampleCo.Simeon ',
      publisher: 'CN=1A2B3C4D-0000-1111-2222-333344445555',
      publisherDisplayName: 'Example Co.',
    })
    expect(readStoreIdentity(text)).toEqual({
      identity: {
        identityName: 'ExampleCo.Simeon',
        publisher: 'CN=1A2B3C4D-0000-1111-2222-333344445555',
        publisherDisplayName: 'Example Co.',
      },
    })
  })

  it('refuses what Partner Center doesn’t write there', () => {
    const text = JSON.stringify({
      identityName: 'Example Co Simeon',
      publisher: 'Example Co.',
      publisherDisplayName: 'Example Co.',
    })
    expect(readStoreIdentity(text)).toEqual({ missing: [], wrong: ['identityName', 'publisher'] })
    expect(readStoreIdentity('not json')).toEqual({ missing: [], wrong: ['store.json is not JSON'] })
  })
})

describe('the Store’s pictures', () => {
  const folder = path.join(windows, 'resources/appx')
  const size = (name: string) => {
    const image = decodePNG(readFileSync(path.join(folder, name)))
    return [image.width, image.height]
  }

  it('are there at each size electron-builder and Windows ask for', () => {
    const names = readdirSync(folder)
    for (const base of ['Square44x44Logo', 'Square150x150Logo', 'Wide310x150Logo', 'StoreLogo'])
      expect(names.some((name) => name.startsWith(`${base}.`)), base).toBe(true)
    expect(size('Square44x44Logo.scale-100.png')).toEqual([44, 44])
    expect(size('Square44x44Logo.scale-200.png')).toEqual([88, 88])
    expect(size('Square44x44Logo.targetsize-256_altform-unplated.png')).toEqual([256, 256])
    expect(size('StoreLogo.scale-100.png')).toEqual([50, 50])
    expect(size('Square150x150Logo.scale-200.png')).toEqual([300, 300])
    expect(size('Wide310x150Logo.scale-100.png')).toEqual([310, 150])
  })

  it('are the icon itself, the tiles with it in their middle on a clear ground', () => {
    const tile = decodePNG(readFileSync(path.join(folder, 'Square150x150Logo.scale-100.png')))
    const at = (x: number, y: number) => tile.rgba[(y * 150 + x) * 4 + 3]
    expect(at(2, 2)).toBe(0)
    expect(at(75, 75)).toBe(255)
    // The same 44 as the icon file's own drawing at 44.
    const icon = decodePNG(readFileSync(path.join(folder, 'Square44x44Logo.scale-100.png')))
    expect(icon.rgba[(22 * 44 + 2) * 4 + 3]).toBe(255)
    expect(icon.rgba[3]).toBe(0)
  })
})
