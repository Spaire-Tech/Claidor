'use client'

// Composer-local icon set. Distinct from Spaire's main Icon component;
// names match the design bundle so the rest of the composer code reads 1:1.

import type { CSSProperties } from 'react'

export type IconName =
  | 'close'
  | 'dots'
  | 'eye'
  | 'back'
  | 'chevronRight'
  | 'chevronDown'
  | 'chevronLeft'
  | 'check'
  | 'plus'
  | 'globe'
  | 'paidCard'
  | 'quote'
  | 'bullet'
  | 'numbered'
  | 'paragraph'
  | 'h1Gly'
  | 'h2Gly'
  | 'h3Gly'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'alignFull'
  | 'link'
  | 'code'
  | 'imageFill'
  | 'videoFill'
  | 'buttonFill'
  | 'dividerLine'
  | 'paperclip'
  | 'file'
  | 'crop'
  | 'replace'
  | 'trash'
  | 'info'
  | 'type'
  | 'monitor'
  | 'smartphone'
  | 'copy'
  | 'duplicate'
  | 'drafts'
  | 'calendar'
  | 'send'
  | 'sendFill'
  | 'clock'
  | 'people'
  | 'bell'
  | 'tag'
  | 'shield'
  | 'pen'
  | 'mail'
  | 'flag'
  | 'sparkle'
  | 'star'
  | 'reply'
  | 'filter'
  | 'flask'
  | 'minusC'

