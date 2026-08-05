'use client'
/* eslint-disable @next/next/no-img-element */

/**
 * Avatar for the community hub. When a photo exists it renders it; otherwise
 * it renders the person's initials on a stable, name-derived tint instead of a
 * single featureless grey blob — so members without a headshot are still
 * distinguishable from one another.
 *
 * `className` carries the size/shape classes (`crf-av`, `cmt-av`, `mav`, …);
 * `style` carries any inline size overrides. Sizing comes from those, not from
 * this component, so it drops in wherever the old `hub-av-fallback` span lived.
 */
import * as React from 'react'

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

const tintFor = (seed: string) => {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
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

export function HubAvatar({
  name,
  url,
  className,
  style,
}: {
  name?: string | null
  url?: string | null
  className?: string
  style?: React.CSSProperties
}) {
  if (url) {
    return (
      <img className={className} src={url} alt={name ?? ''} style={style} />
    )
  }
  const tint = tintFor(name || '·')
  // Scale the glyph to the avatar when an explicit pixel size is given;
  // otherwise the per-class CSS rules in hub-extra.css set it.
  const w = typeof style?.width === 'number' ? style.width : undefined
  const fontSize = w ? Math.max(10, Math.round(w * 0.4)) : undefined
  return (
    <span
      className={`${className ?? ''} hub-av-init`.trim()}
      style={{ background: tint.bg, color: tint.fg, fontSize, ...style }}
      aria-label={name ?? undefined}
    >
      {initialsOf(name)}
    </span>
  )
}
