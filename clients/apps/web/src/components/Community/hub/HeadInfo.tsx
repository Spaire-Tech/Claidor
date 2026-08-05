'use client'

/**
 * Community Hub — section header info popover.
 *
 * Replaces the long descriptive sub-headline under each tab title (Feed,
 * Activities, Events, Settings). The explanation now lives behind a small "?"
 * glyph next to the title — click it to reveal the blurb, click anywhere else
 * (or Esc) to dismiss. Keeps the headers tight while preserving the guidance.
 */
import * as React from 'react'
import { Glyph } from './icons'

export function HeadInfo({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLSpanElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span className="head-info" ref={ref}>
      <button
        type="button"
        className="head-info-btn"
        aria-label="About this section"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Glyph d="help" size={16} stroke={1.9} />
      </button>
      {open && (
        <span className="head-info-pop" role="tooltip">
          {children}
        </span>
      )}
    </span>
  )
}
