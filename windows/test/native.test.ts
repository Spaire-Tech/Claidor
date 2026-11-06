// After step 7's parts (src/main/native/): which addresses a picture may be
// read from, a site's icon found in its page's head, pictures kept a week,
// and what Windows' file dialog may be asked and gives back.

import { mkdtempSync, readdirSync, rmSync, utimesSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { absolute, isBlockedAddress, linkHref, safeURL, siteKey } from '../src/main/native/addresses'
import { chosenType, readFileAsk } from '../src/main/native/files'
import { type Network, PictureShelf, keptForMs, pictureType, readSiteIcon } from '../src/main/native/pictures'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>')

/** A stand-in network: each address's answer, and every address asked. */
function network(
  answers: Record<string, { status?: number; body?: Uint8Array | string; location?: string }>,
  addresses: Record<string, string[]> = {},
) {
  const asked: string[] = []
  const net: Network = {
    lookup: async (host) => addresses[host] ?? ['93.184.216.34'],
    fetch: async (url) => {
      asked.push(url)
      const answer = answers[url]
      if (!answer) return new Response('', { status: 404 })
      const headers = new Headers()
      if (answer.location) headers.set('location', answer.location)
      const body = typeof answer.body === 'string' || answer.body === undefined ? (answer.body ?? '') : Buffer.from(answer.body)
      return new Response(body, { status: answer.status ?? 200, headers })
    },
  }
  return { net, asked }
}

const folders: string[] = []
function folder(): string {
  const made = mkdtempSync(path.join(os.tmpdir(), 'simeon-pictures-'))
  folders.push(made)
  return made
}
afterEach(() => {
  for (const made of folders.splice(0)) rmSync(made, { recursive: true, force: true })
})

describe('the addresses a picture may come from', () => {
  it('takes public https addresses only', () => {
    expect(safeURL('https://assets.duffel.com/img/airlines/BA.svg')?.hostname).toBe('assets.duffel.com')
    expect(safeURL('https://93.184.216.34/icon.png')).toBeDefined()
    for (const refused of [
      'http://example.com/a.png',
      'https://user:pass@example.com/a.png',
      'https://example.com:8443/a.png',
      'https://localhost/a.png',
      'https://router.local/a.png',
      'https://intranet/a.png',
      'https://printer.lan/a.png',
      'https://127.0.0.1/a.png',
      'https://10.0.0.1/a.png',
      'https://192.168.1.1/a.png',
      'https://169.254.169.254/latest',
      'https://[::1]/a.png',
      'https://[fe80::1]/a.png',
      'https://[::ffff:10.0.0.1]/a.png',
      'file:///C:/Windows/win.ini',
      'not an address',
      `https://example.com/${'a'.repeat(2_100)}`,
    ])
      expect(safeURL(refused), refused).toBeUndefined()
  })

  it('knows the private and reserved addresses', () => {
    expect(isBlockedAddress('10.1.2.3')).toBe(true)
    expect(isBlockedAddress('172.20.0.1')).toBe(true)
    expect(isBlockedAddress('100.64.0.1')).toBe(true)
    expect(isBlockedAddress('::ffff:192.168.0.1')).toBe(true)
    expect(isBlockedAddress('fd00::1')).toBe(true)
    expect(isBlockedAddress('nonsense')).toBe(true)
    expect(isBlockedAddress('8.8.8.8')).toBe(false)
    expect(isBlockedAddress('2606:4700::1111')).toBe(false)
  })

  it('reads a page head’s icons, made absolute', () => {
    const html =
      '<head><link rel="stylesheet" href="/a.css"><link rel="icon" href="/fav.png"><link rel=apple-touch-icon href="/touch&amp;big.png"></head>'
    expect(linkHref(html, ['apple-touch-icon'])).toBe('/touch&big.png')
    expect(linkHref(html, ['icon', 'shortcut'])).toBe('/fav.png')
    expect(linkHref(html, ['mask-icon'])).toBeUndefined()
    const base = new URL('https://www.example.com/login')
    expect(absolute('/fav.png', base)).toBe('https://www.example.com/fav.png')
    expect(absolute('http://www.example.com/fav.png', base)).toBeUndefined()
    expect(absolute('https://10.0.0.1/fav.png', base)).toBeUndefined()
  })

  it('keys a site as the core does', () => {
    expect(siteKey(' https://WWW.GitHub.com/login ')).toBe('github.com')
    expect(siteKey('github.com.')).toBe('github.com')
    expect(siteKey('intranet')).toBe('')
    expect(siteKey('two words.com')).toBe('')
  })
})

describe('pictures from other sites', () => {
  it('tells a picture by its first bytes', () => {
    expect(pictureType(png)).toBe('image/png')
    expect(pictureType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(pictureType(new Uint8Array([0, 0, 1, 0, 1, 0]))).toBe('image/x-icon')
    expect(pictureType(svg)).toBe('image/svg+xml')
    expect(pictureType(new TextEncoder().encode('<html><body>Not found</body></html>'))).toBeUndefined()
  })

  it('finds a site’s touch icon in its page, after a redirect', async () => {
    const { net, asked } = network({
      'https://github.com/': { status: 302, location: 'https://github.com/login' },
      'https://github.com/login': { body: '<link rel="apple-touch-icon" href="/touch.png">' },
      'https://github.com/touch.png': { body: png },
    })
    expect(await readSiteIcon(net, 'github.com')).toBe(`data:image/png;base64,${Buffer.from(png).toString('base64')}`)
    expect(asked).toEqual(['https://github.com/', 'https://github.com/login', 'https://github.com/touch.png'])
  })

  it('falls back to /favicon.ico, and never follows a redirect inside the network', async () => {
    const { net, asked } = network({
      'https://example.com/': { status: 301, location: 'https://192.168.0.1/' },
      'https://example.com/favicon.ico': { body: png },
    })
    expect(await readSiteIcon(net, 'example.com')).toMatch(/^data:image\/png;base64,/)
    expect(asked).not.toContain('https://192.168.0.1/')
  })

  it('reads nothing from a name that points inside the network', async () => {
    const { net, asked } = network(
      { 'https://sneaky.example/logo.png': { body: png } },
      { 'sneaky.example': ['10.0.0.5'] },
    )
    const shelf = new PictureShelf(folder(), net)
    expect(await shelf.logo('https://sneaky.example/logo.png')).toBeNull()
    expect(asked).toEqual([])
  })

  it('keeps a logo a week, none too, and reads each once', async () => {
    const place = folder()
    const { net, asked } = network({ 'https://assets.duffel.com/BA.svg': { body: svg } })
    const shelf = new PictureShelf(place, net)
    const [one, two] = await Promise.all([
      shelf.logo('https://assets.duffel.com/BA.svg'),
      shelf.logo('https://assets.duffel.com/BA.svg'),
    ])
    expect(one).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(two).toBe(one)
    expect(asked).toHaveLength(1)
    // The next run reads the copy kept on this PC.
    const again = network({})
    expect(await new PictureShelf(place, again.net).logo('https://assets.duffel.com/BA.svg')).toBe(one)
    expect(again.asked).toEqual([])
    // None is kept too: a missing logo isn't asked again for a week.
    expect(await shelf.logo('https://assets.duffel.com/XX.svg')).toBeNull()
    expect(readdirSync(place)).toHaveLength(2)
    // A week later, it is read again.
    const later = network({ 'https://assets.duffel.com/BA.svg': { body: png } })
    for (const file of readdirSync(place)) {
      const old = new Date(Date.now() - keptForMs - 1_000)
      utimesSync(path.join(place, file), old, old)
    }
    expect(await new PictureShelf(place, later.net).logo('https://assets.duffel.com/BA.svg')).toMatch(
      /^data:image\/png;base64,/,
    )
  })

  it('reads nothing bigger than 2 MB', async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1)
    big.set(png)
    const { net } = network({ 'https://example.com/big.png': { body: big } })
    expect(await new PictureShelf(folder(), net).logo('https://example.com/big.png')).toBeNull()
  })
})

