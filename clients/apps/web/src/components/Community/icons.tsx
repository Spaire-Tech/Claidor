// Minimal stroke-icon set used by the Community surface.
// Kept local (instead of pulling MUI) so the bundle stays small for the
// customer-portal route and the iconography matches the Apple-monochrome
// look exactly.

import type { SVGProps } from 'react'

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

type Props = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number }

const withSize = ({ size, ...rest }: Props) =>
  size != null
    ? { ...base, ...rest, width: size, height: size }
    : { ...base, ...rest }

export const IconBook = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5z" />
    <path d="M4 19a2 2 0 012-2h13" />
  </svg>
)

export const IconChat = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M21 12a8 8 0 01-12.7 6.5L3 20l1.5-5.3A8 8 0 1121 12z" />
  </svg>
)

export const IconShare = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v14" />
  </svg>
)

export const IconDots = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <circle cx="5" cy="12" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="19" cy="12" r="1.4" />
  </svg>
)

export const IconPlus = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconPin = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M12 17v5M7 4h10l-1 5 3 4H5l3-4-1-5z" />
  </svg>
)

export const IconFilter = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M4 5h16l-6 8v6l-4-2v-4L4 5z" />
  </svg>
)

export const IconSort = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M3 6h18M6 12h12M10 18h4" />
  </svg>
)

export const IconBookmark = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M6 3h12v18l-6-4-6 4V3z" />
  </svg>
)

export const IconBell = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10 21a2 2 0 0 0 4 0" />
  </svg>
)

export const IconSettings = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
)

export const IconStar = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M12 3l2.5 6.5L21 10l-5 4.5L17.5 21 12 17.5 6.5 21 8 14.5 3 10l6.5-.5L12 3z" />
  </svg>
)

export const IconImage = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
)

export const IconTrash = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" />
  </svg>
)

export const IconCheck = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M4 12l5 5L20 6" />
  </svg>
)

export const IconX = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
)

export const IconVideo = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <rect x="3" y="6" width="14" height="12" rx="2" />
    <path d="M17 10l4-2v8l-4-2z" />
  </svg>
)

export const IconPlay = (p: Props = {}) => (
  <svg {...withSize(p)} fill="currentColor" stroke="none">
    <path d="M8 5v14l11-7L8 5z" />
  </svg>
)

export const IconThumbsUp = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M7 11v9H4a1 1 0 01-1-1v-7a1 1 0 011-1h3z" />
    <path d="M7 11l5-8a2 2 0 014 0v6h5a2 2 0 012 2.5l-2 7a2 2 0 01-2 1.5H7" />
  </svg>
)

export const IconHeart = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M12 21s-7-4.5-9.5-9C1 9 3 5 7 5c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6 4 4.5 7-2.5 4.5-9.5 9-9.5 9z" />
  </svg>
)

export const IconSend = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
)

export const IconRepeat = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3" />
  </svg>
)

export const IconGlobe = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a13.5 13.5 0 010 18M12 3a13.5 13.5 0 000 18" />
  </svg>
)

export const IconHome = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1V10z" />
  </svg>
)

export const IconFile = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z" />
    <path d="M14 3v6h6" />
  </svg>
)

export const IconSmile = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
  </svg>
)

export const IconUsers = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.9M16 3.1A4 4 0 0116 11" />
  </svg>
)

export const IconCalendar = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
)

export const IconClock = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

export const IconMapPin = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M12 22s-7-6-7-12a7 7 0 0114 0c0 6-7 12-7 12z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
)

export const IconSearch = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
)

export const IconPlayCircle = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 8l6 4-6 4V8z" />
  </svg>
)

export const IconPoll = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M6 20V10M12 20V4M18 20v-7" />
  </svg>
)

export const IconGif = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10v4M6 12h2M12 10v4M16 10v4M16 10h2M16 12h2" />
  </svg>
)

export const IconCamera = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M3 7h3l2-3h8l2 3h3a1 1 0 011 1v11a1 1 0 01-1 1H3a1 1 0 01-1-1V8a1 1 0 011-1z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
)

