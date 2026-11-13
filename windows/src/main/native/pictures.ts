// Pictures from other sites, read by the app and kept on this PC a week
// (the Mac's `RemoteLogos` and the core's `SiteIcons`): an airline's logo,
// and a saved login's site icon (its page's touch icon, else its icon, else
// /favicon.ico). The main process reads them, so a site that doesn't let a
// page read its pictures (no CORS) is drawn all the same, and the page gets
// each as a `data:` address it can cut and lighten. Kept in
// %APPDATA%\Simeon\pictures, one file per address or site. None is kept a
// day, and only when the site answered every request: a read that had no
// answer (no connection, a name not found, a site too slow or busy) writes
// nothing and is asked again (13 November 2026, with the core's `SiteIcons`).
//
// Every address is checked (addresses.ts) before each request and each
// redirect, and its host's addresses looked up first; a picture is at most
// 2 MB and must be one by its first bytes, a page's first 512 KB are read
// (its head is there; before 13 November 2026 a longer page was dropped
// whole, and its site had no icon unless it had a /favicon.ico); eight
// seconds a request.

import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  absolute,
  htmlByteLimit,
  iconHrefs,
  imageByteLimit,
  isBlockedAddress,
  maxRedirects,
  safeURL,
  siteKey,
} from './addresses'

/** A week, as the Mac's caches keep them. */
export const keptForMs = 7 * 24 * 60 * 60 * 1000
/** "None" is kept a day (`SiteIcons.noneTTL`): a site gains an icon, and a refusal passes. */
export const noneKeptForMs = 24 * 60 * 60 * 1000
/** A read that had no answer is tried again after five minutes (`SiteIcons.retryAfter`). */
export const retryAfterMs = 5 * 60 * 1000
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

/** One answer, read to at most `limit` bytes: its first `limit` when `cut`, else undefined when it is bigger. */
async function bodyOf(response: Response, limit: number, cut: boolean): Promise<Uint8Array | undefined> {
  const declared = Number(response.headers.get('content-length'))
  if (!cut && Number.isFinite(declared) && declared > limit) {
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
    parts.push(value)
    if (size > limit) {
      await reader.cancel().catch(() => {})
      if (!cut) return undefined
      break
    }
  }
  const whole = new Uint8Array(size)
  let at = 0
  for (const part of parts) {
    whole.set(part, at)
    at += part.byteLength
  }
  return whole.subarray(0, Math.min(size, limit))
}

/**
 * What an address gave: its bytes and where it ended; "none" when the site
 * answered with nothing to read there; "unreachable" when there was no
 * answer to judge by (no connection, a name not found or pointing inside the
 * network, too slow, or the site busy: 429, 5xx).
 */
export type Asked = { bytes: Uint8Array; url: URL } | 'none' | 'unreachable'

/** An address asked, following at most five redirects, each checked. `cut`: a longer answer's first `limit` bytes. */
export async function askAddress(network: Network, raw: string, limit: number, accept: string, cut = false): Promise<Asked> {
  let url = safeURL(raw)
  for (let hop = 0; url && hop <= maxRedirects; hop += 1) {
    const host = url.hostname.replace(/^\[|\]$/g, '')
    const addresses = await network.lookup(host).catch(() => [] as string[])
    if (addresses.length === 0 || addresses.some(isBlockedAddress)) return 'unreachable'
    let response: Response
    try {
      response = await network.fetch(url.href, {
        redirect: 'manual',
        signal: AbortSignal.timeout(requestMs),
        headers: { accept, 'user-agent': userAgent },
      })
    } catch {
      return 'unreachable'
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get('location')
      await response.body?.cancel().catch(() => {})
      url = next ? safeURL(new URL(next, url).href) : undefined
      continue
    }
    if (response.status < 200 || response.status >= 300) {
      await response.body?.cancel().catch(() => {})
      return response.status === 429 || response.status >= 500 ? 'unreachable' : 'none'
    }
    let bytes: Uint8Array | undefined
    try {
      bytes = await bodyOf(response, limit, cut)
    } catch {
      return 'unreachable'
    }
    return bytes ? { bytes, url } : 'none'
  }
  return 'none'
}

/** An address read, following at most five redirects, each checked: the answer's bytes and where it ended. */
export async function readAddress(
  network: Network,
  raw: string,
  limit: number,
  accept: string,
): Promise<{ bytes: Uint8Array; url: URL } | undefined> {
  const asked = await askAddress(network, raw, limit, accept)
  return typeof asked === 'string' ? undefined : asked
}

/** What was found, and whether every request was answered: only then is "none" the site's own answer. */
export interface Found {
  picture: string | undefined
  sure: boolean
}

