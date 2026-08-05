import { CSSProperties, JSX } from 'react'

type IconName =
  | 'plus'
  | 'search'
  | 'mail'
  | 'mail-open'
  | 'send'
  | 'users'
  | 'user'
  | 'chart'
  | 'trending-up'
  | 'trending-down'
  | 'arrow-right'
  | 'arrow-left'
  | 'arrow-up-right'
  | 'arrow-up'
  | 'arrow-down'
  | 'chevron-down'
  | 'chevron-up'
  | 'chevron-right'
  | 'list'
  | 'quote'
  | 'x'
  | 'check'
  | 'check-circle'
  | 'circle'
  | 'clock'
  | 'calendar'
  | 'filter'
  | 'download'
  | 'upload'
  | 'edit'
  | 'trash'
  | 'copy'
  | 'more'
  | 'play'
  | 'pause'
  | 'zap'
  | 'tag'
  | 'globe'
  | 'sparkles'
  | 'image'
  | 'text'
  | 'heading'
  | 'button-icon'
  | 'divider'
  | 'video'
  | 'link'
  | 'eye'
  | 'mouse-pointer'
  | 'monitor'
  | 'phone'
  | 'settings'
  | 'shopping-cart'
  | 'gift'
  | 'mic'
  | 'book'
  | 'package'
  | 'rotate'
  | 'x-circle'
  | 'star'
  | 'minus'
  | 'split'
  | 'flask'
  | 'grid'
  | 'globe-2'
  | 'drag'

type IconProps = {
  name: IconName | string
  size?: number
  strokeWidth?: number
  style?: CSSProperties
  className?: string
}