export const IconPaperclip = (p: Props = {}) => (
  <svg {...withSize(p)}>
    <path d="M21 12.5l-9 9a5 5 0 01-7-7l9-9a3.5 3.5 0 015 5l-9 9a2 2 0 01-3-3l8-8" />
  </svg>
)

// v5 right-rail "See all >" affordance — rotated chevron-down so the
// stroke style matches the rest of the icon set.
export const IconChevron = (p: Props = {}) => (
  <span
    style={{
      display: 'inline-flex',
      transform: 'rotate(-90deg)',
      alignItems: 'center',
    }}
  >
    <svg {...withSize(p)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  </span>
)

// ---------------------------------------------------------------------
// Brand marks for the Add-to-Calendar menu. These intentionally do NOT
// use the stroke-only `withSize` base — they're filled brand glyphs at
// a smaller fixed size so the dropdown reads at a glance.
// ---------------------------------------------------------------------

type BrandProps = { size?: number }

const brandSize = (size: number | undefined): number => size ?? 16

// Google Calendar — the square mark with the day number "31". We
// reproduce the official colors (blue/red/yellow/green corners) at a
// small scale; enough to read as "Google" without infringing the full
// logotype.
export const IconGoogleCalendar = ({ size }: BrandProps = {}) => {
  const s = brandSize(size)
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="4" y="4" width="24" height="24" rx="3" fill="#fff" />
      <path d="M22 4h6v6h-6z" fill="#fbbc04" />
      <path d="M4 22h6v6H4z" fill="#34a853" />
      <path d="M22 22h6v6h-6z" fill="#ea4335" />
      <path d="M4 4h6v6H4z" fill="#4285f4" />
      <path
        d="M14 12h-3v2h3v2.5h-2.5V18H14a2.5 2.5 0 0 0 0-5h-3v2h3"
        fill="#4285f4"
      />
      <text
        x="17"
        y="20"
        fontFamily="Arial, sans-serif"
        fontSize="9"
        fontWeight="700"
        fill="#1a73e8"
      >
        31
      </text>
    </svg>
  )
}

// Apple Calendar — white tile with red "DAY" header and the day number.
// Same reading as the macOS / iOS calendar icon.
export const IconAppleCalendar = ({ size }: BrandProps = {}) => {
  const s = brandSize(size)
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        x="3"
        y="4"
        width="26"
        height="24"
        rx="4"
        fill="#fff"
        stroke="#e5e7eb"
        strokeWidth="1"
      />
      <rect x="3" y="4" width="26" height="7" rx="4" fill="#ef4444" />
      <rect x="3" y="8" width="26" height="3" fill="#ef4444" />
      <text
        x="16"
        y="10"
        textAnchor="middle"
        fontFamily="-apple-system, Helvetica, Arial, sans-serif"
        fontSize="5"
        fontWeight="700"
        fill="#fff"
      >
        WED
      </text>
      <text
        x="16"
        y="24"
        textAnchor="middle"
        fontFamily="-apple-system, Helvetica, Arial, sans-serif"
        fontSize="13"
        fontWeight="600"
        fill="#1f2937"
      >
        17
      </text>
    </svg>
  )
}

// Outlook — the blue "O" + calendar grid mark.
export const IconOutlookCalendar = ({ size }: BrandProps = {}) => {
  const s = brandSize(size)
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="4" y="6" width="24" height="20" rx="2" fill="#fff" />
      <path d="M4 8h24v3H4z" fill="#0078d4" />
      <rect x="4" y="6" width="24" height="20" rx="2" fill="none" stroke="#0078d4" strokeWidth="1.2" />
      <circle cx="16" cy="18" r="5" fill="#fff" stroke="#0078d4" strokeWidth="2" />
      <path
        d="M14 16.5a2 2 0 1 1 4 0 2 2 0 0 1-4 0z"
        fill="#0078d4"
      />
    </svg>
  )
}
