// Platform detection + embed-URL building for storefront links.
// Single source of truth — the picker, the public renderer, AND the
// editor canvas all import from here. Adding a new platform only
// requires touching this file (plus icon metadata in the picker).

export type PlatformId =
  | 'youtube'
  | 'spotify'
  | 'soundcloud'
  | 'vimeo'
  | 'apple_music'
  | 'tiktok'
  | 'instagram'
  | 'substack'
  | 'x'

export type PlatformConfig = {
  id: PlatformId
  hosts: string[]
  // True if buildEmbedUrl can produce a working iframe URL for this
  // platform. canEmbed: false platforms render as styled link cards.
  canEmbed: boolean
  // For aspect-ratio embeds (responsive height). Mutually exclusive
  // with embedHeight — pick whichever the platform's iframe expects.
  embedAspect?: number
  // For fixed-height embeds (Spotify compact, SoundCloud, Apple Music).
  embedHeight?: number
}

export const PLATFORMS: ReadonlyArray<PlatformConfig> = [
  {
    id: 'youtube',
    hosts: [
      'youtube.com',
      'youtu.be',
      'm.youtube.com',
      'music.youtube.com',
      'youtube-nocookie.com',
    ],
    canEmbed: true,
    embedAspect: 16 / 9,
  },
  {
    id: 'spotify',
    hosts: ['open.spotify.com', 'spotify.com'],
    canEmbed: true,
    embedHeight: 152,
  },
  {
    id: 'soundcloud',
    hosts: ['soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'],
    canEmbed: true,
    embedHeight: 116,
  },
  {
    id: 'vimeo',
    hosts: ['vimeo.com', 'player.vimeo.com'],
    canEmbed: true,
    embedAspect: 16 / 9,
  },
  {
    id: 'apple_music',
    hosts: ['music.apple.com', 'embed.music.apple.com'],
    canEmbed: true,
    embedHeight: 175,
  },
  {
    id: 'tiktok',
    hosts: ['tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'],
    canEmbed: true,
    // TikTok videos are vertical (9:16). The native iframe respects it.
    embedAspect: 9 / 16,
  },
  {
    id: 'instagram',
    hosts: ['instagram.com'],
    canEmbed: true,
    // Posts are typically square or portrait. The native embed renders
    // a card with caption + comments, so 4:5 is the closest natural fit.
    embedAspect: 4 / 5,
  },
  {
    id: 'substack',
    hosts: ['substack.com'],
    canEmbed: false,
  },
  {
    id: 'x',
    hosts: ['x.com', 'twitter.com'],
    canEmbed: false,
  },
]

const HOST_TO_PLATFORM: Map<string, PlatformConfig> = (() => {
  const m = new Map<string, PlatformConfig>()
  for (const p of PLATFORMS) {
    for (const h of p.hosts) m.set(h, p)
  }
  return m
})()

/**
 * Returns the canonical platform for a URL, or null if it isn't a known
 * platform. Matches by hostname suffix so locale/mobile subdomains
 * (m.tiktok.com, music.youtube.com) are detected correctly.
 */
export function detectPlatform(url: string): PlatformConfig | null {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
  // Exact host first, then suffix match.
  const exact = HOST_TO_PLATFORM.get(host)
  if (exact) return exact
  for (const p of PLATFORMS) {
    for (const allowed of p.hosts) {
      if (host.endsWith(`.${allowed}`)) return p
    }
  }
  return null
}

export function isEmbeddablePlatform(
  platform: PlatformId | string | null | undefined,
): boolean {
  if (!platform) return false
  const found = PLATFORMS.find((p) => p.id === platform)
  return !!found?.canEmbed
}

export function getPlatformConfig(
  platform: PlatformId | string | null | undefined,
): PlatformConfig | null {
  if (!platform) return null
  return PLATFORMS.find((p) => p.id === platform) ?? null
}

