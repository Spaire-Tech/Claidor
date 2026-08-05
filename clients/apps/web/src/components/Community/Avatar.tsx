'use client'

import styles from './community.module.css'

// Stable hue from initials so each author gets a consistent tint
// without any network calls. Mirrors the v3 prototype's palette but
// keeps the lookup local (no external avatar service in production).
const PALETTE = [
  { bg: '#E5F2FF', fg: '#0071E3' },
  { bg: '#E5F7EC', fg: '#34A853' },
  { bg: '#FFEDE5', fg: '#FF6B35' },
  { bg: '#F0E8FF', fg: '#7C5CFF' },
  { bg: '#FFF4D6', fg: '#C99A2A' },
  { bg: '#FCE4F0', fg: '#D63384' },
  { bg: '#E0F2F4', fg: '#13818E' },
  { bg: '#EDEEF0', fg: '#6E6E73' },
]

const hashIndex = (seed: string): number => {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0
  }
  return Math.abs(h) % PALETTE.length
}

const initialsOf = (name: string | null | undefined): string => {
  if (!name) return '·'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return (
    parts
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2) || '·'
  )
}

export type AvatarProps = {
  name: string | null | undefined
  avatarUrl?: string | null
  size?: number
  fontSize?: number
  className?: string
}

export function Avatar({
  name,
  avatarUrl,
  size = 36,
  fontSize,
  className,
}: AvatarProps) {
  const initials = initialsOf(name)
  const seed = name || initials
  const tint = PALETTE[hashIndex(seed)]
  const computedFontSize = fontSize ?? Math.max(11, Math.round(size * 0.36))

  return (
    <span
      className={`${styles.avatar} ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        background: tint.bg,
        color: tint.fg,
        fontSize: computedFontSize,
      }}
      aria-label={name ?? undefined}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={name ?? ''} loading="lazy" />
      ) : (
        initials
      )}
    </span>
  )
}