/** A picture at an address, and whether the address answered. */
export async function askPicture(network: Network, raw: string): Promise<Found> {
  const asked = await askAddress(network, raw, imageByteLimit, 'image/*')
  if (typeof asked === 'string') return { picture: undefined, sure: asked === 'none' }
  const type = pictureType(asked.bytes)
  return { picture: type ? dataAddress(type, asked.bytes) : undefined, sure: true }
}

/** A picture at an address: a `data:` address, or undefined when there is none there. */
export async function readPicture(network: Network, raw: string): Promise<string | undefined> {
  return (await askPicture(network, raw)).picture
}

/**
 * A site's icon (`SiteIcons.read`): every icon its page names, its touch
 * icons first, then /favicon.ico where the page ended, then the site's own;
 * the first that is a picture by its own bytes.
 */
export async function askSiteIcon(network: Network, site: string): Promise<Found> {
  const candidates: string[] = []
  let sure = true
  // A sign-in page a redirect lands on still has the site's icons: only the head is read.
  const page = await askAddress(network, `https://${site}/`, htmlByteLimit, 'text/html,application/xhtml+xml', true)
  if (page === 'unreachable') sure = false
  else if (page !== 'none') {
    const html = new TextDecoder().decode(page.bytes)
    for (const href of iconHrefs(html)) {
      const found = absolute(href, page.url)
      if (found) candidates.push(found)
    }
    candidates.push(`https://${page.url.hostname}/favicon.ico`)
  }
  candidates.push(`https://${site}/favicon.ico`)
  for (const address of [...new Set(candidates)]) {
    const found = await askPicture(network, address)
    if (found.picture) return { picture: found.picture, sure: true }
    if (!found.sure) sure = false
  }
  return { picture: undefined, sure }
}

/** A site's icon as a `data:` address, or undefined when it has none. */
export async function readSiteIcon(network: Network, site: string): Promise<string | undefined> {
  return (await askSiteIcon(network, site)).picture
}

/** One picture or none, as kept on disk. */
interface Kept {
  picture: string | null
}

/**
 * The shelf: what was read this run, what is being read (asked twice, read
 * once), and the copies kept on disk: a picture a week, "none" a day, and
 * nothing for a read that had no answer (that one is asked again after five
 * minutes).
 */
export class PictureShelf {
  private readonly answered = new Map<string, { picture: string | null; until: number }>()
  private readonly reading = new Map<string, Promise<string | null>>()

  constructor(
    private readonly folder: string,
    private readonly network: Network,
    private readonly now: () => number = Date.now,
  ) {}

  /** An airline's logo at an https address. */
  logo(url: string): Promise<string | null> {
    if (!safeURL(url)) return Promise.resolve(null)
    return this.find(`logo:${url}`, () => askPicture(this.network, url))
  }

  /** A saved login's site icon. */
  siteIcon(site: string): Promise<string | null> {
    const key = siteKey(site)
    if (key === '' || !safeURL(`https://${key}/`)) return Promise.resolve(null)
    return this.find(`site:${key}`, () => askSiteIcon(this.network, key))
  }

  private find(key: string, read: () => Promise<Found>): Promise<string | null> {
    const done = this.answered.get(key)
    if (done && this.now() < done.until) return Promise.resolve(done.picture)
    const running = this.reading.get(key)
    if (running) return running
    const task = (async () => {
      const file = path.join(this.folder, `${createHash('sha256').update(key).digest('hex')}.json`)
      const kept = await this.readKept(file)
      if (kept) {
        this.answered.set(key, kept)
        return kept.picture
      }
      const found = await read().catch((): Found => ({ picture: undefined, sure: false }))
      const picture = found.picture ?? null
      if (picture === null && !found.sure) {
        // Nothing is written: asked again in five minutes, or the next time the app starts.
        this.answered.set(key, { picture: null, until: this.now() + retryAfterMs })
        return null
      }
      this.answered.set(key, { picture, until: this.now() + (picture === null ? noneKeptForMs : keptForMs) })
      await mkdir(this.folder, { recursive: true })
        .then(() => writeFile(file, JSON.stringify({ picture } satisfies Kept)))
        .catch(() => {})
      return picture
    })()
    this.reading.set(key, task)
    return task.then(
      (picture) => {
        this.reading.delete(key)
        return picture
      },
      () => {
        this.reading.delete(key)
        return null
      },
    )
  }

  /** What is kept on disk and still holds: a picture a week from its writing, "none" a day. */
  private async readKept(file: string): Promise<{ picture: string | null; until: number } | undefined> {
    try {
      const info = await stat(file)
      const value = JSON.parse(await readFile(file, 'utf8')) as Partial<Kept>
      const picture =
        value.picture === null
          ? null
          : typeof value.picture === 'string' && value.picture.startsWith('data:image/')
            ? value.picture
            : undefined
      if (picture === undefined) return undefined
      const until = info.mtimeMs + (picture === null ? noneKeptForMs : keptForMs)
      return this.now() < until ? { picture, until } : undefined
    } catch {
      return undefined
    }
  }
}