describe('Windows’ file dialog', () => {
  const ask = {
    title: 'Choose an avatar image',
    filterName: 'Picture',
    extensions: ['png', 'JPG', 'jpeg'],
    multiple: false,
    max: 1,
  }

  it('takes the words and kinds a page may ask for', () => {
    expect(readFileAsk(ask)).toEqual({ ...ask, extensions: ['png', 'jpg', 'jpeg'] })
    expect(readFileAsk({ ...ask, extensions: ['exe'] })).toBeUndefined()
    expect(readFileAsk({ ...ask, extensions: [] })).toBeUndefined()
    expect(readFileAsk({ ...ask, title: '' })).toBeUndefined()
    expect(readFileAsk({ ...ask, max: 50 })).toBeUndefined()
    expect(readFileAsk({ ...ask, multiple: 'yes' })).toBeUndefined()
    expect(readFileAsk(null)).toBeUndefined()
  })

  it('gives back only the kinds asked for', () => {
    const checked = readFileAsk(ask)!
    expect(chosenType('me.PNG', checked)).toBe('image/png')
    expect(chosenType('me.jpg', checked)).toBe('image/jpeg')
    expect(chosenType('notes.txt', checked)).toBeUndefined()
    expect(chosenType('no-extension', checked)).toBeUndefined()
  })
})
