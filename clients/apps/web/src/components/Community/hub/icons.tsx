'use client'

/**
 * Community Hub (Creator) — line-glyph icon system.
 *
 * Ported verbatim from the design handoff (community-data.jsx `CSF`,
 * creator-app.jsx `CR`, creator-feed.jsx `CRF`). Single-stroke, monochrome,
 * no emoji — matches the Apple-restraint vocabulary. Paths are split on " M"
 * into subpaths exactly like the prototype's `CGlyph`.
 */
import * as React from 'react'

export const GLYPHS = {
  // —— shared (CSF) ——
  play: 'M7 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 7 5.5Z',
  check: 'm5 12.5 4.5 4.5L19 6.5',
  close: 'M6 6l12 12M18 6 6 18',
  bubble: 'M21 11.5a8 8 0 0 1-11.5 7.2L4 20.5l1.35-4.5A8 8 0 1 1 21 11.5Z',
  heart: 'M12 20.2s-7.2-4.4-9.4-9.2C1.2 7.8 3 4.4 6.6 4.4c2 0 3.3 1.2 3.6 1.9.3-.7 1.6-1.9 3.6-1.9 3.6 0 5.4 3.4 4 6.6C19.2 15.8 12 20.2 12 20.2Z',
  send: 'M21 3 3 11l7 2.6L13 21l8-18Z',
  plus: 'M12 5v14 M5 12h14',
  image:
    'M4 5.5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z M8.4 11a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2 M21 15.5l-5-5-8 7.5',
  poll: 'M6 20v-6 M12 20V4 M18 20v-9',
  calendar:
    'M7 3v3 M17 3v3 M4.5 9.5h15 M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 7.5V12l3 2',
  users:
    'M9 11.4a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4 M3.5 19c.5-3 2.7-4.7 5.5-4.7s5 1.7 5.5 4.7 M16 5.3a3 3 0 0 1 0 6 M17.6 14.7c2.2.4 3.5 1.9 3.9 4.3',
  bolt: 'M13 3 5 13.5h5l-1 7.5 8-10.5h-5l1-7.5Z',
  flame:
    'M12 3.5c2.5 2.8 3.4 4.8 3.4 6.6 0 1-.4 1.9-1 2.5.3-1.6-.5-3-1.6-3.9.2 2.2-1.2 3.3-2.2 4.3-.8.8-1.5 1.7-1.5 3a4.4 4.4 0 1 0 8.6 0c0-3.6-2.6-6.9-5.7-12.5Z',
  target:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 16.6a4.6 4.6 0 1 0 0-9.2 4.6 4.6 0 0 0 0 9.2 M12 13.1a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2',
  trophy:
    'M8 4h8v3.5a4 4 0 0 1-8 0V4Z M8 5H5.4A2.4 2.4 0 0 0 8 7.6 M16 5h2.6A2.4 2.4 0 0 1 16 7.6 M9.5 20h5 M12 11.5V14',
  dots: 'M5 12h.01 M12 12h.01 M19 12h.01',
  share:
    'M17 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5 M7 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5 M17 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5 M9.2 11.2l5.6-3 M9.2 12.8l5.6 3',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14 M20 20l-4-4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  bell: 'M18 16V11a6 6 0 0 0-12 0v5l-2 2.5h16L18 16Z M9.5 19a2.5 2.5 0 0 0 5 0',
  // —— creator console (CR) ——
  chevR: 'M9 6l6 6-6 6',
  back: 'M15 5l-7 7 7 7',
  chevU: 'M6 15l6-6 6 6',
  chevD: 'M6 9l6 6 6-6',
  trash:
    'M5 7h14 M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2 M7 7l1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13 M10 11v6 M14 11v6',
  spark:
    'M12 3.2l1.7 5.6 5.6 1.7-5.6 1.7L12 17.8l-1.7-5.6L4.7 10.5l5.6-1.7Z M18.5 14.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7Z',
  link: 'M9.5 13.5 14.5 8.5 M8 11 6 13a3 3 0 0 0 4.2 4.2l2-2 M16 13l2-2a3 3 0 0 0-4.2-4.2l-2 2',
  doc: 'M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M13.5 3v5h4.5',
  grid: 'M4 4h7v7H4Z M13 4h7v7h-7Z M4 13h7v7H4Z M13 13h7v7h-7Z',
  star: 'M12 3.6l2.5 5.4 5.9.6-4.4 4 1.2 5.8L12 16.9l-5.2 2.5 1.2-5.8-4.4-4 5.9-.6Z',
  lock: 'M7 10V8a5 5 0 0 1 10 0v2 M6 10h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z M12 14v3',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  video: 'M3 7.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z M15 11l6-3.6v9.2L15 13',
  smiley:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M8.5 10.5h.01 M15.5 10.5h.01 M8.5 14.5s1.4 2 3.5 2 3.5-2 3.5-2',
  // —— feed (CRF) ——
  globe:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M3.6 9h16.8 M3.6 15h16.8 M12 3c2.4 2.4 2.4 15.6 0 18 M12 3c-2.4 2.4-2.4 15.6 0 18',
  seal: 'M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z M9 12l2 2 4-4',
  repost: 'M4 9.5V8a2.5 2.5 0 0 1 2.5-2.5H16 M13 2.5 16 5.5 13 8.5 M20 14.5V16a2.5 2.5 0 0 1-2.5 2.5H8 M11 21.5 8 18.5 11 15.5',
  heartFeed: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
  pin: 'M12 17v5 M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.8a2 2 0 0 0-1.1-1.8l-1.8-.9A2 2 0 0 1 15 10.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z',
  comment: 'M21 11.5a8 8 0 0 1-11.5 7.2L4 20.5l1.35-4.5A8 8 0 1 1 21 11.5Z',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M9.6 9.2a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2-2.4 3.6 M12 17.3h.01',
} as const

export type GlyphName = keyof typeof GLYPHS

export function Glyph({
  d,
  size = 24,
  stroke = 2,
  fill = 'none',
  className,
}: {
  d: GlyphName | string
  size?: number
  stroke?: number
  fill?: string
  className?: string
}) {
  const path = (GLYPHS as Record<string, string>)[d] ?? (d as string)
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={fill === 'none' ? 'currentColor' : 'none'}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path.split(' M').map((seg, i) => (
        <path key={i} d={(i ? 'M' : '') + seg} />
      ))}
    </svg>
  )
}

export function useEscClose(onClose: () => void) {
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
}