export const Icon = ({
  name,
  size = 18,
  strokeWidth = 1.6,
  style,
  className,
}: IconProps): JSX.Element => {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style,
    className,
  }

  switch (name) {
    case 'plus':
      return (
        <svg {...props}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      )
    case 'search':
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      )
    case 'mail':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      )
    case 'mail-open':
      return (
        <svg {...props}>
          <path d="M21 8.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5" />
          <path d="m3 8.5 9-5.5 9 5.5" />
          <path d="m3 8.5 9 6 9-6" />
        </svg>
      )
    case 'send':
      return (
        <svg {...props}>
          <path d="M22 2 11 13" />
          <path d="M22 2l-7 20-4-9-9-4Z" />
        </svg>
      )
    case 'users':
      return (
        <svg {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    case 'user':
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      )
    case 'chart':
      return (
        <svg {...props}>
          <path d="M3 3v18h18" />
          <path d="M7 14l4-4 4 4 5-7" />
        </svg>
      )
    case 'trending-up':
      return (
        <svg {...props}>
          <path d="m3 17 6-6 4 4 8-8" />
          <path d="M14 7h7v7" />
        </svg>
      )
    case 'trending-down':
      return (
        <svg {...props}>
          <path d="m3 7 6 6 4-4 8 8" />
          <path d="M14 17h7v-7" />
        </svg>
      )
    case 'arrow-right':
      return (
        <svg {...props}>
          <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      )
    case 'arrow-left':
      return (
        <svg {...props}>
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
      )
    case 'arrow-up-right':
      return (
        <svg {...props}>
          <path d="M7 17 17 7M7 7h10v10" />
        </svg>
      )
    case 'arrow-up':
      return (
        <svg {...props}>
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      )
    case 'arrow-down':
      return (
        <svg {...props}>
          <path d="M12 5v14M19 12l-7 7-7-7" />
        </svg>
      )
    case 'chevron-down':
      return (
        <svg {...props}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      )
    case 'chevron-up':
      return (
        <svg {...props}>
          <path d="m18 15-6-6-6 6" />
        </svg>
      )
    case 'list':
      return (
        <svg {...props}>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      )
    case 'quote':
      return (
        <svg {...props}>
          <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
          <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
        </svg>
      )
    case 'x':
      return (
        <svg {...props}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      )
    case 'chevron-right':
      return (
        <svg {...props}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      )
    case 'check':
      return (
        <svg {...props}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )
    case 'check-circle':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12 2.5 2.5L16 9.5" />
        </svg>
      )
    case 'circle':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      )
    case 'clock':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      )
    case 'calendar':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      )
    case 'filter':
      return (
        <svg {...props}>
          <path d="M3 5h18l-7 9v6l-4-2v-4z" />
        </svg>
      )
    case 'download':
      return (
        <svg {...props}>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      )
    case 'upload':
      return (
        <svg {...props}>
          <path d="M12 21V9" />
          <path d="m7 14 5-5 5 5" />
          <path d="M5 3h14" />
        </svg>
      )
    case 'edit':
      return (
        <svg {...props}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      )
    case 'trash':
      return (
        <svg {...props}>
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        </svg>
      )
    case 'copy':
      return (
        <svg {...props}>
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )
    case 'more':
      return (
        <svg {...props}>
          <circle cx="5" cy="12" r="1.2" fill="currentColor" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
          <circle cx="19" cy="12" r="1.2" fill="currentColor" />
        </svg>
      )
    case 'play':
      return (
        <svg {...props}>
          <polygon points="6 4 20 12 6 20" fill="currentColor" />
        </svg>
      )
    case 'pause':
      return (
        <svg {...props}>
          <rect x="6" y="4" width="4" height="16" fill="currentColor" />
          <rect x="14" y="4" width="4" height="16" fill="currentColor" />
        </svg>
      )
    case 'zap':
      return (
        <svg {...props}>
          <path d="M13 2 4 14h7l-1 8 9-12h-7Z" />
        </svg>
      )
    case 'tag':
      return (
        <svg {...props}>
          <path d="M20 12 12 20 4 12V4h8Z" />
          <circle cx="9" cy="9" r="1.5" fill="currentColor" />
        </svg>
      )
    case 'globe':
    case 'globe-2':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      )
    case 'sparkles':
      return (
        <svg {...props}>
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M18.4 5.6l-2 2M7.6 16.4l-2 2" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      )
    case 'image':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      )
    case 'text':
      return (
        <svg {...props}>
          <path d="M4 7h16M4 12h16M4 17h10" />
        </svg>
      )
    case 'heading':
      return (
        <svg {...props}>
          <path d="M6 4v16M18 4v16M6 12h12" />
        </svg>
      )
    case 'button-icon':
      return (
        <svg {...props}>
          <rect x="3" y="8" width="18" height="8" rx="4" />
          <path d="M9 12h6" />
        </svg>
      )
    case 'divider':
      return (
        <svg {...props}>
          <path d="M3 12h18" />
          <path d="M3 6h18M3 18h18" opacity="0.3" />
        </svg>
      )
    case 'video':
      return (
        <svg {...props}>
          <rect x="2" y="6" width="14" height="12" rx="2" />
          <path d="m22 8-6 4 6 4Z" />
        </svg>
      )
    case 'link':
      return (
        <svg {...props}>
          <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 1 0-7-7l-1 1" />
          <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 1 0 7 7l1-1" />
        </svg>
      )
    case 'eye':
      return (
        <svg {...props}>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case 'mouse-pointer':
      return (
        <svg {...props}>
          <path d="m4 4 7 16 2-7 7-2Z" />
        </svg>
      )
    case 'monitor':
      return (
        <svg {...props}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      )
    case 'phone':
      return (
        <svg {...props}>
          <rect x="6" y="2" width="12" height="20" rx="3" />
          <path d="M11 18h2" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      )
    case 'shopping-cart':
      return (
        <svg {...props}>
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.7 13a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
        </svg>
      )
    case 'gift':
      return (
        <svg {...props}>
          <rect x="3" y="8" width="18" height="13" rx="1" />
          <path d="M3 8h18M12 8v13M12 8c-2.5 0-4-1.5-4-3s1.5-3 4 0c2.5-3 4-1.5 4 0s-1.5 3-4 3Z" />
        </svg>
      )
    case 'mic':
      return (
        <svg {...props}>
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      )
    case 'book':
      return (
        <svg {...props}>
          <path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3Z" />
          <path d="M4 17h15" />
        </svg>
      )
    case 'package':
      return (
        <svg {...props}>
          <path d="m12 2 9 5v10l-9 5-9-5V7Z" />
          <path d="m3 7 9 5 9-5M12 12v10" />
        </svg>
      )
    case 'rotate':
      return (
        <svg {...props}>
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      )
    case 'x-circle':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="m9 9 6 6M15 9l-6 6" />
        </svg>
      )
    case 'star':
      return (
        <svg {...props}>
          <polygon points="12 2 15 9 22 10 17 15 18 22 12 18 6 22 7 15 2 10 9 9" />
        </svg>
      )
    case 'minus':
      return (
        <svg {...props}>
          <path d="M5 12h14" />
        </svg>
      )
    case 'split':
      return (
        <svg {...props}>
          <path d="M12 3v4M12 17v4M5 9l7 4 7-4" />
        </svg>
      )
    case 'flask':
      return (
        <svg {...props}>
          <path d="M9 3h6M10 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-10V3" />
        </svg>
      )
    case 'grid':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      )
    case 'drag':
      return (
        <svg {...props}>
          <circle cx="9" cy="6" r="1.2" fill="currentColor" />
          <circle cx="9" cy="12" r="1.2" fill="currentColor" />
          <circle cx="9" cy="18" r="1.2" fill="currentColor" />
          <circle cx="15" cy="6" r="1.2" fill="currentColor" />
          <circle cx="15" cy="12" r="1.2" fill="currentColor" />
          <circle cx="15" cy="18" r="1.2" fill="currentColor" />
        </svg>
      )
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      )
  }
}
