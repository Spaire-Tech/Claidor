import { lookup } from 'dns/promises'
import { isIPv4, isIPv6 } from 'net'
import { NextRequest } from 'next/server'

// ─── Constants ────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 4000
const MAX_RESPONSE_BYTES = 1024 * 1024 // 1 MiB
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 min
const CACHE_MAX_ENTRIES = 500
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 30 // per IP per window

const USER_AGENT = 'Mozilla/5.0 (compatible; SpaireLinkBot/1.0; +https://spairehq.com)'

// ─── SSRF guard ───────────────────────────────────────────────────────────────

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true
  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true // link-local + AWS metadata
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // multicast / reserved
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === '::' || lower === '::1') return true
  if (lower.startsWith('fe80:') || lower.startsWith('fe80::')) return true // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique-local
  if (lower.startsWith('ff')) return true // multicast
  // IPv4-mapped IPv6 (::ffff:a.b.c.d)
  const v4mapped = lower.match(/^::ffff:([\d.]+)$/)
  if (v4mapped) return isPrivateIPv4(v4mapped[1])
  return false
}

function isPrivateIP(ip: string): boolean {
  if (isIPv4(ip)) return isPrivateIPv4(ip)
  if (isIPv6(ip)) return isPrivateIPv6(ip)
  return true // unknown format → reject
}

async function isHostSafe(hostname: string): Promise<boolean> {
  // Reject literal IPs that resolve to private ranges before DNS lookup
  if (isIPv4(hostname) || isIPv6(hostname)) {
    return !isPrivateIP(hostname)
  }
  // Reject obvious local names
  const lower = hostname.toLowerCase()
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return false
  }
  try {
    const results = await lookup(hostname, { all: true })
    if (results.length === 0) return false
    return results.every((r) => !isPrivateIP(r.address))
  } catch {
    return false
  }
}

function validateUrl(raw: string): URL | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null
  if (url.username || url.password) return null
  return url
}

// ─── In-memory LRU cache ──────────────────────────────────────────────────────

type Preview = {
  title: string | null
  description: string | null
  image_url: string | null
}

const previewCache = new Map<string, { value: Preview; expiresAt: number }>()

function cacheGet(key: string): Preview | null {
  const entry = previewCache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    previewCache.delete(key)
    return null
  }
  // LRU bump
  previewCache.delete(key)
  previewCache.set(key, entry)
  return entry.value
}

function cacheSet(key: string, value: Preview): void {
  if (previewCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = previewCache.keys().next().value
    if (oldest) previewCache.delete(oldest)
  }
  previewCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
}

// ─── Rate limit (per IP, per window) ──────────────────────────────────────────

const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function rateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateBuckets.get(ip)
  if (!entry || entry.resetAt < now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) return false
  entry.count += 1
  return true
}

function getClientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

// ─── HTML / oEmbed parsing ────────────────────────────────────────────────────

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function extractMeta(html: string, prop: string): string | null {
  const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escaped}["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escaped}["']`,
      'i',
    ),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return decodeHtmlEntities(m[1].trim())
  }
  return null
}

const OEMBED_ENDPOINTS: Record<string, (url: string) => string> = {
  'youtube.com': (u) =>
    `https://www.youtube.com/oembed?url=${encodeURIComponent(u)}&format=json`,
  'youtu.be': (u) =>
    `https://www.youtube.com/oembed?url=${encodeURIComponent(u)}&format=json`,
  'soundcloud.com': (u) =>
    `https://soundcloud.com/oembed?url=${encodeURIComponent(u)}&format=json`,
  'tiktok.com': (u) =>
    `https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}`,
  'open.spotify.com': (u) =>
    `https://open.spotify.com/oembed?url=${encodeURIComponent(u)}`,
  'vimeo.com': (u) =>
    `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}`,
}

// ─── Bounded fetch ────────────────────────────────────────────────────────────

async function fetchBounded(
  url: string,
  init: RequestInit,
): Promise<{ status: number; body: string } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      // Manual redirect handling so we re-validate every hop
      redirect: 'manual',
      cache: 'no-store',
    })
    if (!res.body) return { status: res.status, body: '' }

    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8', { fatal: false })
    let received = 0
    let body = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        break
      }
      body += decoder.decode(value, { stream: true })
    }
    body += decoder.decode()
    return { status: res.status, body }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function safeFetch(
  url: string,
  init: RequestInit,
  hopsLeft = 3,
): Promise<{ status: number; body: string } | null> {
  const parsed = validateUrl(url)
  if (!parsed) return null
  if (!(await isHostSafe(parsed.hostname))) return null

  const res = await fetchBounded(url, init)
  if (!res) return null

  // Manual redirect handling — re-validate the next hop's host
  if (res.status >= 300 && res.status < 400 && hopsLeft > 0) {
    // We need the Location header; refetch just enough to get headers.
    // Simpler approach: do a HEAD-like fetch with redirect: 'manual' via a
    // separate call. But fetchBounded already consumed the body; the spec
    // requires we read Location from the response. To keep this self-contained,
    // do a second call that only reads headers.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const headRes = await fetch(url, {
        ...init,
        signal: controller.signal,
        redirect: 'manual',
        cache: 'no-store',
      })
      const location = headRes.headers.get('location')
      if (location) {
        const next = new URL(location, url).toString()
        return safeFetch(next, init, hopsLeft - 1)
      }
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  return res
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) {
    return Response.json({ error: 'URL required' }, { status: 400 })
  }

  const parsed = validateUrl(url)
  if (!parsed) {
    return Response.json({ error: 'Invalid URL' }, { status: 400 })
  }

  const ip = getClientIp(request)
  if (!rateLimit(ip)) {
    return Response.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const cacheKey = parsed.toString()
  const cached = cacheGet(cacheKey)
  if (cached) {
    return Response.json(cached)
  }

  if (!(await isHostSafe(parsed.hostname))) {
    return Response.json({ error: 'Host not allowed' }, { status: 400 })
  }

  const host = parsed.hostname.replace(/^www\./, '')
  const oEmbedBuilder = OEMBED_ENDPOINTS[host]

  // 1. Try oEmbed first
  if (oEmbedBuilder) {
    const res = await safeFetch(oEmbedBuilder(parsed.toString()), {
      headers: { 'User-Agent': 'SpaireLinkBot/1.0', Accept: 'application/json' },
    })
    if (res && res.status >= 200 && res.status < 300 && res.body) {
      try {
        const data = JSON.parse(res.body)
        const preview: Preview = {
          title: data.title ?? null,
          description: data.author_name ?? null,
          image_url: data.thumbnail_url ?? null,
        }
        cacheSet(cacheKey, preview)
        return Response.json(preview)
      } catch {
        // fall through to OG scrape
      }
    }
  }

  // 2. Fallback: scrape OG tags from the page
  const res = await safeFetch(parsed.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
  })

  if (res && res.status >= 200 && res.status < 300 && res.body) {
    const html = res.body
    const title =
      extractMeta(html, 'og:title') ??
      html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ??
      null
    const description =
      extractMeta(html, 'og:description') ??
      extractMeta(html, 'description') ??
      null
    const image_url = extractMeta(html, 'og:image') ?? null

    const preview: Preview = {
      title: title ? decodeHtmlEntities(title) : null,
      description: description ? decodeHtmlEntities(description) : null,
      image_url,
    }
    cacheSet(cacheKey, preview)
    return Response.json(preview)
  }

  const empty: Preview = { title: null, description: null, image_url: null }
  cacheSet(cacheKey, empty)
  return Response.json(empty)
}
