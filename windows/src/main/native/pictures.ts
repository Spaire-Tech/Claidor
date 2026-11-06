// Pictures from other sites, read by the app and kept on this PC a week
// (the Mac's `RemoteLogos` and the core's `SiteIcons`): an airline's logo,
// and a saved login's site icon (its page's touch icon, else its icon, else
// /favicon.ico). The main process reads them, so a site that doesn't let a
// page read its pictures (no CORS) is drawn all the same, and the page gets
// each as a `data:` address it can cut and lighten. Kept in
// %APPDATA%\Simeon\pictures, one file per address or site, none kept too (so
// a site without an icon isn't asked again for a week).
//
// Every address is checked (addresses.ts) before each request and each
// redirect, and its host's addresses looked up first; a picture is at most
// 2 MB and must be one by its first bytes, a page's head at most 512 KB;
// eight seconds a request.

import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  absolute,
  htmlByteLimit,
  imageByteLimit,
  isBlockedAddress,
  maxRedirects,
  safeURL,
  siteKey,
  linkHref,
} from './addresses'

/** A week, as the Mac's caches keep them. */
export const keptForMs = 7 * 24 * 60 * 60 * 1000
const requestMs = 8_000
const userAgent = 'Simeon-LinkPreview/1.0'

/** What a picture's first bytes say it is, or undefined when it is none the page draws. */
export function pictureType(bytes: Uint8Array): string | undefined {
  const starts = (...values: number[]) => values.every((value, at) => bytes[at] === value)
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif'
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)
    return 'image/webp'
  if (starts(0x00, 0x00, 0x01, 0x00) || starts(0x00, 0x00, 0x02, 0x00)) return 'image/x-icon'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 12)) === 'ftypavif') return 'image/avif'
  // An SVG: drawn by the page as a picture, where nothing in it runs.
  const head = new TextDecoder().decode(bytes.slice(0, 1024)).replace(/^﻿/, '').trimStart().toLowerCase()
  if ((head.startsWith('<svg') || head.startsWith('<?xml') || head.startsWith('<!--')) && head.includes('<svg'))
    return 'image/svg+xml'
  return undefined
}

export function dataAddress(type: string, bytes: Uint8Array): string {
  return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`
}

/** The network as the shelf uses it, given by the part (Node's own) or by the tests. */
export interface Network {
  /** The host's addresses, as Windows resolves them. */
  lookup(host: string): Promise<string[]>
  fetch(url: string, init: { redirect: 'manual'; signal: AbortSignal; headers: Record<string, string> }): Promise<Response>
}

/** One answer, read to at most `limit` bytes; undefined when it is bigger. */
async function bodyOf(response: Response, limit: number): Promise<Uint8Array | undefined> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel().catch(() => {})
    return undefined
  }
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel().catch(() => {})
      return undefined
    }
    parts.push(value)
  }
  const whole = new Uint8Array(size)
  let at = 0
  for (const part of parts) {
    whole.set(part, at)
    at += part.byteLength
  }
  return whole
}

/** An address read, following at most five redirects, each checked: the answer's bytes and where it ended. */
export async function readAddress(
  network: Network,
  raw: string,
  limit: number,
  accept: string,
): Promise<{ bytes: Uint8Array; url: URL } | undefined> {
  let url = safeURL(raw)
  for (let hop = 0; url && hop <= maxRedirects; hop += 1) {
    const host = url.hostname.replace(/^\[|\]$/g, '')
    const addresses = await network.lookup(host).catch(() => [] as string[])
    if (addresses.length === 0 || addresses.some(isBlockedAddress)) return undefined
    let response: Response
    try {
      response = await network.fetch(url.href, {
        redirect: 'manual',
        signal: AbortSignal.timeout(requestMs),
        headers: { accept, 'user-agent': userAgent },
      })
    } catch {
      return undefined
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get('location')
      await response.body?.cancel().catch(() => {})
      url = next ? safeURL(new URL(next, url).href) : undefined
      continue
    }
    if (response.status < 200 || response.status >= 300) {
      await response.body?.cancel().catch(() => {})
      return undefined
    }
    const bytes = await bodyOf(response, limit).catch(() => undefined)
    return bytes ? { bytes, url } : undefined
  }
  return undefined
}

/** A picture at an address: a `data:` address, or undefined when there is none there. */
export async function readPicture(network: Network, raw: string): Promise<string | undefined> {
  const read = await readAddress(network, raw, imageByteLimit, 'image/*')
  const type = read ? pictureType(read.bytes) : undefined
  return read && type ? dataAddress(type, read.bytes) : undefined
}

/** A site's icon (`SiteIcons.read`): its page's touch icon, else its icon, else /favicon.ico where the page ended, else the site's own. */
export async function readSiteIcon(network: Network, site: string): Promise<string | undefined> {
  const candidates: string[] = []
  // A sign-in page a redirect lands on still has the site's icons: only the head is read.
  const page = await readAddress(network, `https://${site}/`, htmlByteLimit, 'text/html,application/xhtml+xml').catch(
    () => undefined,
  )
  if (page) {
    const html = new TextDecoder().decode(page.bytes)
    for (const rels of [['apple-touch-icon', 'apple-touch-icon-precomposed'], ['icon', 'shortcut']]) {
      const href = linkHref(html, rels)
      const found = href !== undefined ? absolute(href, page.url) : undefined
      if (found) candidates.push(found)
    }
    candidates.push(`https://${page.url.hostname}/favicon.ico`)
  }
  candidates.push(`https://${site}/favicon.ico`)
  for (const address of [...new Set(candidates)]) {
    const picture = await readPicture(network, address)
    if (picture) return picture
  }
  return undefined
}