/**
 * Returns the aspect ratio (width / height) the iframe for this URL
 * should render at, or null if the platform uses a fixed height
 * instead. Smaller than 1 = portrait ("reel") and the renderer will
 * cap the width so it doesn't dominate the column.
 *
 * Per-URL because the same platform can host both shapes — e.g. an
 * Instagram /reel/ is 9:16 vertical while a /p/ post is roughly
 * square, and a YouTube /shorts/ is vertical while a normal /watch?v=
 * is 16:9.
 */
export function getEmbedAspect(
  url: string,
  platform: PlatformId | string,
): number | null {
  const cfg = getPlatformConfig(platform)
  if (!cfg) return null
  switch (platform) {
    case 'youtube':
      return /\/shorts\//.test(url) ? 9 / 16 : 16 / 9
    case 'instagram':
      // /reel/ and /tv/ are vertical; /p/ posts embed as ~1:1 cards.
      return /instagram\.com\/(reel|tv)\//.test(url) ? 9 / 16 : 1
    default:
      return cfg.embedAspect ?? null
  }
}

/**
 * Build an embeddable iframe URL for a platform URL. Returns null when
 * we don't know how to embed it (unknown platform, malformed URL, or a
 * platform whose iframe needs a JS widget we don't ship).
 */
export function buildEmbedUrl(
  url: string,
  platform: PlatformId | string,
): string | null {
  switch (platform) {
    case 'youtube': {
      const videoId = url.match(
        /(?:v=|youtu\.be\/|\/shorts\/|\/embed\/)([a-zA-Z0-9_-]{11})/,
      )?.[1]
      if (!videoId) return null
      const p = new URLSearchParams({ rel: '0', modestbranding: '1' })
      return `https://www.youtube.com/embed/${videoId}?${p}`
    }
    case 'spotify': {
      const m = url.match(
        /open\.spotify\.com\/(?:embed\/)?(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]+)/,
      )
      if (!m) return null
      const p = new URLSearchParams({ utm_source: 'generator' })
      return `https://open.spotify.com/embed/${m[1]}/${m[2]}?${p}`
    }
    case 'soundcloud': {
      const p = new URLSearchParams({
        url,
        color: '#ff5500',
        auto_play: 'false',
        hide_related: 'true',
        show_comments: 'false',
        show_user: 'true',
        show_reposts: 'false',
        show_teaser: 'false',
      })
      return `https://w.soundcloud.com/player/?${p}`
    }
    case 'vimeo': {
      const videoId = url.match(
        /vimeo\.com\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d+)/,
      )?.[1]
      if (!videoId) return null
      return `https://player.vimeo.com/video/${videoId}`
    }
    case 'apple_music': {
      // Apple's embed host accepts the same path as music.apple.com.
      try {
        const u = new URL(url)
        if (!u.hostname.endsWith('apple.com')) return null
        return `https://embed.music.apple.com${u.pathname}${u.search}`
      } catch {
        return null
      }
    }
    case 'tiktok': {
      const videoId = url.match(/tiktok\.com\/(?:@[^/]+\/)?video\/(\d+)/)?.[1]
      if (!videoId) return null
      return `https://www.tiktok.com/embed/v2/${videoId}`
    }
    case 'instagram': {
      const m = url.match(/instagram\.com\/(p|reel|tv)\/([a-zA-Z0-9_-]+)/)
      if (!m) return null
      return `https://www.instagram.com/${m[1]}/${m[2]}/embed/`
    }
    default:
      return null
  }
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Public path to a platform's real brand logo. Drop a square .jpg into
 *   clients/apps/web/public/<id>.jpg
 * (e.g. youtube.jpg, spotify.jpg, apple_music.jpg). Returns null for
 * unknown platforms so callers fall back to a generic glyph / the inline
 * SVG mark. Both the Add-to-Space picker and the rendered link cards
 * read from here, so adding the file is all that's needed to light the
 * logo up everywhere.
 */
export function platformLogoUrl(
  platform: PlatformId | string | null | undefined,
): string | null {
  if (!platform) return null
  const known = PLATFORMS.some((p) => p.id === platform)
  return known ? `/${platform}.jpg` : null
}
