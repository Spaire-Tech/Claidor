'use client'

/**
 * The pieces a list needs once it stops being seven rows long.
 *
 * The design was drawn at seven findings and nine files. A real deck
 * yields 128 figures, a real check yields hundreds of findings, and a real
 * data room holds thousands of documents. At those sizes a list has to
 * answer questions the drawing never had to: how do I find one, how do I
 * skip the noise, and does the heading stay where I can read it.
 *
 * **Nothing here is a new visual language.** Every piece is composed from
 * something the design already does:
 *
 * | Piece | Borrowed from |
 * |---|---|
 * | Filter | The Chain's « Open the slide · Open the cell » — text, blue when live, faint when not. Not chips; the design has no chips |
 * | Search | The input on the confirmation queue, which itself came from the composer's proportions at panel scale |
 * | Sticky heading | The heading block that already exists, pinned |
 * | « showing 200 of 1,248 » | The count line under every heading, which already says what a screen holds |
 *
 * The one rule underneath all of it: **a list must never quietly show a
 * subset.** If 1,248 rows exist and 200 are drawn, the screen says so.
 * Silent truncation reads as « that is all of them », which is the same
 * lie as hiding a finding.
 */

import { useEffect, useRef, useState } from 'react'

import { colour, size } from './design'

/** How many rows are drawn before scrolling asks for more. */
export const WINDOW = 120

/**
 * Grow the drawn window as the reader reaches the end of it.
 *
 * A sentinel at the bottom rather than a scroll handler: it costs nothing
 * while the reader is at the top of a long list, which is where they spend
 * most of their time.
 */
export function useWindowed<T>(rows: T[]): {
  shown: T[]
  sentinel: React.RefObject<HTMLDivElement | null>
  more: boolean
} {
  const [limit, setLimit] = useState(WINDOW)
  const sentinel = useRef<HTMLDivElement | null>(null)

  // A new list — a filter changed, a check re-ran — starts at the top
  // again. Keeping the old limit would silently render 600 rows of a list
  // the reader has not scrolled.
  //
  // Adjusted during the render that notices rather than in an effect
  // afterwards. An effect would paint 600 rows of the new list first and
  // then throw them away, which on a list of a thousand findings is a
  // visible stall for no reason.
  const [countedAt, setCountedAt] = useState(rows.length)
  if (rows.length !== countedAt) {
    setCountedAt(rows.length)
    setLimit(WINDOW)
  }

  useEffect(() => {
    const node = sentinel.current
    if (!node) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setLimit((was) => was + WINDOW)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [rows.length])

  return { shown: rows.slice(0, limit), sentinel, more: rows.length > limit }
}

/**
 * The heading block, pinned so it survives a long scroll.
 *
 * Same padding and type as the design's own heading. `position: sticky`
 * with the panel's own background under it, because the panel is frosted
 * and a transparent sticky header lets rows show through it.
 */
export function Heading({
  title,
  line,
  children,
}: {
  title: string
  line: string
  children?: React.ReactNode
}) {
  return (
    <div
      style={{
        flex: '0 0 auto',
        position: 'sticky',
        top: 0,
        zIndex: 2,
        background: 'rgba(255,255,255,.92)',
        backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
        padding: '24px 26px 14px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 16,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: size.title,
              fontWeight: 500,
              color: colour.ink,
              letterSpacing: '-.015em',
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 13, color: colour.faint, marginTop: 4 }}>
            {line}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * A row of choices, one live at a time.
 *
 * Text rather than chips or a select, because the design's only precedent
 * for « a small action among small actions » is the Chain's pair of text
 * buttons. A count rides with each label: « Critical 3 » is a filter and a
 * summary at once, and the summary is the part a banker reads first.
 */
export function Filter<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        alignItems: 'baseline',
        flexWrap: 'wrap',
      }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          style={{
            border: 0,
            background: 'transparent',
            padding: 0,
            font: 'inherit',
            fontSize: 13,
            cursor: 'pointer',
            color: option.value === value ? colour.blue : colour.faint,
          }}
        >
          {option.label}
          {option.count !== undefined && (
            <span style={{ color: colour.fainter }}> {option.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

/** The in-panel input, as the confirmation queue set it. */
export function Search({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        border: `1px solid ${colour.ruleStrong}`,
        borderRadius: 10,
        padding: '9px 12px',
        font: 'inherit',
        fontSize: size.meta,
        color: colour.ink,
        outline: 'none',
        background: colour.paper,
      }}
    />
  )
}

/**
 * What is drawn, against what exists.
 *
 * Only appears when they differ. A screen showing everything should not
 * carry a sentence explaining that it is.
 */
export function Truncation({
  shown,
  total,
  sentinel,
}: {
  shown: number
  total: number
  sentinel: React.RefObject<HTMLDivElement | null>
}) {
  if (shown >= total) return null
  return (
    <div ref={sentinel} style={{ padding: '18px 0 4px' }}>
      <span style={{ fontSize: size.small, color: colour.fainter }}>
        showing {shown.toLocaleString()} of {total.toLocaleString()} — scroll
        for more
      </span>
    </div>
  )
}

/**
 * Nothing to show, and why.
 *
 * Kept apart from « nothing found » on purpose: an empty check is the
 * *good* outcome and must not read as a failure, while an empty filter is
 * a dead end the reader can back out of.
 */
export function Nothing({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: size.meta,
        color: colour.muted,
        padding: '8px 0',
        lineHeight: 1.7,
        maxWidth: '58ch',
      }}
    >
      {children}
    </div>
  )
}
