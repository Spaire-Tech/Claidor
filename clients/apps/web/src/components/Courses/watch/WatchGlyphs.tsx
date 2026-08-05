// SF-style glyph set from the Spaire Originals v2 design
// (originals2-parts.jsx). Multi-segment paths are encoded as one string
// with " M" separators, exactly like the design file.

export const SF = {
  play: 'M7 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 7 5.5Z',
  check: 'm5 12.5 4.5 4.5L19 6.5',
  chevron: 'm9 6 6 6-6 6',
  close: 'M6 6l12 12M18 6 6 18',
  bookmark:
    'M6.5 4h11a1 1 0 0 1 1 1v15.4a.5.5 0 0 1-.78.42L12 17.2l-5.72 3.62A.5.5 0 0 1 5.5 20.4V5a1 1 0 0 1 1-1Z',
  download: 'M12 3.5v11 M8 11l4 3.8 4-3.8 M5 19.5h14',
  bubble: 'M21 11.5a8 8 0 0 1-11.5 7.2L4 20.5l1.35-4.5A8 8 0 1 1 21 11.5Z',
  heart:
    'M12 20.2s-7.2-4.4-9.4-9.2C1.2 7.8 3 4.4 6.6 4.4c2 0 3.3 1.2 3.6 1.9.3-.7 1.6-1.9 3.6-1.9 3.6 0 5.4 3.4 4 6.6C19.2 15.8 12 20.2 12 20.2Z',
  send: 'M21 3 3 11l7 2.6L13 21l8-18Z',
  doc: 'M7 3h7l5 5v13a0 0 0 0 1 0 0H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M14 3v5h5 M9.5 13h6 M9.5 16.5h6',
  pause: 'M8.5 5h3v14h-3z M13.5 5h3v14h-3z',
  back: 'M15 5l-7 7 7 7',
  fullscreen:
    'M4 9V5a1 1 0 0 1 1-1h4 M20 9V5a1 1 0 0 0-1-1h-4 M4 15v4a1 1 0 0 0 1 1h4 M20 15v4a1 1 0 0 1-1 1h-4',
  // Inverse of `fullscreen` — corner brackets pointing inward, shown while
  // the player is already full-screen so the control reads as "collapse".
  fullscreenExit:
    'M9 4v3a1 1 0 0 1-1 1H5 M15 4v3a1 1 0 0 0 1 1h3 M9 20v-3a1 1 0 0 0-1-1H5 M15 20v-3a1 1 0 0 1 1-1h3',
  // A captions "CC" badge: rounded frame with two evenly-spaced, vertically
  // centred "C" letterforms (open to the right).
  captions:
    'M4 5.5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z M10.6 10.2a2.4 2.4 0 1 0 0 3.6 M18 10.2a2.4 2.4 0 1 0 0 3.6',
  link: 'M9.5 14.5 14.5 9.5 M8 11 6.2 12.8a3.4 3.4 0 0 0 4.8 4.8L13 15.8 M16 13l1.8-1.8a3.4 3.4 0 0 0-4.8-4.8L11 8.2',
  audio: 'M11 5 6 9H3v6h3l5 4z M15.5 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11',
  // Same speaker at low volume (one wave) and muted (an "x" where the
  // waves would be) — the icon narrates the current level, SF-style.
  audioLow: 'M11 5 6 9H3v6h3l5 4z M15.5 9a4 4 0 0 1 0 6',
  audioMuted: 'M11 5 6 9H3v6h3l5 4z M16 9.5l5 5 M21 9.5l-5 5',
  videoclip:
    'M4 6.5h11a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z M16 10l5-3v10l-5-3',
  pdf: 'M7 3h7l5 5v13a0 0 0 0 1 0 0H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M14 3v5h5',
  lock: 'M7.5 10.5V7.5a4.5 4.5 0 0 1 9 0v3 M6 10.5h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z',
  locksm:
    'M8 10V7.5a4 4 0 0 1 8 0V10 M6.5 10h11a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1z',
  play2:
    'M8 6.5v11a1 1 0 0 0 1.5.87l9-5.5a1 1 0 0 0 0-1.74l-9-5.5A1 1 0 0 0 8 6.5Z',
  infinity:
    'M6.5 9a3 3 0 1 0 0 6c2 0 3-1.6 5.5-3s3.5-3 5.5-3a3 3 0 1 1 0 6c-2 0-3-1.6-5.5-3S8.5 9 6.5 9Z',
  info: 'M12 21.2a9.2 9.2 0 1 0 0-18.4 9.2 9.2 0 0 0 0 18.4 M12 11v5.2 M12 7.9h.012',
  pin: 'M9.5 3.5h5l.8 6 2.7 2.5H6l2.7-2.5.8-6z M12 12v8.5',
  trash:
    'M4.5 6.5h15 M9.5 6.5V4.2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2.3 M6.5 6.5l1 13.3a1 1 0 0 0 1 .9h7a1 1 0 0 0 1-.9l1-13.3 M10 10.5v6 M14 10.5v6',
  reply: 'M9.5 7 4 12l5.5 5 M4 12h9a7 7 0 0 1 7 7',
} as const

export function Glyph({
  d,
  size = 24,
  stroke = 2,
  fill = 'none',
}: {
  d: string
  size?: number
  stroke?: number
  fill?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={fill === 'none' ? 'currentColor' : 'none'}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {d.split(' M').map((seg, i) => (
        <path key={i} d={(i ? 'M' : '') + seg} />
      ))}
    </svg>
  )
}

export function SkipIcon({
  dir = -1,
  n = 10,
  size = 30,
}: {
  dir?: number
  n?: number
  size?: number
}) {
  const flip = dir > 0
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g transform={flip ? 'translate(24,0) scale(-1,1)' : undefined}>
        <path d="M4.6 9A8 8 0 1 1 4 13.4" />
        <path d="M4.6 9 4 4.6 M4.6 9 9 8.5" />
      </g>
      <text
        x="12"
        y="15.2"
        fontSize="7.6"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
        textAnchor="middle"
      >
        {n}
      </text>
    </svg>
  )
}

export function fmtTime(s: number): string {
  const t = Math.max(0, Math.floor(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}
