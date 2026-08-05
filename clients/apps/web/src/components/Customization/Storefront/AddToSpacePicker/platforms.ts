import {
  PLATFORMS,
  type PlatformConfig,
  type PlatformId,
} from '@/components/Profile/linkPlatforms'
import {
  AppleMusicLogo,
  InstagramLogo,
  SoundCloudLogo,
  SpotifyLogo,
  SubstackLogo,
  TikTokLogo,
  VimeoLogo,
  XLogo,
  YouTubeLogo,
} from './PlatformLogos'

// Picker-specific UI metadata. Adding a new platform = add it to
// PLATFORMS in linkPlatforms.ts (data) AND to PLATFORM_UI here (chrome).

export type EmbedPlatformId = PlatformId

type PlatformUi = {
  label: string
  sub: string
  Icon: React.ComponentType<{
    className?: string
    style?: React.CSSProperties
  }>
  bg: string
}

const PLATFORM_UI: Record<EmbedPlatformId, PlatformUi> = {
  youtube: {
    label: 'YouTube',
    sub: 'Videos & shorts',
    Icon: YouTubeLogo,
    bg: '#FF0000',
  },
  spotify: {
    label: 'Spotify',
    sub: 'Tracks, episodes, playlists',
    Icon: SpotifyLogo,
    bg: '#1ED760',
  },
  soundcloud: {
    label: 'SoundCloud',
    sub: 'Tracks & sets',
    Icon: SoundCloudLogo,
    bg: '#FF5500',
  },
  vimeo: {
    label: 'Vimeo',
    sub: 'Videos',
    Icon: VimeoLogo,
    bg: '#1AB7EA',
  },
  apple_music: {
    label: 'Apple Music',
    sub: 'Tracks & playlists',
    Icon: AppleMusicLogo,
    bg: '#FA243C',
  },
  tiktok: {
    label: 'TikTok',
    sub: 'Videos',
    Icon: TikTokLogo,
    bg: '#000000',
  },
  substack: {
    label: 'Substack',
    sub: 'Newsletter posts',
    Icon: SubstackLogo,
    bg: '#FF6719',
  },
  instagram: {
    label: 'Instagram',
    sub: 'Posts & reels',
    Icon: InstagramLogo,
    bg: 'linear-gradient(135deg, #E4405F, #FCAF45)',
  },
  x: {
    label: 'X',
    sub: 'Posts & threads',
    Icon: XLogo,
    bg: '#000000',
  },
}

export type EmbedPlatform = PlatformConfig & PlatformUi

export const EMBED_PLATFORMS: ReadonlyArray<EmbedPlatform> = PLATFORMS.map(
  (p) => ({ ...p, ...PLATFORM_UI[p.id] }),
)

export function detectEmbedPlatform(url: string): EmbedPlatform | null {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
  for (const p of EMBED_PLATFORMS) {
    for (const allowed of p.hosts) {
      if (host === allowed || host.endsWith(`.${allowed}`)) {
        return p
      }
    }
  }
  return null
}