export function Icon({
  name,
  size = 20,
  sw = 1.9,
  style,
}: {
  name: IconName
  size?: number
  sw?: number
  style?: CSSProperties
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    style,
    fill: 'none',
  } as const
  const stroke = {
    stroke: 'currentColor',
    strokeWidth: sw,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  switch (name) {
    case 'close':
      return <svg {...common}><path d="M6 6l12 12M18 6L6 18" {...stroke} /></svg>
    case 'dots':
      return (
        <svg {...common} fill="currentColor">
          <circle cx="5" cy="12" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="19" cy="12" r="1.9" />
        </svg>
      )
    case 'eye':
      return (
        <svg {...common}>
          <path d="M2.2 12S6 5.2 12 5.2 21.8 12 21.8 12 18 18.8 12 18.8 2.2 12 2.2 12Z" {...stroke} />
          <circle cx="12" cy="12" r="3.1" {...stroke} />
        </svg>
      )
    case 'back':
    case 'chevronLeft':
      return <svg {...common}><path d="M15 5l-7 7 7 7" {...stroke} /></svg>
    case 'chevronRight':
      return <svg {...common}><path d="M9 5l7 7-7 7" {...stroke} /></svg>
    case 'chevronDown':
      return <svg {...common}><path d="M5 8.5l7 7 7-7" {...stroke} /></svg>
    case 'check':
      return <svg {...common}><path d="M20 6 9 17l-5-5" {...stroke} /></svg>
    case 'plus':
      return <svg {...common}><path d="M12 5v14M5 12h14" {...stroke} /></svg>
    case 'globe':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" {...stroke} />
          <path d="M3 12h18M12 3c2.5 2.4 2.5 15.6 0 18M12 3c-2.5 2.4-2.5 15.6 0 18" {...stroke} />
        </svg>
      )
    case 'paidCard':
      return (
        <svg {...common}>
          <rect x="2.5" y="5" width="19" height="14" rx="3" {...stroke} />
          <circle cx="12" cy="12" r="2.6" {...stroke} />
          <path d="M12 9.4v-.9M12 15.5v-.9" {...stroke} />
        </svg>
      )
    case 'quote':
      return (
        <svg {...common} fill="currentColor">
          <path d="M9.6 6.4C7 6.7 5.2 8.8 5.2 11.6V17.2h5.2v-5.2H7.7c.1-1.4.9-2.4 2.3-2.8zM18.8 6.4c-2.6.3-4.4 2.4-4.4 5.2v5.6h5.2v-5.2h-2.7c.1-1.4.9-2.4 2.3-2.8z" />
        </svg>
      )
    case 'bullet':
      return (
        <svg {...common}>
          <path d="M9 6h11M9 12h11M9 18h11" {...stroke} />
          {[6, 12, 18].map((y) => (
            <circle key={y} cx="4.6" cy={y} r="1.5" fill="currentColor" />
          ))}
        </svg>
      )
    case 'numbered':
      return (
        <svg {...common}>
          <path d="M10 6h10M10 12h10M10 18h10" {...stroke} />
          <text x="2" y="8" fontSize="6.5" fontWeight="700" fill="currentColor">1</text>
          <text x="2" y="14.3" fontSize="6.5" fontWeight="700" fill="currentColor">2</text>
          <text x="2" y="20.6" fontSize="6.5" fontWeight="700" fill="currentColor">3</text>
        </svg>
      )
    case 'paragraph':
      return <svg {...common}><path d="M5 5.5h14M5 10h14M5 14.5h14M5 19h8" {...stroke} /></svg>
    case 'h1Gly':
      return (
        <svg {...common} fill="none">
          <path d="M3.5 5.5v11M9 5.5v11M3.5 11H9" {...stroke} />
          <text x="11.5" y="16.6" fontSize="9.5" fontWeight="800" fill="currentColor">1</text>
        </svg>
      )
    case 'h2Gly':
      return (
        <svg {...common} fill="none">
          <path d="M3.5 5.5v11M9 5.5v11M3.5 11H9" {...stroke} />
          <text x="11" y="16.6" fontSize="9.5" fontWeight="800" fill="currentColor">2</text>
        </svg>
      )
    case 'h3Gly':
      return (
        <svg {...common} fill="none">
          <path d="M3.5 5.5v11M9 5.5v11M3.5 11H9" {...stroke} />
          <text x="11" y="16.6" fontSize="9.5" fontWeight="800" fill="currentColor">3</text>
        </svg>
      )
    case 'alignLeft':
      return <svg {...common}><path d="M4 6h16M4 12h10M4 18h13" {...stroke} /></svg>
    case 'alignCenter':
      return <svg {...common}><path d="M4 6h16M7 12h10M5 18h14" {...stroke} /></svg>
    case 'alignRight':
      return <svg {...common}><path d="M4 6h16M10 12h10M7 18h13" {...stroke} /></svg>
    case 'alignFull':
      return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16" {...stroke} /></svg>
    case 'link':
      return (
        <svg {...common}>
          <path d="M9.5 14.5l5-5M10.8 7.2l1.1-1.1a4 4 0 0 1 5.7 5.7l-1.1 1.1M13.2 16.8l-1.1 1.1a4 4 0 0 1-5.7-5.7l1.1-1.1" {...stroke} />
        </svg>
      )
    case 'code':
      return <svg {...common}><path d="M8.5 8l-4 4 4 4M15.5 8l4 4-4 4" {...stroke} /></svg>
    case 'imageFill':
      return (
        <svg {...common} fill="currentColor">
          <rect x="2.5" y="4" width="19" height="16" rx="2.6" />
          <circle cx="8" cy="9.5" r="1.8" fill="#fff" />
          <path d="M4.5 18l4.8-5 3.2 3 2.5-2.4 4.5 4.4" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'videoFill':
      return (
        <svg {...common} fill="currentColor">
          <rect x="2.5" y="4" width="19" height="16" rx="2.6" />
          <path d="M10 8.7v6.6l5.4-3.3z" fill="#fff" />
        </svg>
      )
    case 'buttonFill':
      return (
        <svg {...common} fill="currentColor">
          <rect x="2.5" y="8" width="19" height="8.5" rx="4.25" />
          <path d="M8 12.2h8" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      )
    case 'dividerLine':
      return <svg {...common}><path d="M4 12h16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
    case 'paperclip':
      return (
        <svg {...common}>
          <path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7-7L13.5 4a3.3 3.3 0 0 1 4.7 4.7l-8.3 8.3a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6" {...stroke} />
        </svg>
      )
    case 'file':
      return (
        <svg {...common} fill="currentColor">
          <path d="M6 2.5h7l5 5V21a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 21z" />
          <path d="M13 2.5V7.5h5" stroke="#fff" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
        </svg>
      )
    case 'crop':
      return <svg {...common}><path d="M6.5 2v13.5a2 2 0 0 0 2 2H22M17.5 22V8.5a2 2 0 0 0-2-2H2" {...stroke} /></svg>
    case 'replace':
      return (
        <svg {...common}>
          <path d="M3 9a9 9 0 0 1 15-4.5L21 7M21 15a9 9 0 0 1-15 4.5L3 17M21 4v3h-3M3 20v-3h3" {...stroke} />
        </svg>
      )
    case 'trash':
      return (
        <svg {...common}>
          <path d="M3.5 6.5h17M9 6.5V4.5h6v2M6.5 6.5l1 14h9l1-14" {...stroke} />
        </svg>
      )
    case 'info':
      return (
        <svg {...common} fill="currentColor">
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 11v5.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="7.8" r="1.3" fill="#fff" />
        </svg>
      )
    case 'type':
      return <svg {...common}><path d="M4 7V5h16v2M9 19h6M12 5v14" {...stroke} /></svg>
    case 'monitor':
      return (
        <svg {...common}>
          <rect x="2.5" y="4" width="19" height="13" rx="2" {...stroke} />
          <path d="M8 21h8M12 17v4" {...stroke} />
        </svg>
      )
    case 'smartphone':
      return (
        <svg {...common}>
          <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" {...stroke} />
          <path d="M11 18.5h2" {...stroke} />
        </svg>
      )
    case 'copy':
      return (
        <svg {...common}>
          <rect x="8" y="8" width="12" height="12" rx="2.5" {...stroke} />
          <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" {...stroke} />
        </svg>
      )
    case 'duplicate':
      return (
        <svg {...common}>
          <rect x="8" y="8" width="12" height="12" rx="2.5" {...stroke} />
          <path d="M14 11v6M11 14h6" {...stroke} />
          <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" {...stroke} />
        </svg>
      )
    case 'drafts':
      return <svg {...common}><path d="M4 7.5 12 13l8-5.5M4 7.5 12 2l8 5.5v9L12 22 4 16.5z" {...stroke} /></svg>
    case 'calendar':
      return (
        <svg {...common}>
          <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" {...stroke} />
          <path d="M8 2.5v4M16 2.5v4M3.5 9.5h17" {...stroke} />
        </svg>
      )
    case 'send':
      return <svg {...common}><path d="M21 3 10.5 13.5M21 3l-6.6 18-3.9-8.5L2 8.6 21 3z" {...stroke} /></svg>
    case 'sendFill':
      return (
        <svg {...common} fill="currentColor">
          <path d="M21.4 2.6 2.9 8.2c-.9.3-1 1.5-.1 1.9l7.1 3 3 7.1c.4.9 1.6.8 1.9-.1l5.6-18.5c.3-.9-.6-1.7-1.5-1.4z" />
          <path d="M21.4 2.6 10.4 13" stroke="#fff" strokeWidth="1.5" />
        </svg>
      )
    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" {...stroke} />
          <path d="M12 7v5.2l3.4 2" {...stroke} />
        </svg>
      )
    case 'people':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.3" {...stroke} />
          <path d="M3.5 19.2a5.5 5.5 0 0 1 11 0M16 5.2a3.3 3.3 0 0 1 0 6M17.5 14.2a5.5 5.5 0 0 1 3 5" {...stroke} />
        </svg>
      )
    case 'bell':
      return <svg {...common}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0" {...stroke} /></svg>
    case 'tag':
      return (
        <svg {...common}>
          <path d="M3.5 11.5V4.5a1 1 0 0 1 1-1h7l8 8a1.5 1.5 0 0 1 0 2.1l-5.9 5.9a1.5 1.5 0 0 1-2.1 0l-8-8z" {...stroke} />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
        </svg>
      )
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 2.5 4.5 5.5v6c0 4.5 3.1 7.8 7.5 9.5 4.4-1.7 7.5-5 7.5-9.5v-6L12 2.5z" {...stroke} />
          <path d="M8.8 12 11 14.2l4.2-4.4" {...stroke} />
        </svg>
      )
    case 'pen':
      return (
        <svg {...common}>
          <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" {...stroke} />
          <path d="M14 7l3 3" {...stroke} />
        </svg>
      )
    case 'mail':
      return (
        <svg {...common}>
          <rect x="2.5" y="4.5" width="19" height="15" rx="2.6" {...stroke} />
          <path d="M3.5 6.5 12 13l8.5-6.5" {...stroke} />
        </svg>
      )
    case 'flag':
      return <svg {...common}><path d="M5 21V4M5 4.5h11l-2 3.5 2 3.5H5" {...stroke} /></svg>
    case 'sparkle':
      return (
        <svg {...common}>
          <path d="M12 3.5 13.7 9 19 10.7 13.7 12.4 12 18 10.3 12.4 5 10.7 10.3 9 12 3.5zM19 3.5l.6 1.9L21.5 6l-1.9.6L19 8.5l-.6-1.9L16.5 6l1.9-.6L19 3.5z" {...stroke} />
        </svg>
      )
    case 'star':
      return <svg {...common}><path d="M12 3.5 14.6 9l6 .7-4.5 4 1.3 5.9L12 16.6 6.6 19.6l1.3-5.9-4.5-4 6-.7L12 3.5z" {...stroke} /></svg>
    case 'reply':
      return <svg {...common}><path d="M9 7 4 12l5 5M4 12h9a6 6 0 0 1 6 6v1" {...stroke} /></svg>
    case 'filter':
      return <svg {...common}><path d="M3 5h18l-7 8.5V20l-4 1v-7.5L3 5z" {...stroke} /></svg>
    case 'flask':
      return (
        <svg {...common}>
          <path d="M9 3h6M10 3v6L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9V3" {...stroke} />
          <path d="M7.6 14h8.8" {...stroke} />
        </svg>
      )
    case 'minusC':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" {...stroke} />
          <path d="M8 12h8" {...stroke} />
        </svg>
      )
    default:
      return <svg {...common}></svg>
  }
}