/** One picture or none, as kept on disk. */
interface Kept {
  picture: string | null
}

/**
 * The shelf: what was read this run, what is being read (asked twice, read
 * once), and the copies kept on disk a week.
 */
export class PictureShelf {
  private readonly answered = new Map<string, string | null>()
  private readonly reading = new Map<string, Promise<string | null>>()

  constructor(
    private readonly folder: string,
    private readonly network: Network,
    private readonly now: () => number = Date.now,
  ) {}

  /** An airline's logo at an https address. */
  logo(url: string): Promise<string | null> {
    if (!safeURL(url)) return Promise.resolve(null)
    return this.find(`logo:${url}`, () => readPicture(this.network, url))
  }

  /** A saved login's site icon. */
  siteIcon(site: string): Promise<string | null> {
    const key = siteKey(site)
    if (key === '' || !safeURL(`https://${key}/`)) return Promise.resolve(null)
    return this.find(`site:${key}`, () => readSiteIcon(this.network, key))
  }

  private find(key: string, read: () => Promise<string | undefined>): Promise<string | null> {
    if (this.answered.has(key)) return Promise.resolve(this.answered.get(key) ?? null)
    const running = this.reading.get(key)
    if (running) return running
    const task = (async () => {
      const file = path.join(this.folder, `${createHash('sha256').update(key).digest('hex')}.json`)
      const kept = await this.readKept(file)
      if (kept) return kept.picture
      const picture = (await read().catch(() => undefined)) ?? null
      await mkdir(this.folder, { recursive: true })
        .then(() => writeFile(file, JSON.stringify({ picture } satisfies Kept)))
        .catch(() => {})
      return picture
    })()
    this.reading.set(key, task)
    return task.then(
      (picture) => {
        this.reading.delete(key)
        this.answered.set(key, picture)
        return picture
      },
      () => {
        this.reading.delete(key)
        return null
      },
    )
  }

  private async readKept(file: string): Promise<Kept | undefined> {
    try {
      const info = await stat(file)
      if (this.now() - info.mtimeMs >= keptForMs) return undefined
      const value = JSON.parse(await readFile(file, 'utf8')) as Partial<Kept>
      if (value.picture === null) return { picture: null }
      if (typeof value.picture === 'string' && value.picture.startsWith('data:image/')) return { picture: value.picture }
      return undefined
    } catch {
      return undefined
    }
  }
}
